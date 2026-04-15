/**
 * invoiceService — async invoice generation + email delivery.
 *
 * Sprint 3 implementation: plain HTML invoices stored in Firestore
 * (`invoices/{invoiceId}`) and emailed via existing emailService. No PDF
 * dependency — HTML+text is sufficient for early-stage legal retention.
 *
 * Grounded in: .orchestrator/specs/invoice-format.md (adapted for HTML-only).
 */

import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { sendEmailNotification } from './emailService'

export interface InvoiceJob {
  jobId: string
  kind: 'render_invoice'
  invoiceId: string
}

export interface InvoiceSummary {
  invoiceId: string
  invoiceNumber: string
  date: string
  totalLocal: number
  currencyCode: string
  pdfStorageRef: string | null
  status: 'PAID' | 'PENDING' | 'VOID'
}

interface PaymentRow {
  txnid: string
  uid: string
  plan: string
  cycle: string
  productinfo: string
  priceUsd: number
  amountLocal: string | number
  currency: string
  buyer?: { firstname?: string; email?: string }
  gstin?: string | null
  paidAt?: Timestamp
  state?: string
}

function legalEntityName(): string {
  return process.env.LEGAL_ENTITY_NAME || 'Easebot Pvt Ltd'
}
function legalEntityCountry(): string {
  return process.env.LEGAL_ENTITY_COUNTRY || 'IN'
}
function legalEntityAddress(): string {
  return process.env.LEGAL_ENTITY_ADDRESS || ''
}
function legalEntityGstin(): string {
  return process.env.LEGAL_ENTITY_GSTIN || ''
}

function renderHtml(p: PaymentRow, invoiceNumber: string): { html: string; text: string } {
  const isInIndia = legalEntityCountry() === 'IN'
  const buyerGst = p.gstin ?? null
  const gstLine = isInIndia && buyerGst
    ? `<tr><td>Buyer GSTIN</td><td>${buyerGst}</td></tr>`
    : ''
  const html = `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:640px;padding:24px;color:#111">
    <h1 style="margin:0 0 4px 0">Invoice ${invoiceNumber}</h1>
    <p style="color:#666;margin:0 0 16px 0">${legalEntityName()} — ${legalEntityCountry()}</p>
    <p style="color:#666;margin:0 0 16px 0">${legalEntityAddress()}</p>
    ${legalEntityGstin() ? `<p style="color:#666;margin:0 0 16px 0">GSTIN: ${legalEntityGstin()}</p>` : ''}
    <table style="width:100%;border-collapse:collapse;margin-top:16px">
      <tr><td><strong>Transaction ID</strong></td><td>${p.txnid}</td></tr>
      <tr><td><strong>Plan</strong></td><td>${p.productinfo}</td></tr>
      <tr><td><strong>Billing cycle</strong></td><td>${p.cycle}</td></tr>
      <tr><td><strong>Amount (USD base)</strong></td><td>$${p.priceUsd.toFixed(2)}</td></tr>
      <tr><td><strong>Amount charged</strong></td><td>${p.currency} ${p.amountLocal}</td></tr>
      ${gstLine}
    </table>
    <p style="margin-top:24px;color:#666;font-size:12px">
      Per our terms §6.5, no refunds are issued for partial cycles, unused
      tokens, or top-up packs. Keep this invoice for your records.
    </p>
  </div>`
  const text = `Invoice ${invoiceNumber}
${legalEntityName()} — ${legalEntityCountry()}

Transaction: ${p.txnid}
Plan: ${p.productinfo}
Cycle: ${p.cycle}
USD base: $${p.priceUsd.toFixed(2)}
Charged: ${p.currency} ${p.amountLocal}

Per our terms §6.5, no refunds are issued.`
  return { html, text }
}

export async function queueInvoice(job: InvoiceJob): Promise<void> {
  // Render inline. Non-blocking upstream — this function is called with
  // .catch so any failure here never propagates to the webhook ack path.
  const payRef = doc(db, 'payments', job.invoiceId)
  const paySnap = await getDoc(payRef)
  if (!paySnap.exists()) {
    console.warn('[invoiceService] missing payment doc', { jobId: job.jobId })
    return
  }
  const p = paySnap.data() as PaymentRow
  const invoiceNumber = `EB-${new Date().getUTCFullYear()}-${job.invoiceId.slice(-8).toUpperCase()}`
  const { html, text } = renderHtml(p, invoiceNumber)

  // Persist invoice record.
  await setDoc(doc(db, 'invoices', job.invoiceId), {
    invoiceId: job.invoiceId,
    invoiceNumber,
    uid: p.uid,
    txnid: p.txnid,
    plan: p.plan,
    cycle: p.cycle,
    priceUsd: p.priceUsd,
    amountLocal: Number(p.amountLocal),
    currency: p.currency,
    html,
    status: 'PAID',
    createdAt: serverTimestamp(),
  })

  // Deliver by email if buyer email captured.
  const email = p.buyer?.email
  if (email) {
    try {
      await sendEmailNotification({
        to: email,
        subject: `Your Easebot invoice ${invoiceNumber}`,
        html,
        text,
      })
    } catch (err) {
      console.warn('[invoiceService] email dispatch failed', err)
    }
  }
  console.log('[invoiceService] invoice_rendered', { invoiceId: job.invoiceId, invoiceNumber })
}

export async function renderInvoicePdf(_jobId: string): Promise<string> {
  // HTML-only in Sprint 3; return empty ref.
  return ''
}

export async function getInvoicesForUser(uid: string): Promise<InvoiceSummary[]> {
  try {
    const q = query(
      collection(db, 'invoices'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      fsLimit(50),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      const createdAt = data.createdAt as Timestamp | undefined
      return {
        invoiceId: String(data.invoiceId ?? d.id),
        invoiceNumber: String(data.invoiceNumber ?? ''),
        date: createdAt?.toDate().toISOString() ?? '',
        totalLocal: Number(data.amountLocal ?? 0),
        currencyCode: String(data.currency ?? 'USD'),
        pdfStorageRef: null,
        status: (data.status as InvoiceSummary['status']) ?? 'PAID',
      }
    })
  } catch (err) {
    console.warn('[invoiceService.getInvoicesForUser] failed', err)
    return []
  }
}
