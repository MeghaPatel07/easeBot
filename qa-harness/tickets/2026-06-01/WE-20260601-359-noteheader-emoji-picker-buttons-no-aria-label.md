# WE-20260601-359: NoteHeader emoji icon-picker buttons have no accessible name (raw emoji glyph only)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-359` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/notes/NoteHeader.tsx:253-263` |
| **URL / Page** | `Notes → click note icon → emoji picker popover` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

The note-icon picker popover renders a 6-column grid of `<button>`s where each button's only content is a raw emoji glyph (L254-262, from the WEDDING_EMOJIS list). Screen-reader announcement of a bare emoji button is inconsistent across AT (some read the unicode name, many read nothing or "button"), and there is no `aria-label` to disambiguate (e.g. "Wedding chapel icon", "Ring icon"). There is also no `aria-pressed`/selected state indicating which icon is currently chosen.

The popover container has a visible "Pick an icon" heading (L252) but it is a plain `<p>`, not associated with the grid (no `role="group"`/`aria-label`), so the grouping is not exposed.

Not covered by in-flight PRs. Minor but a real Name/Role/Value gap on a custom control grid.

## Steps to reproduce

1. Notes → click the note icon → emoji popover opens.
2. Read L254-262: `<button>{emoji}</button>` — no aria-label, no selected state.

## Expected

Each emoji button has an `aria-label` describing the icon; the currently selected icon exposes `aria-pressed="true"`; the grid is wrapped in a labeled `role="group"` / `radiogroup`. WCAG 4.1.2.

## Actual

Emoji buttons announced inconsistently / unnamed; no selected-state semantics.

## Notes

STATIC — needs live re-verify when MCP+backend restored. Same pattern likely in any other emoji/icon grid; scope here is NoteHeader. fix-frontend.

---

_Filed by `qa-accessibility` on `2026-06-01`._
