# WE-20260527-050: AnalyticsConsent banner overlays critical content on every page (no scroll padding)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-050` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P1` |
| **Priority** | `high` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/AnalyticsConsent.tsx` |
| **URL / Page** | `*` (every route — visible on /, /pricing, /help, /terms, /privacy, /checkout, /payment/*, /login, /__no_such_route__, settings dialogs) |
| **Breakpoint** | `all` (worst on `mobile`) |
| **Status** | `in_review` |
| **Assigned** | `fix-frontend` |
| **PR** | `https://github.com/MeghaPatel07/easeBot/pull/new/fix-WE-20260527-050` (open via UI; base `Bug-Resolve-claude`, source `fix-WE-20260527-050`) |
| **Progress** | `qa-harness/progress/WE-20260527-050/progress.html` |
| **Branch** | `fix-WE-20260527-050` |

## Description

The "We use privacy-friendly analytics…" consent banner is fixed at the bottom of the viewport on every page and overlays content underneath. On `mobile-pricing`, `mobile-help`, `mobile-checkout` the banner sits directly on top of the first pricing-tier card / first FAQ / first plan column, hiding text and parts of CTAs. The page below it never gets `padding-bottom`, so scrolled content stops one banner-height too early.

Mobile screenshot of `/pricing` shows banner covering ~25% of the "Free" plan card, including the "300K tokens / month" bullet partial cut.

## Steps to reproduce

1. Load any route in a fresh browser (consent banner unblocked).
2. Inspect bottom 100px of the viewport at 375x812.
3. Try to read the lowest content row — it is partially or fully obscured by the banner.

## Expected

Either (a) banner pushes layout up via `padding-bottom` on the page body equal to its height, or (b) banner is dismissable above-the-fold (e.g. inline drawer on first visit, not persistent overlay).

## Actual

Banner is `position: fixed; bottom: 0` with full opacity over content. No spacer/padding compensates for it on any page. On mobile, the consent banner alone consumes ~120px of vertical screen real estate.

## Evidence

- `qa-harness/evidence/WE-20260527-050/screenshots/mobile-index-consent-overlap.png`
- `qa-harness/evidence/WE-20260527-050/screenshots/mobile-pricing-consent-overlap.png`
- `qa-harness/evidence/WE-20260527-050/screenshots/desktop-help-consent-overlap.png`

## Notes

Affects ALL pages so this is the highest-volume regression in the run. Bumping severity because pricing-tier comparison is a primary conversion surface and is partially obstructed.

---
