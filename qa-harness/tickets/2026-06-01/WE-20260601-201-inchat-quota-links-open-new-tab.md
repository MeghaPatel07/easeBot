# WE-20260601-201: In-chat quota / signup markdown links open in a new tab (target=_blank) — breaks SPA flow & Flow F "back out" step

| Field | Value |
|---|---|
| **ID** | `WE-20260601-201` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `qa-e2e-playwright` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `e2e-flow` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatMessages.tsx:447-449` (markdown `a` renderer) ; sources `src/hooks/useChat.ts:837,840` |
| **URL / Page** | In-chat assistant error/quota bubble links (`/pricing`, `/signup`) |
| **Breakpoint** | all |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/118 |
| **Progress** | fix-WE-20260601-200-chat-send-resilience |

## Description
When the chat send hits a quota error, `useChat.sendMessage` renders an assistant bubble containing
INTERNAL markdown links: `[Upgrade or top up](/pricing)` (useChat.ts:837) and `[Sign up](/signup)`
(useChat.ts:840). ChatMessages renders ALL markdown anchors with a single hard-coded component:

```
a: ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" ...>{children}</a>
)
```
(ChatMessages.tsx:447-449)

Because every anchor gets `target="_blank"`, these INTERNAL app routes open in a **new browser tab**
instead of in-app SPA navigation. Consequences for the golden paths:

- Flow F step 3-4 ("Click upgrade → routes to checkout … Back out → verify state preserved") is not
  testable as designed: there is no "back out" because a new tab opened; the original chat tab is
  untouched and the new tab is a cold full-page load of `/pricing` (or 404 `/signup`, see -200).
- The full-page reload of the upgrade target loses all in-memory chat/guest state and forces a fresh
  bundle download + auth re-hydration.
- External product links legitimately want `_blank`; internal app routes do not.

## Steps to reproduce (by reading)
1. Trigger a quota error so `useChat.ts:830-846` builds a bubble with `[Upgrade or top up](/pricing)`.
2. ReactMarkdown renders the link via the `a` component at ChatMessages.tsx:447-449 → `target="_blank"`.
3. Click → opens `/pricing` in a NEW tab (cold load), not in-app navigation.

## Expected
Internal links (those starting with `/`) should render as `<Link to={href}>` (or `<a>` without
`target="_blank"`) so they navigate in-place and preserve session state. Only external `http(s)://`
links should keep `target="_blank" rel="noopener noreferrer"`.

## Actual
All markdown links — including internal `/pricing` and `/signup` — open in a new tab.

## Evidence
- STATIC — needs live re-verify when MCP+backend restored.
- Renderer: `src/components/chat/ChatMessages.tsx:447-449`.
- Internal-link sources: `src/hooks/useChat.ts:837,840`.

## Notes
Pairs with WE-20260601-200 (the `/signup` target is also a dead route). fix-frontend.
Not in marathon-master-2026-05-29.csv.

---
_Filed by `qa-e2e-playwright` on `2026-06-01T00:00:00Z`._
