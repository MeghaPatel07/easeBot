# Spec — Subscription State Machine

**Owner:** System Architect
**Primary consumer:** Payment Master Agent (`paymentController.ts`) + Backend Agent (`subscriptionStateMachine.ts`)
**Status:** Draft v2 — grace period removed (point-to-point policy)
**Grounded in:** PRICING_PRD.md §6.5; EXECUTION_PLAN.md §7 (state shape), §5 (UC-29..UC-33), §6 (LH-09..LH-19)

The canonical lifecycle of a user's paid relationship with Easebot. Every state transition is idempotent on a deterministic key. Every transition has exactly one *trigger* input and produces a bounded set of side effects. The state machine is the **only** code path that writes to `users/{uid}/subscription` — no other module touches this doc.

**Non-goals:** Refunds. Cancellation money-back. Grace periods. Dunning retries. Model downgrade on cap. None of these exist. (Guardrails 8, 9, and the point-to-point policy from EXECUTION_PLAN.md §0.)

---

## 1. States

```ts
export type SubscriptionState =
  | 'guest'                           // pre-signup, no user doc exists
  | 'free'                            // logged in, no subscription
  | 'pro_monthly'
  | 'pro_annual'
  | 'promax_monthly'
  | 'promax_annual'
  | 'pro_cancel_scheduled'            // cancel_at_period_end = true; still has Pro access
  | 'promax_cancel_scheduled'         // same, but for Pro Max
```

Important shapes:
- `_cancel_scheduled` is a **paid state** — the user still has their tier's token pool and features. It is UI-annotated ("expires on {date}") but enforcement-indistinguishable from the active `pro_monthly` / `promax_monthly` states.
- There is **NO grace period state.** A failed renewal drops the user immediately to `free`. Point-to-point, straightforward. No dunning, no retry window, no `_grace` variants.
- There is **no** `pro_6mo` or `promax_6mo`. The 6-month fixed pack (PRD §4.3) is Sprint 4+ work and appears as a `pro_annual` variant with `billingCycle='6mo'` on the Firestore doc. Adding a new state value for it later is non-breaking — a new string literal in the union.
- There is **no separate "downgrade_scheduled" state.** A Pro Max user who asks to "downgrade to Pro at period end" enters `promax_cancel_scheduled` with a side field `downgradeToOnPeriodEnd='pro_monthly'`. See §9.

---

## 2. Triggers (inputs that can cause a transition)

| Trigger | Source | Typical payload |
|---|---|---|
| `signup` | Firebase Auth onCreate hook (future) OR first `/account/me` call | `{ uid, email }` |
| `purchase` | `/payment/webhook` (paid event) | `{ uid, plan, billingCycle, txnid, amount, currency }` |
| `upgrade` | `/payment/subscription/upgrade` + webhook | `{ uid, fromPlan, toPlan, billingCycle, txnid, creditApplied }` |
| `downgrade_schedule` | `/payment/subscription/downgrade` (Pro Max → Pro; effective at period end) | `{ uid, targetPlan, scheduledFor }` |
| `cancel` | `/payment/subscription/cancel` | `{ uid, transitionId }` |
| `reactivate` | `/payment/subscription/reactivate` | `{ uid, transitionId }` |
| `renew_success` | `/payment/webhook` (renewal event) | `{ uid, txnid, newPeriodEnd }` |
| `renew_fail` | `/payment/webhook` (failure event) | `{ uid, txnid, reason }` |
| `period_end` | In-process scheduler running every minute, reads `subscription.currentPeriodEnd <= now` | `{ uid, transitionId }` |

Note: `period_end` is **time-driven** and must use a deterministic transition ID (e.g. `${uid}:period_end:${currentPeriodEnd.toISOString()}`) so a duplicated tick does not re-fire the transition.

`renew_fail` is **event-driven** (PayU webhook) and produces an immediate tier drop, not a scheduled one. No timer, no cron, no retry window.

---

## 3. Transition table

Each row is `(fromState, trigger) → toState + sideEffects`. All transitions are guarded by the idempotency check in §7.

