# Sprint 1 Batch B — Backend Skeletons (BE-001 / BE-002 / BE-003)

**Agent:** Backend Engineer
**Branch:** optimization
**Date:** 2026-04-14
**Scope:** SKELETON FILES ONLY. No business logic, no route wiring, no enforcement.

---

## Files created

1. `easebot-backend/src/types/billing.ts` — shared types for meter, quota
   middleware, and subscription state machine (single home to avoid circular
   imports).
2. `easebot-backend/src/services/tokenMeter.ts` — BE-001. Exports
   `rawToTokens`, `estimateCost`, `chargeTokens`, `getUsage`, `addExtras`,
   `resetMonthly`, `refundTokens`. Re-exports billing types for spec-aligned
   import paths. All bodies throw `not_implemented_sprint_2`.
3. `easebot-backend/src/middleware/quotaMiddleware.ts` — BE-002. Exports
   `quotaCheck(service): RequestHandler`, `QuotaContext` interface,
   `QuotaExceededResponse` type, and the `Express.Request.quotaContext`
   augmentation. Factory throws `not_implemented_sprint_2` at call time.
4. `easebot-backend/src/services/subscriptionStateMachine.ts` — BE-003.
   Exports `applyTransition` stub. Re-exports `SubscriptionState` union
   (8 states, NO grace states per point-to-point policy).
5. `easebot-backend/src/controllers/subscriptionController.ts` — BE-003.
   Exports `cancel`, `reactivate`, `upgrade`, `downgrade`,
   `getCurrentSubscription` Express handlers. All call `next(Error(...))`.
   NOT wired into any router.
6. `easebot-backend/src/controllers/paymentController.ts` — BE-003. Exports
   `initiate`, `handleReturn`, `handleWebhook`, `verify`. NOT wired. No
   `handleRefund` (Guardrail 9).
7. `easebot-backend/src/services/invoiceService.ts` — BE-003. Exports
   `queueInvoice`, `renderInvoicePdf`, `getInvoicesForUser`, plus
   `InvoiceJob` + `InvoiceSummary` types. Module-load throw for
   `LEGAL_ENTITY_NAME` deferred to runtime — TODO comment in file cites
   invoice-format.md §3 for Sprint 3 to move the throw into
   `invoiceTemplate.ts` where it belongs.
8. `easebot-backend/src/services/exchangeRateService.ts` — BE-003. Exports
   `getLockedRate`, `fetchLiveRate`, `LockedRate` type. Empty per-minute
   cache `Map` declared but unused (marked `void` so tsc doesn't flag it).

Total: 8 files, 0 edits to existing files.

---

## tsc result

```
cd easebot-backend && npx tsc --noEmit
EXIT=0
```

**PASS — zero errors, zero warnings.** No remediation needed.

eslint not run (no project eslint config detected at backend root).

---

## Spec ambiguities & judgment calls

1. **`chargeTokens` signature — meter spec vs backlog prose.**
   token-meter.md §1 shows `chargeTokens(principal, raw, opts)` — no
   explicit `service` arg because `service` is derived from `raw.kind`.
   The backlog prose says `chargeTokens(subject, service, rawCost)`. I went
   with the backlog shape (4-arg: subject, service, raw, opts?) because the
   quota-middleware spec §5.1 explicitly says the middleware's `service`
   label is passed through, and having it on the call is cheaper than
   re-deriving from `raw.kind` at every call site. Sprint 2 implementers
   can collapse or reconcile; the type signature is forward-compatible.

2. **`refundTokens` signature — spec §1 takes
   `(principal, tokens, originalConsumedFrom, service)`; backlog says
   `(subject, service, amount, reason)`.** I went with the backlog shape
   (adds a `reason: string` for observability, drops the
   `originalConsumedFrom` hint which the meter can recover from the ledger
   on its own in Sprint 2). Flagging for Sprint 2 reviewer.

3. **`Subject` alias.** The backlog uses `Subject`, the spec uses
   `Principal`. I aliased `Subject = Principal` in types/billing.ts and
   re-exported both from tokenMeter. Neither name is wrong; both work.

4. **`invoiceService.ts` vs `invoiceTemplate.ts`.** The spec distributes
   responsibilities across 3 files (`invoiceService` + `invoiceTemplate` +
   `invoiceQueue`). Batch B only asked for `invoiceService.ts`, so I put
   the public surface there and left the template/queue files for Sprint 3
   PAY-020. The `LEGAL_ENTITY_NAME` throw belongs in `invoiceTemplate.ts`
   at module load — I documented this with a TODO in the service file so
   Sprint 3 moves it to the right place.

5. **No new route wiring.** `routes/payment.ts` does NOT exist and I did
   not create it. The handlers are exported but unbound. Sprint 2 PAY-010
   creates the router file and imports these handlers. This matches
   guardrail 2 ("do NOT touch route handlers").

6. **`pdfkit` not installed.** Guardrail 5. Flagged as deferred dependency
   in `invoiceService.ts` JSDoc. Sprint 3 PAY-020 must run
   `npm install pdfkit @types/pdfkit`.

---

## Known limitations for Sprint 2 to pick up

- **auth.ts extension.** quota-middleware.md §6.1 requires
  `req.user.tier` to be populated from the custom claim (or Firestore
  mirror). `middleware/auth.ts` does NOT do this today, and I did not
  modify it (Batch B is skeletons only). Sprint 2 PAY-002 owns the
  one-line extension; the Architect D1 decision (EXECUTION_PLAN.md §13.5)
  is to read from `users/{uid}.tierMirror` first, custom claim as
  fast-path. Plan accordingly.
- **`extrasBucket` lives on the parent user doc** per spec §2.2. The
  existing `accountController.ts` does not create or initialize this
  field. Sprint 2 should either lazy-init on first `chargeTokens` or
  add a migration step — either works. Meter skeleton does not assume
  presence.
- **`guests/{guestId}` TTL policy.** Spec §9 concern 1. Requires Firebase
  console toggle. FIREBASE_CONSOLE_CHECKLIST.md is the human's problem.
- **`reminderScheduler.ts` still owns its own cost-tracking.** When Sprint
  2 wires `chargeTokens('whatsapp', ...)` into `whatsappReminderService.ts`,
  the scheduler will need a system-principal helper (spec §9 concern 5).
  Not implemented here.
- **Legacy `usageService.ts` is untouched.** Spec §9 concern 3 recommends
  deleting it in the same commit that wires `tokenMeter` into
  `chatController`. Not in scope for Batch B.
- **Duplicate-reconcile guard.** quota-middleware.md §9 suggests a
  `_reconciled` flag on `QuotaContext`. I did not add it to the interface
  because Sprint 2 might implement it inside the closure instead. Sprint 2
  can add the field to `QuotaContext` if they want compile-time visibility.

---

## Guardrail verification

- [x] No deploys, no `firebase deploy`, no `npm run deploy`
- [x] No Firestore rules writes
- [x] No IAM changes
- [x] No edits to existing controllers, routes, or middleware (auth.ts
      untouched; route files untouched; existing controllers untouched)
- [x] No `therapist` or `consultant` references created
- [x] tsc --noEmit passes with zero errors
- [x] No new npm packages installed (`pdfkit` flagged as Sprint 3 work)
- [x] Code style matches `reminderService.ts` / `accountController.ts`
      (JSDoc headers, section dividers, lowercase file names, explicit
      imports from relative paths)
