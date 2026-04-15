/**
 * paymentService — Sprint 3 frontend client for /api/payment/*.
 *
 * - initiatePayment(): POST /api/payment/initiate → { txnid, formAction, formParams }
 * - autoSubmitToPayu(): builds a hidden <form> and POSTs to PayU sandbox
 * - verifyPayment(): GET /api/payment/verify?txnid=
 * - subscription CRUD: cancel / reactivate / upgrade / downgrade / current
 */

import { auth } from '@/lib/firebase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

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

export interface InitiatePaymentRequest {
  plan: Plan | 'topup_2m'
  cycle: BillingCycle | 'once'
  currency: string
  firstname: string
  email: string
  gstin?: string
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

// ---- Subscription ----------------------------------------------------------

export async function getCurrentSubscription(): Promise<SubscriptionSnapshot> {
  const res = await authFetch('/api/payment/subscription/current')
  if (!res.ok) throw new Error(`subscription_fetch_failed:${res.status}`)
  return res.json()
}

export async function cancelSubscription(clientRequestId: string): Promise<unknown> {
  const res = await authFetch('/api/payment/subscription/cancel', {
    method: 'POST',
    body: JSON.stringify({ clientRequestId }),
  })
  if (!res.ok) throw new Error(`cancel_failed:${res.status}`)
  return res.json()
}

export async function reactivateSubscription(clientRequestId: string): Promise<unknown> {
  const res = await authFetch('/api/payment/subscription/reactivate', {
    method: 'POST',
    body: JSON.stringify({ clientRequestId }),
  })
  if (!res.ok) throw new Error(`reactivate_failed:${res.status}`)
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

export async function downgradeSubscription(clientRequestId: string): Promise<unknown> {
  const res = await authFetch('/api/payment/subscription/downgrade', {
    method: 'POST',
    body: JSON.stringify({ clientRequestId }),
  })
  if (!res.ok) throw new Error(`downgrade_failed:${res.status}`)
  return res.json()
}

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
