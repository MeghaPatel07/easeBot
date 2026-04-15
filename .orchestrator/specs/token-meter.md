# Spec — `tokenMeter.ts`

**Owner:** System Architect
**File:** `easebot-backend/src/services/tokenMeter.ts`
**Status:** Draft v1 — Sprint 1 deliverable
**Grounded in:** PRICING_PRD.md §3, §6; EXECUTION_PLAN.md §0, §7, LH-01..LH-08

The single source of truth for every cost-bearing Azure / Algolia / WhatsApp call in the backend. Every call that spends money goes through this module. No direct Firestore writes to usage counters from anywhere else. No mini model fallback — every user is on full GPT-4o, so `chargeTokens` is the only degradation lever (it returns `allowed:false` and the caller stops cleanly).

---

## 1. Type signatures (exported API)

```ts
// services/tokenMeter.ts

// ---------- Domain types ----------

export type Tier = 'guest' | 'free' | 'pro' | 'promax'

export type Service =
  | 'chat'        // GPT-4o chat (combines input + output in one call)
  | 'image'       // GPT-Image-1.5 standard OR HD
  | 'tts'         // Azure Speech TTS
  | 'stt'         // Azure Speech STT
  | 'vision'      // GPT-4o multimodal (per-image portion)
  | 'algolia'     // product search
  | 'whatsapp'    // reminder send

export interface ChatRawCost {
  kind: 'chat'
  promptTokens: number      // Azure prompt_tokens
  completionTokens: number  // Azure completion_tokens
}

export interface ImageRawCost {
  kind: 'image'
  quality: 'standard' | 'hd'   // 1024² standard vs 1536/HD
  count?: number                // default 1
}

export interface TtsRawCost {
  kind: 'tts'
  characters: number
}

export interface SttRawCost {
  kind: 'stt'
  seconds: number
}

export interface VisionRawCost {
  kind: 'vision'
  imageCount: number           // number of image parts in the request
  // NB: the chat/text token portion of a vision call is charged separately
  // via a `chat` ChargeCall — vision only covers the fixed per-image cost.
}

export interface AlgoliaRawCost {
  kind: 'algolia'
  queries: number               // usually 1
}

export interface WhatsappRawCost {
  kind: 'whatsapp'
  messages: number              // usually 1
}

export type RawCost =
  | ChatRawCost | ImageRawCost | TtsRawCost | SttRawCost
  | VisionRawCost | AlgoliaRawCost | WhatsappRawCost

export interface Principal {
  kind: 'user' | 'guest'
  id: string                    // uid OR guestId
  tier: Tier                    // always set — resolver upstream (quota middleware)
}

export interface ChargeResult {
  allowed: boolean
  tokensCharged: number          // 0 if rejected
  consumedFrom: 'monthly' | 'extras' | 'both' | 'none'
  remainingDaily: number
  remainingMonthly: number
  remainingExtras: number
  reason?:
    | 'ok'
    | 'daily_cap_exceeded'
    | 'monthly_cap_exceeded'
    | 'guest_limit_exceeded'
    | 'firestore_unreachable'
    | 'negative_raw_cost'
  resetAt?: string               // ISO, when the blocking dimension resets
}

export interface UsageSnapshot {
  tier: Tier
  monthlyTokensUsed: number
  monthlyTokensCap: number
  extrasBucket: number
  extrasPurchasedThisMonth: number
  dailyTokensUsed: number
  dailyResetAt: string           // ISO
  byService: Record<Service, number>
  updatedAt: string              // ISO
  // Guest-only fields (undefined for users)
  guestCounters?: {
    msgCount: number
    imgCount: number
    voiceCount: number
    visionCount: number
  }
}

export interface EstimateInput {
  principal: Principal
  raw: RawCost
}

export interface EstimateResult {
  estimatedTokens: number
  wouldExceedDaily: boolean
  wouldExceedMonthly: boolean
  wouldExceedGuestLimit: boolean
  remainingDaily: number
  remainingMonthly: number
  remainingExtras: number
}

// ---------- Public API ----------

/**
 * Convert a raw cost to Easebot Tokens using the §3.2 table.
 * Pure — no Firestore I/O. Used for both estimate and post-call reconciliation.
 */
export function rawToTokens(raw: RawCost): number

/**
 * Pre-call estimate. Called from quotaMiddleware BEFORE the expensive call.
 * Reads the current usage doc, applies the conversion table, and reports
 * whether the call would fit. Does NOT mutate state.
 */
export function estimateCost(input: EstimateInput): Promise<EstimateResult>

/**
 * Post-call reconciliation. Called from the controller AFTER Azure/etc
 * returns, with the actual measured cost. Atomically debits the ledger
 * (monthly first, then extras) and returns a decision that the caller
 * already executed — this call is almost always `allowed:true` because the
 * estimate was already checked. The exception is concurrent races (LH-03),
 * in which case the transaction may observe the monthly pool already empty
 * and return `allowed:false` → caller refunds the Azure response on the
 * outer controller.
 *
 * Guest branch: bypasses token ledger, increments the relevant hard counter
 * on `guests/{guestId}` and enforces the per-session / lifetime limits.
 */
export function chargeTokens(
  principal: Principal,
  raw: RawCost,
  opts?: { idempotencyKey?: string }   // reserved — see §6 error cases
): Promise<ChargeResult>

/**
 * Read-only usage for `GET /account/me`. Never mutates.
 */
export function getUsage(principal: Principal): Promise<UsageSnapshot>

/**
 * Adds tokens to the extras bucket after a top-up webhook fires.
 * Enforces the "max 10 top-ups per calendar month" cap.
 * Called from paymentController, never directly from a controller or route.
 */
export function addExtras(
  uid: string,
  tokens: number,
  txnid: string,                 // idempotency key for top-up
): Promise<{ newExtrasBalance: number; extrasPurchasedThisMonth: number }>

/**
 * Reset the monthly pool to the tier's cap. Called by subscriptionStateMachine
 * on renew_success and purchase events. Month key rollover happens lazily
 * (see §4) — this is the explicit form.
 */
export function resetMonthly(uid: string, tier: Tier): Promise<void>

/**
 * Refund a charge that a controller kicked off but the downstream call
 * failed after the meter was debited (LH-06: image gen fails after charge).
 * Adds `tokens` back in the opposite order to the original drain.
 */
export function refundTokens(
  principal: Principal,
  tokens: number,
  originalConsumedFrom: 'monthly' | 'extras' | 'both',
  service: Service,
): Promise<void>

/**
 * Reserved — do not call directly. Exposed for testing and for an
 * Orchestrator-driven data migration. Not part of the runtime surface.
 */
export function _debugRebuildByService(uid: string): Promise<void>
```

