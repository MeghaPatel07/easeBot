# WE-20260601-205: Mid-stream network drop — no Last-Event-ID reconnect / resume; user message left dangling (Flow E step 3)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-205` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `qa-e2e-playwright` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `e2e-flow` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/services/functionsService.ts:184-201` (SSE reader loop) ; `src/hooks/useChat.ts:511-611, 798-860` |
| **URL / Page** | `/chat` mid-stream |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description
Flow E step 3 expects: "Restore network → verify reconnect." The SSE client has NO reconnect logic.
Once `streamChatMessage` has a 200 and is reading the body (functionsService.ts:184-200), if the
network drops MID-STREAM, `reader.read()` rejects with a `TypeError`. That bubbles out of the async
generator into `useChat.sendMessage`'s catch (useChat.ts:798). It is not an `AbortError` and carries
no `code`, so it falls through to the generic path and the partially-streamed assistant placeholder is
replaced by "Something went wrong. Please try again." (useChat.ts:829, 848-860).

Crucially:
- There is NO `Last-Event-ID` header sent and NO resume attempt, despite a code comment at
  useChat.ts:573 that explicitly references "reconnects via Last-Event-ID" — that path is referenced
  but never implemented on the client. `streamChatMessage` reads the body once, top to bottom, no retry.
- For logged-in users the user message was already persisted to Firestore BEFORE the stream
  (useChat.ts:481), but the assistant reply was not. After a mid-stream drop the thread is left with a
  dangling user turn and no assistant reply; on reload the partial streamed text is gone entirely
  (it was only in component state).
- No duplicate-message guard is exercised because no reconnect happens — but it also means Flow E
  step 4 ("verify no duplicate messages after reconnect") is vacuously "passing" only because reconnect
  never occurs.

## Steps to reproduce (by reading)
1. Logged-in user sends a message; user turn persisted (useChat.ts:481), stream starts (200).
2. Network drops while `reader.read()` is mid-body (functionsService.ts:189).
3. `reader.read()` rejects → generator throws TypeError → useChat.ts:798 catch.
4. Not AbortError, no `code` → generic "Something went wrong" bubble (useChat.ts:829).
5. No reconnect attempted; partial text discarded; Firestore has user turn but no assistant turn.

## Expected
On a mid-stream transport failure, attempt a bounded reconnect/resume (the documented Last-Event-ID
path) or at minimum offer an explicit "Reconnect / Resend" affordance, and reconcile the dangling
user turn. Distinguish transient drop from server fault.

## Actual
Stream silently ends as a generic error bubble; no reconnect, no resume, dangling Firestore user turn.

## Evidence
- STATIC — needs live re-verify (DevTools throttling) when MCP+backend restored.
- SSE loop: `src/services/functionsService.ts:184-201`. Catch: `src/hooks/useChat.ts:798-860`.
- Phantom Last-Event-ID reference: `src/hooks/useChat.ts:573` comment vs no client implementation.

## Notes
fix-frontend / fix-backend-api (resume endpoint). DISTINCT from WE-20260601-300 (edge agent) which
covers the PRE-stream offline fetch reject + generic-error/no-offline-copy; THIS ticket is the
post-200 MID-STREAM reader drop + missing reconnect/resume + dangling-turn reconciliation. Cross-ref
-300 to avoid double-fixing the generic-error-copy half. Not in marathon-master-2026-05-29.csv.

---
_Filed by `qa-e2e-playwright` on `2026-06-01T00:00:00Z`._
