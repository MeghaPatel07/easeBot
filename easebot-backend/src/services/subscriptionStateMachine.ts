/**
 * subscriptionStateMachine — the ONLY code path that writes to
 * `users/{uid}/subscription/current`.
 *
 * Sprint 3: real Firestore implementation per
 * .orchestrator/specs/subscription-state.md §3, §6, §7, §8, §9.
 *
 * Client SDK only (no firebase-admin, per sprint guardrail). Tier read path
 * stays `users/{uid}.tierMirror`; custom claims are NOT touched.
 *
 * Non-goals: refunds, grace states, dunning retries.
 */

import {
  doc,
  runTransaction,
  Timestamp,
  getDoc,
  setDoc,
  collectionGroup,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { resetMonthly } from './tokenMeter'
import { emit } from '../lib/observability'
import { capture as phCapture } from '../lib/posthog'
import { queueInvoice } from './invoiceService'
import type {
  SubscriptionState,
  SubscriptionTrigger,
  SubscriptionTransitionPayload,
  TransitionResult,
  Tier,
} from '../types/billing'

export type {
  SubscriptionState,
  SubscriptionTrigger,
  SubscriptionTransitionPayload,
  TransitionResult,
}

// ---------------------------------------------------------------------------
// Shapes (spec §5)
// ---------------------------------------------------------------------------

const PERIOD_DAYS: Record<'monthly' | 'annual' | '6mo', number> = {
  monthly: 30,
  annual: 365,
  '6mo': 182,
}

const PLAN_USD: Record<'pro' | 'promax', { monthly: number; annual: number }> = {
  pro: { monthly: 10, annual: 79 },
  promax: { monthly: 39, annual: 299 },
}

interface SubscriptionDoc {
  state: SubscriptionState
  plan: 'free' | 'pro' | 'promax'
  billingCycle: 'none' | 'monthly' | 'annual' | '6mo'
  currentPeriodStart: Timestamp | null
  currentPeriodEnd: Timestamp | null
  nextRenewalAt: Timestamp | null
  cancelAtPeriodEnd: boolean
  downgradeToOnPeriodEnd: 'pro_monthly' | null
  forwardCreditUsd: number
  lastTxnid: string | null
  status: 'active' | 'cancel_scheduled' | 'free'
  updatedAt: Timestamp
}

function freshFreeDoc(): SubscriptionDoc {
  return {
    state: 'free',
    plan: 'free',
    billingCycle: 'none',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextRenewalAt: null,
    cancelAtPeriodEnd: false,
    downgradeToOnPeriodEnd: null,
    forwardCreditUsd: 0,
    lastTxnid: null,
    status: 'free',
    updatedAt: Timestamp.now(),
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: SubscriptionState, trigger: SubscriptionTrigger) {
    super(`invalid_transition: ${from} + ${trigger}`)
    this.name = 'InvalidTransitionError'
  }
}

// ---------------------------------------------------------------------------
// Idempotency key (spec §7)
// ---------------------------------------------------------------------------

function computeTransitionId(
  uid: string,
  trigger: SubscriptionTrigger,
  payload: SubscriptionTransitionPayload,
): string {
  switch (trigger) {
    case 'purchase':
    case 'upgrade':
    case 'renew_success':
    case 'renew_fail':
      if (!payload.txnid) throw new Error(`${trigger} requires txnid`)
      return payload.txnid
    case 'cancel':
    case 'reactivate':
    case 'downgrade_schedule': {
      const cri = payload.clientRequestId ?? `${Date.now()}`
      return `${uid}:${trigger}:${cri}`
    }
    case 'period_end': {
      const end = payload.scheduledFor ?? 'unknown'
      return `${uid}:period_end:${end}`
    }
    case 'signup':
      return `${uid}:signup`
  }
}

// ---------------------------------------------------------------------------
// Credit calculation (spec §6)
// ---------------------------------------------------------------------------

export interface CreditComputation {
  chargeNowUsd: number
  newForwardCreditUsd: number
  proCreditUsd: number
}

export function computeUpgradeCredit(params: {
  currentPlanUsd: number
  targetPlanUsd: number
  currentPeriodStart: Date
  currentPeriodEnd: Date
  existingForwardCreditUsd: number
  now?: Date
}): CreditComputation {
  const now = params.now ?? new Date()
  const ms = params.currentPeriodEnd.getTime() - params.currentPeriodStart.getTime()
  const periodLength = Math.max(1, Math.ceil(ms / 86_400_000))
  const remainingMs = Math.max(0, params.currentPeriodEnd.getTime() - now.getTime())
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / 86_400_000))
  const unusedFraction = Math.min(1, daysRemaining / periodLength)

  const proCreditUsd = Math.round(params.currentPlanUsd * unusedFraction * 100) / 100
  const chargeNowUsd = Math.max(
    0,
    Math.round(
      (params.targetPlanUsd - proCreditUsd - params.existingForwardCreditUsd) * 100,
    ) / 100,
  )
  const newForwardCreditUsd = Math.max(
    0,
    Math.round(
      (proCreditUsd + params.existingForwardCreditUsd - params.targetPlanUsd) * 100,
    ) / 100,
  )
  return { chargeNowUsd, newForwardCreditUsd, proCreditUsd }
}