Nothing else is exported. In particular, there is **no** `setTier()`, **no** `getGuestDoc()`, **no** `decrementGuest()`. All guest state mutation happens inside `chargeTokens` so there is one code path, not two.

---

## 2. Firestore document schemas

### 2.1 `users/{uid}/usage/{YYYY-MM}` — logged-in users

Month key is `YYYY-MM` in **UTC**, matching the user's current billing period rollover month. A user with period `2026-04-15 → 2026-05-14` will write to `2026-04` until April 30 UTC and roll to `2026-05` on May 1 UTC. This is deliberate: the daily reset is UTC-anchored; the monthly doc naming follows the same clock to keep reasoning simple. The *subscription period* boundary lives in `users/{uid}/subscription` (see `subscription-state.md`) and is an independent concern — `resetMonthly` is called on period-end, it clears `monthlyTokensUsed` on whichever month key is current, and the cycle continues.

```ts
// users/{uid}/usage/{YYYY-MM}
{
  tier: 'free' | 'pro' | 'promax',     // snapshot at charge time
  monthlyTokensUsed: number,            // >=0, this doc-month
  monthlyTokensCap: number,             // snapshot of the tier cap for this doc-month
  extrasBucket: number,                 // current balance, persists across months
                                        //   (actually stored on the parent user doc — see §2.2)
  extrasPurchasedThisMonth: number,     // count of successful top-ups this calendar month
  dailyTokensUsed: number,              // resets at UTC midnight (lazy)
  dailyResetAt: Timestamp,              // UTC midnight of "today"
  byService: {
    chat: number,
    image: number,
    tts: number,
    stt: number,
    vision: number,
    algolia: number,
    whatsapp: number,
  },
  updatedAt: Timestamp,
}
```

