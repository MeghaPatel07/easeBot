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
import {
  getPaymentEnv,
  getPayuConfig,
  getRazorpayConfig,
  missingPaymentConfig,
} from '../lib/paymentConfig'
import {
  createOrder as createRazorpayOrder,
  verifyPaymentSignature as verifyRazorpaySignature,
  verifyWebhookSignature as verifyRazorpayWebhook,
  toSubunit,
} from '../services/razorpayService'

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

function mintTxnid(): string {
  return `EB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

// --- Shared initiate preflight ----------------------------------------------
//
// The plan/cycle/buyer/billing/GSTIN validation + subscription preflight +
// currency resolution + rate lock + amountLocal computation is identical for
// PayU and Razorpay. Extracted here so both gateways create byte-identical
// payments/{txnid} records and diverge only in the gateway-specific tail.

interface BillingAddressInput {
  name?: string
  country?: string
  state?: string
  postalCode?: string
  line1?: string
  city?: string
}

interface InitiateBody {
  plan?: string
  cycle?: string
  currency?: string
  gstin?: string
  firstname?: string
  email?: string
  isUpgrade?: boolean
  billingAddress?: BillingAddressInput
}

interface PreflightSuccess {
  ok: true
  row: PriceRow
  firstname: string
  email: string
  gstin: string | null
  billingAddress?: BillingAddressInput
  isUpgrade: boolean
  toCurrency: string
  locked: { rate: number; source: string }
  amountLocal: string
}

interface PreflightFailure {
  ok: false
  status: number
  body: Record<string, unknown>
}

type PreflightResult = PreflightSuccess | PreflightFailure

async function runInitiatePreflight(
  uid: string,
  body: InitiateBody,
): Promise<PreflightResult> {
  const { plan, cycle, currency, gstin, firstname, email, isUpgrade, billingAddress } = body ?? {}

  const key = `${plan}:${cycle}`
  const row = PRICES[key]
  if (!row) return { ok: false, status: 400, body: { error: 'invalid_plan_cycle' } }
  if (!firstname || !email) return { ok: false, status: 400, body: { error: 'missing_buyer_details' } }
  if (gstin && !GSTIN_REGEX.test(gstin)) return { ok: false, status: 400, body: { error: 'invalid_gstin' } }

  // Billing address is required for subscription purchases (not topups) so
  // invoiceService can compute the correct GST branch.
  if (row.plan !== 'topup_2m') {
    if (!billingAddress || !billingAddress.country) {
      return { ok: false, status: 400, body: { error: 'missing_billing_address' } }
    }
    if (billingAddress.country.toUpperCase() === 'IN' && !billingAddress.state) {
      return { ok: false, status: 400, body: { error: 'missing_billing_state' } }
    }
  }

  // Subscription preflight (reads the authoritative subscription doc).
  if (row.plan === 'topup_2m') {
    const sub = await readSubscription(uid)
    if (sub.plan === 'free' || sub.state === 'guest') {
      return { ok: false, status: 409, body: { error: 'topup_requires_paid_tier' } }
    }
  } else if (isUpgrade === true) {
    if (row.plan !== 'promax') {
      return { ok: false, status: 400, body: { error: 'upgrade_target_must_be_promax' } }
    }
    const sub = await readSubscription(uid)
    if (sub.plan !== 'pro') {
      return { ok: false, status: 409, body: { error: 'upgrade_requires_pro_tier', currentTier: sub.plan } }
    }
  } else {
    const sub = await readSubscription(uid)
    if (sub.state === 'guest') {
      return { ok: false, status: 403, body: { error: 'guest_cannot_purchase', action: 'sign_up' } }
    }
    if (sub.plan !== 'free') {
      return { ok: false, status: 409, body: { error: 'already_subscribed', currentTier: sub.plan } }
    }
  }

  const toCurrency = (currency || 'USD').toUpperCase()
  if (!SUPPORTED_CURRENCIES.has(toCurrency)) {
    return { ok: false, status: 400, body: { error: 'unsupported_currency' } }
  }

  let locked
  try {
    locked = await getLockedRate('USD', toCurrency)
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'rate_api_unavailable') {
      return { ok: false, status: 503, body: { error: 'rate_api_unavailable' } }
    }
    throw err
  }
  const amountLocal = (row.usd * locked.rate).toFixed(2)

  return {
    ok: true,
    row,
    firstname,
    email,
    gstin: gstin ?? null,
    billingAddress,
    isUpgrade: isUpgrade === true,
    toCurrency,
    locked,
    amountLocal,
  }
}

// --- POST /api/payment/initiate (PayU) --------------------------------------

export async function initiate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = req.user?.uid
    if (!uid) { res.status(401).json({ error: 'auth_required' }); return }

    const pf = await runInitiatePreflight(uid, (req.body ?? {}) as InitiateBody)
    if (!pf.ok) { res.status(pf.status).json(pf.body); return }
    const { row, firstname, email, gstin, billingAddress, isUpgrade, toCurrency, locked, amountLocal } = pf

    const txnid = mintTxnid()
    const cfg = getPayuConfig()

    const hash = generatePayuHash({
      key: cfg.merchantKey,
      txnid,
      amount: amountLocal,
      productinfo: row.productinfo,
      firstname,
      email,
      udf1: uid,
      udf2: row.plan,
      udf3: row.cycle,
      salt: cfg.salt,
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
      isUpgrade,
      provider: 'payu',
      paymentEnv: getPaymentEnv(),
      state: 'pending',
      pendingStateMachineTransition: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    emit('payment_initiate', { uid, txnid, plan: row.plan, cycle: row.cycle, currency: toCurrency, usd: row.usd, provider: 'payu' })
    phCapture(uid, 'payu_initiated', {
      tier: row.plan,
      cycle: row.cycle,
      amount: row.usd,
      currency: toCurrency,
      txn_id: txnid,
      is_upgrade: isUpgrade,
    })
    res.status(200).json({
      txnid,
      formAction: `${cfg.baseUrl}/_payment`,
      formParams: {
        key: cfg.merchantKey,
        txnid,
        amount: amountLocal,
        productinfo: row.productinfo,
        firstname,
        email,
        udf1: uid,
        udf2: row.plan,
        udf3: row.cycle,
        surl: cfg.returnUrl,
        furl: cfg.failureUrl,
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

// Provider-agnostic input to finalizePaymentCore. Each gateway normalizes its
// own return/webhook payload into this shape (after verifying its signature),
// then calls core — which owns all the Firestore / subscription / invoice /
// analytics side effects exactly once per txnid.
interface NormalizedFinalize {
  txnid: string
  /** Normalized to 'success' | anything-else (treated as failure). */
  status: 'success' | string
  /**
   * Local-currency amount string to verify against the stored record, or null
   * to skip (Razorpay verifies the subunit amount against its signed order in
   * its own handler, so the string compare here is redundant for it).
   */
  amount: string | null
  provider: 'payu' | 'razorpay'
  /** Raw gateway status/event string, persisted for forensics. */
  providerStatus: string
  /** Generic gateway payment id (mihpayid / razorpay_payment_id). */
  providerPaymentId: string | null
  /** PayU-specific echo for backward compat. */
  payuMihpayid?: string | null
  /** Razorpay-specific echoes. */
  razorpayOrderId?: string | null
  razorpayPaymentId?: string | null
  razorpaySignature?: string | null
  source: 'return' | 'webhook'
}

async function finalizePaymentCore(n: NormalizedFinalize): Promise<FinalizeResult> {
  const ref = doc(db, 'payments', n.txnid)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('unknown_txnid')
  const stored = snap.data() as Record<string, unknown>
  const currentState = String(stored.state ?? 'pending')
  if (currentState === 'paid' || currentState === 'failed') {
    return { kind: 'duplicate', state: currentState }
  }

  // Amount verify (LH-25): PayU sends `amount` as a local-currency string.
  if (n.amount != null && String(n.amount) !== String(stored.amountLocal)) {
    await updateDoc(ref, { state: 'unknown', reason: 'amount_mismatch', updatedAt: serverTimestamp() })
    return { kind: 'amount_mismatch' }
  }

  // Gateway fields written on every terminal state so the record always shows
  // which provider (payu vs razorpay) processed it.
  const providerFields: Record<string, unknown> = {
    provider: n.provider,
    providerStatus: n.providerStatus,
    providerPaymentId: n.providerPaymentId ?? null,
  }
  if (n.provider === 'payu') {
    providerFields.payuStatus = n.providerStatus
    providerFields.mihpayid = n.payuMihpayid ?? null
  } else {
    providerFields.razorpayOrderId = n.razorpayOrderId ?? null
    providerFields.razorpayPaymentId = n.razorpayPaymentId ?? null
    providerFields.razorpaySignature = n.razorpaySignature ?? null
  }

  emit('payment_webhook_received', { txnid: n.txnid, status: n.providerStatus, provider: n.provider, source: n.source })

  if (n.status !== 'success') {
    await updateDoc(ref, { state: 'failed', ...providerFields, updatedAt: serverTimestamp() })
    emit('payment_failure', { txnid: n.txnid, status: n.providerStatus, provider: n.provider, uid: String(stored.uid) })
    phCapture(String(stored.uid), 'payment_failed', {
      tier: String(stored.plan),
      reason: n.providerStatus,
      txn_id: n.txnid,
      source: n.source,
      provider: n.provider,
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
            txnid: n.txnid,
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
      await addExtras(uid, TOPUP_TOKENS, n.txnid)
      emit('topup_purchased', { uid, txnid: n.txnid, tokens: TOPUP_TOKENS })
    } catch (err) {
      console.error('[paymentController.finalize] addExtras failed', err)
      emit('payment.webhook.side_effect_failed', {
        txnid: n.txnid, uid, plan, stage: 'addExtras',
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
        emit('pro_upgrade_promax', { uid, txnid: n.txnid, fromState: sub.state })
      } else if (
        (sub.plan === plan) &&
        (sub.state === 'pro_monthly' || sub.state === 'pro_annual' ||
         sub.state === 'promax_monthly' || sub.state === 'promax_annual')
      ) {
        trigger = 'renew_success'
      } else {
        trigger = 'purchase'
        if (plan === 'pro') emit('free_upgrade_pro', { uid, txnid: n.txnid })
      }
      await applyTransition(uid, sub.state, sub.state, trigger, {
        txnid: n.txnid,
        plan: plan as 'pro' | 'promax',
        billingCycle: cycle,
        amount: Number(stored.priceUsd ?? 0),
        currency: String(stored.currency ?? 'USD'),
      })
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        console.error('[paymentController.finalize] transition conflict', err)
        emit('payment.webhook.transition_conflict', {
          txnid: n.txnid, uid, plan, error: err.message,
        })
        try {
          await updateDoc(ref, {
            state: 'needs_review',
            reason: 'transition_conflict',
            transitionError: err.message,
            ...providerFields,
            updatedAt: serverTimestamp(),
          })
        } catch (innerErr) {
          console.error('[paymentController.finalize] needs_review write failed', innerErr)
        }
        return { kind: 'needs_review', error: err.message }
      }
      console.error('[paymentController.finalize] state machine transition failed', err)
      emit('payment.webhook.side_effect_failed', {
        txnid: n.txnid, uid, plan, stage: 'applyTransition',
        error: (err as Error)?.message ?? String(err),
      })
      throw err
    }
  }

  await updateDoc(ref, {
    state: 'paid',
    ...providerFields,
    pendingStateMachineTransition: false,
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  queueInvoice({ jobId: n.txnid, kind: 'render_invoice', invoiceId: n.txnid, uid }).catch((err) =>
    console.warn('[paymentController.finalize] queueInvoice failed', err),
  )
  console.log('[paymentController] payment_success', { txnid: n.txnid, uid, plan, provider: n.provider, source: n.source })
  emit('payment_success', { txnid: n.txnid, uid, plan, provider: n.provider, source: n.source })
  phCapture(uid, 'payment_succeeded', {
    tier: plan,
    amount: Number(stored.priceUsd ?? 0),
    currency: String(stored.currency ?? 'USD'),
    txn_id: n.txnid,
    provider: n.provider,
    provider_payment_id: n.providerPaymentId ?? null,
    source: n.source, // 'return' first-win is de-duped because core is idempotent
  })
  return { kind: 'paid' }
}

// PayU adapter: verify-then-normalize happens in the controllers (which already
// check the PayU hash); this maps the PayU payload onto the shared core.
async function finalizePayment(
  payload: Record<string, string>,
  source: 'return' | 'webhook',
): Promise<FinalizeResult> {
  const status = (payload.status || '').toLowerCase()
  return finalizePaymentCore({
    txnid: payload.txnid,
    status: status === 'success' ? 'success' : 'failed',
    amount: payload.amount,
    provider: 'payu',
    providerStatus: status,
    providerPaymentId: payload.mihpayid ?? null,
    payuMihpayid: payload.mihpayid ?? null,
    source,
  })
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
    const salt = getPayuConfig().salt
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

    const salt = getPayuConfig().salt
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
      provider: data.provider ?? 'payu',
      createdAt,
    })
  } catch (err) {
    console.error('[paymentController.verify]', err)
    next(err)
  }
}

// ============================================================================
// Razorpay — second gateway. Shares the preflight, the payments/{txnid} record
// shape, and finalizePaymentCore with PayU; only the gateway plumbing differs.
// ============================================================================

const RAZORPAY_SUCCESS_EVENTS = new Set(['payment.captured', 'order.paid'])
const RAZORPAY_FAILURE_EVENTS = new Set(['payment.failed'])

// Minimal shape of the webhook events we consume.
interface RazorpayWebhookEvent {
  event?: string
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string; notes?: Record<string, string> } }
    order?: { entity?: { id?: string; amount?: number; notes?: Record<string, string> } }
  }
}

// --- POST /api/payment/razorpay/initiate (auth) -----------------------------

export async function razorpayInitiate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = req.user?.uid
    if (!uid) { res.status(401).json({ error: 'auth_required' }); return }

    const pf = await runInitiatePreflight(uid, (req.body ?? {}) as InitiateBody)
    if (!pf.ok) { res.status(pf.status).json(pf.body); return }
    const { row, firstname, email, gstin, billingAddress, isUpgrade, toCurrency, locked, amountLocal } = pf

    const txnid = mintTxnid()
    const amountSubunit = toSubunit(amountLocal, toCurrency)

    let order
    try {
      order = await createRazorpayOrder({
        amount: amountSubunit,
        currency: toCurrency,
        receipt: txnid,
        // Echoed back on webhook events so we can map order → our txnid.
        notes: { txnid, uid, plan: row.plan, cycle: row.cycle },
      })
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'invalid_amount') { res.status(400).json({ error: 'invalid_amount' }); return }
      if (code === 'razorpay_not_configured') { res.status(500).json({ error: 'razorpay_not_configured' }); return }
      if (code === 'razorpay_auth_failed') { res.status(502).json({ error: 'razorpay_auth_failed' }); return }
      console.error('[paymentController.razorpayInitiate] order create failed', err)
      res.status(502).json({ error: 'razorpay_order_failed' }); return
    }

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
      isUpgrade,
      provider: 'razorpay',
      paymentEnv: getPaymentEnv(),
      razorpayOrderId: order.orderId,
      state: 'pending',
      pendingStateMachineTransition: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    emit('payment_initiate', { uid, txnid, plan: row.plan, cycle: row.cycle, currency: toCurrency, usd: row.usd, provider: 'razorpay' })
    phCapture(uid, 'razorpay_initiated', {
      tier: row.plan,
      cycle: row.cycle,
      amount: row.usd,
      currency: toCurrency,
      txn_id: txnid,
      is_upgrade: isUpgrade,
    })

    res.status(200).json({
      txnid,
      orderId: order.orderId,
      keyId: order.keyId,
      amountSubunit: order.amount,
      currency: order.currency,
    })
  } catch (err) {
    console.error('[paymentController.razorpayInitiate]', err)
    next(err)
  }
}

// --- POST /api/payment/razorpay/verify (auth, browser return path) ----------
//
// The client posts the three razorpay_* fields from the checkout handler plus
// our txnid. We confirm ownership, that the order matches what we created, and
// the checkout signature — then finalize. The webhook is the authoritative
// duplicate; whichever lands first wins (core is idempotent).

export async function razorpayVerify(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uid = req.user?.uid
    if (!uid) { res.status(401).json({ error: 'auth_required' }); return }

    const {
      txnid,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = (req.body ?? {}) as Record<string, string>

    if (!txnid || !orderId || !paymentId || !signature) {
      res.status(400).json({ error: 'missing_fields' }); return
    }

    const snap = await getDoc(doc(db, 'payments', txnid))
    if (!snap.exists()) { res.status(404).json({ error: 'unknown_txnid' }); return }
    const stored = snap.data() as Record<string, unknown>
    if (String(stored.uid) !== uid) { res.status(403).json({ error: 'forbidden' }); return }
    if (String(stored.provider) !== 'razorpay') { res.status(400).json({ error: 'provider_mismatch' }); return }
    if (stored.razorpayOrderId && String(stored.razorpayOrderId) !== orderId) {
      emit('payment.razorpay.order_mismatch', { txnid, expected: String(stored.razorpayOrderId), got: orderId })
      res.status(400).json({ error: 'order_mismatch' }); return
    }

    if (!verifyRazorpaySignature({ orderId, paymentId, signature })) {
      emit('payment.razorpay.signature_mismatch', { txnid, source: 'return' })
      res.status(400).json({ error: 'signature_mismatch' }); return
    }

    let result: FinalizeResult
    try {
      result = await finalizePaymentCore({
        txnid,
        status: 'success',
        amount: null, // amount is bound by the signed order — no string compare
        provider: 'razorpay',
        providerStatus: 'captured',
        providerPaymentId: paymentId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        source: 'return',
      })
    } catch (err) {
      if ((err as Error)?.message === 'unknown_txnid') { res.status(404).json({ error: 'unknown_txnid' }); return }
      console.error('[paymentController.razorpayVerify] finalize failed', err)
      res.status(500).json({ error: 'side_effect_failed' }); return
    }

    if (result.kind === 'paid' || (result.kind === 'duplicate' && result.state === 'paid')) {
      res.status(200).json({ ok: true, txnid, state: 'paid', provider: 'razorpay' }); return
    }
    if (result.kind === 'needs_review') { res.status(200).json({ ok: true, txnid, state: 'needs_review', provider: 'razorpay' }); return }
    if (result.kind === 'duplicate') { res.status(200).json({ ok: true, txnid, state: result.state, provider: 'razorpay' }); return }
    res.status(400).json({ ok: false, txnid, error: result.kind })
  } catch (err) {
    console.error('[paymentController.razorpayVerify]', err)
    next(err)
  }
}

// --- POST /api/payment/razorpay/webhook (no auth; HMAC is the gate) ----------

export async function razorpayWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const signature = req.header('x-razorpay-signature') || ''
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody
    if (!rawBody || !signature) { res.status(400).json({ error: 'bad_payload' }); return }

    if (!verifyRazorpayWebhook(rawBody, signature)) {
      emit('payment.razorpay.webhook_signature_mismatch', { ip: req.ip })
      res.status(400).json({ error: 'signature_mismatch' }); return
    }

    const event = (req.body ?? {}) as RazorpayWebhookEvent
    const type = String(event.event ?? '')
    const paymentEntity = event.payload?.payment?.entity
    const orderEntity = event.payload?.order?.entity
    const notes = paymentEntity?.notes ?? orderEntity?.notes ?? {}
    const txnid = String(notes.txnid ?? '')

    if (!txnid) {
      // Refunds, disputes, or orders created outside this flow — ack & ignore.
      emit('payment.razorpay.webhook_unmapped', { type })
      res.status(200).json({ ok: true, ignored: true }); return
    }

    const isSuccess = RAZORPAY_SUCCESS_EVENTS.has(type)
    const isFailure = RAZORPAY_FAILURE_EVENTS.has(type)
    if (!isSuccess && !isFailure) {
      res.status(200).json({ ok: true, ignored: true, type }); return
    }

    // Subunit amount integrity for success events: the captured amount must
    // equal what we'd charge for the stored plan/currency.
    if (isSuccess && paymentEntity) {
      const snap = await getDoc(doc(db, 'payments', txnid))
      if (snap.exists()) {
        const stored = snap.data() as Record<string, unknown>
        const expected = toSubunit(String(stored.amountLocal ?? ''), String(stored.currency ?? 'INR'))
        const got = Number(paymentEntity.amount)
        if (Number.isFinite(got) && got !== expected) {
          emit('payment.razorpay.amount_mismatch', { txnid, expected, got })
          await updateDoc(doc(db, 'payments', txnid), {
            state: 'unknown', reason: 'amount_mismatch', updatedAt: serverTimestamp(),
          }).catch((err) => console.error('[paymentController.razorpayWebhook] amount_mismatch write failed', err))
          res.status(400).json({ error: 'amount_mismatch' }); return
        }
      }
    }

    try {
      const result = await finalizePaymentCore({
        txnid,
        status: isSuccess ? 'success' : 'failed',
        amount: null,
        provider: 'razorpay',
        providerStatus: type,
        providerPaymentId: paymentEntity?.id ?? null,
        razorpayOrderId: paymentEntity?.order_id ?? orderEntity?.id ?? null,
        razorpayPaymentId: paymentEntity?.id ?? null,
        razorpaySignature: null,
        source: 'webhook',
      })
      if (result.kind === 'duplicate') { res.status(200).json({ ok: true, duplicate: true, state: result.state }); return }
      if (result.kind === 'amount_mismatch') { res.status(400).json({ error: 'amount_mismatch' }); return }
      if (result.kind === 'failed') { res.status(200).json({ ok: true, duplicate: false, state: 'failed' }); return }
      if (result.kind === 'needs_review') { res.status(200).json({ ok: true, duplicate: false, state: 'needs_review' }); return }
      res.status(200).json({ ok: true, duplicate: false, state: 'paid' })
    } catch (err) {
      if ((err as Error)?.message === 'unknown_txnid') { res.status(404).json({ error: 'unknown_txnid' }); return }
      console.error('[paymentController.razorpayWebhook] finalize failed', err)
      res.status(500).json({ error: 'side_effect_failed' })
    }
  } catch (err) {
    console.error('[paymentController.razorpayWebhook]', err)
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
 * missing for the ACTIVE credential set (PAYMENT_FOR=dev|prod). Resolves the
 * PayU + Razorpay creds via paymentConfig (suffixed _DEV/_PROD with flat
 * fallback), so an unfinished prod setup crashes here rather than at first
 * checkout. Call from server.ts before starting the HTTP listener.
 */
export function validatePaymentConfig(): void {
  const env = getPaymentEnv()
  const missing = missingPaymentConfig()
  // Exchange rate API is gateway-independent but still required to price.
  if (!process.env.EXCHANGE_RATE_API_KEY) missing.push('EXCHANGE_RATE_API_KEY')

  if (missing.length > 0) {
    console.error(
      `[easebot] Missing required payment config env vars (PAYMENT_FOR=${env}): ${missing.join(', ')}`,
    )
    process.exit(1)
  }

  // Webhook secret is optional in dev (Razorpay can't reach localhost) but
  // REQUIRED in prod — without it every webhook signature check fails closed.
  let webhookSecret: string | null = null
  try { webhookSecret = getRazorpayConfig().webhookSecret } catch { /* unreachable — checked above */ }
  if (!webhookSecret) {
    const msg = `[easebot] RAZORPAY_WEBHOOK_SECRET not set for PAYMENT_FOR=${env} — Razorpay webhooks will be rejected (signature fails closed).`
    if (env === 'prod') { console.error(msg); process.exit(1) }
    else console.warn(`${msg} OK for local dev.`)
  }
}
