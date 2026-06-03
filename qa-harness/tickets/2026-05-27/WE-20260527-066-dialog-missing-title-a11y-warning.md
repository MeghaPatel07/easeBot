# WE-20260527-066: Settings dialog throws Radix a11y warning "DialogContent requires a DialogTitle" (12+ console hits per page load)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-066` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/settings/SettingsShell.tsx` (or wherever the `<DialogContent>` for Settings is mounted) |
| **URL / Page** | `/?settings=*` (all settings tabs) |
| **Breakpoint** | `all` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

Loading the Settings dialog produces this Radix console warning:

> `DialogContent` requires a `DialogTitle` for the component to be accessible for screen reader users.
> If you want to hide the `DialogTitle`, you can wrap it with our VisuallyHidden component.

12 hits in one run across breakpoints — fires on every Settings open. Radix throws because the modal lacks a programmatically associated title.

## Steps to reproduce

1. Open devtools console.
2. Visit `http://localhost:8081/?settings=ai-behavior`.
3. Observe 1-2 warnings per load (multiplied across breakpoints in QA = 12).

## Expected

Add `<DialogTitle>` (with `<VisuallyHidden>` if we want it off-screen) inside the Settings `DialogContent`.

## Actual

Title missing; screen readers don’t announce the dialog purpose; console noise.

## Evidence

- `qa-harness/evidence/WE-20260527-066/screenshots/dialog-missing-title-a11y.png`
- Raw console: `/Users/krish/Desktop/easebot/qa-screenshots/2026-05-27-1520/_results.json` → `consoleErrors[].text` filtered by `DialogContent requires`

## Notes

Filing under `visual` since the symptom is dialog-region without an announced title. A11y agent will likely re-file under `a11y` — that’s fine, deduplicate at triage.

---