| From | Trigger | To | Side effects |
|---|---|---|---|
| `guest` | `signup` | `free` | Create `users/{uid}` doc, initial `subscription` subdoc with `plan='free'`. Archive guest counter doc (set flag `convertedToUid`). UC-11. |
| `free` | `purchase` (pro, monthly) | `pro_monthly` | Set currentPeriodStart=now, currentPeriodEnd=now+30d, nextRenewalAt=currentPeriodEnd, lastTxnid=txnid, status='active'. Set Firebase custom claim `tier='pro'`. Call `tokenMeter.resetMonthly(uid, 'pro')`. Emit invoice job. UC-26. |
| `free` | `purchase` (pro, annual) | `pro_annual` | Same but +365d. |
| `free` | `purchase` (promax, monthly) | `promax_monthly` | Same with promax caps. |
| `free` | `purchase` (promax, annual) | `promax_annual` | Same +365d. |
| `pro_monthly` \| `pro_annual` | `upgrade` → promax | `promax_monthly` or `promax_annual` | Compute forward credit (§6). Reset period clock to `now → now+30d/365d`. Set claim `tier='promax'`. Call `tokenMeter.resetMonthly(uid, 'promax')`. Emit upgrade invoice with credit line. UC-29, LH-09, LH-10. |
| `pro_monthly` \| `pro_annual` | `cancel` | `pro_cancel_scheduled` | Set `cancelAtPeriodEnd=true`. Keep access. No refund. UC-31. |
| `promax_monthly` \| `promax_annual` | `cancel` | `promax_cancel_scheduled` | Same. |
| `promax_monthly` \| `promax_annual` | `downgrade_schedule` (→ pro) | `promax_cancel_scheduled` with `downgradeToOnPeriodEnd='pro_monthly'` | NOT immediate. Side field captures intent. UC-30, LH-11. |
| `pro_cancel_scheduled` \| `promax_cancel_scheduled` | `reactivate` | `pro_monthly` \| `promax_monthly` (whichever the underlying plan was) | Set `cancelAtPeriodEnd=false`. Clear `downgradeToOnPeriodEnd` if set. UC-32, LH-12. |
| `pro_monthly` \| `pro_annual` \| `promax_monthly` \| `promax_annual` | `renew_success` | same state | Advance `currentPeriodStart`, `currentPeriodEnd`, `nextRenewalAt`. Apply any `forwardCreditUsd` to the new invoice. Call `tokenMeter.resetMonthly(...)`. Emit renewal invoice. LH-16. |
| `pro_monthly` \| `pro_annual` \| `promax_monthly` \| `promax_annual` | `renew_fail` | `free` | **Immediate drop.** Set plan='free', billingCycle='none', clear period fields, status='free'. Set Firebase custom claim `tier='free'`. Call `tokenMeter.resetMonthly(uid, 'free')`. **Data retained in full.** Existing reminders keep firing. Emit `tier_downgraded_renew_fail` event. LH-17. |
| `pro_cancel_scheduled` \| `promax_cancel_scheduled` | `period_end` | `free` **OR** `pro_monthly` (if downgradeToOnPeriodEnd set) | If `downgradeToOnPeriodEnd === 'pro_monthly'`: transition to `pro_monthly` with a fresh 30-day period billed from any `forwardCreditUsd` first, cash second. Else: transition to `free`, reset tier, data retained, old reminders keep firing. UC-30, UC-31. |
| `pro_cancel_scheduled` \| `promax_cancel_scheduled` | `renew_fail` | `free` | Scheduled cancel + failed-charge on the scheduled downgrade retry → immediate drop to free. Same side effects as above row. |
| any state | duplicate trigger with same transitionId | (no-op) | Log and return the current state. Idempotency. LH-26, UC-34. |

---

## 4. ASCII diagram

```
                      signup                     purchase(pro,M)
          guest ─────────────▶ free ────────────────────┬────────────▶ pro_monthly
                                 │                       │                    │ ▲
                                 │ purchase(pro,A)       │                    │ │
                                 ├──────────────────────▶│                    │ │
                                 │                       ▼                    │ │
                                 │                 pro_annual ────────────────┘ │
                                 │                     │ ▲                      │
                                 │                     │ │ renew_success        │
                                 │ purchase(promax,*)  │ │                      │
                                 ├─────────────────────┼─┘                      │
                                 │                     │                        │
                                 ▼                     │         upgrade        │
                            promax_monthly  ◀──────────┴──────────────(Pro→PMax)┘
                                 │  ▲
                   renew_success │  │ purchase(promax,A)
                                 │  │
                                 ▼  │
                            promax_annual
                                 │
                       cancel    │           period_end
                 ┌───────────────┤             │
                 │               │             ▼
                 ▼               ▼           free ◀──── renew_fail (immediate)
       promax_cancel_scheduled   │            ▲
                 │               │            │
                 │ period_end    │            │
                 │  (downgrade=  │            │
                 │   pro_monthly)│            │
                 ▼               ▼            │
            pro_monthly       free ◀──────────┘

            (analogous for pro_*)
```