// ---------------------------------------------------------------------------
// computeNext — pure state transition (no IO)
// ---------------------------------------------------------------------------

function derivePaidState(
  plan: 'pro' | 'promax',
  cycle: 'monthly' | 'annual' | '6mo',
): SubscriptionState {
  if (plan === 'pro') return cycle === 'annual' ? 'pro_annual' : 'pro_monthly'
  return cycle === 'annual' ? 'promax_annual' : 'promax_monthly'
}

function tierFromState(state: SubscriptionState): Tier {
  switch (state) {
    case 'guest': return 'guest'
    case 'free': return 'free'
    case 'pro_monthly':
    case 'pro_annual':
    case 'pro_cancel_scheduled':
      return 'pro'
    case 'promax_monthly':
    case 'promax_annual':
    case 'promax_cancel_scheduled':
      return 'promax'
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

function computeNext(
  cur: SubscriptionDoc,
  trigger: SubscriptionTrigger,
  payload: SubscriptionTransitionPayload,
): SubscriptionDoc {
  const now = new Date()
  const nowTs = Timestamp.fromDate(now)

  switch (trigger) {
    case 'signup': {
      if (cur.state !== 'guest' && cur.state !== 'free') {
        throw new InvalidTransitionError(cur.state, trigger)
      }
      return { ...freshFreeDoc(), updatedAt: nowTs }
    }

    case 'purchase': {
      if (cur.state !== 'free' && cur.state !== 'guest') {
        throw new InvalidTransitionError(cur.state, trigger)
      }
      const plan = payload.plan
      const cycle = payload.billingCycle
      if (!plan || !cycle || cycle === '6mo') {
        throw new Error('purchase requires plan + monthly|annual cycle')
      }
      const end = addDays(now, PERIOD_DAYS[cycle])
      return {
        state: derivePaidState(plan, cycle),
        plan,
        billingCycle: cycle,
        currentPeriodStart: nowTs,
        currentPeriodEnd: Timestamp.fromDate(end),
        nextRenewalAt: Timestamp.fromDate(end),
        cancelAtPeriodEnd: false,
        downgradeToOnPeriodEnd: null,
        forwardCreditUsd: cur.forwardCreditUsd,
        lastTxnid: payload.txnid ?? cur.lastTxnid,
        status: 'active',
        updatedAt: nowTs,
      }
    }

    case 'upgrade': {
      if (
        cur.state !== 'pro_monthly' &&
        cur.state !== 'pro_annual' &&
        cur.state !== 'pro_cancel_scheduled'
      ) {
        throw new InvalidTransitionError(cur.state, trigger)
      }
      const targetCycle = (payload.billingCycle ?? 'monthly') as 'monthly' | 'annual'
      const end = addDays(now, PERIOD_DAYS[targetCycle])
      const nextForward =
        typeof payload.creditApplied === 'number'
          ? Math.max(0, payload.creditApplied)
          : cur.forwardCreditUsd
      return {
        state: derivePaidState('promax', targetCycle),
        plan: 'promax',
        billingCycle: targetCycle,
        currentPeriodStart: nowTs,
        currentPeriodEnd: Timestamp.fromDate(end),
        nextRenewalAt: Timestamp.fromDate(end),
        cancelAtPeriodEnd: false,
        downgradeToOnPeriodEnd: null,
        forwardCreditUsd: nextForward,
        lastTxnid: payload.txnid ?? cur.lastTxnid,
        status: 'active',
        updatedAt: nowTs,
      }
    }

    case 'cancel': {
      if (cur.state === 'pro_monthly' || cur.state === 'pro_annual') {
        return {
          ...cur,
          state: 'pro_cancel_scheduled',
          cancelAtPeriodEnd: true,
          status: 'cancel_scheduled',
          updatedAt: nowTs,
        }
      }
      if (cur.state === 'promax_monthly' || cur.state === 'promax_annual') {
        return {
          ...cur,
          state: 'promax_cancel_scheduled',
          cancelAtPeriodEnd: true,
          status: 'cancel_scheduled',
          updatedAt: nowTs,
        }
      }
      throw new InvalidTransitionError(cur.state, trigger)
    }

    case 'reactivate': {
      if (cur.state === 'pro_cancel_scheduled') {
        return {
          ...cur,
          state: cur.billingCycle === 'annual' ? 'pro_annual' : 'pro_monthly',
          cancelAtPeriodEnd: false,
          downgradeToOnPeriodEnd: null,
          status: 'active',
          updatedAt: nowTs,
        }
      }
      if (cur.state === 'promax_cancel_scheduled') {
        return {
          ...cur,
          state: cur.billingCycle === 'annual' ? 'promax_annual' : 'promax_monthly',
          cancelAtPeriodEnd: false,
          downgradeToOnPeriodEnd: null,
          status: 'active',
          updatedAt: nowTs,
        }
      }
      throw new InvalidTransitionError(cur.state, trigger)
    }

    case 'downgrade_schedule': {
      if (cur.state !== 'promax_monthly' && cur.state !== 'promax_annual') {
        throw new InvalidTransitionError(cur.state, trigger)
      }
      return {
        ...cur,
        state: 'promax_cancel_scheduled',
        cancelAtPeriodEnd: true,
        downgradeToOnPeriodEnd: 'pro_monthly',
        status: 'cancel_scheduled',
        updatedAt: nowTs,
      }
    }

    case 'renew_success': {
      if (
        cur.state !== 'pro_monthly' &&
        cur.state !== 'pro_annual' &&
        cur.state !== 'promax_monthly' &&
        cur.state !== 'promax_annual'
      ) {
        throw new InvalidTransitionError(cur.state, trigger)
      }
      const cycle = cur.billingCycle === 'annual' ? 'annual' : 'monthly'
      const end = addDays(now, PERIOD_DAYS[cycle])
      // forwardCreditUsd is applied on the invoice; state-machine clears it.
      return {
        ...cur,
        currentPeriodStart: nowTs,
        currentPeriodEnd: Timestamp.fromDate(end),
        nextRenewalAt: Timestamp.fromDate(end),
        forwardCreditUsd: 0,
        lastTxnid: payload.txnid ?? cur.lastTxnid,
        updatedAt: nowTs,
      }
    }

    case 'renew_fail': {
      // Immediate drop to free; forwardCreditUsd is preserved (spec §8).
      return {
        ...freshFreeDoc(),
        forwardCreditUsd: cur.forwardCreditUsd,
        lastTxnid: payload.txnid ?? cur.lastTxnid,
        updatedAt: nowTs,
      }
    }

    case 'period_end': {
      // P2: fail-safe validation. An unexpected downgradeToOnPeriodEnd value
      // is normalized to null (+ warn) rather than throwing, so the tick loop
      // can still drop the user to `free` deterministically.
      const dgToRaw = cur.downgradeToOnPeriodEnd
      const dgTo: 'pro_monthly' | null =
        dgToRaw === null || dgToRaw === 'pro_monthly' ? dgToRaw : null
      if (dgToRaw !== null && dgToRaw !== 'pro_monthly') {
        console.warn('[stateMachine] unexpected downgradeToOnPeriodEnd — resetting', {
          value: dgToRaw,
        })
      }
      if (cur.state === 'pro_cancel_scheduled') {
        return {
          ...freshFreeDoc(),
          forwardCreditUsd: cur.forwardCreditUsd,
          updatedAt: nowTs,
        }
      }
      if (cur.state === 'promax_cancel_scheduled') {
        if (dgTo === 'pro_monthly') {
          // Fresh 30d Pro period; forward credit applies to new invoice.
          const end = addDays(now, 30)
          return {
            state: 'pro_monthly',
            plan: 'pro',
            billingCycle: 'monthly',
            currentPeriodStart: nowTs,
            currentPeriodEnd: Timestamp.fromDate(end),
            nextRenewalAt: Timestamp.fromDate(end),
            cancelAtPeriodEnd: false,
            downgradeToOnPeriodEnd: null,
            // Consume credit against the $14.99 Pro monthly charge.
            forwardCreditUsd: Math.max(0, cur.forwardCreditUsd - PLAN_USD.pro.monthly),
            lastTxnid: cur.lastTxnid,
            status: 'active',
            updatedAt: nowTs,
          }
        }
        return {
          ...freshFreeDoc(),
          forwardCreditUsd: cur.forwardCreditUsd,
          updatedAt: nowTs,
        }
      }
      throw new InvalidTransitionError(cur.state, trigger)
    }
  }
}

// ---------------------------------------------------------------------------
// applyTransition — atomic idempotent write
// ---------------------------------------------------------------------------

export async function applyTransition(
  uid: string,
  _from: SubscriptionState,
  _to: SubscriptionState,
  trigger: SubscriptionTrigger,
  payload: SubscriptionTransitionPayload,
): Promise<TransitionResult> {
  const transitionId = computeTransitionId(uid, trigger, payload)
  const currentRef = doc(db, 'users', uid, 'subscription', 'current')
  const historyRef = doc(db, 'users', uid, 'subscription', 'history_' + transitionId)

  const result = await runTransaction(db, async (tx) => {
    const histSnap = await tx.get(historyRef)
    if (histSnap.exists()) {
      const curSnap = await tx.get(currentRef)
      const cur = (curSnap.data() as SubscriptionDoc | undefined) ?? freshFreeDoc()
      return { applied: false, state: cur.state, next: cur, prev: cur }
    }

    const curSnap = await tx.get(currentRef)
    const cur = (curSnap.data() as SubscriptionDoc | undefined) ?? freshFreeDoc()

    const next = computeNext(cur, trigger, payload)
    tx.set(currentRef, next)
    tx.set(historyRef, {
      from: cur.state,
      to: next.state,
      trigger,
      triggeredAt: Timestamp.now(),
      sideEffectSummary: `${cur.state}→${next.state}`,
      ...(payload.txnid ? { txnid: payload.txnid } : {}),
    })
    return { applied: true, state: next.state, next, prev: cur }
  })

  // Post-commit side effects (tier mirror flip + token meter reset).
  if (result.applied) {
    const nextTier = tierFromState(result.state)
    emit('subscription_transition', {
      uid,
      trigger,
      toState: result.state,
      toTier: nextTier,
      txnid: payload.txnid,
    })

    if (trigger === 'renew_success') {
      phCapture(uid, 'subscription_renewed', {
        uid,
        tier: nextTier,
        cycle: result.next.billingCycle === 'annual' ? 'annual' : 'monthly',
      })
    } else if (trigger === 'renew_fail') {
      phCapture(uid, 'subscription_renewal_failed', {
        uid,
        reason: payload.reason ?? 'unknown',
      })
    } else if (trigger === 'period_end' && result.next.state === 'free') {
      phCapture(uid, 'subscription_expired', {
        uid,
        from_tier: tierFromState(result.prev.state),
      })
    }
    try {
      const userRef = doc(db, 'users', uid)
      const userSnap = await getDoc(userRef)
      if (userSnap.exists()) {
        const { updateDoc, serverTimestamp } = await import('firebase/firestore')
        await updateDoc(userRef, { tierMirror: nextTier, tierUpdatedAt: serverTimestamp() })
      } else {
        const { setDoc, serverTimestamp } = await import('firebase/firestore')
        await setDoc(userRef, { tierMirror: nextTier, tierUpdatedAt: serverTimestamp() }, { merge: true })
      }
    } catch (err) {
      console.error('[stateMachine] tierMirror flip failed', { uid, err })
    }
    // Reset monthly pool on tier changes and renewals.
    if (
      trigger === 'purchase' ||
      trigger === 'upgrade' ||
      trigger === 'renew_success' ||
      trigger === 'renew_fail' ||
      (trigger === 'period_end' && result.state !== 'free')
    ) {
      resetMonthly(uid, nextTier).catch((err) =>
        console.error('[stateMachine] resetMonthly failed', { uid, err }),
      )
    }

    // P0-1 + P0-4: period_end ProMax→Pro downgrade invoice.
    // Log credit consumption BEFORE the fire-and-forget queue so we still have
    // an audit trail if queueInvoice throws. Invoice retry itself is the
    // queueInvoice runner's responsibility (Agent D scope).
    if (
      trigger === 'period_end' &&
      result.next.state === 'pro_monthly' &&
      result.prev.state === 'promax_cancel_scheduled'
    ) {
      const periodStartIso =
        result.next.currentPeriodStart?.toDate().toISOString() ??
        new Date().toISOString()
      const creditConsumed = Math.max(
        0,
        Math.round((result.prev.forwardCreditUsd - result.next.forwardCreditUsd) * 100) / 100,
      )
      const synthTxnid = `DGRD-${uid.slice(0, 6)}-${periodStartIso}`
      emit('subscription.credit_consumed', {
        uid,
        amount: creditConsumed,
        transitionId,
        periodStart: periodStartIso,
        newState: result.next.state,
      })
      void queueSyntheticInvoice({
        uid,
        txnid: synthTxnid,
        priceUsd: PLAN_USD.pro.monthly,
        creditAppliedUsd: creditConsumed,
        productinfo: 'Easebot Pro — Monthly (scheduled downgrade)',
        cycle: 'monthly',
        plan: 'pro',
      }).catch((err) => {
        emit('subscription.invoice_queue_failed', {
          uid,
          transitionId,
          txnid: synthTxnid,
          error: err instanceof Error ? err.message : String(err),
        })
        console.warn('[stateMachine] queueInvoice (downgrade) failed', { uid, err })
      })
    }
  }

  return { applied: result.applied, state: result.state }
}

// ---------------------------------------------------------------------------
// Synthetic invoice helper — used by period_end downgrades (P0-1) and
// free-upgrade zero-charge transitions (P0-2 in subscriptionController).
//
// invoiceService.queueInvoice reads `payments/{txnid}`; so for synthetic
// transitions with no PayU payment we first materialize a payments doc
// mimicking the webhook shape, then call queueInvoice.
// ---------------------------------------------------------------------------

export interface SyntheticInvoiceArgs {
  uid: string
  txnid: string
  priceUsd: number
  creditAppliedUsd: number
  productinfo: string
  cycle: 'monthly' | 'annual'
  plan: 'pro' | 'promax'
}

export async function queueSyntheticInvoice(args: SyntheticInvoiceArgs): Promise<void> {
  const totalLocal = Math.max(
    0,
    Math.round((args.priceUsd - args.creditAppliedUsd) * 100) / 100,
  )
  // Try to hydrate buyer/billing fields from the user doc; optional.
  let buyer: { firstname?: string; email?: string } | undefined
  let billingAddress: Record<string, unknown> | undefined
  try {
    const userSnap = await getDoc(doc(db, 'users', args.uid))
    if (userSnap.exists()) {
      const u = userSnap.data() as Record<string, unknown>
      const email = typeof u.email === 'string' ? u.email : undefined
      const name =
        (typeof u.displayName === 'string' && u.displayName) ||
        (typeof u.firstname === 'string' && u.firstname) ||
        undefined
      if (email || name) buyer = { firstname: name, email }
      if (u.billingAddress && typeof u.billingAddress === 'object') {
        billingAddress = u.billingAddress as Record<string, unknown>
      }
    }
  } catch (err) {
    console.warn('[stateMachine] synthetic invoice user lookup failed', { uid: args.uid, err })
  }

  await setDoc(doc(db, 'payments', args.txnid), {
    txnid: args.txnid,
    uid: args.uid,
    plan: args.plan,
    cycle: args.cycle,
    productinfo: args.productinfo,
    priceUsd: args.priceUsd,
    amountLocal: totalLocal,
    currency: 'USD',
    forwardCreditUsd: args.creditAppliedUsd,
    state: 'paid',
    synthetic: true,
    ...(buyer ? { buyer } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    createdAt: serverTimestamp(),
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await queueInvoice({ jobId: args.txnid, kind: 'render_invoice', invoiceId: args.txnid, uid: args.uid })
}

// ---------------------------------------------------------------------------
// Read helper for subscriptionController.getCurrent
// ---------------------------------------------------------------------------

export async function readSubscription(uid: string): Promise<SubscriptionDoc> {
  const snap = await getDoc(doc(db, 'users', uid, 'subscription', 'current'))
  return snap.exists() ? (snap.data() as SubscriptionDoc) : freshFreeDoc()
}

// ---------------------------------------------------------------------------
// Period-end scheduler tick — used by subscriptionScheduler cron
// ---------------------------------------------------------------------------

export async function scanForPeriodEnd(): Promise<number> {
  // P0-3: collectionGroup query keyed on state + currentPeriodEnd, which
  // catches both cancel-to-free and ProMax→Pro downgrade scenarios.
  // REQUIRES a composite index (Firebase console action — see
  // FIREBASE_CONSOLE_CHECKLIST.md §2):
  //   collection group: subscription
  //   fields: state ASC, currentPeriodEnd ASC
  try {
    const nowTs = Timestamp.now()
    const q = query(
      collectionGroup(db, 'subscription'),
      where('state', 'in', ['pro_cancel_scheduled', 'promax_cancel_scheduled']),
      where('currentPeriodEnd', '<=', nowTs),
    )
    const snap = await getDocs(q)
    let ticked = 0
    for (const d of snap.docs) {
      // path = users/{uid}/subscription/current
      const segments = d.ref.path.split('/')
      if (segments.length < 4 || segments[0] !== 'users' || d.id !== 'current') continue
      const uid = segments[1]!
      try {
        const sub = d.data() as SubscriptionDoc
        await applyTransition(uid, sub.state, 'free', 'period_end', {
          scheduledFor: sub.currentPeriodEnd?.toDate().toISOString() ?? new Date().toISOString(),
        })
        ticked += 1
      } catch (err) {
        console.warn('[stateMachine] period_end scan error', { uid, err })
      }
    }
    return ticked
  } catch (err) {
    console.error('[stateMachine] scanForPeriodEnd failed', err)
    return 0
  }
}
