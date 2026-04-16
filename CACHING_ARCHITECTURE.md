# TheWeddingBot — Zero-Cost Caching Architecture

**Version:** 1.0
**Date:** 2026-04-07
**Status:** Draft
**Architect:** System Architect Review
**Constraint:** Zero additional infrastructure cost — uses only free libraries + existing Firebase (Firestore already on Blaze plan)

---

## 1. Why Cache & What Problem We're Solving

Every single chat request currently hits Firestore and Azure OpenAI cold:

```
User message
  → Auth verification (Firestore/REST)          ~50-100ms
  → Fetch user profile (Firestore read)          ~30-60ms
  → Fetch chat history — 10 docs (Firestore)     ~80-150ms
  → Build system prompt (CPU, deterministic)      ~1ms
  → Check image quota (Firestore read)            ~30-60ms
  → Azure OpenAI call                             ~1500-4000ms
  → Write token usage (Firestore write)           ~30ms
                                         Total:  ~1.7s - 4.4s
```

**The LLM call is unavoidable.** But everything else around it — auth, profile, history, prompts, quota — is repeated identical work across requests. Caching these shaves **200-400ms per request** and **reduces Firestore reads by 60-70%** (cost savings on Blaze plan).

---

## 2. Architecture Decision: Two-Tier In-Process + Firestore Cache

### Why NOT Redis / Upstash / Memorystore

| Option | Monthly Cost | Why Rejected |
|--------|-------------|--------------|
| Azure Cache for Redis (C0) | ~$16/mo | Unnecessary cost for current traffic scale |
| Upstash Redis (Free tier) | $0 (limited) | 10K commands/day limit — too low for production |
| GCP Memorystore | ~$30/mo | Overengineered, adds GCP dependency |

### Why This Approach

| Tier | Tool | Cost | Latency | Scope |
|------|------|------|---------|-------|
| **L1 — In-Memory** | `lru-cache` (npm) | $0 | ~0ms | Per server instance |
| **L2 — Firestore TTL** | Existing Firestore | $0 extra | ~20-40ms | Shared across instances |
| **L3 — CDN Headers** | Firebase Storage config | $0 extra | Browser-cached | Global |

```
Request arrives
  ↓
  L1: Check in-memory LRU cache ──→ HIT → return (0ms)
  ↓ MISS
  L2: Check Firestore cache doc ──→ HIT → populate L1, return (20-40ms)
  ↓ MISS
  Source: Fetch from origin (Firestore collection / API)
  ↓
  Write to L1 + L2 (async, non-blocking)
  ↓
  Return result
```

**`lru-cache`** — zero-dependency, battle-tested (180M+ weekly downloads), TypeScript-native, supports TTL, max size, and stale-while-revalidate out of the box. Already compatible with the project's Node 20 + TypeScript stack.

---

## 3. What to Cache (and What NOT to)

### 3.1 Cache Matrix

| Data | Layer | TTL | Key Pattern | Why Cache | Invalidation |
|------|-------|-----|-------------|-----------|-------------|
| **System prompts** | L1 only | 30 min | `prompt:{mode}` | Deterministic per mode, rebuilt identically every request | On deploy (process restart clears L1) |
| **User profile** | L1 + L2 | 10 min | `user:{uid}` | Read every request, changes rarely | On profile update (explicit bust) |
| **Chat history** | L1 | 60 sec | `history:{threadId}` | 10 Firestore reads per request, same thread hit repeatedly | On new message (explicit bust) |
| **Image quota** | L1 | 30 sec | `quota:{uid}` | Checked before every image gen, changes only on generation | On image generated (explicit bust) |
| **Mode detection** | L1 | 5 min | `mode:{msgHash}` | Same/similar messages get same mode, regex is cheap but avoidable | No invalidation needed (short TTL) |
| **Speech token** | L1 | 8 min | `speech:token` | Azure token valid 10 min, all users share same token | TTL-based expiry |
| **Algolia results** | L1 | 15 min | `products:{queryHash}` | Product catalog changes infrequently, same queries repeat | TTL-based expiry |
| **Tone suffix** | L1 | 10 min | `tone:{settingsHash}` | Deterministic from settings, recomputed every request | On settings change |
| **Generated images** | L3 (CDN) | 1 hour | HTTP `Cache-Control` header | Static after creation, served repeatedly in chat | None (immutable once generated) |

### 3.2 What NOT to Cache

