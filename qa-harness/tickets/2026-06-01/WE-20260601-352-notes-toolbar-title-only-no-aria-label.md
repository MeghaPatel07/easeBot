# WE-20260601-352: Notes FloatingToolbar + BlockWidgetBar icon buttons rely on title only (no aria-label); color swatches unnamed

| Field | Value |
|---|---|
| **ID** | `WE-20260601-352` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/notes/toolbar/FloatingToolbar.tsx:74-86,189,207,241,255; BlockWidgetBar.tsx:187` |
| **URL / Page** | `Notes editor → select text (bubble toolbar) / block insert bar` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

The Tiptap floating bubble toolbar (FloatingToolbar.tsx) and the block-insert bar (BlockWidgetBar.tsx) use icon-only `<button>`s whose only label is the `title` HTML attribute. `title` is unreliable as an accessible name (not announced consistently by NVDA/VoiceOver, never surfaced on touch), so these formatting controls (Bold/Italic/Underline/Strike/Code/Highlight/Text-color/Link/H1/H2/H3) are effectively nameless to AT.

Worse, the highlight + text color swatch buttons (FloatingToolbar L207, L255) are 6×6 colored squares with `title={c.name}` only and NO text/aria-label, AND color is the sole means of distinguishing them — a screen reader announces "button" with no color name, and the active state is conveyed purely visually (`bg-primary/20`) with no `aria-pressed`.

BlockWidgetBar (L187) does carry the name as visible text on `sm:` and up (`hidden sm:inline`), but on mobile the label is hidden and only the icon + tooltip remain, leaving the button nameless on touch.

Not covered by in-flight PRs (#61 was chat surfaces). New surface.

## Steps to reproduce

1. Open a note, select text → bubble toolbar appears.
2. Read FloatingToolbar.tsx: ToolbarButton (L62-87) renders icon + `title`, no `aria-label`; swatch buttons L207/L255 have `title` only.
3. Read BlockWidgetBar.tsx L196: `<span className="...hidden sm:inline">{widget.name}</span>` — name hidden on mobile.

## Expected

Every formatting / insert / swatch button has an explicit `aria-label` (e.g. "Highlight yellow", "Text color: red", "Insert heading 1"). Toggle buttons expose `aria-pressed`/`aria-checked` for active state rather than relying on background color alone.

## Actual

Title-only labels (unreliable for AT/touch); color swatches unnamed; active state color-only. WCAG 4.1.2 + 1.4.1 (Use of Color) + 2.5.3.

## Notes

STATIC — needs live re-verify when MCP+backend restored. Cheap classname/attr-level fix; no logic change.

---

_Filed by `qa-accessibility` on `2026-06-01`._
