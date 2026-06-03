# WE-20260528-067: /pricing — billing-cycle toggle: inactive "Annual — save ~34%" pill is unreadable in BOTH light and dark mode

| Field | Value |
|---|---|
| **ID** | `WE-20260528-067` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Pricing.tsx` — billing-cycle segmented toggle |
| **URL / Page** | `http://localhost:8081/pricing` |
| **Breakpoint** | `all` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

The billing-cycle pill toggle on `/pricing` uses a brown filled pill for the active option ("Monthly") and a low-contrast translucent pill for the inactive option ("Annual — save ~34%"). The inactive option label colour is light-on-light in light mode and dark-on-dark in dark mode — both fail WCAG AA. Users may not realize Annual is clickable.

## Steps to reproduce

1. Visit `http://localhost:8081/pricing`
2. Observe the billing-cycle toggle (just above the tiers)
3. Toggle dark mode and observe again

## Expected

Inactive option text contrast ≥4.5:1 in both themes; the pill should look obviously clickable.

## Actual

Inactive pill text fades into the chip background in both themes.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-067/screenshots/`
  - `mobile-pricing-dark.png`
  - `desktop-dark-pricing.png`

## Notes

Same root pattern as WE-20260528-056 (ghost button tokens) — likely sharing the `secondary` button variant.
