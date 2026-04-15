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
  collection,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { resetMonthly } from './tokenMeter'
import { emit } from '../lib/observability'
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
  pro: { monthly: 14.99, annual: 119 },
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
      if (
        cur.state === 'pro_cancel_scheduled' &&
        cur.downgradeToOnPeriodEnd !== 'pro_monthly'
      ) {
        return {
          ...freshFreeDoc(),
          forwardCreditUsd: cur.forwardCreditUsd,
          updatedAt: nowTs,
        }
      }
      if (cur.state === 'promax_cancel_scheduled') {
        if (cur.downgradeToOnPeriodEnd === 'pro_monthly') {
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
      return { applied: false, state: cur.state, next: cur }
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
    return { applied: true, state: next.state, next }
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
  }

  return { applied: result.applied, state: result.state }
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
  // Firestore client SDK cannot do a collectionGroup query easily without
  // indexes; instead, we scan recent `payments` docs for subs pending a
  // period_end tick. As a simple heuristic we query the `users` collection
  // and check each user's subscription/current doc — acceptable for low
  // volume early-stage use. Production would replace with a scheduled job.
  try {
    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('tierMirror', 'in', ['pro', 'promax']), limit(200)),
    )
    let ticked = 0
    const now = Date.now()
    for (const u of usersSnap.docs) {
      try {
        const sub = await readSubscription(u.id)
        if (
          (sub.state === 'pro_cancel_scheduled' || sub.state === 'promax_cancel_scheduled') &&
          sub.currentPeriodEnd &&
          sub.currentPeriodEnd.toMillis() <= now
        ) {
          await applyTransition(u.id, sub.state, 'free', 'period_end', {
            scheduledFor: sub.currentPeriodEnd.toDate().toISOString(),
          })
          ticked += 1
        }
      } catch (err) {
        console.warn('[stateMachine] period_end scan error', { uid: u.id, err })
      }
    }
    return ticked
  } catch (err) {
    console.error('[stateMachine] scanForPeriodEnd failed', err)
    return 0
  }
}
