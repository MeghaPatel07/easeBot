# WE-20260527-072: Pricing "MOST POPULAR" eyebrow on the Pro card overlaps the top edge of the card on mobile

| Field | Value |
|---|---|
| **ID** | `WE-20260527-072` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `low` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx` (Pro tier card) |
| **URL / Page** | `/pricing` |
| **Breakpoint** | `mobile` (375x812) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

On mobile pricing scroll, the "MOST POPULAR" eyebrow ribbon on the Pro card visually sits half above and half below the card’s top edge. Looks like overlap was intended but the centering math is slightly off — the pill is biased downward inside the card by ~6px, breaking the symmetric "ribbon hangs from top edge" look that the design seems to call for.

## Steps to reproduce

1. Open `/pricing` at 375x812.
2. Scroll until the Pro card is visible.
3. Observe the "MOST POPULAR" eyebrow against the card top edge.

## Expected

Pill is vertically centered on the card top edge (50% above, 50% below) OR sits fully above the card with a small gap.

## Actual

Pill biased downward inside the card.

## Evidence

- `qa-harness/evidence/WE-20260527-072/screenshots/mobile-pricing-most-popular.png`

---