**Important:** `extrasBucket` is NOT month-scoped. It must persist across months. To avoid copying a mutable balance across documents, the **authoritative** extras balance lives on `users/{uid}` (parent doc, field `extrasBucket: number`) and the month doc mirrors it only in `getUsage` responses. `chargeTokens` reads/writes the parent for extras and the month doc for everything else, inside **one transaction**. `extrasPurchasedThisMonth` is month-scoped (on the month doc) — it resets naturally when a new month doc is created.

### 2.2 `users/{uid}` — parent user doc (extras bucket + tier)

```ts
// users/{uid}
{
  // …all existing fields from accountController are preserved…

  // NEW fields added by tokenMeter (the rest of the user doc is untouched):
  extrasBucket: number,                // persistent top-up pool; only ever
                                       //   mutated inside chargeTokens /
                                       //   addExtras / refundTokens transactions
  tierMirror: 'free' | 'pro' | 'promax',  // mirror of the Firebase custom claim.
                                       //   Read-only for the meter; written by
                                       //   subscriptionStateMachine. Used only
                                       //   as a fallback if the claim isn't set
                                       //   yet on a fresh session.
}
```

> **Open concern — see §9:** `tier` should come from the Firebase custom claim (PRD §6 point 10). We mirror to Firestore to survive claim-propagation lag (LH-43). That mirror is intentionally redundant, not the source of truth.

### 2.3 `guests/{guestId}` — guest counter doc

```ts
// guests/{guestId}
{
  msgCount: number,        // 0..10 (hard cap 10, lifetime per guestId)
  imgCount: number,        // 0..3  (lifetime per guestId)
  voiceCount: number,      // 0..3  (per-session — see guest branch logic)
  visionCount: number,     // 0..3  (per-session — see guest branch logic)
  firstSeenAt: Timestamp,
  ipHash: string,          // sha256(ip + PAYU/APP salt) — fingerprint-adjacent
  lastActivityAt: Timestamp,
  ttl: Timestamp,          // firstSeenAt + 7 days; Firestore TTL policy
                           //   → flag required in Firestore console. See §9.
}
```

Guest session-limited counters (voice/STT/vision) use the same doc because there is no separate session concept server-side. The PRD frames them as "session limit" but the implementation is "lifetime-per-guestId" — a guest that clears cookies gets a fresh 3 anyway (LH-21, accepted). The *effect* of the PRD rule is preserved: no guest can spam more than 3 voice calls on one `guestId`.

---

## 3. Conversion table (PRD §3.2 — the canonical numbers)

Implemented as `rawToTokens(raw: RawCost): number` — pure function, unit-tested:

| Service | Input | Formula (tokens) |
|---|---|---|
| `chat` | `promptTokens, completionTokens` | `promptTokens * 1 + completionTokens * 4` |
| `image` standard | — | `16_000 * count` |
| `image` hd | — | `32_000 * count` |
| `tts` | `characters` | `Math.ceil(characters * 0.3)` |
| `stt` | `seconds` | `Math.ceil((seconds / 60) * 7_000)` |
| `vision` | `imageCount` | `2_000 * imageCount` |
| `algolia` | `queries` | `50 * queries` |
| `whatsapp` | `messages` | `2_000 * messages` |

Rules:
- Always `Math.ceil` — never fractional tokens in the ledger.
- `rawToTokens` clamps negative inputs to 0 and logs (LH-05).
- Any new service requires a PR that edits both this table and the `rawToTokens` implementation in the same commit. No silent additions.

---

## 4. `chargeTokens` — atomic two-bucket ledger

Two-bucket ordering (PRD §6 point 1, §6.5): **drain `monthlyPool` first, then `extrasBucket`.** A single call may straddle the boundary. Daily cap evaluates against total consumption of the day (monthly + extras combined).

### 4.1 User branch — pseudocode

