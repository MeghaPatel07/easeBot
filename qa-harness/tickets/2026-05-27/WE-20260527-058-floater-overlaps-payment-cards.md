# WE-20260527-058: WeddingEaseFloater icon overlaps the bottom-right of cards on /payment/* and /help (desktop + tablet)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-058` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `low` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/WeddingEaseFloater.tsx` |
| **URL / Page** | `/payment/success`, `/payment/failure`, `/help`, `/terms`, `/privacy` |
| **Breakpoint** | `tablet`, `desktop` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

The floating circle "E" branded icon (bottom-right) overlaps the bottom-right corner of the centered card on payment pages (and the FAQ accordion on Help/Privacy/Terms). The floater is on top of content (z-index ≥ banner) and slightly obscures rounded card edges.

Visually present but minor — the floater is small enough that it never fully covers text, just sits at the corner.

## Steps to reproduce

1. Open `http://localhost:8081/payment/failure` at 1280x800.
2. Observe the cursive "E" floater near the bottom-right corner overlapping the payment card border.
3. Repeat at 768x1024 with `/help` — floater obscures FAQ chevron at the bottom.

## Expected

Either nudge the floater up/right when a center-card is present, or hide the floater on these routes (it adds little value on success/failure flows where the user already has a clear next action).

## Actual

Floater consistently overlaps card edges on these routes.

## Evidence

- `qa-harness/evidence/WE-20260527-058/screenshots/desktop-payment-failure-no-floater-card.png` (floater pre-paint covers card border)
- `qa-harness/evidence/WE-20260527-058/screenshots/desktop-payment-success-floater-overlap.png`

## Notes

GlobalFloater render is gated on path prefix (`App.tsx` line 41). Trimming `/payment` and `/help` from that allowlist would close this.

---
