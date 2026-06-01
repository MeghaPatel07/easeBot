# WE-20260528-055: Dark mode — "Support & Feedback" tab and FAQ accordion items have low contrast on /help

| Field | Value |
|---|---|
| **ID** | `WE-20260528-055` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Help.tsx` |
| **URL / Page** | `http://localhost:8081/help` (dark mode) |
| **Breakpoint** | `all` (verified mobile + desktop) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

On `/help` in dark mode:
- The inactive tab **"Support & Feedback"** text fades to a near-black on a dark-grey background, hard to read
- The FAQ accordion **question text** (e.g. "How do I start planning my wedding?") is also dimmed — contrast ratio looks <3:1
- The accordion chevrons are barely visible against the card background

## Steps to reproduce

1. `localStorage.setItem('theme','dark')`; reload `http://localhost:8081/help`
2. Compare the active "FAQ / Help" tab text vs the inactive "Support & Feedback" tab text
3. Read any FAQ question

## Expected

Inactive tab text ≥4.5:1 contrast; FAQ question text ≥7:1 (body text); chevrons clearly visible.

## Actual

Inactive tab + questions look washed-out and ghosted.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-055/screenshots/`
  - `mobile-dark-help.png` — clearly shows the contrast issue

## Notes

Likely caused by `text-muted-foreground` being too dark in `:root.dark`. Single token fix likely covers multiple pages.
