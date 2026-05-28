# WE-20260528-073: Radix DialogContent missing DialogTitle — 12× console warnings per page that opens any settings/feedback dialog

| Field | Value |
|---|---|
| **ID** | `WE-20260528-073` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `P3` |
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | dialogs missing `<DialogTitle>` (need to grep `<DialogContent` without sibling title) |
| **URL / Page** | any page that opens a Radix dialog (Settings, Feedback, Help) |
| **Breakpoint** | `all` |
| **Status** | `duplicate` |
| **Duplicate of** | `WE-20260527-066` |
| **Assigned** | fix-frontend |

## Description

Radix console warning:

```
`DialogContent` requires a `DialogTitle` for the component to be accessible for screen reader users.
If you want to hide the `DialogTitle`, wrap it in our `VisuallyHidden` component.
```

Fired 12× during the visual capture run. Already filed as **WE-20260527-066** yesterday; re-filing as duplicate to record the visual-QA-run evidence count for fresh prioritization.

## Steps to reproduce

1. Open DevTools console
2. Navigate to `/?settings=ai-behavior`
3. Observe Radix accessibility warning

## Expected

Every `DialogContent` has a `DialogTitle` (visually-hidden if not designed to show).

## Actual

Multiple dialogs miss the title; screen readers cannot announce the dialog topic.

## Evidence

- `_results.json` — 12× occurrences during the run.

## Notes

Pure dup. Re-listed for queue visibility on this sprint.
