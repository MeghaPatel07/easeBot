# WE-20260528-062: Ultrawide (1920px) — /pricing and other content pages do not scale up; locked to narrow center, wastes 50% of viewport

| Field | Value |
|---|---|
| **ID** | `WE-20260528-062` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `P3` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Pricing.tsx` (and shared marketing layout) |
| **URL / Page** | `/pricing` (also `/help`, `/login`, `/terms`, `/privacy`) at ≥1600px |
| **Breakpoint** | `desktop` (≥1600) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

At 1920×1080 the pricing grid stays clamped to ~1200px in the center with large empty bands on both sides. The 3 tier cards stay at their tablet/desktop widths instead of either becoming wider, growing to 4-up, or distributing across the page.

## Steps to reproduce

1. Resize browser to 1920×1080
2. Open `http://localhost:8081/pricing`
3. Observe the empty gutters and undersized tier cards

## Expected

Either: tier cards grow proportionally, OR a 4th tier appears in the row (see WE-20260528-057), OR a max-width layout that **doesn't** look intentional-narrow when the screen is huge.

## Actual

Cards stay narrow; tons of empty space.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-062/screenshots/`
  - `uw-pricing.png` (1920px)

## Notes

Marketing pages share this issue — consider adding a `2xl:max-w-7xl` or similar cap.
