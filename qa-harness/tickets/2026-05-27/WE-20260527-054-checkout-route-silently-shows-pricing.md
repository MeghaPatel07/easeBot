# WE-20260527-054: /checkout with no plan param silently renders Pricing page (no error, no redirect)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-054` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/Checkout.tsx` |
| **URL / Page** | `/checkout` |
| **Breakpoint** | `all` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

Loading `/checkout` directly (no query params, no chosen plan) renders the exact same UI as `/pricing` — the "Plans That Grow With Your Wedding" page with tier cards. The user sees no indication they’re actually on `/checkout`; the URL bar still says `/checkout`, but the visual experience implies they came from the wrong link.

## Steps to reproduce

1. Visit `http://localhost:8081/checkout` directly (no plan param).
2. Observe identical visual to `/pricing` (Free / Pro / Pro Max cards).

## Expected

Either (a) redirect to `/pricing` when no plan is selected (cleaner URL semantics), or (b) show a "Select a plan" empty-state with explicit copy.

## Actual

Page silently mounts pricing component. URL stays `/checkout`. Confusing for analytics, deep-linking, and the user’s mental model.

## Evidence

- `qa-harness/evidence/WE-20260527-054/screenshots/desktop-checkout-shows-pricing.png`
- `qa-harness/evidence/WE-20260527-054/screenshots/mobile-checkout-shows-pricing.png`

## Notes

Probably a fallback inside Checkout.tsx; worth surfacing an explicit empty-state OR `<Navigate to="/pricing">`.

---
