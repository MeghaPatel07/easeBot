# WE-20260528-054: "Continue With Google" button text near-invisible in dark mode on Login page (all breakpoints)

| Field | Value |
|---|---|
| **ID** | `WE-20260528-054` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P1` |
| **Priority** | `P1` |
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Login.tsx` |
| **URL / Page** | `http://localhost:8081/login` (dark mode) |
| **Breakpoint** | `all` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

When dark mode is active on the Login page, the **"Continue With Google"** button shows the white-on-tan Google "G" mark followed by **almost-invisible text** — the label colour stays close to the default dark `text` token and the button background is also dark, producing contrast well below WCAG AA (likely <2:1).

The "View Plans" link at the top-right of the login page suffers the same issue.

## Steps to reproduce

1. `localStorage.setItem('theme','dark')`; reload `http://localhost:8081/login`
2. Observe the "Continue With Google" button label
3. Observe the "View Plans" anchor in the top-right

## Expected

Label text colour adapts to dark-mode token (e.g. `--foreground-on-button` light) — contrast ≥4.5:1 against the button background.

## Actual

Label is rendered in a colour that nearly matches the dark button surface; users with default brightness cannot read "Continue With Google".

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-054/screenshots/`
  - `mobile-dark-login.png` — full page dark mode, button text invisible
  - `desktop-dark-login.png` — same on desktop

## Notes

A11y impact. WCAG 1.4.3. Likely a missing `dark:text-*` Tailwind class on the OAuth button.
