# WE-20260528-071: /checkout without a plan param renders the Pricing page on desktop too — silent fallback (cross-breakpoint)

| Field | Value |
|---|---|
| **ID** | `WE-20260528-071` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Checkout.tsx` |
| **URL / Page** | `http://localhost:8081/checkout` (no plan param) and `?plan=basic` (unknown plan id) |
| **Breakpoint** | `all` |
| **Status** | `duplicate` |
| **Duplicate of** | `WE-20260527-054` |
| **Assigned** | fix-frontend |

## Description

`/checkout` with no `plan` query param silently falls back to the Pricing page UI at all breakpoints, with no error message and no indication that the user is no longer on a checkout flow. `?plan=basic` (an unknown plan id) does the same thing.

Filing as duplicate of WE-20260527-054 — new evidence shows the behaviour is also reproducible at desktop + tablet, not only mobile.

## Steps to reproduce

1. Open `http://localhost:8081/checkout` (no query)
2. Open `http://localhost:8081/checkout?plan=basic`
3. Compare to `http://localhost:8081/pricing`

## Expected

Show "Plan not found" or redirect to `/pricing` with a banner explaining why.

## Actual

Pricing UI rendered under the `/checkout` URL.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-071/screenshots/`
  - `desktop-checkout.png`, `tablet-checkout.png`

## Notes

Duplicate of WE-20260527-054.