| Data | Reason |
|------|--------|
| LLM responses | Non-deterministic (temperature > 0), context-dependent — caching would return stale/irrelevant answers |
| Auth token verification | Security-critical — must verify JWT freshly (but switching to Admin SDK `verifyIdToken` is already fast at ~1-5ms locally) |
| Image generation results | Unique per prompt, expensive to store in memory, already stored in Firebase Storage |
| Firestore writes | Writes are fire-and-forget async — no caching benefit |
| Audio/STT transcription | Unique per audio input, binary data too large for memory cache |

---

## 4. Implementation Design

### 4.1 Cache Service — Single Module

**File:** `easebot-backend/src/services/cacheService.ts`

```typescript
import { LRUCache } from 'lru-cache';

// ─── L1: In-Memory LRU Cache ────────────────────────────────
// Max 500 entries, ~2-5MB memory footprint (safe for Cloud Functions 256MB-1GB)

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const cache = new LRUCache<string, CacheEntry<any>>({
  max: 500,                    // max items
  maxSize: 5 * 1024 * 1024,   // 5MB total size budget
  sizeCalculation: (value) => JSON.stringify(value.data).length,
  ttl: 1000 * 60 * 10,        // default 10 min (overridden per-call)
  allowStale: false,
  updateAgeOnGet: true,        // accessing resets TTL countdown
});

// ─── Public API ─────────────────────────────────────────────

/**
 * Get from cache. Returns undefined on miss.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  return entry.data as T;
}

/**
 * Set in cache with custom TTL (milliseconds).
 */
export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, cachedAt: Date.now() }, { ttl: ttlMs });
}

/**
 * Explicitly remove a key (for invalidation on writes).
 */
export function cacheBust(key: string): void {
  cache.delete(key);
}

/**
 * Bust all keys matching a prefix (e.g., "history:threadId" on new message).
 */
export function cacheBustPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Get-or-fetch pattern: check cache first, call fetcher on miss, cache result.
 */
export async function cacheThrough<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;

  const fresh = await fetcher();
  cacheSet(key, fresh, ttlMs);
  return fresh;
}

// ─── Cache Stats (for /health or monitoring) ────────────────

export function cacheStats() {
  return {
    size: cache.size,
    calculatedSize: cache.calculatedSize,
    maxSize: cache.maxSize,
    itemCount: cache.size,
  };
}
```

### 4.2 TTL Constants — Centralized

**File:** `easebot-backend/src/config/cacheTTL.ts`

```typescript
// All values in milliseconds
export const CACHE_TTL = {
  SYSTEM_PROMPT:   30 * 60 * 1000,   // 30 min — changes only on deploy
  USER_PROFILE:    10 * 60 * 1000,   // 10 min — changes rarely
  CHAT_HISTORY:     1 * 60 * 1000,   //  1 min — changes on each message
  IMAGE_QUOTA:          30 * 1000,   // 30 sec — changes on each generation
  MODE_DETECTION:   5 * 60 * 1000,   //  5 min — deterministic per input
  SPEECH_TOKEN:     8 * 60 * 1000,   //  8 min — Azure token valid 10 min
  PRODUCT_SEARCH:  15 * 60 * 1000,   // 15 min — catalog changes infrequently
  TONE_SUFFIX:     10 * 60 * 1000,   // 10 min — changes on settings update
} as const;
```

### 4.3 Integration Points — Where to Wire In

Each integration is a **minimal change** — wrap the existing Firestore/API call with `cacheThrough`.

---

#### A) User Profile — `chatController.ts`

```typescript
// BEFORE (every request)
const userDoc = await getDoc(doc(db, 'users', uid));
const userData = userDoc.data();

// AFTER (cached 10 min, busted on profile update)
import { cacheThrough, cacheBust } from '../services/cacheService';
import { CACHE_TTL } from '../config/cacheTTL';

const userData = await cacheThrough(
  `user:${uid}`,
  CACHE_TTL.USER_PROFILE,
  async () => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.data();
  }
);

// On profile update (wherever user data is written):
cacheBust(`user:${uid}`);
```

**Impact:** Eliminates 1 Firestore read per request for returning users (majority of requests).

---

#### B) Chat History — `chatController.ts` → `getChatHistory()`

```typescript
// BEFORE
const messagesQuery = query(
  collection(db, 'chats', threadId, 'messages'),
  orderBy('timestamp', 'desc'),
  limit(10)
);
const snapshot = await getDocs(messagesQuery);

// AFTER (cached 60 sec, busted when new message saved)
const history = await cacheThrough(
  `history:${threadId}`,
  CACHE_TTL.CHAT_HISTORY,
  async () => {
    const snapshot = await getDocs(messagesQuery);
    return snapshot.docs.map(d => ({ role: d.data().role, content: d.data().content }));
  }
);

// On new message saved to thread:
cacheBust(`history:${threadId}`);
```

