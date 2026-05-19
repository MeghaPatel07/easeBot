/**
 * paymentController — PayU integration surface.
 *
 * Sprint 2 (PAY-010/011): real implementation of initiate / return / webhook
 * / verify. Client SDK only for Firestore (no Admin SDK, per sprint guardrail).
 *
 * Spec: .orchestrator/specs/payu-contract.md
 */

import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getLockedRate } from '../services/exchangeRateService'
import { addExtras } from '../services/tokenMeter'
import { applyTransition, readSubscription, InvalidTransitionError } from '../services/subscriptionStateMachine'
import { queueInvoice } from '../services/invoiceService'
import { generatePayuHash, verifyPayuResponseHash } from '../utils/payuHash'
import { emit } from '../lib/observability'
import { capture as phCapture } from '../lib/posthog'

// --- Plan catalog (PRD §4) ---------------------------------------------------

type Plan = 'pro' | 'promax' | 'topup_2m'
type BillingCycle = 'monthly' | 'annual' | 'once'

interface PriceRow {
  plan: Plan
  cycle: BillingCycle
  usd: number
  productinfo: string
}

const PRICES: Record<string, PriceRow> = {
  'pro:monthly':    { plan: 'pro',      cycle: 'monthly', usd: 10,    productinfo: 'Easebot Pro — Monthly' },
  'pro:annual':     { plan: 'pro',      cycle: 'annual',  usd: 79,    productinfo: 'Easebot Pro — Annual' },
  'promax:monthly': { plan: 'promax',   cycle: 'monthly', usd: 39,    productinfo: 'Easebot Pro Max — Monthly' },
  'promax:annual':  { plan: 'promax',   cycle: 'annual',  usd: 299,   productinfo: 'Easebot Pro Max — Annual' },
  'topup_2m:once':  { plan: 'topup_2m', cycle: 'once',    usd: 10,    productinfo: 'Easebot Top-up — 2M tokens' },
}

const TOPUP_TOKENS = 2_000_000
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

// P1: supported currencies for PayU initiate. Reject others with 400.
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'INR', 'GBP', 'EUR', 'AUD', 'CAD', 'JPY', 'AED', 'SGD',
])

// --- Helpers -----------------------------------------------------------------

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing env: ${name}`)
  return v
}

function sandboxBase(): string {
  return process.env.PAYU_BASE_URL || 'https://test.payu.in'
}

function mintTxnid(): string {
  return `EB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

// --- POST /api/payment/initiate ---------------------------------------------

