# WE-20260601-354: ComparisonTable sortable <th onClick> is keyboard-inaccessible and lacks aria-sort

| Field | Value |
|---|---|
| **ID** | `WE-20260601-354` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/ComparisonTable.tsx:227-243` |
| **URL / Page** | `Chat → AI reply containing a markdown comparison table` |
| **Breakpoint** | `all` |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/113 |
| **Progress** | |

## Description

ComparisonTable renders sortable column headers as `<th onClick={() => handleSort(colIdx)}>` (L228-242). The `<th>` has `cursor-pointer` styling but:
- no `tabIndex` and no element inside it is focusable → keyboard users cannot reach the sort control at all;
- no `onKeyDown` (Enter/Space) handler;
- no `aria-sort="ascending|descending|none"` on the header cell, so a screen reader never announces that the column is sortable or its current sort direction;
- the sort direction is shown only by a small ArrowUp/ArrowDown icon (L237-240) with no text/aria.

So sorting an AI-generated vendor/price comparison is a sighted-mouse-only feature. The "Save to Planner" button (L280) is a real `<button>` and is fine.

This component is rendered inline in chat AI replies and was not covered by the chat-stream a11y PRs (#41/#61/#1056), which dealt with the message log / icon buttons, not embedded comparison tables. New surface.

## Steps to reproduce

1. Trigger an AI reply that contains a markdown table (consultant mode comparing venues/prices).
2. Tab through the rendered table — column headers receive no focus.
3. Read code L228: `<th onClick>` with no tabIndex/keydown/aria-sort.

## Expected

Sortable header is a `<th aria-sort=...>` containing a `<button>` (or has `role="button" tabIndex={0}` + Enter/Space), and `aria-sort` reflects the live state. WCAG 2.1.1 (Keyboard) + 4.1.2 + 1.3.1.

## Actual

Header sort is mouse-only and silent to AT.

## Notes

STATIC — needs live re-verify when MCP+backend restored.

---

_Filed by `qa-accessibility` on `2026-06-01`._
