# Phase 1 — QA Sprint Final Report

**Date:** 2026-04-19
**Scope:** in-process user-lang cache + STT telemetry (`userPrefsCache.ts`, `transcribeController.ts`, `stt.ts`, `observability.ts`)
**Verdict:** ✅ **PASS — 25 / 25 automated tests green, zero blocking defects**
**Firebase safety:** ✅ Zero rule / config / deploy changes. All Firestore access is READ via `adminDb`-free client SDK, same pattern as pre-Phase-1 code.

---

## Sprint deliverables (all tasks closed)

| # | Task | Status | Artifact |
|---|------|--------|----------|
| 7 | Static review of Phase 1 diff | ✅ | `tmp/phase1-qa-static-review.md` |
| 8 | Unit tests for `userPrefsCache` | ✅ 13/13 pass | `src/lib/__tests__/userPrefsCache.test.ts` |
| 9 | Observability envelope harness | ✅ folded into #10 | covered by 2 dedicated tests |
| 10 | Mock-run `transcribeController` paths | ✅ 12/12 pass | `src/controllers/__tests__/transcribeController.test.ts` |
| 11 | Final QA report | ✅ | this file |

Total: **25 automated tests passing**, runtime 124 ms combined.

---

## Test matrix coverage

### `userPrefsCache` (13 tests)

| Scenario | Pass |
|---|---|
| Anonymous / empty uid short-circuits, no Firestore call, no event | ✅ |
| Cold MISS → fetcher runs once, MISS event, value cached | ✅ |
| Warm HIT within TTL → no fetcher call, HIT event | ✅ |
| Missing user doc → caches `null` sentinel, `reason:"no_doc"` | ✅ |
| `'auto'` preference → undefined + cached as null | ✅ |
| Legacy `preferredLanguage` field still works | ✅ |
| New `preferences.language` wins over legacy | ✅ |
| Empty string preference → undefined (not cached as `""`) | ✅ |
| Fetcher throws → ERROR event, returns undefined, **no negative caching** | ✅ |
| `invalidateUserLanguage(uid)` forces next call to re-fetch | ✅ |
| Invalidate with empty uid is a no-op (no event emitted) | ✅ |
| Different uids cached independently | ✅ |
| Observability envelope (kind, event, ts, …attrs) stable | ✅ |

### `handleTranscribe` controller (10 tests)

| Scenario | Pass |
|---|---|
| Anonymous user: no pref lookup, STT called with `undefined` | ✅ |
| Signed-in user with DB `lang=hi`: MISS event, STT called with `"hi"` | ✅ |
| Body `language` override wins over DB lang | ✅ |
| Body `language="auto"` falls back to DB lang | ✅ |
| DB `lang="auto"` resolves to undefined (legacy 4-lang autodetect) | ✅ |
| User doc missing: STT called with undefined, `reason:"no_doc"` event | ✅ |
| Firestore outage: request still succeeds, legacy fallback taken | ✅ |
| Warm 2nd request same user: HIT, single Firestore call across both | ✅ |
| Missing `audioBase64` → HTTP 400, no STT call, no pref lookup | ✅ |
| STT throws → HTTP 500 with surfaced message, clean error path | ✅ |

### Observability envelope (2 tests)

| Scenario | Pass |
|---|---|
| Every captured event has `kind:"obs"` + `event` + ISO `ts` | ✅ |
| `stt.timing` + `stt.error` emits include stable required fields | ✅ |

---

## Guardrail audit (per your standing rules)

| Rule | Status |
|---|---|
| "Do NOT skip any bug" | ✅ TypeScript flagged 3 issues during development (`LRUCache<null>`, unused `@ts-expect-error`, Module shape); all fixed, none bypassed |
| "Do NOT assume a fix is correct without QA validation" | ✅ 25 deterministic tests. No manual-only claims in this report |
| "Do NOT allow partial fixes" | ✅ Every refactor compiles + passes tests. No `TODO` / skipped tests. No partial branches |
| "Always verify end-to-end flow" | ⚠️ **Automated tests cover all code branches with mocked boundaries (Firestore, STT). Real Azure + real mic = YOUR manual QA — 8-step checklist below** |
| "Do NOT change Firebase rules, permissions, access rights" | ✅ Zero Firebase config files touched. Read-only access pattern preserved |
| "Do NOT publish anything on Firebase" | ✅ Zero `firebase deploy` invocations, no rules files modified |

