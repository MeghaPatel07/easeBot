# WE-20260601-200: Guest cap-hit "Sign up" CTA routes to /signup — no such route — 404 (golden-path conversion break)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-200` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `qa-e2e-playwright` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `e2e-flow` |
| **Repo** | `Wedding-Ease-Viva-Chat` + `easebot-backend` |
| **Path** | `easebot-backend/src/middleware/quotaMiddleware.ts:185-187` → `Wedding-Ease-Viva-Chat/src/components/pricing/CapHitBanner.tsx:40-50` ; also `Wedding-Ease-Viva-Chat/src/hooks/useChat.ts:840` ; router `src/App.tsx:70-105` |
| **URL / Page** | Guest cap-hit banner / in-chat guest-limit message → `/signup?from=guest-cap` |
| **Breakpoint** | all |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/118 |
| **Progress** | fix-WE-20260601-200-chat-send-resilience |

## Description
This is the Flow F (tier-upgrade) + Flow A step-7 (guest limit) conversion moment, and the CTA 404s.

The backend `quotaMiddleware.sendQuotaExceeded` emits, for a guest principal:
`upgradeUrl = '/signup?from=guest-cap'` (quotaMiddleware.ts:185-187). On a 402 from
`/api/chat/stream`, `functionsService` dispatches `QUOTA_EVENT` with that payload, and
`CapHitBanner` renders `<Link to={payload.upgradeUrl.replace(/^\//,'/')}>` (a no-op replace)
→ React-Router navigates to `/signup?from=guest-cap`.

But `src/App.tsx` has **no `/signup` route** — only `/login` exists. `/signup` falls through to
the catch-all `<Route path="*" element={<NotFound />} />`. So the guest, at the exact moment
they are most likely to convert, lands on the 404 page.

Independently, `useChat.sendMessage`'s quota catch builds the in-chat message
`"You've reached the guest limit. [Sign up](/signup) ..."` (useChat.ts:840) — the same dead
`/signup` target (and that markdown link also opens in a new tab; see WE-20260601-201).

## Steps to reproduce (by reading)
1. Guest sends messages until the backend returns 402 `reason='guest_limit_exceeded'`.
2. `quotaMiddleware.ts:187` sets `upgradeUrl='/signup?from=guest-cap'`.
3. `CapHitBanner.tsx:41` renders `<Link to="/signup?from=guest-cap">Sign up</Link>`.
4. Click → router matches no `/signup` route → catch-all `*` → `NotFound`.

## Expected
The guest upgrade CTA lands on a working signup surface (e.g. `/login?mode=signup&from=guest-cap`,
or open the in-app `SignUpModal`), preserving the guest's intent.

## Actual
Navigates to `/signup?from=guest-cap` → 404 NotFound. Dead end at the highest-intent conversion point.

## Evidence
- STATIC — needs live re-verify when MCP+backend restored.
- Router: `src/App.tsx:70-105` (no `/signup`, only `/login` at line 97).
- Backend emitter: `easebot-backend/src/middleware/quotaMiddleware.ts:185-187`.
- Banner: `src/components/pricing/CapHitBanner.tsx:40-50`.
- In-chat duplicate target: `src/hooks/useChat.ts:840`.

## Notes
Cross-boundary bug (backend chooses URL, frontend has no matching route). Fix can live on either
side, but the canonical fix is to make the frontend honour a real signup path and the backend emit it.
Assigned suggestion: fix-frontend (add `/signup` redirect → Login signup mode) coordinated with fix-backend-api.
Not present in marathon-master-2026-05-29.csv. Distinct from WE-20260528-004 (which was the PayU
return-port mismatch).

---
_Filed by `qa-e2e-playwright` on `2026-06-01T00:00:00Z`._
