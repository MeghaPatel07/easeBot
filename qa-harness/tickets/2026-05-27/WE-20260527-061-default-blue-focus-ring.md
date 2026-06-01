# WE-20260527-061: Keyboard focus ring is the browser-default 1px blue outline (off-brand on warm/cream theme)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-061` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `low` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/index.css` (or tailwind `ring-*` defaults) |
| **URL / Page** | `/` (and likely all routes) |
| **Breakpoint** | `desktop` (keyboard nav primary on desktop) |
| **Status** | `likely_closed` (canonical: `WE-20260527-256`) |
| **Fix branch** | `fix-WE-20260527-256` — global `:focus-visible` rule in `index.css` now provides a 2px bronze outline on every focusable element, replacing the Chromium default blue. Verify after merge. |

## Description

Tabbing through the page on desktop reveals the system default focus indicator: `outline: rgb(0, 95, 204) auto 1px; box-shadow: none`. This is the Chromium-default sky-blue 1px focus, which clashes with the warm cream / brown palette of the rest of the app.

## Steps to reproduce

1. Open `http://localhost:8081/` desktop.
2. Press `Tab` 2-3 times — focus moves to "Send Feedback" / sidebar items.
3. Notice the thin blue 1px outline.

## Expected

A brand-aligned focus ring (e.g. `ring-2 ring-brand-burgundy ring-offset-2`) on all focusable elements, sized 2-3px so it’s clearly visible.

## Actual

Default UA outline is present (so a11y minimum is met) but visually clashing.

## Evidence

- `qa-harness/evidence/WE-20260527-061/screenshots/desktop-default-blue-focusring.png`

## Notes

A11y agent runs Axe separately — this ticket is purely visual/branding. Don’t suppress the ring; replace it.

---