```
function chargeTokens(principal, raw):
  if principal.kind == 'guest': return chargeGuest(principal, raw)

  tokens = rawToTokens(raw)
  if tokens < 0: tokens = 0         // LH-05

  monthKey = currentUtcYearMonth()   // "2026-04"
  now      = serverNow()
  userDocRef  = db.doc(`users/${principal.id}`)
  monthDocRef = db.doc(`users/${principal.id}/usage/${monthKey}`)

  return db.runTransaction(async tx => {
    const userSnap  = await tx.get(userDocRef)
    const monthSnap = await tx.get(monthDocRef)

    // --- lazy month init ---
    let month = monthSnap.exists ? monthSnap.data() : null
    if (!month) {
      month = {
        tier: principal.tier,
        monthlyTokensUsed: 0,
        monthlyTokensCap: capFor(principal.tier),
        extrasPurchasedThisMonth: 0,
        dailyTokensUsed: 0,
        dailyResetAt: nextUtcMidnight(now),
        byService: zeroByService(),
        updatedAt: now,
      }
    }

    // --- lazy daily reset (LH-08) ---
    if (now >= month.dailyResetAt) {
      month.dailyTokensUsed = 0
      month.dailyResetAt = nextUtcMidnight(now)
    }

    const cap        = capFor(principal.tier)     // daily cap lookup
    const dailyCap   = dailyCapFor(principal.tier)
    const extras     = Number(userSnap.data()?.extrasBucket ?? 0)
    const monthRoom  = Math.max(0, month.monthlyTokensCap - month.monthlyTokensUsed)
    const totalRoom  = monthRoom + extras
    const dailyRoom  = Math.max(0, dailyCap - month.dailyTokensUsed)

    // --- cap checks ---
    if (tokens > dailyRoom) {
      return fail('daily_cap_exceeded', dailyRoom, monthRoom, extras, month.dailyResetAt)
    }
    if (tokens > totalRoom) {
      return fail('monthly_cap_exceeded', dailyRoom, monthRoom, extras, endOfMonth(monthKey))
    }

    // --- two-bucket drain ---
    let fromMonthly = Math.min(tokens, monthRoom)
    let fromExtras  = tokens - fromMonthly
    let consumedFrom =
      fromMonthly > 0 && fromExtras > 0 ? 'both'
      : fromMonthly > 0                 ? 'monthly'
      :                                   'extras'

    // --- writes (all inside the same transaction) ---
    month.monthlyTokensUsed += fromMonthly
    month.dailyTokensUsed   += tokens
    month.byService[serviceOf(raw)] += tokens
    month.updatedAt = now

    tx.set(monthDocRef, month, { merge: true })
    if (fromExtras > 0) {
      tx.update(userDocRef, { extrasBucket: extras - fromExtras })
    }

    return {
      allowed: true,
      tokensCharged: tokens,
      consumedFrom,
      remainingDaily:   dailyCap - month.dailyTokensUsed,
      remainingMonthly: month.monthlyTokensCap - month.monthlyTokensUsed,
      remainingExtras:  extras - fromExtras,
      reason: 'ok',
    }
  })
```

### 4.2 Pre-call estimate flow

`estimateCost` is a **non-transactional** read of the same two docs. It applies the conversion, does the cap math, and returns a verdict. If it reports `wouldExceedDaily` or `wouldExceedMonthly`, the middleware returns 402 before Azure is ever called. If it passes, the controller runs the Azure call and then calls `chargeTokens` with the **actual** measured cost, which re-runs the check inside a transaction for LH-03 safety.

**Pre-call estimation is conservative.** For chat we estimate `promptTokens = count(history + systemPrompt + userMessage, via tokenizer)` and `completionTokens = maxCompletionTokens` (i.e. the ceiling). This is intentionally pessimistic so a single burst call can never blow past the cap (LH-01). Post-call reconciliation uses the real numbers and never over-charges.

### 4.3 Daily reset rule (LH-04, LH-08)

Boundary is **UTC midnight**. Reset is **lazy**: the first `chargeTokens` after `now >= dailyResetAt` clears `dailyTokensUsed` to 0 and advances `dailyResetAt = nextUtcMidnight(now)` inside the same transaction that charges the current call. No cron. No background worker. No clock-skew surface — server time is the only time.

If two concurrent calls both observe a stale `dailyResetAt`, Firestore's transaction retry semantics make the second one re-read; whichever commits first performs the reset, the other sees the reset and charges against 0 + tokens. Clean.

### 4.4 Tier cap lookups

```ts
const MONTHLY_CAPS: Record<Tier, number> = {
  guest:  0,       // guests don't use the token ledger
  free:   300_000,
  pro:  3_000_000,
  promax: 8_000_000,
}

const DAILY_CAPS: Record<Tier, number> = {
  guest:  0,
  free:    50_000,
  pro:    300_000,
  promax: 800_000,
}
```

Caps live in this file and nowhere else. The PRD is the spec; this table is the implementation. If the PRD changes, both get updated in the same PR.

---

## 5. Guest branch — `chargeGuest(principal, raw)`

Guests do not use `monthlyTokensUsed` at all. They have hard counters keyed by action type:

