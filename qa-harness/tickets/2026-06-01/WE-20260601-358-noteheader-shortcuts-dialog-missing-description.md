# WE-20260601-358: NoteHeader "Keyboard Shortcuts" Dialog has DialogTitle but no DialogDescription (Radix a11y warning)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-358` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/notes/NoteHeader.tsx:570-589` |
| **URL / Page** | `Notes → More menu → Keyboard shortcuts` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

The Keyboard Shortcuts `Dialog` (L570) provides a `DialogTitle` (L573) but no `DialogDescription` and no `aria-describedby`. Radix Dialog emits a runtime a11y warning when `Description`/`aria-describedby` is absent, and screen readers get no descriptive context for the dialog beyond the bare title. Per the Radix baseline checklist (Dialog must have title + description), this is a gap.

This dialog is in the Notes editor, not covered by the chat/auth a11y PRs. New surface.

## Steps to reproduce

1. Notes → More (⋯) menu → "Keyboard shortcuts".
2. Read L570-577: `<DialogHeader><DialogTitle>…</DialogTitle></DialogHeader>` — no `DialogDescription`.

## Expected

Add a `DialogDescription` (e.g. "List of keyboard shortcuts available in the note editor.") or wire `aria-describedby`. Clears the Radix warning and gives AT a description. WCAG 4.1.2 (best practice).

## Actual

Dialog announces title only; Radix logs missing-description warning.

## Notes

STATIC — needs live re-verify when MCP+backend restored. Trivial one-line addition. Audit sibling dialogs in the same flow for the same gap.

---

_Filed by `qa-accessibility` on `2026-06-01`._