export async function initiate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = req.user?.uid
    if (!uid) { res.status(401).json({ error: 'auth_required' }); return }

    const { plan, cycle, currency, gstin, firstname, email, isUpgrade, billingAddress } = (req.body ?? {}) as {
      plan?: string; cycle?: string; currency?: string; gstin?: string
      firstname?: string; email?: string; isUpgrade?: boolean
      billingAddress?: {
        name?: string; country?: string; state?: string
        postalCode?: string; line1?: string; city?: string
      }
    }

    const key = `${plan}:${cycle}`
    const row = PRICES[key]
    if (!row) { res.status(400).json({ error: 'invalid_plan_cycle' }); return }
    if (!firstname || !email) { res.status(400).json({ error: 'missing_buyer_details' }); return }
    if (gstin && !GSTIN_REGEX.test(gstin)) { res.status(400).json({ error: 'invalid_gstin' }); return }

    // Billing address is required for subscription purchases (not topups) so
    // invoiceService can compute the correct GST branch. Fields beyond the
    // required minimum are stored as-is for the PDF.
    if (row.plan !== 'topup_2m') {
      if (!billingAddress || !billingAddress.country) {
        res.status(400).json({ error: 'missing_billing_address' }); return
      }
      if (billingAddress.country.toUpperCase() === 'IN' && !billingAddress.state) {
        res.status(400).json({ error: 'missing_billing_state' }); return
      }
    }

    // Subscription preflight.
    //   - topup: only allowed on paid tiers.
    //   - purchase (fresh pro/promax): only allowed on free/guest.
    //   - upgrade (pro→promax): only allowed when current tier is 'pro' and
    //     caller set isUpgrade=true and plan='promax'. The webhook uses the
    //     `isUpgrade` flag on the payment doc to drive the `upgrade` trigger
    //     instead of `purchase`.
    if (row.plan === 'topup_2m') {
      // Read authoritative subscription doc — tierMirror can be stale.
      const sub = await readSubscription(uid)
      if (sub.plan === 'free' || sub.state === 'guest') {
        res.status(409).json({ error: 'topup_requires_paid_tier' })
        return
      }
    } else if (isUpgrade === true) {
      if (row.plan !== 'promax') {
        res.status(400).json({ error: 'upgrade_target_must_be_promax' }); return
      }
      // Read authoritative subscription doc — tierMirror can be stale.
      const sub = await readSubscription(uid)
      if (sub.plan !== 'pro') {
        res.status(409).json({ error: 'upgrade_requires_pro_tier', currentTier: sub.plan })
        return
      }
    } else {
      // Read authoritative subscription doc — tierMirror can be stale.
      const sub = await readSubscription(uid)
      if (sub.state === 'guest') {
        res.status(403).json({ error: 'guest_cannot_purchase', action: 'sign_up' })
        return
      }
      if (sub.plan !== 'free') {
        res.status(409).json({ error: 'already_subscribed', currentTier: sub.plan })
        return
      }
    }

    const toCurrency = (currency || 'USD').toUpperCase()
    if (!SUPPORTED_CURRENCIES.has(toCurrency)) {
      res.status(400).json({ error: 'unsupported_currency' }); return
    }
    let locked
    try {
      locked = await getLockedRate('USD', toCurrency)
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'rate_api_unavailable') {
        res.status(503).json({ error: 'rate_api_unavailable' }); return
      }
      throw err
    }
    const amountLocal = (row.usd * locked.rate).toFixed(2)

    const txnid = mintTxnid()
    const payuKey = env('PAYU_MERCHANT_KEY')
    const salt = env('PAYU_MERCHANT_SALT')

    const hash = generatePayuHash({
      key: payuKey,
      txnid,
      amount: amountLocal,
      productinfo: row.productinfo,
      firstname,
      email,
      udf1: uid,
      udf2: row.plan,
      udf3: row.cycle,
      salt,
    })

    await setDoc(doc(db, 'payments', txnid), {
      txnid,
      uid,
      plan: row.plan,
      cycle: row.cycle,
      productinfo: row.productinfo,
      priceUsd: row.usd,
      currency: toCurrency,
      amountLocal,
      exchangeRate: locked.rate,
      rateSource: locked.source,
      gstin: gstin ?? null,
      buyer: { firstname, email },
      ...(billingAddress ? { billingAddress } : {}),
      isUpgrade: isUpgrade === true,
      state: 'pending',
      pendingStateMachineTransition: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    emit('payment_initiate', { uid, txnid, plan: row.plan, cycle: row.cycle, currency: toCurrency, usd: row.usd })
    phCapture(uid, 'payu_initiated', {
      tier: row.plan,
      cycle: row.cycle,
      amount: row.usd,
      currency: toCurrency,
      txn_id: txnid,
      is_upgrade: isUpgrade === true,
    })
    res.status(200).json({
      txnid,
      formAction: `${sandboxBase()}/_payment`,
      formParams: {
        key: payuKey,
        txnid,
        amount: amountLocal,
        productinfo: row.productinfo,
        firstname,
        email,
        udf1: uid,
        udf2: row.plan,
        udf3: row.cycle,
        surl: env('PAYU_RETURN_URL'),
        furl: env('PAYU_FAILURE_URL'),
        hash,
      },
      currency: toCurrency,
      rate: locked.rate,
      rateSource: locked.source,
    })
  } catch (err) {
    console.error('[paymentController.initiate]', err)
    next(err)
  }
}

// --- Shared finalizer: runs on both return and webhook paths ----------------
//
// Both paths verify the PayU hash before calling this helper. Idempotency
// guarantees: addExtras keyed on txnid, applyTransition keyed on transitionId,
// and the final state='paid' write is a no-op if already flipped.
// Whichever path arrives first wins; the other becomes a duplicate ack.

type FinalizeResult =
  | { kind: 'duplicate'; state: string }
  | { kind: 'amount_mismatch' }
  | { kind: 'failed' }
  | { kind: 'paid' }
  | { kind: 'needs_review'; error: string }

