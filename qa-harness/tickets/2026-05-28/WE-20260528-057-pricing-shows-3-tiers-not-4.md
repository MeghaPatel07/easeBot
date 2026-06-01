# WE-20260528-057: Pricing page renders only 3 tiers (Free / Pro / Pro Max) — 4-tier roadmap from project_pricing_rollout missing 4th tier

| Field | Value |
|---|---|
| **ID** | `WE-20260528-057` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Pricing.tsx` + tier data source |
| **URL / Page** | `http://localhost:8081/pricing` |
| **Breakpoint** | `all` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

Sprint planning auto-memory `project_pricing_rollout` documents a **4-tier** pricing model, but `/pricing` currently shows 3 tiers (Free / Pro / Pro Max) at all breakpoints. Either the 4th tier is missing from the UI source-of-truth or this is an intentional roll-back that contradicts the saved plan.

Filing as visual since the layout looks "complete" but is missing a column at desktop and a card at mobile.

## Steps to reproduce

1. Open `http://localhost:8081/pricing` at any breakpoint
2. Count the tier cards in the hero comparison grid

## Expected

4 tier cards reflecting Sprint 1 closed pricing rollout.

## Actual

3 tier cards. The 4th tier (likely "Vendor" / "Enterprise" / a higher Pro Max) is absent.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-057/screenshots/`
  - `desktop-pricing.png`, `tablet-pricing.png`, `mobile-pricing.png`, `tablet-pricing-fullpage.png`

## Notes

Could be intentional revert. Krish should confirm — if 3-tier is the new truth, update `project_pricing_rollout` memory; otherwise restore tier 4. Triage to chairman.