---

## 5. Firestore schema — `users/{uid}/subscription/current`

One fixed doc ID, `current`. History lives in `users/{uid}/subscription/history/{transitionId}` (append-only log of prior states for audit).

```ts
// users/{uid}/subscription/current
{
  state: SubscriptionState,            // one of the 8 from §1
  plan: 'free' | 'pro' | 'promax',
  billingCycle: 'none' | 'monthly' | 'annual' | '6mo',  // 'none' for free
  currentPeriodStart: Timestamp | null,
  currentPeriodEnd:   Timestamp | null,
  nextRenewalAt:      Timestamp | null,     // usually == currentPeriodEnd unless cancel_scheduled
  cancelAtPeriodEnd:  boolean,
  downgradeToOnPeriodEnd: 'pro_monthly' | null,  // set by downgrade_schedule trigger
  forwardCreditUsd: number,              // accumulates from upgrades (never refunds). §6.
  lastTxnid: string | null,              // most recent payment's txnid
  status: 'active' | 'cancel_scheduled' | 'free',
  updatedAt: Timestamp,
}
```

```ts
// users/{uid}/subscription/history/{transitionId}
{
  from: SubscriptionState,
  to:   SubscriptionState,
  trigger: string,                     // e.g. 'purchase', 'upgrade', 'period_end', 'renew_fail'
  triggeredAt: Timestamp,
  sideEffectSummary: string,           // human-readable log line
  txnid?: string,
}
```

`transitionId` is the idempotency key (§7).

---

## 6. Credit calculation — forward credits only, no refunds

All monetary sides of this machine operate on USD. Currency conversion is a display/charge-time concern (see `payu-contract.md`), not a state-machine concern.

### 6.1 Formula (from EXECUTION_PLAN.md §7.3)

```
daysRemaining  = daysBetween(today, currentPeriodEnd)
periodLength   = daysBetween(currentPeriodStart, currentPeriodEnd)
unusedFraction = daysRemaining / periodLength

proCredit      = currentPlanUSD * unusedFraction
proMaxFull     = targetPlanUSD
chargeNow      = max(0, proMaxFull - proCredit - existingForwardCreditUsd)
newForward     = max(0, (proCredit + existingForwardCreditUsd) - proMaxFull)
```

Invariants:
- `chargeNow >= 0` always. If `chargeNow === 0`, no PayU redirect occurs — the transition happens via an internal "free upgrade" webhook mimic.
- `newForward` is **forward credit**, stored on `subscription.forwardCreditUsd`. It is applied automatically on the next renewal invoice as a line item. **It never refunds. It never expires.**
- No path ever writes a negative number to any of these fields.

### 6.2 Worked example — Annual Pro → Monthly Pro Max upgrade at day 180

- Today: day 180 of 365 on annual Pro at $119 USD.
- `daysRemaining = 185`, `periodLength = 365`, `unusedFraction = 0.5068`
- `proCredit = 119 * 0.5068 = $60.31`
- `proMaxFull = $39` (monthly Pro Max)
- `existingForwardCreditUsd = 0`
- `chargeNow = max(0, 39 - 60.31 - 0) = $0`
- `newForward = max(0, 60.31 - 39) = $21.31`

Transition: `pro_annual → promax_monthly`, no PayU call, `forwardCreditUsd = 21.31` stored. Next Pro Max renewal ($39) is billed as `charge = 39 - 21.31 = $17.69`, and `forwardCreditUsd` is cleared to 0.

Invoice for the upgrade shows both lines:
```
Pro Max (monthly)              $39.00
  − Credit from unused Pro     −$60.31
  Forward credit to next cycle   $21.31
────────────────────────────────────────
  Charged today                $0.00
```

UC-29, LH-09, LH-10 — all covered by this formula.

---

## 7. Idempotency — every transition keyed

**Every** transition must compute a deterministic `transitionId` and write it to `users/{uid}/subscription/history/{transitionId}` inside the **same transaction** that mutates `current`. If the history doc already exists, the transition is a no-op (LH-26, UC-34).

