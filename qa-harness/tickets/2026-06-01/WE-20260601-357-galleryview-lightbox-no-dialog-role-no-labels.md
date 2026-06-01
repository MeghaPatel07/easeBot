# WE-20260601-357: GalleryView lightbox chrome buttons (close/zoom-in/zoom-out/prev/next) have no aria-label

| Field | Value |
|---|---|
| **ID** | `WE-20260601-357` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/GalleryView.tsx:197,206,210,217,227` |
| **URL / Page** | `Sidebar → Gallery → click an image (lightbox)` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

NARROWED to avoid dup with WE-20260528-282 (which already covers the GalleryView lightbox being a non-dialog `<div>` with no `role="dialog"`/`aria-modal`/focus-trap). THIS ticket scopes only the part -282 did NOT cover: the icon-only chrome `<button>`s inside the lightbox have no accessible name.

- L197 close (X)
- L206 zoom-out, L210 zoom-in
- L217 prev (ChevronLeft), L227 next (ChevronRight)

Each wraps only a lucide icon with zero `aria-label`. A screen reader announces bare "button" for all five, so even once the dialog-shell fix (-282) lands, the controls remain nameless. (Note: -282 states GalleryView has "no Esc handler" — that is inaccurate for this component; GalleryView.tsx L71 does bind Escape via a window keydown listener. Flagging so triage doesn't expect the Esc work here.)

## Steps to reproduce

1. Open Gallery, click a thumbnail → lightbox.
2. Tab through the X / zoom / arrow controls.
3. Read code L197-231 — none has `aria-label`.

## Expected

Each lightbox button has an explicit `aria-label` ("Close preview", "Zoom out", "Zoom in", "Previous image", "Next image"). WCAG 4.1.2 + 2.5.3.

## Actual

Five icon-only lightbox controls announce as bare "button".

## Notes

STATIC — needs live re-verify when MCP+backend restored. Pairs with -282 (dialog shell) and -668 (thumbnail arrow-key nav). fix-frontend.

---

_Filed by `qa-accessibility` on `2026-06-01`._
