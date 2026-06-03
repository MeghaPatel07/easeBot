/**
 * paymentService — Sprint 3 frontend client for /api/payment/*.
 *
 * - initiatePayment(): POST /api/payment/initiate → { txnid, formAction, formParams }
 * - autoSubmitToPayu(): builds a hidden <form> and POSTs to PayU sandbox
 * - verifyPayment(): GET /api/payment/verify?txnid=
 * - subscription CRUD: upgrade / downgrade / current
 */

import { auth } from '@/lib/firebase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://backend.theweddingbot.ai'

export function isPaymentEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_PAYMENT !== 'false'
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('not_signed_in')
  const token = await user.getIdToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

// ---- Types ----------------------------------------------------------------

export type BillingCycle = 'monthly' | 'annual'
export type Plan = 'pro' | 'promax'

export interface BillingAddressInput {
  name?: string
  country: string        // ISO-3166 alpha-2, e.g. 'IN', 'US'
  state?: string         // required if country === 'IN'
  city?: string
  postalCode?: string
  line1?: string
}

export interface InitiatePaymentRequest {
  plan: Plan | 'topup_2m'
  cycle: BillingCycle | 'once'
  currency: string
  firstname: string
  email: string
  gstin?: string
  isUpgrade?: boolean
  billingAddress?: BillingAddressInput
}

export interface InitiatePaymentResponse {
  txnid: string
  formAction: string
  formParams: Record<string, string>
  currency: string
  rate: number
  rateSource: string
}

export interface SubscriptionSnapshot {
  state: string
  plan: 'free' | 'pro' | 'promax'
  billingCycle: 'none' | 'monthly' | 'annual' | '6mo'
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  nextRenewalAt: string | null
  cancelAtPeriodEnd: boolean
  downgradeToOnPeriodEnd: 'pro_monthly' | null
  forwardCreditUsd: number
  status: 'active' | 'cancel_scheduled' | 'free'
}

// ---- Initiate + autosubmit -------------------------------------------------

export async function initiatePayment(
  body: InitiatePaymentRequest,
): Promise<InitiatePaymentResponse> {
  const res = await authFetch('/api/payment/initiate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`initiate_failed:${res.status}:${text}`)
  }
  return res.json()
}

/**
 * Build a hidden form with all PayU params and POST it to the sandbox URL.
 * PayU redirects back via the configured surl/furl.
 */
export function autoSubmitToPayu(init: InitiatePaymentResponse): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = init.formAction
  form.style.display = 'none'
  for (const [k, v] of Object.entries(init.formParams)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = k
    input.value = String(v ?? '')
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

export async function verifyPayment(txnid: string): Promise<unknown> {
  const res = await authFetch(`/api/payment/verify?txnid=${encodeURIComponent(txnid)}`)
  if (!res.ok) throw new Error(`verify_failed:${res.status}`)
  return res.json()
}

// ---- Razorpay (second gateway) ---------------------------------------------

export interface InitiateRazorpayResponse {
  txnid: string
  orderId: string
  keyId: string
  amountSubunit: number
  currency: string
}

/** Razorpay checkout.js success payload passed to the handler callback. */
export interface RazorpayHandlerResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayCheckoutOptions {
  key: string
  amount: number
  currency: string
  name: string
  description?: string
  order_id: string
  handler: (resp: RazorpayHandlerResponse) => void
  prefill?: { name?: string; email?: string; contact?: string }
  notes?: Record<string, string>
  theme?: { color?: string }
  modal?: { ondismiss?: () => void }
}

interface RazorpayInstance {
  open: () => void
  on: (event: 'payment.failed', cb: (resp: { error?: { code?: string; description?: string } }) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance
  }
}

const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

/** Inject checkout.js once; resolves true when window.Razorpay is available. */
export function loadRazorpayCheckoutJs(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(false); return }
    if (window.Razorpay) { resolve(true); return }
    const existing = document.getElementById('razorpay-checkout-js') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(true))
      existing.addEventListener('error', () => resolve(false))
      return
    }
    const s = document.createElement('script')
    s.id = 'razorpay-checkout-js'
    s.src = RAZORPAY_CHECKOUT_SRC
    s.async = true
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

/** POST /api/payment/razorpay/initiate → creates the order + pending record. */
export async function initiateRazorpay(
  body: InitiatePaymentRequest,
): Promise<InitiateRazorpayResponse> {
  const res = await authFetch('/api/payment/razorpay/initiate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`razorpay_initiate_failed:${res.status}:${text}`)
  }
  return res.json()
}