async function finalizePayment(
  payload: Record<string, string>,
  source: 'return' | 'webhook',
): Promise<FinalizeResult> {
  const txnid = payload.txnid
  const ref = doc(db, 'payments', txnid)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('unknown_txnid')
  const stored = snap.data() as Record<string, unknown>
  const currentState = String(stored.state ?? 'pending')
  if (currentState === 'paid' || currentState === 'failed') {
    return { kind: 'duplicate', state: currentState }
  }

  // Amount verify (LH-25): PayU sends `amount` in local currency string form.
  if (String(payload.amount) !== String(stored.amountLocal)) {
    await updateDoc(ref, { state: 'unknown', reason: 'amount_mismatch', updatedAt: serverTimestamp() })
    return { kind: 'amount_mismatch' }
  }

  emit('payment_webhook_received', { txnid, status: payload.status, source })
  const status = (payload.status || '').toLowerCase()
  if (status !== 'success') {
    await updateDoc(ref, { state: 'failed', payuStatus: status, updatedAt: serverTimestamp() })
    emit('payment_failure', { txnid, status, uid: String(stored.uid) })
    phCapture(String(stored.uid), 'payment_failed', {
      tier: String(stored.plan),
      reason: status,
      txn_id: txnid,
      source,
    })
    try {
      const failUid = String(stored.uid)
      const failPlan = String(stored.plan)
      if (failPlan === 'pro' || failPlan === 'promax') {
        const sub = await readSubscription(failUid)
        const active = sub.state === 'pro_monthly' || sub.state === 'pro_annual' ||
                       sub.state === 'promax_monthly' || sub.state === 'promax_annual'
        if (active && sub.plan === failPlan) {
          await applyTransition(failUid, sub.state, sub.state, 'renew_fail', {
            txnid,
            plan: failPlan as 'pro' | 'promax',
            billingCycle: String(stored.cycle) as 'monthly' | 'annual',
          })
        }
      }
    } catch (err) {
      console.error('[paymentController.finalize] renew_fail transition failed', err)
    }
    return { kind: 'failed' }
  }

  const uid = String(stored.uid)
  const plan = String(stored.plan)

  if (plan === 'topup_2m') {
    try {
      await addExtras(uid, TOPUP_TOKENS, txnid)
      emit('topup_purchased', { uid, txnid, tokens: TOPUP_TOKENS })
    } catch (err) {
      console.error('[paymentController.finalize] addExtras failed', err)
      emit('payment.webhook.side_effect_failed', {
        txnid, uid, plan, stage: 'addExtras',
        error: (err as Error)?.message ?? String(err),
      })
      throw err
    }
  } else {
    const cycle = (String(stored.cycle) as 'monthly' | 'annual')
    const isUpgrade = stored.isUpgrade === true
    try {
      const sub = await readSubscription(uid)
      let trigger: 'upgrade' | 'renew_success' | 'purchase'
      if (isUpgrade && plan === 'promax' &&
          (sub.state === 'pro_monthly' || sub.state === 'pro_annual' || sub.state === 'pro_cancel_scheduled')) {
        trigger = 'upgrade'
        emit('pro_upgrade_promax', { uid, txnid, fromState: sub.state })
      } else if (
        (sub.plan === plan) &&
        (sub.state === 'pro_monthly' || sub.state === 'pro_annual' ||
         sub.state === 'promax_monthly' || sub.state === 'promax_annual')
      ) {
        trigger = 'renew_success'
      } else {
        trigger = 'purchase'
        if (plan === 'pro') emit('free_upgrade_pro', { uid, txnid })
      }
      await applyTransition(uid, sub.state, sub.state, trigger, {
        txnid,
        plan: plan as 'pro' | 'promax',
        billingCycle: cycle,
        amount: Number(stored.priceUsd ?? 0),
        currency: String(stored.currency ?? 'USD'),
      })
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        console.error('[paymentController.finalize] transition conflict', err)
        emit('payment.webhook.transition_conflict', {
          txnid, uid, plan, error: err.message,
        })
        try {
          await updateDoc(ref, {
            state: 'needs_review',
            reason: 'transition_conflict',
            transitionError: err.message,
            updatedAt: serverTimestamp(),
          })
        } catch (innerErr) {
          console.error('[paymentController.finalize] needs_review write failed', innerErr)
        }
        return { kind: 'needs_review', error: err.message }
      }
      console.error('[paymentController.finalize] state machine transition failed', err)
      emit('payment.webhook.side_effect_failed', {
        txnid, uid, plan, stage: 'applyTransition',
        error: (err as Error)?.message ?? String(err),
      })
      throw err
    }
  }

  await updateDoc(ref, {
    state: 'paid',
    payuStatus: status,
    mihpayid: payload.mihpayid ?? null,
    pendingStateMachineTransition: false,
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  queueInvoice({ jobId: txnid, kind: 'render_invoice', invoiceId: txnid, uid }).catch((err) =>
    console.warn('[paymentController.finalize] queueInvoice failed', err),
  )
  console.log('[paymentController] payment_success', { txnid, uid, plan, source })
  emit('payment_success', { txnid, uid, plan, source })
  phCapture(uid, 'payment_succeeded', {
    tier: plan,
    amount: Number(stored.priceUsd ?? 0),
    currency: String(stored.currency ?? 'USD'),
    txn_id: txnid,
    mihpayid: payload.mihpayid ?? null,
    source, // 'return' first-win is de-duped because this fn is idempotent
  })
  return { kind: 'paid' }
}

// --- POST /api/payment/return (PayU → our server, no auth) ------------------
//
// Industry-standard pattern: return handler finalizes the payment itself
// rather than deferring to the webhook. Both paths use idempotent side
// effects, so the eventual webhook is a no-op duplicate. This makes the flow
// work in local dev (where PayU cannot reach localhost) and in prod when the
// webhook is delayed or lost.

export async function handleReturn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload = (req.body ?? {}) as Record<string, string>
    const txnid = payload.txnid
    const expectedHash = payload.hash
    const frontend = env('FRONTEND_BASE_URL')
    console.log('[paymentController.handleReturn] payload snapshot', {
      txnid,
      status: payload.status,
      hasHash: !!expectedHash,
      hasAdditionalCharges: !!payload.additionalCharges,
      error: payload.error,
      errorMessage: payload.error_Message,
      unmappedstatus: payload.unmappedstatus,
    })
    if (!txnid || !expectedHash) {
      res.redirect(302, `${frontend}/payment/failure?reason=bad_payload`)
      return
    }
    const salt = env('PAYU_MERCHANT_SALT')
    if (!verifyPayuResponseHash(payload, expectedHash, salt)) {
      console.warn('[paymentController.handleReturn] hash mismatch', { txnid })
      emit('payment.hash.mismatch', {
        txnid, ip: req.ip,
        claimedStatus: payload.status ?? null,
        source: 'return',
      })
      res.redirect(302, `${frontend}/payment/failure?reason=hash_mismatch&txnid=${encodeURIComponent(txnid)}`)
      return
    }

    let result: FinalizeResult
    try {
      result = await finalizePayment(payload, 'return')
    } catch (err) {
      console.error('[paymentController.handleReturn] finalize failed', err)
      res.redirect(302, `${frontend}/payment/failure?reason=finalize_failed&txnid=${encodeURIComponent(txnid)}`)
      return
    }

    const status = (payload.status || '').toLowerCase()
    if (result.kind === 'paid' || (result.kind === 'duplicate' && result.state === 'paid')) {
      res.redirect(302, `${frontend}/payment/success?txnid=${encodeURIComponent(txnid)}`)
      return
    }
    if (result.kind === 'failed' || (result.kind === 'duplicate' && result.state === 'failed')) {
      res.redirect(302, `${frontend}/payment/failure?txnid=${encodeURIComponent(txnid)}&reason=${encodeURIComponent(status || 'failed')}`)
      return
    }
    if (result.kind === 'amount_mismatch') {
      res.redirect(302, `${frontend}/payment/failure?txnid=${encodeURIComponent(txnid)}&reason=amount_mismatch`)
      return
    }
    if (result.kind === 'needs_review') {
      res.redirect(302, `${frontend}/payment/failure?txnid=${encodeURIComponent(txnid)}&reason=needs_review`)
      return
    }
    res.redirect(302, `${frontend}/payment/failure?txnid=${encodeURIComponent(txnid)}&reason=unknown`)
  } catch (err) {
    console.error('[paymentController.handleReturn]', err)
    next(err)
  }
}

