# WE-20260601-402: Chat hot-path runs independent Firestore reads sequentially (profile getDoc + getChatHistory) before LLM — serial waterfall on every turn

| Field | Value |
|---|---|
| **ID** | `WE-20260601-402` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-performance` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `perf` |
| **Repo** | `easebot-backend` |
| **Path** | `src/controllers/chatController.ts:677-708 (non-stream) and 1208-1231 (stream)` |
| **URL / Page** | `POST /api/chat` and `POST /api/chat/stream` |
| **Breakpoint** | `n/a (backend)` |
| **Status** | `triaged`|
| **Assigned** | `fix-backend-api`|

## Description

Both chat handlers build a strictly sequential await chain before the LLM call, even though several steps are independent of each other:

```
const resolvedLanguage = await resolveRequestLanguage(language, uid)   // Firestore (settings) read
const { englishText, detectedLanguage } = await processInbound(...)    // STT / translate round-trip
const mode = requestedMode ?? detectMode(englishText)
const history = await getChatHistory(threadId, providedHistory)        // Firestore getDocs (10 msgs)  ← independent of profile
if (isLoggedIn) { const profileSnap = await getDoc(doc(db,'users',uid)) } // Firestore getDoc           ← independent of history
const { prompt } = await buildSystemPrompt(...)                        // may query Algolia
```

`getChatHistory(threadId)` (line 680/1211) and the user-profile `getDoc(doc(db,'users',uid))` (line 687/1217) are completely independent — neither consumes the other's output — yet they execute one-after-another, each paying a full Firestore round-trip. They could run in a single `Promise.all([...])`. On a turn where history fetch and profile fetch are each ~50-150ms, this is ~100-300ms of avoidable serial latency added to every chat turn's time-to-first-token.

Additionally, the profile `getDoc(doc(db,'users',uid))` here is likely a REDUNDANT read: `tokenMeter` already reads `doc('users', uid)` for tier resolution (`getTier` → tokenMeter.ts:191, `chargeUser` → tokenMeter.ts:589 reads the same userRef). The same user doc is fetched 2-3 times per turn across the quota gate and the controller. A shared read (pass the snapshot through `req.quotaContext`) would remove a round-trip.

## Steps to reproduce (by reading)

1. Trace any `POST /api/chat/stream` turn for a logged-in user.
2. Observe: resolveRequestLanguage → processInbound → getChatHistory → profile getDoc all awaited serially (lines 1208-1217), and the user doc re-read by tokenMeter.

## Expected

- `Promise.all([getChatHistory(threadId, providedHistory), isLoggedIn ? getDoc(userRef) : null])` — they have no data dependency.
- Reuse the user snapshot already loaded by the quota/tokenMeter path instead of re-fetching `doc('users', uid)`.

## Actual

Independent Firestore reads serialized; user doc fetched multiple times per turn — extra latency on the chat critical path.

## Notes

STATIC — needs live re-verify (Server-Timing / span trace) when backend restored. Distinct from in-flight PR #103 (translation withRetry) and #101 (scheduler deferral). Specialist: fix-backend-api.

---

_Filed by `qa-performance` on `2026-06-01`._
