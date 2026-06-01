# WE-20260601-350: NoteHeader icon-only buttons (undo/redo/copy/cut/paste/comments/more/icon-picker) lack aria-label

| Field | Value |
|---|---|
| **ID** | `WE-20260601-350` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/notes/NoteHeader.tsx:247,302,318,332,356,382,479,533` |
| **URL / Page** | `/?... → Notes view → note header toolbar` |
| **Breakpoint** | `desktop` (edit-action cluster is `hidden sm:flex`) |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/113 |
| **Progress** | |

## Description

The Notes editor header (NoteHeader.tsx) contains a cluster of icon-only `<button>`/`Button` elements that have NO accessible name. They use `<Tooltip>` for sighted hover, but Radix Tooltip content is NOT wired as the button's accessible name (no `aria-labelledby`/`aria-describedby` association), so a screen reader announces only "button" with no purpose.

In-flight a11y PR #61 (WE-20260528-1063) added aria-labels to ChatHeader/ChatInput/ImageActions/ImageCarousel/AudioPlayer — it explicitly did NOT touch the Notes editor. This surface is uncovered.

Affected buttons (all icon-only, no `aria-label`):
- L247 icon-picker PopoverTrigger (`title="Change icon"` only — title is not a reliable accessible name)
- L302 Undo, L318 Redo, L332 Copy, L356 Cut, L382 Paste
- L479 Comments toggle (also has a numeric badge with no SR text)
- L533 More menu (`MoreHorizontal`)

## Steps to reproduce

1. Open a note in the Notes view on desktop (>=640px).
2. Read code: each `<button>`/`Button` wraps only a lucide icon; none has `aria-label`.
3. With VoiceOver/NVDA, Tab through the header toolbar.

## Expected

Every icon-only control announces a verb+object name (e.g. "Undo", "Redo", "Copy selection", "Comments, 3 unread", "More note actions", "Change note icon").

## Actual

Screen reader announces bare "button". Voice Control / Switch Control users cannot target the controls by name. WCAG 2.2 4.1.2 (Name, Role, Value) + 2.5.3 (Label in Name) fail.

## Evidence

- Code-only (STATIC — needs live re-verify when MCP+backend restored).

## Notes

Fix: add `aria-label` to each icon-only button. Comments badge needs the count folded into the label (`aria-label={`Comments${commentsCount ? `, ${commentsCount} new` : ''}`}`). Dedup-checked vs PR #61 (chat surfaces only) and #85 (sidebar search) — Notes editor header is new.

---

_Filed by `qa-accessibility` on `2026-06-01`._
