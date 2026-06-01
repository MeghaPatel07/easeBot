# WE-20260528-064: /payment/failure shows literal "Reason: unknown" — user-facing copy reads as broken/unfinished

| Field | Value |
|---|---|
| **ID** | `WE-20260528-064` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/PaymentFailure.tsx` |
| **URL / Page** | `http://localhost:8081/payment/failure` (with no query string) |
| **Breakpoint** | `all` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

`/payment/failure` (no params) renders the heading "Payment not completed" followed by **"Reason: unknown"** verbatim. This looks like a placeholder copy that escaped to production. The user has no useful information about what failed, just the developer-shaped diagnostic.

## Steps to reproduce

1. Visit `http://localhost:8081/payment/failure` directly (no query string)
2. Observe the body text

## Expected

When the reason is absent, hide the "Reason:" line entirely and show a friendly fallback (e.g. "No charge was completed. Try again from the pricing page, or contact support if this persists.").

## Actual

Literal string "Reason: unknown" rendered in the body.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-064/screenshots/`
  - `mobile-payment-failure.png`

## Notes

Adjacent to WE-20260527-055 (payment-success contradictory) — both pages need a copy pass.