/** POST /api/payment/razorpay/verify → confirms the checkout signature server-side. */
export async function verifyRazorpay(
  args: { txnid: string } & RazorpayHandlerResponse,
): Promise<{ ok: boolean; state: string; provider?: string }> {
  const res = await authFetch('/api/payment/razorpay/verify', {
    method: 'POST',
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`razorpay_verify_failed:${res.status}:${text}`)
  }
  return res.json()
}

export interface OpenRazorpayArgs {
  init: InitiateRazorpayResponse
  name?: string
  description?: string
  prefill?: { name?: string; email?: string; contact?: string }
  onSuccess: (resp: RazorpayHandlerResponse) => void
  onDismiss?: () => void
  onFailure?: (err: { code?: string; description?: string }) => void
}

/** Open the Razorpay Standard Checkout modal for an initiated order. */
export function openRazorpayModal(args: OpenRazorpayArgs): void {
  if (!window.Razorpay) throw new Error('razorpay_checkout_not_loaded')
  const rzp = new window.Razorpay({
    key: args.init.keyId,
    amount: args.init.amountSubunit,
    currency: args.init.currency,
    name: args.name ?? 'WeddingEase',
    description: args.description ?? 'Subscription',
    order_id: args.init.orderId,
    prefill: args.prefill,
    theme: { color: '#7c3aed' },
    handler: (resp) => args.onSuccess(resp),
    modal: { ondismiss: () => args.onDismiss?.() },
  })
  rzp.on('payment.failed', (resp) => args.onFailure?.(resp.error ?? {}))
  rzp.open()
}

// ---- Subscription ----------------------------------------------------------

export async function getCurrentSubscription(): Promise<SubscriptionSnapshot> {
  const res = await authFetch('/api/payment/subscription/current')
  if (!res.ok) throw new Error(`subscription_fetch_failed:${res.status}`)
  return res.json()
}

export async function upgradeSubscription(cycle: BillingCycle): Promise<unknown> {
  const res = await authFetch('/api/payment/subscription/upgrade', {
    method: 'POST',
    body: JSON.stringify({ billingCycle: cycle }),
  })
  if (!res.ok) throw new Error(`upgrade_failed:${res.status}`)
  return res.json()
}

// TODO: downgrade disabled for now, only upgrades allowed
// export async function downgradeSubscription(clientRequestId: string): Promise<unknown> {
//   const res = await authFetch('/api/payment/subscription/downgrade', {
//     method: 'POST',
//     body: JSON.stringify({ clientRequestId }),
//   })
//   if (!res.ok) throw new Error(`downgrade_failed:${res.status}`)
//   return res.json()
// }

// ---- Invoices --------------------------------------------------------------

export interface InvoiceSummary {
  invoiceId: string
  invoiceNumber: string
  date: string
  totalLocal: number
  currencyCode: string
  status: 'PAID' | 'PENDING' | 'VOID'
}

export async function getInvoices(): Promise<InvoiceSummary[]> {
  const res = await authFetch('/api/account/invoices')
  if (!res.ok) return []
  const json = (await res.json()) as { invoices?: InvoiceSummary[] }
  return json.invoices ?? []
}

// ---- Purchase / billing history -------------------------------------------

export type BillingHistoryStatus = 'PAID' | 'FAILED' | 'PENDING' | 'REVIEW'

export interface BillingHistoryRow {
  /** txnid — also the PDF download id when hasPdf is true. */
  id: string
  invoiceNumber: string | null
  date: string
  amount: number
  currencyCode: string
  status: BillingHistoryStatus
  plan: string | null
  cycle: string | null
  provider: string | null
  productinfo: string | null
  hasPdf: boolean
}

/** Unified invoices + raw payment attempts (paid/pending/failed). */
export async function getBillingHistory(): Promise<BillingHistoryRow[]> {
  const res = await authFetch('/api/account/billing-history')
  if (!res.ok) return []
  const json = (await res.json()) as { history?: BillingHistoryRow[] }
  return json.history ?? []
}

export async function downloadInvoicePdf(invoiceId: string): Promise<void> {
  const res = await authFetch(`/api/account/invoices/${encodeURIComponent(invoiceId)}/pdf`)
  if (!res.ok) throw new Error(`invoice_pdf_failed:${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `invoice-${invoiceId}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
