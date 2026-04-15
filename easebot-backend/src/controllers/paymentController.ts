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
import { addExtras, getTier } from '../services/tokenMeter'
import { applyTransition, readSubscription } from '../services/subscriptionStateMachine'
import { queueInvoice } from '../services/invoiceService'
import { generatePayuHash, verifyPayuResponseHash } from '../utils/payuHash'

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
  'pro:monthly':    { plan: 'pro',      cycle: 'monthly', usd: 14.99, productinfo: 'Easebot Pro — Monthly' },
  'pro:annual':     { plan: 'pro',      cycle: 'annual',  usd: 119,   productinfo: 'Easebot Pro — Annual' },
  'promax:monthly': { plan: 'promax',   cycle: 'monthly', usd: 39,    productinfo: 'Easebot Pro Max — Monthly' },
  'promax:annual':  { plan: 'promax',   cycle: 'annual',  usd: 299,   productinfo: 'Easebot Pro Max — Annual' },
  'topup_2m:once':  { plan: 'topup_2m', cycle: 'once',    usd: 10,    productinfo: 'Easebot Top-up — 2M tokens' },
}

const TOPUP_TOKENS = 2_000_000
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

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

    const { plan, cycle, currency, gstin, firstname, email } = (req.body ?? {}) as {
      plan?: string; cycle?: string; currency?: string; gstin?: string
      firstname?: string; email?: string
    }

    const key = `${plan}:${cycle}`
    const row = PRICES[key]
    if (!row) { res.status(400).json({ error: 'invalid_plan_cycle' }); return }
    if (!firstname || !email) { res.status(400).json({ error: 'missing_buyer_details' }); return }
    if (gstin && !GSTIN_REGEX.test(gstin)) { res.status(400).json({ error: 'invalid_gstin' }); return }

    // Subscription preflight: must be on free tier for pro/promax purchases.
    // Top-ups are allowed on any paid tier.
    if (row.plan !== 'topup_2m') {
      const current = await getTier(uid)
      if (current !== 'free' && current !== 'guest') {
        res.status(409).json({ error: 'already_subscribed', currentTier: current })
        return
      }
    } else {
      const current = await getTier(uid)
      if (current === 'free' || current === 'guest') {
        res.status(409).json({ error: 'topup_requires_paid_tier' })
        return
      }
    }

    const toCurrency = (currency || 'USD').toUpperCase()
    const locked = await getLockedRate('USD', toCurrency)
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
      state: 'pending',
      pendingStateMachineTransition: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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
        surl: `${env('PAYU_SURL_BASE')}/api/payment/return`,
        furl: `${env('PAYU_FURL_BASE')}/api/payment/return`,
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

// --- POST /api/payment/return (PayU → our server, no auth) ------------------

export async function handleReturn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload = (req.body ?? {}) as Record<string, string>
    const txnid = payload.txnid
    const expectedHash = payload.hash
    if (!txnid || !expectedHash) {
      res.redirect(302, `${env('FRONTEND_BASE_URL')}/payment/failure?reason=bad_payload`)
      return
    }
    const salt = env('PAYU_MERCHANT_SALT')
    const ok = verifyPayuResponseHash(payload, expectedHash, salt)
    const frontend = env('FRONTEND_BASE_URL')
    if (!ok) {
      res.redirect(302, `${frontend}/payment/failure?reason=hash_mismatch&txnid=${encodeURIComponent(txnid)}`)
      return
    }
    const status = (payload.status || '').toLowerCase()
    const target = status === 'success'
      ? `${frontend}/payment/success?txnid=${encodeURIComponent(txnid)}`
      : `${frontend}/payment/failure?txnid=${encodeURIComponent(txnid)}&reason=${encodeURIComponent(status)}`
    res.redirect(302, target)
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
      res.status(400).json({ error: 'hash_mismatch' }); return
    }

    const ref = doc(db, 'payments', txnid)
    const snap = await getDoc(ref)
    if (!snap.exists()) { res.status(404).json({ error: 'unknown_txnid' }); return }
    const stored = snap.data() as Record<string, unknown>
    const currentState = String(stored.state ?? 'pending')
    if (currentState === 'paid' || currentState === 'failed') {
      res.status(200).json({ ok: true, duplicate: true }); return
    }

    // Amount verify (LH-25): PayU sends `amount` in local currency string form.
    if (String(payload.amount) !== String(stored.amountLocal)) {
      await updateDoc(ref, { state: 'unknown', reason: 'amount_mismatch', updatedAt: serverTimestamp() })
      res.status(400).json({ error: 'amount_mismatch' }); return
    }

    const status = (payload.status || '').toLowerCase()
    if (status !== 'success') {
      await updateDoc(ref, { state: 'failed', payuStatus: status, updatedAt: serverTimestamp() })
      res.status(200).json({ ok: true, duplicate: false, state: 'failed' }); return
    }

    const uid = String(stored.uid)
    const plan = String(stored.plan)

    if (plan === 'topup_2m') {
      try {
        await addExtras(uid, TOPUP_TOKENS, txnid)
      } catch (err) {
        console.error('[paymentController.webhook] addExtras failed', err)
        // Still mark paid — the txn is complete; top-up cap issues surface in logs.
      }
    } else {
      // pro / promax subscription: drive the state machine. Whether this is
      // a fresh purchase or a renewal depends on the current sub state.
      const cycle = (String(stored.cycle) as 'monthly' | 'annual')
      try {
        const sub = await readSubscription(uid)
        const isRenewal =
          (sub.plan === plan) &&
          (sub.state === 'pro_monthly' ||
           sub.state === 'pro_annual' ||
           sub.state === 'promax_monthly' ||
           sub.state === 'promax_annual')
        await applyTransition(uid, sub.state, sub.state, isRenewal ? 'renew_success' : 'purchase', {
          txnid,
          plan: plan as 'pro' | 'promax',
          billingCycle: cycle,
          amount: Number(stored.priceUsd ?? 0),
          currency: String(stored.currency ?? 'USD'),
        })
      } catch (err) {
        console.error('[paymentController.webhook] state machine transition failed', err)
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

    // Fire-and-forget invoice queue. Never blocks the webhook ack.
    queueInvoice({ jobId: txnid, kind: 'render_invoice', invoiceId: txnid }).catch((err) =>
      console.warn('[paymentController.webhook] queueInvoice failed', err),
    )
    console.log('[paymentController] payment_success', { txnid, uid, plan })

    res.status(200).json({ ok: true, duplicate: false, state: 'paid' })
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
