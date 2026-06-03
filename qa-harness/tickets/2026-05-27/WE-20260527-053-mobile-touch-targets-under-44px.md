# WE-20260527-053: 35+ interactive elements below 44×44px touch target on mobile (every page)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-053` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P1` |
| **Priority** | `high` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | global — `Wedding-Ease-Viva-Chat/src/components/AnalyticsConsent.tsx`, `src/components/chat/ChatHeader.tsx`, `src/components/sidebar/*`, `src/pages/Login.tsx`, `src/pages/Pricing.tsx`, `src/pages/Help.tsx`, `src/pages/Privacy*`, `src/pages/Terms*` |
| **URL / Page** | all pages at 375 |
| **Breakpoint** | `mobile` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

A scripted audit (Playwright + `getBoundingClientRect`) flagged below-44px hit-targets on every mobile route:

| Page | Count |
|---|---|
| `/` (index) | 35 |
| `/login` | 6 |
| `/pricing` | 6 |
| `/help` | 7 |
| `/terms` | 7 |
| `/privacy` | 10 |
| `/checkout` | 6 |
| `/payment/success` | 2 |
| `/payment/failure` | 2 |
| `/__no_such_route__` | 3 |
| `/{uid}/{planner,gallery,liked,reminders,budget,shopping,timeline,progress,notifications,collaborate,notes}` | 15-35 |
| `/?settings=*` | 41 |

Notable offenders (caught everywhere because they live in global chrome):

- AnalyticsConsent `Decline` 66×28, `Accept` 65×28
- Settings dialog `X` close 40×32
- Theme toggle 40×32
- Login `Terms of Service` link 82×12, `Privacy Policy` 102x12 — tiny tap targets in legalese
- Pricing `Monthly` 79×36, `Annual — save ~34%` 154×36 — top-of-fold plan switcher fails iOS guideline
- Help page `+91 99250 74485` 102×15, `theweddingease@gmail.com` 162×15 — phone/email links too thin to tap

## Steps to reproduce

1. Run `node /tmp/qa-visual-run.mjs` (script archived in `/tmp/`). It captures + measures every page.
2. Inspect `_results.json` `issues[].tt` entries — counts of small-button cases per page.

## Expected

All buttons/links/role=button elements ≥ 44×44 (Apple HIG) or ≥ 48×48 (Material). Either pad the container, increase min-height in CSS, or wrap inline links with a larger tap target.

## Actual

35-41 violations per page on mobile. See `_results.json` in the run dir for the full sample.

## Evidence

- `qa-harness/evidence/WE-20260527-053/screenshots/mobile-index-touch-targets.png`
- `qa-harness/evidence/WE-20260527-053/screenshots/mobile-pricing-touch-targets.png`
- raw counts: `/Users/krish/Desktop/easebot/qa-screenshots/2026-05-27-1520/_results.json` → `.issues[]` `kind=touch44`

## Notes

This is one bug filed against many places. Fix should be coordinated: add a `min-h-[44px] min-w-[44px]` rule to default button + link variants for the `mobile` media query, plus pad the AnalyticsConsent buttons. The pricing tier switcher and chat-input mic/`+` controls are the highest-impact subsets.

---