// --- POST /api/payment/webhook (PayU → our server, authoritative) -----------

export async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload = (req.body ?? {}) as Record<string, string>
    const txnid = payload.txnid
    const expectedHash = payload.hash
    if (!txnid || !expectedHash) { res.status(400).json({ error: 'bad_payload' }); return }

    const salt = env('PAYU_MERCHANT_SALT')
    if (!verifyPayuResponseHash(payload, expectedHash, salt)) {
      emit('payment.hash.mismatch', {
        txnid,
        ip: req.ip,
        claimedStatus: payload.status ?? null,
        source: 'webhook',
      })
      res.status(400).json({ error: 'hash_mismatch' }); return
    }

    try {
      const result = await finalizePayment(payload, 'webhook')
      if (result.kind === 'duplicate') { res.status(200).json({ ok: true, duplicate: true, state: result.state }); return }
      if (result.kind === 'amount_mismatch') { res.status(400).json({ error: 'amount_mismatch' }); return }
      if (result.kind === 'failed') { res.status(200).json({ ok: true, duplicate: false, state: 'failed' }); return }
      if (result.kind === 'needs_review') { res.status(200).json({ ok: true, duplicate: false, state: 'needs_review' }); return }
      res.status(200).json({ ok: true, duplicate: false, state: 'paid' })
    } catch (err) {
      if ((err as Error)?.message === 'unknown_txnid') {
        res.status(404).json({ error: 'unknown_txnid' }); return
      }
      console.error('[paymentController.handleWebhook] finalize failed', err)
      res.status(500).json({ error: 'side_effect_failed' })
    }
  } catch (err) {
    console.error('[paymentController.handleWebhook]', err)
    next(err)
  }
}

