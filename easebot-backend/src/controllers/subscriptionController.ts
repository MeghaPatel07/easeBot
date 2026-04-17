/**
 * subscriptionController — user-facing subscription mutations.
 *
 * Sprint 3: real implementation. All writes go through
 * subscriptionStateMachine.applyTransition (idempotent per clientRequestId).
 */

import type { Request, Response, NextFunction } from 'express'
import {
  applyTransition,
  readSubscription,
  computeUpgradeCredit,
  queueSyntheticInvoice,
} from '../services/subscriptionStateMachine'
import { emit } from '../lib/observability'

function requireUid(req: Request, res: Response): string | null {
  const uid = req.user?.uid
  if (!uid) {
    res.status(401).json({ error: 'auth_required' })
    return null
  }
  return uid
}

export async function upgrade(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = requireUid(req, res)
    if (!uid) return
    const { billingCycle } = (req.body ?? {}) as {
      billingCycle?: 'monthly' | 'annual'
    }
    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly'
    const sub = await readSubscription(uid)
    if (
      sub.state !== 'pro_monthly' &&
      sub.state !== 'pro_annual' &&
      sub.state !== 'pro_cancel_scheduled'
    ) {
      res.status(409).json({ error: 'not_upgradable', currentState: sub.state })
      return
    }
    if (!sub.currentPeriodStart || !sub.currentPeriodEnd) {
      res.status(409).json({ error: 'no_active_period' }); return
    }
    const currentPlanUsd =
      sub.billingCycle === 'annual' ? 0.12 : 0.01
    const targetPlanUsd = cycle === 'annual' ? 299 : 39
    const credit = computeUpgradeCredit({
      currentPlanUsd,
      targetPlanUsd,
      currentPeriodStart: sub.currentPeriodStart.toDate(),
      currentPeriodEnd: sub.currentPeriodEnd.toDate(),
      existingForwardCreditUsd: sub.forwardCreditUsd ?? 0,
    })
    // If chargeNow == 0 → free upgrade: apply transition immediately with
    // synthetic txnid. Otherwise return the credit preview; the frontend
    // redirects through /payment/initiate with `upgradeCredit` applied.
    if (credit.chargeNowUsd === 0) {
      const synth = `UPG-${Date.now()}-${uid.slice(0, 6)}`
      const result = await applyTransition(uid, sub.state, sub.state, 'upgrade', {
        txnid: synth,
        plan: 'promax',
        billingCycle: cycle,
        creditApplied: credit.newForwardCreditUsd,
      })
      if (result.applied) {
        emit('subscription_upgrade', { uid, fromState: sub.state, toState: result.state, chargeNowUsd: 0 })
        // P0-2: spec mandates an invoice even for zero-charge upgrades. The
        // credit applied fully covers the ProMax price; invoice total = 0.
        // Fire-and-forget; retry is invoice runner's responsibility.
        const creditCovered = targetPlanUsd
        emit('subscription.credit_consumed', {
          uid,
          amount: creditCovered,
          transitionId: synth,
          newState: result.state,
          reason: 'free_upgrade',
        })
        void queueSyntheticInvoice({
          uid,
          txnid: synth,
          priceUsd: targetPlanUsd,
          creditAppliedUsd: creditCovered,
          productinfo: cycle === 'annual'
            ? 'Easebot Pro Max — Annual (upgrade, credit applied)'
            : 'Easebot Pro Max — Monthly (upgrade, credit applied)',
          cycle,
          plan: 'promax',
        }).catch((err) => {
          emit('subscription.invoice_queue_failed', {
            uid,
            transitionId: synth,
            txnid: synth,
            error: err instanceof Error ? err.message : String(err),
          })
          console.warn('[subscriptionController.upgrade] queueInvoice failed', err)
        })
      }
      res.status(200).json({
        freeUpgrade: true,
        state: result.state,
        applied: result.applied,
        credit,
      })
      return
    }
    // Non-zero upgrade: return the effective plan USD (after credit) so the
    // frontend can kick off a PayU initiate with plan=promax, applying credit
    // server-side in the webhook. The webhook detects `upgradeFromState` on
    // the payment doc and drives an `upgrade` transition rather than `purchase`.
    emit('subscription_upgrade', { uid, fromState: sub.state, toState: 'pending', chargeNowUsd: credit.chargeNowUsd })
    res.status(200).json({
      freeUpgrade: false,
      credit,
      targetPlan: 'promax',
      cycle,
      effectiveChargeUsd: credit.chargeNowUsd,
      requiresCheckout: true,
    })
  } catch (err) {
    console.error('[subscriptionController.upgrade]', err)
    next(err)
  }
}

export async function downgrade(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = requireUid(req, res)
    if (!uid) return
    const { clientRequestId } = (req.body ?? {}) as { clientRequestId?: string }
    if (typeof clientRequestId !== 'string' || clientRequestId.trim() === '') {
      res.status(400).json({ error: 'missing_client_request_id' })
      return
    }
    const sub = await readSubscription(uid)
    const result = await applyTransition(uid, sub.state, sub.state, 'downgrade_schedule', {
      clientRequestId,
      targetPlan: 'pro',
    })
    if (result.applied) emit('subscription_downgrade', { uid, fromState: sub.state, toState: result.state })
    res.status(200).json({ state: result.state, applied: result.applied })
  } catch (err) {
    console.error('[subscriptionController.downgrade]', err)
    next(err)
  }
}

export async function getCurrentSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = requireUid(req, res)
    if (!uid) return
    const sub = await readSubscription(uid)
    res.status(200).json({
      state: sub.state,
      plan: sub.plan,
      billingCycle: sub.billingCycle,
      currentPeriodStart: sub.currentPeriodStart?.toDate().toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toDate().toISOString() ?? null,
      nextRenewalAt: sub.nextRenewalAt?.toDate().toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      downgradeToOnPeriodEnd: sub.downgradeToOnPeriodEnd,
      forwardCreditUsd: sub.forwardCreditUsd,
      status: sub.status,
    })
  } catch (err) {
    console.error('[subscriptionController.getCurrent]', err)
    next(err)
  }
}