Key formulas:
- `purchase`, `upgrade`, `renew_success`, `renew_fail`, `addExtras` → `transitionId = txnid` (PayU's unique transaction ID)
- `cancel`, `reactivate` → `transitionId = ${uid}:${trigger}:${clientRequestId}` where `clientRequestId` is a UUID the frontend passes on the request (new per click, persisted for retry)
- `period_end` → `transitionId = ${uid}:period_end:${currentPeriodEnd.toISOString()}`
- `signup` → `transitionId = ${uid}:signup`
- `downgrade_schedule` → `transitionId = ${uid}:downgrade_schedule:${clientRequestId}`

Transaction pseudocode:

```
async function applyTransition(uid, from, to, trigger, payload):
  const transitionId = computeId(uid, trigger, payload)
  const currentRef = db.doc(`users/${uid}/subscription/current`)
  const historyRef = db.doc(`users/${uid}/subscription/history/${transitionId}`)

  return db.runTransaction(async tx => {
    const histSnap = await tx.get(historyRef)
    if (histSnap.exists) {
      // Idempotent no-op. Return current state for the caller.
      const curSnap = await tx.get(currentRef)
      return { applied: false, state: curSnap.data().state }
    }

    const curSnap = await tx.get(currentRef)
    const cur = curSnap.data()
    if (cur.state !== from && !isCompatibleFromState(cur.state, from, trigger)) {
      throw new InvalidTransitionError(`cannot ${trigger} from ${cur.state}`)
    }

    const next = computeNext(cur, to, trigger, payload)
    tx.set(currentRef, { ...cur, ...next, updatedAt: now })
    tx.set(historyRef, {
      from: cur.state, to: next.state, trigger, triggeredAt: now,
      sideEffectSummary: summarize(next),
      ...(payload.txnid ? { txnid: payload.txnid } : {}),
    })
    return { applied: true, state: next.state }
  })
```

Side effects (custom claim, `tokenMeter.resetMonthly`, invoice emit) fire **after** the transaction commits. If they fail, they're retried by their own mechanisms — the state-machine commit is authoritative.

---

## 8. Renewal failure behavior (LH-17) — point-to-point

- **Trigger:** PayU webhook delivers a `renew_fail` / failed-charge event for a scheduled renewal.
- **Transition:** current paid state → `free`, **immediately**, in the same webhook handler transaction.
- **No grace window. No dunning. No retries orchestrated by Easebot.** PayU may internally retry as part of its SI mandate; if a subsequent retry succeeds, PayU will deliver a separate `renew_success` webhook, which will be treated as a fresh `purchase` on the now-`free` account (idempotent via `txnid`, so no double-processing).
- **Side effects on drop:**
  - Firebase custom claim `tier='free'`
  - `tokenMeter.resetMonthly(uid, 'free')` — user immediately lands on Free token caps
  - `forwardCreditUsd` is preserved (credit survives the tier drop; applied on next paid purchase)
  - Data retained in full. Existing reminders keep firing (PRD §6.5 explicit).
  - Emit `tier_downgraded_renew_fail` analytics event for the dashboard.
- **Re-subscription from `free` after renew_fail:** fresh `purchase` trigger. New period, new invoice. No back-dating, no credit games beyond the `forwardCreditUsd` that was preserved.

---

## 9. Downgrade scheduled-at-period-end (LH-11)

There is NO immediate downgrade. A Pro Max user who clicks "Downgrade to Pro" produces:
- Trigger: `downgrade_schedule`
- State: `promax_monthly` → `promax_cancel_scheduled` with `downgradeToOnPeriodEnd='pro_monthly'`
- `cancelAtPeriodEnd=true` on the subscription doc
- Access stays Pro Max until `currentPeriodEnd`
- On `period_end` trigger, the machine reads `downgradeToOnPeriodEnd`:
  - If set → transition to `pro_monthly`, start fresh 30-day clock **billed from `forwardCreditUsd` first, then the user's saved payment method**. This is a NEW subscription period; a new invoice is emitted.
  - If the scheduled charge fails → immediate drop to `free` via `renew_fail` (no grace). The downgrade intent is discarded.
- If user reactivates (`reactivate` trigger) before `period_end` → clear both `cancelAtPeriodEnd` and `downgradeToOnPeriodEnd`, return to `promax_monthly`.

Edge: user downgrades, then upgrades again before period end. Sequence: `promax_monthly → promax_cancel_scheduled(downgrade=pro) → reactivate → promax_monthly`. No new charge. LH-12.

---

## 10. "Already has a plan" guard (UC-37, LH-14)

Every `purchase` trigger must be validated BEFORE calling PayU:

```
if currentState !== 'free':
  return 409 Conflict { error: 'already_subscribed', currentPlan: derivePlanFromState(state) }
```

The frontend also hides the buy button for the current plan (§7.2 of EXECUTION_PLAN.md). Double-defense.

The `upgrade` trigger (Pro → Pro Max) is distinct from `purchase` and has its own endpoint. It passes the guard because the state machine expects an upgrade trigger, not a purchase trigger, for this case.

---

## 11. Cross-reference to use cases and loopholes

| UC / LH | Covered by |
|---|---|
| UC-29 Pro upgrades to Pro Max mid-cycle | §3 row `pro_monthly` + `upgrade`, §6 formula |
| UC-30 Pro Max → Pro downgrade at period end | §9 |
| UC-31 Pro cancel, access until period end, then free | §3 row cancel, row period_end |
| UC-32 Cancel then reactivate before period end | §3 reactivate row |
| UC-33 Refund request | §1 non-goals. The state machine has no refund trigger. Support responds per PRD §6.5. |
| UC-34 Webhook duplicate | §7 idempotency on `transitionId = txnid` |
| LH-09 Immediate upgrade credit | §6 formula, `forwardCreditUsd` |
| LH-10 Annual Pro → Pro Max crossover | §6.2 worked example |
| LH-11 No mid-cycle downgrade refund | §9 scheduled only |
| LH-12 Downgrade then upgrade before period end | §9 last paragraph |
| LH-13 Cancel then resubscribe next day | Fresh purchase, no credit games. §8 last bullet. |
| LH-14 Buy same plan again | §10 409 guard |
| LH-15 Delayed webhook | `/payment/verify` (see `payu-contract.md`). This spec: transition fires whenever the verify path can reach the machine with a paid status. |
| LH-16 Auto-renew | §3 renew_success row |
| LH-17 Card fails on renew | §8 immediate drop to free |
| LH-18 User demands refund | No such trigger exists. |
| LH-19 Chargeback | Admin, out-of-band. No state-machine path. |

---

## 12. Open architectural concerns

1. **`period_end` trigger needs a scheduler.** There is no existing in-process cron for subscription ticks. `reminderScheduler.ts` exists for reminders; a similar small scheduler is needed here. Flag: Backend agent must add `subscriptionScheduler.ts` that runs every minute and reads `subscription.current` docs where `currentPeriodEnd <= now AND state IN (cancel_scheduled)`. This is new code, not a rules change. Note: there is no `grace` state to scan for — `renew_fail` is handled inline in the webhook handler, no timer involvement.

2. **Custom claim write requires Admin SDK privileges.** Setting `tier` on the Firebase custom claim requires Admin SDK. The Admin SDK is already used (see `lib/firebaseAdmin.ts`), so no new credentials — but the service account must have `Firebase Authentication Admin` role. Flagged in `FIREBASE_CONSOLE_CHECKLIST.md` as a pre-live IAM item. **Decision locked:** default to Firestore tier mirror (`users/{uid}.tierMirror`) as the authoritative read path for `authMiddleware.ts`, with custom claim as a fast-path optimization if/when IAM is in place. This removes the IAM dependency from Sprint 1–3 critical path.

3. **`downgradeToOnPeriodEnd` is a special-case field.** It's a side channel on the `current` doc instead of a separate state. This keeps the state count manageable (no `promax_to_pro_scheduled` variant) but requires the `period_end` handler to branch on the field. If the field is ever corrupted / inconsistent, a user could land in the wrong tier at period end. Mitigation: on entry to `cancel_scheduled`, validate the field value is a known plan string; on `period_end`, fail-closed to `free` (not to a stale scheduled plan) if the field is an unexpected value.

4. **Forward credits in INR (or any non-USD).** Credits are stored in USD. At renewal, the user might be charged in INR at a different rate than when the credit was earned. The credit is applied pre-rate-conversion (USD subtracted from USD total, then the whole total is converted). This is the honest behavior. Document in the invoice template so a user who sees "credit: $21.31" doesn't try to match it to an INR figure. Invoice spec covers this in its own §9 tax/currency notes.

5. **Race between `renew_fail` webhook and concurrent user activity.** A user could be mid-request when PayU delivers a `renew_fail`. The token meter might allow one more charge at the old tier's caps before the transition commits. Accepted: the in-flight request completes at the old tier. The *next* request lands on free caps. This is the sane, point-to-point behavior.
