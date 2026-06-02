# WE-20260601-300: Offline / network-failure send shows generic "Something went wrong" — no offline-aware retry UI

| Field | Value |
|---|---|
| **ID** | `WE-20260601-300` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/hooks/useChat.ts:825-860`, `src/services/functionsService.ts:150-201` |
| **URL / Page** | `/chat` |
| **Breakpoint** | `all` |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/118 |

## Description
When the device is offline (or the backend host is unreachable), `fetch()` inside
`streamChatMessage` / `post` rejects with a `TypeError: Failed to fetch`. That error
is NOT an `AbortError` and carries no `code`, so it falls straight through to the
generic catch in `useChat.sendMessage` and renders an in-chat bubble reading
"Something went wrong. Please try again." There is no `navigator.onLine` check,
no "you're offline — we'll retry when you're back" affordance, and no auto-retry.

The spec for offline behaviour ("Offline → send message → expect 'you're offline,
retry when back' UI") is not met. The user cannot tell a transient network drop
apart from a real server fault, and the already-persisted user message (written to
Firestore at `useChat.ts:481` BEFORE the stream starts) is left dangling with no
assistant reply on reload.

## Steps to reproduce (by reading)
1. `streamChatMessage` (`functionsService.ts:161`) calls `fetch()` with no offline guard.
2. Offline → fetch rejects with `TypeError`, not handled distinctly anywhere.
3. `useChat.ts:798` catch: `err.name !== 'AbortError'`, `err.code` undefined →
   `errorText = 'Something went wrong. Please try again.'` (line 829).
4. Bubble appended; no retry button, no offline copy, user msg already in Firestore.

## Expected
Detect offline / network-failure distinctly (e.g. `!navigator.onLine` or a
`TypeError` from fetch with no response) and surface a dedicated "You appear to be
offline. Your message is saved — we'll retry when you're back online." state with a
manual Retry action, and ideally a `window 'online'` listener to auto-retry.

## Actual
Generic "Something went wrong. Please try again." bubble; no offline detection,
no retry, dangling user turn persisted server-side.

## Notes
STATIC — needs live re-verify when MCP+backend restored. Same generic-error
collapse also hides 429 and 400-too-long responses (see WE-20260601-301/302).

---
_Filed by `edge-case-qa` on `2026-06-01`._