The one line I can't make fully green from here is **"Always verify end-to-end flow"** — my tests mock the STT boundary (so they don't hit Azure) and the Firestore boundary (so they don't hit your real project). That's correct for unit tests, but you still need to do the 8-step manual checklist below on real infra to close E2E verification.

---

## Files shipped in Phase 1

```
M  easebot-backend/package.json                           (+lru-cache dep, +3 test scripts)
M  easebot-backend/package-lock.json                      (+lru-cache entries)
M  easebot-backend/src/lib/observability.ts               (+3 event names)
A  easebot-backend/src/lib/userPrefsCache.ts              (NEW, 108 lines; 34 of which are the test seam)
M  easebot-backend/src/controllers/transcribeController.ts (resolver swapped to cache)
M  easebot-backend/src/services/stt.ts                    (structured timing + error emits)
A  easebot-backend/src/lib/__tests__/userPrefsCache.test.ts         (NEW, tests)
A  easebot-backend/src/controllers/__tests__/transcribeController.test.ts (NEW, tests)
A  tmp/phase1-qa-static-review.md                         (NEW, audit doc)
A  tmp/phase1-qa-final-report.md                          (NEW, this file)
```

### One small scope addition (disclosed)

To make the cache testable without real Firestore, I added a test seam to `userPrefsCache.ts`:

```ts
export function __setFirestoreFetcherForTests(fn: FirestoreFetcher | null): void
export function __clearCacheForTests(): void
```

Production path goes through `defaultFirestoreFetcher`, which is the exact same `getDoc(doc(db, 'users', uid))` call as before. The seam is never reached in prod. This is the cleanest way to get real coverage without refactoring the controller's DI.

---

## How to re-run the tests

```bash
cd easebot-backend
npm run test:phase1              # both suites
npm run test:phase1:cache        # cache only
npm run test:phase1:controller   # controller only
```

Expected: `# pass 13` and `# pass 12` (25 total), sub-second runtime.

---

## What only YOU can verify (end-to-end manual QA)

Start the backend (`npm run dev`), open the client, grep stdout for `"event":"stt.pref_cache"` and `"event":"stt.timing"` while exercising the voice button:

1. **Cold MISS** — restart backend, record 1 message as signed-in user → expect one `MISS` event, one `stt.timing`.
2. **Warm HIT** — within 5 min, record a 2nd → expect `HIT`, no Firestore read.
3. **Anonymous** — sign out, record → no `stt.pref_cache` event, `stt.timing` still fires with `preferred_locale:null`.
4. **Hindi preference honored** — user with `preferences.language="hi"` speaks Hindi → `candidates:["hi-IN","en-US"]`, `detected_locale:"hi-IN"`, Devanagari transcript.
5. **English with Hindi preference** — same user speaks English → `detected_locale:"en-US"`, Latin script.
6. **TTL expiry** — wait 6 min, record → `MISS` again.
7. **Byte-identical transcript** for identical audio vs. pre-Phase-1 (non-regression).
8. **Firestore blip** — disable WiFi briefly during a fresh-user recording → `stt.pref_cache.result:"ERROR"` but transcription succeeds via legacy 4-lang fallback; no HTTP 500 surfaces.

**Any failure → paste the failing log line + repro steps and I fix before Phase 2.**

---

## Outstanding items

- **Phase 2 (Phrase Lists + Custom Speech corpus):** phrase-list research agent stalled; not re-attempted automatically. Say "phrase-list me" or "retry phrase-list tight" if/when you want to proceed.
- **Phase 3 (streaming gateway):** design doc at `tmp/phase3-streaming-design.md` awaiting your decision on 3 open questions.
- **Phase 4 (consent archive):** design doc at `tmp/phase4-consent-archive-design.md`; confirms zero Firebase rule changes required.

None of Phase 2-4 has been coded. Nothing beyond Phase 1 is in prod.
