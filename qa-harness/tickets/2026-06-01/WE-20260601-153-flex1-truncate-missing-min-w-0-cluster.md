# WE-20260601-153: `flex-1 truncate` without `min-w-0` cluster — truncation defeated on note title + audio error + sidebar labels

| Field | Value |
|---|---|
| **ID** | `WE-20260601-153` |
| **Created** | `2026-06-01T12:46:00Z` |
| **Reporter** | `qa-visual-responsive` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/notes/NoteHeader.tsx:272` + `src/components/AudioPlayer.tsx:250` + `src/components/notes/NotesSidebar.tsx:395` + `src/pages/settings/SettingsShell.tsx:594,656` |
| **URL / Page** | Note editor header, voice-message error row, Notes mobile topbar, Settings tab labels / pane title |
| **Breakpoint** | `mobile` (375px) primarily |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

Cluster of elements that are BOTH `flex-1` and `truncate` but whose flex item (and parent) lack `min-w-0`. A flex item defaults to `min-width:auto`, so it will not shrink below its content's intrinsic width — `truncate` then has no narrow box to clip against and the item pushes its row wider than the container.

Same root cause as WE-20260601-152 (InvitePartner), filed separately because that one carries a guaranteed-long URL (P2). These are lower-impact (shorter or capped content) but share the fix.

Instances (parent flex container lacks `min-w-0` in each case):
- `NoteHeader.tsx:272` `<h1 ... flex-1 truncate>{note.title}</h1>` — parent `:231` `flex items-center`. `note.title` is capped at 80 chars (WE-20260528-870) but 80 chars of a long single word still overflows the editor header on a 375px screen.
- `AudioPlayer.tsx:250` `<span ... flex-1 truncate>{errorMsg}</span>` — parent `:248` `flex items-center gap-2`. `errorMsg` is uncapped (can be a long backend/transcription error) and shares the row with a Retry button → overflow / button pushed off-screen.
- `NotesSidebar.tsx:395` `<h2 ... flex-1 ... truncate>Notes</h2>` — static label, low risk but same anti-pattern; add `min-w-0` for consistency.
- `SettingsShell.tsx:594` `<span className="flex-1 truncate">{label}</span>` and `:656` `<h2 className="flex-1 ... truncate">` — tab labels / pane titles; mostly short, but localized/long labels would be defeated.

## Steps to reproduce (by reading)

1. Open each path above; confirm the element has `flex-1 truncate` and its parent `flex` container has no `min-w-0`, nor does the element itself.
2. CSS: `flex` items keep `min-width:auto`, so `truncate` cannot shrink them below content width.

## Expected

Each element truncates with ellipsis and respects its container width at 375px.

## Actual

When the content is long (uncapped audio error; an 80-char single-word note title; a long localized settings label), the element grows to fit the content and overflows the row.

## Evidence

- `grep -rEn 'flex-1[^"]*truncate|truncate[^"]*flex-1' src --include=*.tsx | grep -v min-w-0` returns these 5 lines (plus InvitePartner:241, filed as -152).

## Notes

STATIC — needs live re-verify when MCP+backend restored (force a long audio error string and an 80-char single-word note title at 375px).
Fix (fix-frontend): add `min-w-0` to each listed `flex-1 truncate` element. AudioPlayer error span is the only functional risk (Retry button getting pushed off); the rest are polish.

---

_Filed by `qa-visual-responsive` on `2026-06-01T12:46:00Z`._