**Impact:** Eliminates 10 Firestore document reads per request when user sends rapid follow-up messages within 60 sec (common in active conversations).

---

#### C) System Prompts — `chatController.ts` → `buildSystemPrompt()`

```typescript
// BEFORE — prompt functions called fresh every request
const basePrompt = getPlannerPrompt(userRole);

// AFTER — memoize the base prompt (deterministic per mode + role)
const basePrompt = await cacheThrough(
  `prompt:${mode}:${userRole || 'guest'}`,
  CACHE_TTL.SYSTEM_PROMPT,
  async () => getPlannerPrompt(userRole)
);

// Note: personalization suffix (tone) is cached separately since it
// depends on user settings, not mode.
```

**Impact:** Negligible latency gain (prompt construction is fast), but reduces CPU work on repeated calls. Main value is consistency during prompt iteration — you know exactly which prompt version is active.

---

#### D) Image Quota — `imageQuota.ts`

```typescript
// BEFORE
const quotaDoc = await getDoc(doc(db, 'imageUsage', userId));

// AFTER (cached 30 sec, busted after image generation)
const quotaData = await cacheThrough(
  `quota:${userId}`,
  CACHE_TTL.IMAGE_QUOTA,
  async () => {
    const quotaDoc = await getDoc(doc(db, 'imageUsage', userId));
    return quotaDoc.data();
  }
);

// After successful image generation:
cacheBust(`quota:${userId}`);
```

**Impact:** Prevents redundant Firestore reads when user is browsing their gallery or the LLM decides not to generate (quota check happens before every image-related tool call).

---

#### E) Speech Token — `speech-token` route

```typescript
// BEFORE — fetches fresh Azure token every call
const tokenResponse = await axios.post(tokenUrl, null, { headers });

// AFTER (cached 8 min — Azure tokens valid 10 min)
const token = await cacheThrough(
  'speech:token',
  CACHE_TTL.SPEECH_TOKEN,
  async () => {
    const tokenResponse = await axios.post(tokenUrl, null, { headers });
    return tokenResponse.data;
  }
);
```

**Impact:** Azure Speech token shared across all users. Eliminates a REST call for every voice interaction after the first.

---

#### F) Algolia Product Search — `algoliaProducts.ts`

```typescript
// BEFORE
const results = await index.search(query, { hitsPerPage: 10 });

// AFTER (cached 15 min)
import { createHash } from 'crypto';

const queryHash = createHash('md5').update(query.toLowerCase().trim()).digest('hex').slice(0, 12);

const results = await cacheThrough(
  `products:${queryHash}`,
  CACHE_TTL.PRODUCT_SEARCH,
  async () => index.search(query, { hitsPerPage: 10 })
);
```

**Impact:** Identical or similar product searches (e.g., "lehenga", "wedding dress") return instantly after first fetch.

---

#### G) Firebase Storage CDN Headers — `imageStorage.ts`

```typescript
// BEFORE — uploaded without cache headers
await uploadBytes(storageRef, buffer);

// AFTER — add cache-control metadata
await uploadBytes(storageRef, buffer, {
  contentType: 'image/jpeg',
  cacheControl: 'public, max-age=3600',  // 1 hour browser + CDN cache
});
```

**Impact:** Browsers and Firebase CDN cache generated images. Repeat views of the same image in chat load instantly from browser cache instead of hitting Firebase Storage.

---

## 5. Cache Invalidation Strategy

Cache invalidation is the hard part. The strategy here is **conservative** — short TTLs + explicit busting on writes.

### 5.1 Invalidation Rules

| Event | Cache Keys to Bust | Method |
|-------|-------------------|--------|
| User sends a message | `history:{threadId}` | Explicit bust after saving message to Firestore |
| User updates profile | `user:{uid}` | Explicit bust in profile update handler |
| Image generated | `quota:{uid}` | Explicit bust after incrementing quota |
| User changes tone settings | `tone:{uid}` | Explicit bust in settings update handler |
| Server deploy/restart | All L1 keys | Automatic (in-memory cache is wiped on process restart) |

### 5.2 Staleness Tolerance

