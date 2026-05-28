# WE-20260528-061: Desktop /terms and /privacy stretch body text to full ~1280px width — reading line is far too long (>120ch)

| Field | Value |
|---|---|
| **ID** | `WE-20260528-061` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `P3` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/TermsOfService.tsx`, `src/pages/PrivacyPolicy.tsx` |
| **URL / Page** | `http://localhost:8081/terms`, `http://localhost:8081/privacy` |
| **Breakpoint** | `desktop` (1280+) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

Legal pages render long-form body copy in a container with no `max-w-*` cap, so each line runs the full ~1200px (after the side padding). Readability guidelines recommend 50–75 characters per line for body copy; this page hits ~140ch on desktop, which is fatiguing and undermines legal clarity.

## Steps to reproduce

1. Open `http://localhost:8081/terms` at 1280×800
2. Read any paragraph — eyes have to sweep most of the viewport per line

## Expected

Content container `max-w-prose` (≈65ch) or `max-w-3xl` (~768px), centered.

## Actual

Body copy spans the full container width.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-061/screenshots/`
  - `desktop-terms.png`

## Notes

Both `/terms` and `/privacy` likely share a layout component — fix once, get both.
