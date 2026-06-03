# WE-20260601-303: Chat stream has no timeout — a hung/stalled backend leaves the user stuck on "thinking" forever

| Field | Value |
|---|---|
| **ID** | `WE-20260601-303` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/services/functionsService.ts:40-67, 150-201` |
| **URL / Page** | `/chat` |
| **Breakpoint** | `all` |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/118 |

## Description
Neither `post()` nor `streamChatMessage()` applies any request/idle timeout. The only
`AbortSignal` plumbed in is the user-driven Stop button. If the backend accepts the
connection but then stalls — slow-3G stall, dead Azure upstream holding the socket,
reverse-proxy buffering, a backend that 200s the SSE headers then never writes a
`data:` line — the generator awaits `reader.read()` (line 189) indefinitely. `isTyping`
stays `true`, the composer shows the Stop button forever, and no error is ever raised.

The spec's "Stream interrupted mid-token → 'tap to resume' or auto-retry" and "Slow 3G
→ app should show loading/skeleton, not blank" are not satisfied for the stalled case:
there is a skeleton, but it never resolves or fails. The user's only recourse is to
manually press Stop (which records a "*You stopped this response*" bubble — wrong
framing, the user didn't stop it).

## Steps to reproduce (by reading)
1. `streamChatMessage` opens `fetch` with only the user `signal` — no timeout (line 161).
2. Backend writes SSE headers then stalls (or socket held open by a proxy).
3. `await reader.read()` (line 189) never resolves; loop never exits.
4. No `setTimeout`/idle-watchdog aborts it → `isTyping` stuck true indefinitely.

## Expected
Add an idle/overall timeout (e.g. abort if no chunk received within N seconds, or a
hard request ceiling) that aborts the fetch and surfaces a retryable
"The response stalled — tap to retry" state distinct from a user-initiated Stop.

## Actual
No timeout; a stalled backend pins the UI in the streaming state forever with no
error and no auto-recovery.

## Notes
STATIC — needs live re-verify with DevTools throttling/backend kill once MCP+backend
restored. `res.body!` non-null assertion (line 184) is a separate adjacent risk — see
WE-20260601-304.

---
_Filed by `edge-case-qa` on `2026-06-01`._