| Service in call | Counter it increments | Hard limit |
|---|---|---|
| `chat` | `msgCount` | 10 |
| `image` | `imgCount` | 3 |
| `tts` | `voiceCount` | 3 |
| `stt` | `voiceCount` | 3 |
| `vision` | `visionCount` | 3 |
| `algolia` | none (free for guests) | — |
| `whatsapp` | **reject** — guests never send WhatsApp | — |

Pseudocode:

```
function chargeGuest(principal, raw):
  guestRef = db.doc(`guests/${principal.id}`)
  return db.runTransaction(async tx => {
    const snap = await tx.get(guestRef)
    const g = snap.exists ? snap.data() : {
      msgCount: 0, imgCount: 0, voiceCount: 0, visionCount: 0,
      firstSeenAt: now, ipHash: principal.ipHash, lastActivityAt: now,
      ttl: Timestamp.fromDate(new Date(now.getTime() + 7*24*3600*1000)),
    }
    const counter = counterFor(raw.kind)     // 'msgCount' | 'imgCount' | …
    const limit   = GUEST_LIMITS[raw.kind]
    if (g[counter] + 1 > limit) {
      return fail('guest_limit_exceeded', …)
    }
    g[counter] += 1
    g.lastActivityAt = now
    tx.set(guestRef, g, { merge: true })
    return ok(…)
  })
```

`whatsapp` and `algolia` for guests: `whatsapp` returns `allowed:false, reason:'guest_limit_exceeded'` because guests can't have reminders at all (PRD §4.1). `algolia` is free of charge for guests but still capped indirectly by the chat message count.

---

## 6. Error cases & edge handling

| Case | Handling |
|---|---|
| Firestore transaction throws (quota / network) | `chargeTokens` catches, logs, returns `{ allowed: false, reason: 'firestore_unreachable' }`. Caller (controller) treats as a 503 and does NOT make the Azure call. This is **fail-closed** — we'd rather drop a request than lose the charge. |
| Azure returns negative or undefined token values | `rawToTokens` clamps to 0 and logs a `[tokenMeter] zeroed cost` warning. Never crashes. |
| Partial consumption across monthly→extras boundary | One transaction writes both: `monthlyTokensUsed += fromMonthly` AND `extrasBucket -= fromExtras`. Single commit; never partial. |
| Estimate passes but reconciliation fails cap (concurrent drain, LH-03) | Reconciliation returns `allowed:false, reason:'monthly_cap_exceeded'`. Caller refunds the *already-completed* Azure call — but the user's usage counter does NOT go negative (we just skipped the debit). The user gets the output for free on that one call. Accepted: it's rare, and it's preferable to double-charging. |
| Image gen charged, then Azure image gen errors after HTTP 200 | Caller invokes `refundTokens(...)` — reverses the debit in opposite order (extras first, then monthly). |
| `addExtras` called with negative or zero tokens | Rejects with a thrown error. This is a programming bug, not a runtime case. |
| `addExtras` called with `extrasPurchasedThisMonth >= 10` | Rejects with thrown `TopUpCapExceededError`. Caller (paymentController) translates to 409. |
| User's tier changes mid-call | `chargeTokens` reads `tierMirror` at the start of the transaction, so the user's current tier is what applies. A tier change between estimate and charge is cosmetic — the transaction's cap check is authoritative. |
| `idempotencyKey` option | Reserved for the top-up path and for the webhook retry path. V1 implementation ignores it for chat/image/etc (those are naturally idempotent-unsafe anyway — you made the call, you pay). Top-up path uses `txnid` as the key inside `addExtras`. |

---

## 7. Integration points

`chargeTokens` is called from exactly these sites (and nowhere else):

| Call site | File | Cost kind |
|---|---|---|
| Chat completion (including vision chat) | `controllers/chatController.ts` | `chat` + optionally `vision` |
| Image generation | `controllers/imageController.ts` | `image` |
| TTS synthesis | `controllers/ttsController.ts` | `tts` |
| STT transcription | `controllers/transcribeController.ts` | `stt` |
| Algolia product search | `services/algoliaProducts.ts` (or the stylist tool that calls it) | `algolia` |
| WhatsApp reminder send | `services/whatsappReminderService.ts` | `whatsapp` |

