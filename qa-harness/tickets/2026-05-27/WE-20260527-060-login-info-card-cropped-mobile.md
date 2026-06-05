# WE-20260527-060: Login "What you get" benefits card pushed below the fold on mobile (consent banner cuts last 2 bullets)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-060` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/Login.tsx` |
| **URL / Page** | `/login` |
| **Breakpoint** | `mobile` (375x812) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |
| **Related fix** | Likely closed by `WE-20260527-050` PR (`fix-WE-20260527-050`). Login uses `gradient-bg min-h-screen`, so it now picks up `padding-bottom: var(--analytics-consent-height)` automatically and the "WHAT YOU GET" card scrolls clear of the consent banner. Re-verify after merge before closing. |

## Description

On mobile, the "WHAT YOU GET" card stacks below the email-signin form (which is correct), but the consent banner covers the lower half of the card. Only "Save and revisit your planning conversations" and "Get personalized style and vibe" are partly visible. The remaining bullets ("Generate mood boards", "Track budgets, timelines, checklists" plus the "Free accounts include 10 messages" subtext) are completely hidden until the user scrolls past the banner — but the banner is `position: fixed` so they have to dismiss it first.

This is the only on-ramp where guests learn about app benefits before signing in. Hiding 60% of it on the primary mobile flow is a conversion risk.

## Steps to reproduce

1. Open `http://localhost:8081/login` at 375x812.
2. Observe upper portion of the "What you get" card and the banner overlay.
3. Confirm by scrolling — content is there but obstructed.

## Expected

(a) Inline (non-fixed) banner OR (b) page-bottom padding equal to banner height OR (c) collapse the consent into a small bar that only expands when tapped.

## Actual

Banner sits on top of the benefits card; majority of it inaccessible without dismissing the banner first.

## Evidence

- `qa-harness/evidence/WE-20260527-060/screenshots/mobile-login-info-card-cropped.png`
- `qa-harness/evidence/WE-20260527-060/screenshots/desktop-login-baseline.png` (desktop works because viewport is taller / 2-col layout)

## Notes

Related to WE-050 but worth a separate ticket — login is a conversion choke-point.

---
