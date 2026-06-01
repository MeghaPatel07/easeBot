# WE-20260601-301: 429 chat-burst rate-limit surfaces as generic "Something went wrong" — no "slow down" message

| Field | Value |
|---|---|
| **ID** | `WE-20260601-301` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/services/functionsService.ts:168-182`, `src/hooks/useChat.ts:829` |
| **URL / Page** | `/chat` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|

## Description
The backend `chatBurstRateLimiter` (10 msgs / 10s) returns
`429 { error: 'chat_burst_limit', retryAfter: 10 }`
(`easebot-backend/src/middleware/rateLimiter.ts:34-38`). The frontend stream client
only special-cases `402` (quota). For `429`, `streamChatMessage` falls into the
generic `if (!res.ok)` branch (`functionsService.ts:179-182`) and throws
`new Error('chat_burst_limit')`. `useChat`'s catch (`useChat.ts:829`) doesn't
recognise that code, so the user sees "Something went wrong. Please try again." —
which actively encourages the exact retry behaviour the limiter is trying to stop.

The spec requires a "429 rate limit → 'slow down' message." That message never
reaches the user; instead they get a scary generic failure and the raw internal
code string `chat_burst_limit` becomes the (unshown) Error message.

## Steps to reproduce (by reading)
1. Send >10 messages within 10s → backend returns 429 `chat_burst_limit`.
2. `streamChatMessage` has no 429 branch → throws `Error('chat_burst_limit')`.
3. `useChat` generic catch → "Something went wrong. Please try again."

## Expected
Detect `res.status === 429`, read `retryAfter`, and surface a friendly
"You're sending messages a bit fast — please wait ~10 seconds and try again."
(disable the send button for `retryAfter` seconds if feasible).

## Actual
Generic error bubble; no rate-limit awareness; encourages immediate retry.

## Notes
STATIC — needs live re-verify. Related: WE-20260527-047 (backend 429 lacks
Retry-After header) is the server side; this ticket is the unhandled client side.

---
_Filed by `edge-case-qa` on `2026-06-01`._