| Data | Acceptable Staleness | Reason |
|------|---------------------|--------|
| System prompts | 30 min | Changes only via code deploy (restarts clear cache anyway) |
| User profile | 10 min | `isPremium` upgrade can wait a few minutes to take effect |
| Chat history | 60 sec | Slight delay acceptable; user sees their own message immediately (optimistic UI) |
| Image quota | 30 sec | Worst case: user generates 1 extra image before quota enforces. Acceptable. |
| Product search | 15 min | Catalog changes are rare; 15 min stale results are fine |
| Speech token | 8 min | Token valid 10 min; 2 min safety margin before expiry |

### 5.3 No Distributed Invalidation Needed (Yet)

Since the backend currently runs as a single Express process (or a single Cloud Function instance with `maxInstances: 1-3`), in-memory cache is sufficient. Every instance has its own L1 cache, and short TTLs ensure consistency within the staleness window.

**When to upgrade to Redis:** If you scale to 5+ concurrent Cloud Function instances AND observe cache inconsistency issues (e.g., a user updates their profile but gets stale data because their next request hits a different instance). This is unlikely at current traffic levels.

---

## 6. Memory Budget & Sizing

### 6.1 Per-Entry Size Estimates

| Cache Key | Avg Entry Size | Max Entries | Max Memory |
|-----------|---------------|-------------|------------|
| `user:{uid}` | ~500 bytes | 100 users | 50 KB |
| `history:{threadId}` | ~5 KB (10 messages) | 50 threads | 250 KB |
| `prompt:{mode}` | ~3 KB | 3 modes | 9 KB |
| `quota:{uid}` | ~200 bytes | 100 users | 20 KB |
| `products:{hash}` | ~10 KB | 30 queries | 300 KB |
| `speech:token` | ~1 KB | 1 | 1 KB |
| `tone:{uid}` | ~500 bytes | 100 users | 50 KB |
| `mode:{hash}` | ~50 bytes | 100 | 5 KB |
| **Total** | | | **~685 KB** |

The `maxSize: 5MB` limit in the LRU cache config gives **7x headroom**. Even at 10x traffic, memory usage stays well under the limit. Safe for Cloud Functions with 256MB+ memory.

### 6.2 LRU Eviction

When the cache hits 500 entries or 5MB, the least-recently-used entries are evicted automatically. This means:
- Active users' data stays warm
- Inactive users' data gets evicted naturally
- No manual cleanup needed

---

## 7. Monitoring & Observability

### 7.1 Cache Stats Endpoint

Expose cache stats on the existing `/api/health` endpoint:

```typescript
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    cache: cacheStats(),  // { size, calculatedSize, maxSize, itemCount }
  });
});
```

### 7.2 Cache Hit/Miss Logging

Add lightweight logging to `cacheThrough` (structured for future OTel integration):

```typescript
export async function cacheThrough<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) {
    console.log(`[cache] HIT  ${key.split(':')[0]}:***`);
    return cached;
  }

  console.log(`[cache] MISS ${key.split(':')[0]}:***`);
  const fresh = await fetcher();
  cacheSet(key, fresh, ttlMs);
  return fresh;
}
```

### 7.3 Metrics to Track (Post-Launch)

| Metric | Target | Alert If |
|--------|--------|----------|
| L1 hit rate | > 50% after warm-up | < 30% sustained (cache not helping) |
| Cache memory usage | < 3MB | > 4MB (nearing limit) |
| Firestore reads/day | -40% vs baseline | No improvement after 1 week |
| Avg response latency | -200ms vs baseline | No improvement |

---

## 8. Implementation Plan

### Phase 1 — Core Cache (1-2 days)

| # | Task | File | Effort |
|---|------|------|--------|
| 1 | Install `lru-cache` dependency | `package.json` | 5 min |
| 2 | Create `cacheService.ts` | `src/services/cacheService.ts` | 30 min |
| 3 | Create `cacheTTL.ts` | `src/config/cacheTTL.ts` | 10 min |
| 4 | Wire up user profile caching | `src/controllers/chatController.ts` | 20 min |
| 5 | Wire up chat history caching | `src/controllers/chatController.ts` | 20 min |
| 6 | Wire up speech token caching | `src/routes/tts.ts` or speech token route | 15 min |
| 7 | Add cache stats to `/api/health` | `src/app.ts` | 10 min |

### Phase 2 — Extended Cache (1 day)

| # | Task | File | Effort |
|---|------|------|--------|
| 8 | Wire up image quota caching | `src/services/imageQuota.ts` | 15 min |
| 9 | Wire up system prompt caching | `src/controllers/chatController.ts` | 15 min |
| 10 | Wire up Algolia product search caching | `src/services/algoliaProducts.ts` | 15 min |
| 11 | Add `Cache-Control` headers to Firebase Storage uploads | `src/services/imageStorage.ts` | 10 min |
| 12 | Add cache invalidation on writes (profile, message, quota) | Various controllers | 30 min |

