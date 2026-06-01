# WE-20260528-065: "Back to TheWeddingBot" link in marketing-page header is 180×20px on mobile — touch target far below 44×44

| Field | Value |
|---|---|
| **ID** | `WE-20260528-065` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | shared header on `/pricing`, `/help`, `/terms`, `/privacy`, `/checkout` |
| **URL / Page** | mobile `/pricing`, `/help`, `/terms`, `/privacy`, `/checkout`, `/share/...`, `/payment/...` |
| **Breakpoint** | `mobile` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

The "← Back to TheWeddingBot" anchor at the top of every marketing/footer page measures **180×20 px** on mobile — half the recommended iOS touch target (44×44). Easy to mis-tap on small screens.

Same `<a>` recurs across `/pricing`, `/help`, `/terms`, `/privacy`, `/checkout`, and `/share/...` so a single fix wins many pages.

## Steps to reproduce

1. Open `/pricing` at 375×812
2. Use the DevTools box overlay to measure the back-link tap target

## Expected

Wrap link in a button-like surface with `py-3 px-4` so the hit-area ≥44×44.

## Actual

Bare anchor with 20px line-height; effectively a 20-pixel-tall tap target.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-065/screenshots/`
  - `mobile-pricing.png`, `mobile-help.png` (top-of-page back link)

## Notes

Compounds WE-20260527-053 (35+ small targets reported yesterday). Different element from the targets enumerated there; this is the marketing-page back link.