`estimateCost` is called from `middleware/quotaMiddleware.ts` — see that spec. No controller calls `estimateCost` directly; the middleware handles the pre-call check and attaches `req.quotaContext`.

---

## 8. Test matrix (for QA)

- UC-12 Free user chat: input+output charged correctly (1× + 4×)
- UC-16 Free user hits daily 50k → reason `daily_cap_exceeded`, monthly untouched
- UC-22, UC-25 Pro/Pro Max hit monthly cap cleanly, no model downgrade
- UC-23, UC-25a Top-up flow: `addExtras`, subsequent charge drains monthly first
- UC-25b Month rollover with unused extras: extras persist, monthly resets
- LH-01 Single 100k-token prompt rejected by `estimateCost`
- LH-02 Mid-stream disconnect: partial tokens debited (caller responsibility — call `chargeTokens` with measured cost)
- LH-03 Concurrent calls: Firestore transaction retries, no double-spend
- LH-04 Client sends future timestamp: ignored, server time used
- LH-05 Azure returns `{prompt_tokens:0,completion_tokens:0}`: zero charge
- LH-06 Image gen fails post-charge: `refundTokens` reverses cleanly
- LH-08 Daily reset across midnight: first call after boundary resets

---

## 9. Open architectural concerns

These go to the Orchestrator for human review. None are blockers for *spec* work — they are flagged so the Orchestrator can direct the Backend and Payment Master agents accordingly.

1. **Firebase TTL on `guests/{guestId}`.** The spec relies on Firestore TTL to purge guest docs after 7 days. TTL is enabled in the Firebase console, not in code, and is therefore **out of scope for this sprint's guardrails**. If TTL is not already enabled on this project, the guest collection will grow unbounded. Flag to human: confirm TTL policy state, or accept unbounded growth for now.

2. **Tier source of truth: custom claim vs. Firestore mirror.** PRD §6 point 10 mandates Firebase custom claim as the source. The existing `auth.ts` middleware does **not** currently read custom claims — it only attaches `{ uid, email, emailVerified, authTime }` (see `easebot-backend/src/middleware/auth.ts` lines 40-45). Someone must either (a) extend `auth.ts` to include `decoded.tier` on `req.user`, or (b) the `quotaMiddleware` must read the tier from `users/{uid}.tierMirror` on every request. Option (a) is faster and matches the PRD; option (b) is strictly within current guardrails (no auth-middleware touch).  **Recommendation: extend `auth.ts` minimally — read `decoded.tier` with a Firestore fallback. This is an *extension*, not a re-architecture, so it respects Guardrail 4 (no breaking auth changes).** Flag to human for explicit approval.

3. **Existing `usageService.ts` is client-SDK-based.** The current `incrementUserUsage` in `easebot-backend/src/services/usageService.ts` uses the **client** Firestore SDK (`firebase/firestore`) — lines 1-2 — not the Admin SDK. It writes to `users/{uid}.usage.*` (a flat map), not `users/{uid}/usage/{YYYY-MM}` (a subcollection). The new `tokenMeter` uses `adminDb` (Admin SDK) and subcollections. That's the right move, but we must decide whether to (a) delete `usageService.ts` and its call sites, (b) keep it as a legacy dual-write during Phase 0, or (c) have `tokenMeter` write *both* shapes until the frontend reads the new one. **Recommendation: (a)** — gut the old service in the same commit that wires `tokenMeter` into `chatController`. The existing shape has zero enforcement and zero production consumers outside of an unrelated settings UI display.

4. **`monthlyTokensCap` snapshotted per month doc.** If a user upgrades mid-month, their month doc's `monthlyTokensCap` is stale until `resetMonthly` is called on period end. The spec handles this correctly (new cap applies on next period start), but it means a user upgrading from Free (300k) to Pro (3M) on April 20 keeps the 300k cap on the April doc until May 1 UTC. `subscriptionStateMachine` MUST call `resetMonthly` on purchase/upgrade to bump the cap immediately. See `subscription-state.md` §4.

5. **`byService.whatsapp` vs reminder scheduler.** The reminder scheduler runs in-process (not per-request). When it fires, there is no HTTP request, no `req.user`, no middleware — the scheduler constructs a `Principal` manually. We need a `chargeTokensAsSystem(uid, raw)` helper, OR the scheduler must look up the user's tier from Firestore before calling `chargeTokens`. **Flagged for Backend agent to resolve** — the shape is obvious but it's not implemented here.
