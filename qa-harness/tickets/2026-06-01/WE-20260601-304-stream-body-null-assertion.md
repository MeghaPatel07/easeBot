# WE-20260601-304: streamChatMessage `res.body!` non-null assertion throws a raw TypeError on bodyless 200 responses

| Field | Value |
|---|---|
| **ID** | `WE-20260601-304` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/services/functionsService.ts:184` |
| **URL / Page** | `/chat` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|

## Description
`const reader = res.body!.getReader()` uses a non-null assertion. A `2xx` response
with a null/absent body — possible when an intermediary returns `204`, a proxy
strips the body, or a buggy gateway answers `200` with no stream — makes
`res.body` null. `.getReader()` then throws `TypeError: Cannot read properties of
null`, which bubbles out as the generic "Something went wrong" (it's not an
AbortError). Worse, if `res.body` is null because of a CDN/proxy fault, the user's
message is already persisted and the turn dangles.

## Steps to reproduce (by reading)
1. Backend or intermediary returns an `res.ok` response with `res.body === null`.
2. `res.body!.getReader()` (line 184) → uncaught `TypeError`.
3. Surfaces as generic error; no SSE-specific guidance.

## Expected
Guard `if (!res.body) throw new Error('No response stream — please retry.')` (or
treat as a retryable network error) so the failure is explicit and recoverable.

## Actual
Non-null assertion throws a raw `TypeError` that collapses to the generic error path.

## Notes
STATIC — low likelihood but trivial to harden; grouped with the stream-robustness
cluster (WE-20260601-303).

---
_Filed by `edge-case-qa` on `2026-06-01`._
