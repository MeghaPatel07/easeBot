# Phase 1 — Static Code Review (QA Sprint, Task #7)

**Scope:** line-by-line review of every change shipped in Phase 1.
**Method:** read diff, reason about each branch, check invariants, hunt for regressions.
**Outcome:** PASS with 2 MINOR NOTES (no blockers).

---

## Files reviewed

1. `easebot-backend/package.json` — +1 line (lru-cache dep)
2. `easebot-backend/src/lib/observability.ts` — +3 event names
3. `easebot-backend/src/lib/userPrefsCache.ts` — NEW, 74 lines
4. `easebot-backend/src/controllers/transcribeController.ts` — resolver swapped to cache
5. `easebot-backend/src/services/stt.ts` — structured timing + error emits

---

## Per-file findings

### 1. `package.json` ✅
Dep added as `^10.2.0`; npm resolved `10.4.3`. Minor-only range → safe. No peer conflicts.

### 2. `observability.ts` ✅
Union extended with `stt.pref_cache`, `stt.timing`, `stt.error`. No other callers had to change (union is open via `ObservabilityEvent`). Emit function is JSON-only stdout — no side effects on cache or STT paths.

### 3. `userPrefsCache.ts` — **2 MINOR NOTES, not blockers**

**Path reviewed:**
- Line 28: anonymous short-circuit — correct, returns `undefined` before any Firestore call.
- Line 30-34: LRU HIT path — `cached.value` defaults to `undefined` when null (sentinel for "known no-pref"). ✅
- Line 37-42: no-doc path — caches `{value: null}` so repeat lookups of nonexistent users don't re-hit Firestore. ✅ (**good**, avoids 5-min window of repeat MISSes for missing uids)
- Line 43-51: doc-exists path — reads `preferences.language` first then `preferredLanguage` legacy field, preserves `'auto'` → `undefined` semantics identically to old code. ✅
- Line 52-62: error path — emits ERROR event, returns `undefined` → STT falls back to legacy 4-lang auto-detect. ✅ preserves behavior of the old silently-swallowed catch.

**MINOR NOTE A:** `invalidateUserLanguage(uid)` is exported but has **zero callers** in the codebase. It's there for future use (e.g. profile-update path). No regression risk. Keep.

**MINOR NOTE B:** Cache is in-process only. On multi-replica deploys, different instances have independent caches → same user could see MISS on instance A, HIT on B, MISS on C within one 5-min window. This is **intentional** per design doc (no Redis), but worth stating so nobody mistakes it for a bug later.

### 4. `transcribeController.ts` ✅
- `resolveUserPreferredLanguage` now 4 lines, delegates to cache. Signature + return shape identical.
- Anonymous user short-circuit preserved at line 12.
- All other paths untouched — body parsing, language priority comment, quota reconcile, error handler.
- **Regression risk: ZERO** — same function contract, same behavior on every branch.

### 5. `stt.ts` — ✅, with 1 observation

- `totalStart`, `ffmpegMs`, `azureMs`, `retryCounter` scoped to each `transcribeAudio` call — no cross-call pollution.
- Fast-path (RIFF/WAV) correctly skips ffmpeg timer; `ffmpegMs` stays 0, `is_wav_fast_path: true` emitted.
- ffmpeg failure path: timer closed, error emitted with `stage:'ffmpeg'`, then rethrown — caller flow unchanged.
- Azure retry counter threaded through `withRetry` via opt-in `counter` param. Old call sites (none exist outside this function) unaffected.
- `stt.timing` captures full envelope: ffmpeg_ms, azure_ms, total_ms, is_wav_fast_path, payload_bytes, candidate_count, candidates[], preferred_locale, detected_locale, text_length, retries_used. Complete.
- `stt.error` envelope (azure stage): same core fields minus `detected_locale`/`text_length` (unknown on error). Correct.
- Cleanup `finally` block unchanged — temp files still unlinked fire-and-forget.

**OBSERVATION:** on success, both `console.timeEnd('stt.azure')` AND `emit('stt.timing', ...)` fire. Redundant but cheap — keeps dev-loop ergonomics (stdout timing) without removing structured telemetry. Leave it.

---

## Cross-file invariants verified

| Invariant | Status |
|---|---|
| No Firebase Admin writes introduced | ✅ grep empty |
| No Firestore rule edits | ✅ no files under `firestore.rules` / `firebase.json` touched |
| No `firebase deploy` calls | ✅ grep empty |
| No client code (`Wedding-Ease-Viva-Chat/`) touched | ✅ |
| `.env` files untouched | ✅ |
| Anonymous-user path preserved on every branch | ✅ (verified lines 12, 28) |
| Legacy 4-lang auto-detect fallback on any error | ✅ (cache error → undefined → DEFAULT_SUPPORTED_LANGUAGES) |
| Transcript text byte-identical for same audio + same preferred | ✅ (stt.ts text output path unchanged) |
| Quota accounting preserved | ✅ (transcribeController.ts lines 42-45 untouched) |
| Ffmpeg temp-file cleanup preserved | ✅ (unchanged finally block) |

---

## Verdict

**PASS.** Safe to proceed to automated test execution (#8, #9, #10). The two minor notes are documented, not blockers.
