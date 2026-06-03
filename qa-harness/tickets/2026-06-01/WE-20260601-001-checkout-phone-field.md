---
id: WE-20260601-001
date: 2026-06-01
severity: P2
category: functional
status: open
specialist: fix-frontend + fix-backend-api
origin: spun out of -888 (GSTIN misfile) during decision-clearing marathon
build_gate: awaiting Krish go-ahead (NOT auto-dispatched)
---

# Add a contact phone field to the PayU checkout

## Why this exists
-888 was filed as "phone field truncates international numbers." Investigation
(decision-clearing marathon, 2026-06-01) found the `maxLength=15` field at
`CheckoutModal.tsx:129` + `Checkout.tsx:414` is actually **GSTIN** (Indian tax ID,
15-char by law, validated by `GSTIN_REGEX`) — correct as-is. -888 is closed as misfiled.

The real gap surfaced by that investigation: **there is no phone field in checkout at all.**
`paymentService.ts` has no phone in `BillingAddressInput` or `InitiatePaymentRequest`.
A `PhoneInput` component exists at `auth/PhoneInput.tsx` but is **not wired** into checkout.

PayU's `initiate` flow commonly requires/strongly-prefers a contact `phone` parameter,
so this is a likely real requirement for the live payment integration.

## Scope (when dispatched)
- Wire the existing `auth/PhoneInput.tsx` (or an equivalent) into `CheckoutModal.tsx`
  + `Checkout.tsx` with E.164 / international validation (do NOT reuse the GSTIN field).
- Add `phone` to `BillingAddressInput` + `InitiatePaymentRequest` in `paymentService.ts`.
- Thread `phone` into the backend `/payment/initiate` payload and the PayU hash/params
  per `payu-contract.md` (confirm whether `phone` participates in the hash).
- Tests: validation (reject malformed), payload includes phone, hash still verifies.

## Acceptance
- Checkout collects a valid international phone separate from GSTIN.
- PayU initiate receives the phone param; hash verification still passes.
- No regression to the GSTIN field or existing billing-address inputs.

## Decision gate
Build is **deferred pending Krish go-ahead** — confirm PayU actually needs the phone
param in your merchant config before dispatching, to avoid adding an unneeded field.