// --- GET /api/payment/verify?txnid=... (auth required) ----------------------

export async function verify(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = req.user?.uid
    if (!uid) { res.status(401).json({ error: 'auth_required' }); return }
    const txnid = String(req.query.txnid || '')
    if (!txnid) { res.status(400).json({ error: 'missing_txnid' }); return }

    const snap = await getDoc(doc(db, 'payments', txnid))
    if (!snap.exists()) { res.status(404).json({ error: 'unknown_txnid' }); return }
    const data = snap.data() as Record<string, unknown>
    if (String(data.uid) !== uid) { res.status(403).json({ error: 'forbidden' }); return }

    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null
    res.status(200).json({
      txnid,
      state: data.state ?? 'pending',
      plan: data.plan,
      cycle: data.cycle,
      amountLocal: data.amountLocal,
      currency: data.currency,
      createdAt,
    })
  } catch (err) {
    console.error('[paymentController.verify]', err)
    next(err)
  }
}

// --- POST /api/payment/activate-plan (non-payment flow) ----------------------

export async function activatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = req.user?.uid
    if (!uid) { res.status(401).json({ error: 'auth_required' }); return }

    const { plan, cycle, gstin, firstname, email, isUpgrade, billingAddress } = (req.body ?? {}) as {
      plan?: string; cycle?: string; gstin?: string
      firstname?: string; email?: string; isUpgrade?: boolean
      billingAddress?: {
        name?: string; country?: string; state?: string
        postalCode?: string; line1?: string; city?: string
      }
    }

    const key = `${plan}:${cycle}`
    const row = PRICES[key]
    if (!row) { res.status(400).json({ error: 'invalid_plan_cycle' }); return }
    if (!firstname || !email) { res.status(400).json({ error: 'missing_buyer_details' }); return }
    if (gstin && !GSTIN_REGEX.test(gstin)) { res.status(400).json({ error: 'invalid_gstin' }); return }

    if (row.plan !== 'topup_2m') {
      if (!billingAddress || !billingAddress.country) {
        res.status(400).json({ error: 'missing_billing_address' }); return
      }
      if (billingAddress.country.toUpperCase() === 'IN' && !billingAddress.state) {
        res.status(400).json({ error: 'missing_billing_state' }); return
      }
    }

    const sub = await readSubscription(uid)
    if (row.plan === 'topup_2m') {
      if (sub.plan === 'free' || sub.state === 'guest') {
        res.status(409).json({ error: 'topup_requires_paid_tier' })
        return
      }
    } else if (isUpgrade === true) {
      if (row.plan !== 'promax') {
        res.status(400).json({ error: 'upgrade_target_must_be_promax' }); return
      }
      if (sub.plan !== 'pro') {
        res.status(409).json({ error: 'upgrade_requires_pro_tier', currentTier: sub.plan })
        return
      }
    } else {
      if (sub.state === 'guest') {
        res.status(403).json({ error: 'guest_cannot_purchase', action: 'sign_up' })
        return
      }
      if (sub.plan !== 'free') {
        res.status(409).json({ error: 'already_subscribed', currentTier: sub.plan })
        return
      }
    }

    const txnid = `DIRECT-${Date.now()}-${uid.slice(0, 6)}`

    try {
      const cycle_typed = cycle as 'monthly' | 'annual' | 'once'
      const plan_typed = plan as 'pro' | 'promax' | 'topup_2m'

      if (plan_typed === 'topup_2m') {
        await addExtras(uid, TOPUP_TOKENS, txnid)
        emit('topup_purchased', { uid, txnid, tokens: TOPUP_TOKENS })
      } else {
        let trigger: 'upgrade' | 'renew_success' | 'purchase'
        if (isUpgrade && plan_typed === 'promax' &&
            (sub.state === 'pro_monthly' || sub.state === 'pro_annual' || sub.state === 'pro_cancel_scheduled')) {
          trigger = 'upgrade'
          emit('pro_upgrade_promax', { uid, txnid, fromState: sub.state })
        } else if (
          (sub.plan === plan_typed) &&
          (sub.state === 'pro_monthly' || sub.state === 'pro_annual' ||
           sub.state === 'promax_monthly' || sub.state === 'promax_annual')
        ) {
          trigger = 'renew_success'
        } else {
          trigger = 'purchase'
          if (plan_typed === 'pro') emit('free_upgrade_pro', { uid, txnid })
        }

        const result = await applyTransition(uid, sub.state, sub.state, trigger, {
          txnid,
          plan: plan_typed,
          billingCycle: cycle_typed === 'once' ? 'monthly' : cycle_typed,
          amount: row.usd,
          currency: 'USD',
        })

        if (!result.applied) {
          res.status(409).json({ error: 'transition_failed', state: result.state })
          return
        }
      }

      emit('payment_success', { uid, txnid, plan: plan_typed, cycle: cycle_typed, method: 'direct' })
      phCapture(uid, 'payment_succeeded', {
        tier: plan_typed,
        cycle: cycle_typed,
        amount: row.usd,
        method: 'direct',
      })

      res.status(200).json({
        success: true,
        txnid,
        plan: plan_typed,
        cycle: cycle_typed,
      })
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        console.error('[paymentController.activatePlan] transition conflict', err)
        emit('payment.webhook.transition_conflict', {
          txnid, uid, plan, error: err.message, method: 'direct',
        })
        res.status(409).json({ error: 'transition_conflict', details: err.message })
        return
      }
      console.error('[paymentController.activatePlan] state machine transition failed', err)
      throw err
    }
  } catch (err) {
    console.error('[paymentController.activatePlan]', err)
    next(err)
  }
}

// --- Startup config check (P1) ----------------------------------------------

/**
 * validatePaymentConfig — fail fast at boot if critical payment env vars are
 * missing. Call from server.ts before starting the HTTP listener.
 */
export function validatePaymentConfig(): void {
  const required = [
    'PAYU_MERCHANT_KEY',
    'PAYU_MERCHANT_SALT',
    'PAYU_BASE_URL',
    'PAYU_RETURN_URL',
    'PAYU_FAILURE_URL',
    'EXCHANGE_RATE_API_KEY',
  ]
  const missing = required.filter((name) => !process.env[name])
  if (missing.length > 0) {
    console.error(
      `[easebot] Missing required payment config env vars: ${missing.join(', ')}`,
    )
    process.exit(1)
  }
}
