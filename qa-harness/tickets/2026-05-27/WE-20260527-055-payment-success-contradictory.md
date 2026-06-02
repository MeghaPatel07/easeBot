# WE-20260527-055: /payment/success shows "Payment received" headline together with red "We could not verify" error

| Field | Value |
|---|---|
| **ID** | `WE-20260527-055` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/PaymentSuccess.tsx` |
| **URL / Page** | `/payment/success` (no params / failed verification path) |
| **Breakpoint** | `all` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

The success page renders the green checkmark + "Payment received" headline AND red error copy ("We could not verify your transaction… Please contact support…") simultaneously. The icon and headline contradict the body copy — confusing/upsetting if a real verification ever fails.

## Steps to reproduce

1. Visit `http://localhost:8081/payment/success` with no query params (simulates dropped session / direct link).
2. Observe green checkmark + "Payment received" header + red verify-failure copy stacked together.

## Expected

When verification fails: swap to a neutral/warning icon, headline like "Verification pending" or "Receipt unavailable", and warm red body copy. Save the green-checkmark variant for successful verifications.

## Actual

Both states are presented at once — visually says "all good" while body text says "all bad".

## Evidence

- `qa-harness/evidence/WE-20260527-055/screenshots/desktop-paymentsuccess-conflicting.png`
- `qa-harness/evidence/WE-20260527-055/screenshots/mobile-paymentsuccess-conflicting.png`

## Notes

Likely a state-machine UX bug, not a layout bug. Filing under `visual` because the conflicting iconography + copy is the visible symptom.

---