### Phase 3 — Validate & Tune (Ongoing)

| # | Task | Effort |
|---|------|--------|
| 13 | Monitor cache hit rate via `/api/health` for 1 week | Ongoing |
| 14 | Compare Firestore read counts before/after (Firebase Console → Usage) | 1 hour |
| 15 | Tune TTLs based on observed hit rates and staleness feedback | 30 min |
| 16 | Add unit tests for `cacheService.ts` (get/set/bust/through) | 1 hour |

---

## 9. Expected Impact

### 9.1 Latency Reduction (Per Request)

```
BEFORE (no cache):
  Auth + Profile + History + Quota + Prompt = ~200-400ms overhead
  LLM call                                 = ~1500-4000ms
  Total                                    = ~1.7-4.4s

AFTER (warm cache):
  Auth (still live)                        = ~50ms (switch to Admin SDK later)
  Profile (L1 HIT)                         = ~0ms
  History (L1 HIT)                         = ~0ms
  Quota (L1 HIT)                           = ~0ms
  Prompt (L1 HIT)                          = ~0ms
  LLM call                                 = ~1500-4000ms
  Total                                    = ~1.55-4.05s

Saved: ~150-350ms per request (on cache hits)
```

### 9.2 Firestore Read Reduction

| Operation | Reads/Request (Before) | Reads/Request (After, Warm) | Reduction |
|-----------|----------------------|---------------------------|-----------|
| User profile | 1 | 0 (L1 hit) | -100% |
| Chat history | 10 (10 message docs) | 0 (L1 hit) | -100% |
| Image quota | 1 | 0 (L1 hit) | -100% |
| **Per chat request** | **12 reads** | **0 reads** | **-100%** |

On Firestore Blaze plan: ~$0.06 per 100K reads. At 1000 chats/day × 12 reads = 12K reads/day → savings are modest in dollar terms (~$2/month) but **the latency improvement is the real win**.

### 9.3 Cost Summary

| Item | Cost |
|------|------|
| `lru-cache` npm package | $0 (MIT license) |
| Infrastructure changes | $0 (no new services) |
| Firestore read reduction | -$1-3/month (minor savings) |
| **Total additional cost** | **$0** |

---

## 10. Future Upgrade Path

When traffic grows beyond what in-memory caching can handle (5+ instances, cache inconsistency observed):

```
Current (Phase 1):           Future (if needed):
┌──────────────┐             ┌──────────────┐
│   L1: LRU    │             │   L1: LRU    │  ← Keep for hot data
│  (in-memory) │             │  (in-memory) │
└──────────────┘             └──────┬───────┘
                                    │ MISS
                             ┌──────▼───────┐
                             │  L2: Upstash  │  ← Add when multi-instance
                             │    Redis      │     consistency needed
                             │  (serverless) │
                             └──────┬───────┘
                                    │ MISS
                             ┌──────▼───────┐
                             │  L3: Firestore│  ← Source of truth
                             └──────────────┘
```

The `cacheService.ts` abstraction makes this upgrade a **single-file change** — swap `LRUCache` internals with Redis calls, no integration points need to change.

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stale user profile after premium upgrade | Low | Low | 10 min TTL — user gets premium features within 10 min. Can force-bust via profile update handler. |
| Stale chat history (missed message) | Low | Medium | 60 sec TTL + explicit bust on message save. User sees own messages immediately via optimistic UI. |
| Memory pressure on Cloud Functions | Very Low | Medium | 5MB cap, 500 entry limit, LRU eviction. ~685KB typical usage vs 256MB+ function memory. |
| Cache key collisions | None | — | Keys are namespaced (`user:`, `history:`, etc.) and use unique IDs (uid, threadId). |
| Cold start (empty cache) | Every deploy | Low | Graceful — first request after deploy is slower (same as current behavior), subsequent requests benefit from cache. No crash risk. |

---

## Appendix: Dependency

```json
// Add to easebot-backend/package.json → dependencies
{
  "lru-cache": "^11.0.0"
}
```

```bash
cd easebot-backend && npm install lru-cache
```

`lru-cache` v11: zero dependencies, 15KB, pure ESM + CJS, TypeScript types built-in, 180M+ weekly downloads, maintained by npm co-founder Isaac Z. Schlueter.
