# WE-20260601-351: Notes SlashCommandMenu is a custom combobox with no ARIA roles — invisible to screen readers

| Field | Value |
|---|---|
| **ID** | `WE-20260601-351` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/notes/toolbar/SlashCommandMenu.tsx:319-351` |
| **URL / Page** | `Notes editor → type "/" to open slash menu` |
| **Breakpoint** | `all` |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/113 |
| **Progress** | |

## Description

SlashCommandMenu renders a fully custom popup listbox (the Notion-style "/" command menu) using a bare `<div>` containing `<button>`s. It implements ArrowUp/ArrowDown/Enter/Escape keyboard nav in JS (L270-294) and tracks `selectedIndex`, but exposes NONE of the required ARIA:

- The container `<div>` (L320) has no `role="listbox"` / `role="menu"` and no `aria-label`.
- The option `<button>`s (L329) have no `role="option"` and no `aria-selected={index===selectedIndex}`.
- There is no `aria-activedescendant` pointing at the highlighted item, and focus never moves to the menu (the editor keeps DOM focus while a `document`-level keydown listener drives selection).

Net effect: a screen-reader user types "/", a visual menu appears and arrow keys move a visual highlight, but the AT announces nothing — no "menu opened", no option names, no "Heading 1, selected". The feature is operable by sighted keyboard users only.

This component is NOT covered by any in-flight a11y PR (the marathon a11y work was chat/auth/checkout/help/pricing + sidebar search). New surface.

## Steps to reproduce

1. Open a note, type `/` to trigger the menu.
2. Read code L319-351: plain div + buttons, zero ARIA roles/state.
3. With a screen reader, arrow through the menu — no announcements.

## Expected

Container exposes `role="listbox"` with an accessible name; each item is `role="option"` with `aria-selected`; the controlling editor element references the active option via `aria-activedescendant` (or focus is moved into the listbox). Opening/closing announced. WCAG 4.1.2 + 1.3.1 satisfied.

## Actual

No roles, no selection state, no active-descendant — menu is silent to assistive tech.

## Evidence

- Code-only (STATIC — needs live re-verify when MCP+backend restored).

## Notes

BlockWidgetBar.tsx (the always-visible "Insert" bar) is a separate but related surface — see WE-20260601-352 for its label-only-via-title issue. Fix here is purely additive ARIA; behavior unchanged.

---

_Filed by `qa-accessibility` on `2026-06-01`._
