/**
 * invoiceService — PDF invoices with GST split + email delivery.
 *
 * Sprint 4 (audit close): real PDF rendering via pdfkit, monotonic invoice
 * numbering via a counters doc, Indian GST split (CGST/SGST/IGST) driven by
 * buyer place-of-supply vs legal entity state, and inline storage of the
 * PDF bytes as base64 in Firestore `invoices/{id}.pdfBase64` (small — typical
 * invoice is 8–20 KB, comfortably under Firestore's 1 MB doc cap).
 *
 * Uses the Admin SDK (adminDb) — see tokenMeter.ts for why the original
 * client-SDK-only guardrail was reversed.
 *
 * Grounded in: .orchestrator/specs/invoice-format.md (§3 fields, §7 numbering,
 * §9 currency, §10 tax branches).
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import PDFDocument from 'pdfkit'
import { adminDb } from '../lib/firebaseAdmin'
import { sendEmailNotification, buildInvoiceEmail } from './emailService'
import { emit } from '../lib/observability'

export interface InvoiceJob {
  jobId: string
  kind: 'render_invoice'
  invoiceId: string
  /** Caller's authenticated uid — asserted against payments/{invoiceId}.uid. */
  uid: string
}

export interface InvoiceSummary {
  invoiceId: string
  invoiceNumber: string
  date: string
  totalLocal: number
  currencyCode: string
  pdfStorageRef: string | null
  status: 'PAID' | 'PENDING' | 'VOID' | 'FAILED'
}

export class InvoiceAuthzError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvoiceAuthzError'
  }
}

interface BillingAddress {
  name?: string
  country?: string
  state?: string
  postalCode?: string
  line1?: string
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
  billingAddress?: BillingAddress
  gstin?: string | null
  forwardCreditUsd?: number
  paidAt?: Timestamp
  state?: string
}

// ---------------------------------------------------------------------------
// Legal entity env — read at module load, fail fast on misconfiguration.
// P0-1: production must crash on boot rather than silently mail customers
// invoices branded as a placeholder entity.
// ---------------------------------------------------------------------------

if (!process.env.LEGAL_ENTITY_NAME || !process.env.LEGAL_ENTITY_COUNTRY) {
  throw new Error('[invoiceService] LEGAL_ENTITY_* env vars are required')
}

const LEGAL_ENTITY_NAME: string = process.env.LEGAL_ENTITY_NAME
const LEGAL_ENTITY_COUNTRY: string = process.env.LEGAL_ENTITY_COUNTRY.toUpperCase()
const LEGAL_ENTITY_STATE: string = (process.env.LEGAL_ENTITY_STATE || '').toUpperCase()
const LEGAL_ENTITY_ADDRESS: string = process.env.LEGAL_ENTITY_ADDRESS || ''
const LEGAL_ENTITY_GSTIN: string = process.env.LEGAL_ENTITY_GSTIN || ''

if (LEGAL_ENTITY_COUNTRY === 'IN') {
  if (!LEGAL_ENTITY_STATE) console.warn('[invoiceService] LEGAL_ENTITY_STATE missing for IN entity')
  if (!LEGAL_ENTITY_ADDRESS) console.warn('[invoiceService] LEGAL_ENTITY_ADDRESS missing for IN entity')
  if (!LEGAL_ENTITY_GSTIN) console.warn('[invoiceService] LEGAL_ENTITY_GSTIN missing for IN entity')
}

// ---------------------------------------------------------------------------
// Monotonic invoice number (spec §7)
// ---------------------------------------------------------------------------

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function allocateInvoiceNumber(): Promise<string> {
  const ym = currentYearMonth()
  const ref = adminDb.doc(`counters/invoices_${ym}`)
  const next = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const cur = snap.exists ? Number((snap.data() as { n?: number }).n ?? 0) : 0
    const n = cur + 1
    tx.set(ref, { n, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return n
  })
  const padded = String(next).padStart(6, '0')
  return `EB-${ym.replace('-', '')}-${padded}`
}

// ---------------------------------------------------------------------------
// GST split (spec §10)
// ---------------------------------------------------------------------------

interface TaxLines {
  taxable: number
  cgst: number
  sgst: number
  igst: number
  total: number
  branch: 'INTRA' | 'INTER' | 'EXPORT' | 'INTL_NA'
}

function computeTaxLines(amountLocal: number, buyer: BillingAddress | undefined, _buyerGstin: string | null): TaxLines {
  const country = (buyer?.country || '').toUpperCase()
  const buyerState = (buyer?.state || '').toUpperCase()
  const legalCountry = LEGAL_ENTITY_COUNTRY
  const legalState = LEGAL_ENTITY_STATE

  // Decision D3: non-IN legal entity → INTL_NA for every invoice, regardless of buyer country
  if (legalCountry !== 'IN') {
    return { taxable: amountLocal, cgst: 0, sgst: 0, igst: 0, total: amountLocal, branch: 'INTL_NA' }
  }
  // Buyer outside India → export, zero GST.
  if (country && country !== 'IN') {
    return { taxable: amountLocal, cgst: 0, sgst: 0, igst: 0, total: amountLocal, branch: 'EXPORT' }
  }
  // P1-1: IN legal entity + IN buyer must have buyerState set — otherwise we
  // cannot correctly decide INTRA vs INTER and must not silently default.
  if (legalCountry === 'IN' && country === 'IN' && !buyerState) {
    throw new Error('[invoiceService] IN buyer must have state set')
  }
  // Indian buyer: 18% GST split.
  const taxable = Math.round((amountLocal / 1.18) * 100) / 100
  const gst = Math.round((amountLocal - taxable) * 100) / 100
  if (buyerState && buyerState === legalState) {
    const half = Math.round((gst / 2) * 100) / 100
    return { taxable, cgst: half, sgst: gst - half, igst: 0, total: amountLocal, branch: 'INTRA' }
  }
  return { taxable, cgst: 0, sgst: 0, igst: gst, total: amountLocal, branch: 'INTER' }
}

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------

function renderPdfBuffer(p: PaymentRow, invoiceNumber: string, tax: TaxLines): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const d = new PDFDocument({ size: 'A4', margin: 56 })
      const chunks: Buffer[] = []
      d.on('data', (c: Buffer) => chunks.push(c))
      d.on('end', () => resolve(Buffer.concat(chunks)))
      d.on('error', reject)

      d.fontSize(20).text(LEGAL_ENTITY_NAME, { continued: false })
      d.fontSize(10).fillColor('#666').text(LEGAL_ENTITY_ADDRESS)
      if (LEGAL_ENTITY_GSTIN) d.text(`GSTIN: ${LEGAL_ENTITY_GSTIN}`)
      d.moveDown()

      d.fillColor('#000').fontSize(14).text(`Invoice ${invoiceNumber}`)
      d.fontSize(10).fillColor('#666').text(`Issued: ${new Date().toISOString().slice(0, 10)}`)
      d.text(`Transaction: ${p.txnid}`)
      d.moveDown()

      const buyer = p.billingAddress ?? {}
      d.fillColor('#000').fontSize(11).text('Bill to:')
      d.fontSize(10).fillColor('#333')
        .text(buyer.name || p.buyer?.firstname || '—')
        .text(p.buyer?.email || '')
      if (buyer.line1) d.text(buyer.line1)
      if (buyer.state || buyer.postalCode) d.text([buyer.state, buyer.postalCode].filter(Boolean).join(' '))
      if (buyer.country) d.text(buyer.country)
      if (p.gstin) d.text(`Buyer GSTIN: ${p.gstin}`)
      d.moveDown()

      d.fillColor('#000').fontSize(11).text('Items')
      d.fontSize(10).fillColor('#333').text(p.productinfo)
      d.text(`Cycle: ${p.cycle}`)
      d.moveDown()

      const forwardCredit = Number(p.forwardCreditUsd ?? 0)
      const amount = Number(p.amountLocal)
      d.fillColor('#000').fontSize(11).text('Summary')
      d.fontSize(10).fillColor('#333')
      d.text(`Taxable:           ${p.currency} ${tax.taxable.toFixed(2)}`)
      if (tax.branch === 'INTRA') {
        d.text(`CGST (9%):          ${p.currency} ${tax.cgst.toFixed(2)}`)
        d.text(`SGST (9%):          ${p.currency} ${tax.sgst.toFixed(2)}`)
      } else if (tax.branch === 'INTER') {
        d.text(`IGST (18%):         ${p.currency} ${tax.igst.toFixed(2)}`)
      } else if (tax.branch === 'EXPORT') {
        d.text(`GST:                Export — 0%`)
      } else {
        d.text(`GST:                N/A (non-IN entity)`)
      }
      if (forwardCredit > 0) d.text(`Forward credit:    -USD ${forwardCredit.toFixed(2)}`)
      d.fillColor('#000').fontSize(12).text(`Total:             ${p.currency} ${amount.toFixed(2)}`)
      d.moveDown()

      d.fontSize(8).fillColor('#888').text(
        'Per our terms §6.5, no refunds are issued for partial cycles, unused tokens, or top-up packs.',
        { width: 480 },
      )
      d.end()
    } catch (err) { reject(err as Error) }
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function queueInvoice(job: InvoiceJob): Promise<void> {
  if (!job.uid) {
    throw new InvoiceAuthzError('[invoiceService] queueInvoice requires uid')
  }

  // Idempotency: if an invoice doc already exists in a non-failed state, skip.
  // Only re-render if it previously failed (for retry from the queue runner).
  const invRef = adminDb.doc(`invoices/${job.invoiceId}`)
  const existing = await invRef.get()
  if (existing.exists) {
    const cur = existing.data() as { status?: string; uid?: string }
    if (cur.uid && cur.uid !== job.uid) {
      emit('invoice.authz_denied', { invoiceId: job.invoiceId, callerUid: job.uid })
      throw new InvoiceAuthzError('[invoiceService] invoice uid mismatch (existing doc)')
    }
    if (cur.status && cur.status !== 'FAILED') {
      return
    }
  }

  const payRef = adminDb.doc(`payments/${job.invoiceId}`)
  const paySnap = await payRef.get()
  if (!paySnap.exists) {
    console.warn('[invoiceService] missing payment doc', { jobId: job.jobId })
    return
  }
  const p = paySnap.data() as PaymentRow

  // P0-3: assert caller owns the payment. Never trust invoiceId alone.
  if (p.uid !== job.uid) {
    emit('invoice.authz_denied', { invoiceId: job.invoiceId, callerUid: job.uid, ownerUid: p.uid })
    console.error('[invoiceService] authz denied — payment uid mismatch', {
      invoiceId: job.invoiceId,
      callerUid: job.uid,
    })
    throw new InvoiceAuthzError('[invoiceService] caller uid does not own payment')
  }

  const invoiceNumber = await allocateInvoiceNumber()
  const tax = computeTaxLines(Number(p.amountLocal), p.billingAddress, p.gstin ?? null)

  let pdfBase64: string | null = null
  let renderError: Error | null = null
  try {
    const buf = await renderPdfBuffer(p, invoiceNumber, tax)
    pdfBase64 = buf.toString('base64')
  } catch (err) {
    renderError = err as Error
    console.error('[invoiceService] pdf render failed', err)
  }

  if (renderError || !pdfBase64) {
    // P0-2: do NOT mark PAID, do NOT email. The queue runner (future work)
    // will retry FAILED invoices by re-invoking queueInvoice for the same id.
    // Invoices are legally required to persist — never delete.
    await invRef.set({
      invoiceId: job.invoiceId,
      invoiceNumber,
      uid: p.uid,
      txnid: p.txnid,
      plan: p.plan,
      cycle: p.cycle,
      priceUsd: p.priceUsd,
      amountLocal: Number(p.amountLocal),
      currency: p.currency,
      taxable: tax.taxable,
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
      taxBranch: tax.branch,
      pdfBase64: null,
      status: 'FAILED',
      lastRenderError: renderError?.message ?? 'unknown',
      lastRenderErrorAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    emit('invoice.render_failed', {
      invoiceId: job.invoiceId,
      invoiceNumber,
      uid: p.uid,
      error: renderError?.message ?? 'unknown',
    })
    return
  }

  // Invoices are legally required to persist — never delete.
  await invRef.set({
    invoiceId: job.invoiceId,
    invoiceNumber,
    uid: p.uid,
    txnid: p.txnid,
    plan: p.plan,
    cycle: p.cycle,
    priceUsd: p.priceUsd,
    amountLocal: Number(p.amountLocal),
    currency: p.currency,
    taxable: tax.taxable,
    cgst: tax.cgst,
    sgst: tax.sgst,
    igst: tax.igst,
    taxBranch: tax.branch,
    pdfBase64,
    status: 'PAID',
    lastRenderError: null,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  const email = p.buyer?.email
  if (email) {
    try {
      const paidAtIso = p.paidAt?.toDate
        ? p.paidAt.toDate().toISOString()
        : new Date().toISOString()
      const { subject, html, text } = buildInvoiceEmail({
        recipientName: p.buyer?.firstname ?? null,
        invoiceNumber,
        plan: p.plan,
        cycle: p.cycle,
        amountLocal: Number(p.amountLocal),
        currency: p.currency,
        txnid: p.txnid,
        paidAtIso,
        legalEntityName: LEGAL_ENTITY_NAME,
      })
      await sendEmailNotification({ to: email, subject, html, text })
    } catch (err) {
      console.warn('[invoiceService] email dispatch failed', err)
    }
  }
  emit('invoice_rendered', { invoiceId: job.invoiceId, invoiceNumber, uid: p.uid, taxBranch: tax.branch })
  console.log('[invoiceService] invoice_rendered', { invoiceId: job.invoiceId, invoiceNumber })
}

export async function renderInvoicePdf(_jobId: string): Promise<string> {
  return ''
}

export async function getInvoicesForUser(uid: string): Promise<InvoiceSummary[]> {
  try {
    const snap = await adminDb
      .collection('invoices')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      const createdAt = data.createdAt as Timestamp | undefined
      // P1-3: currencyCode must always be present for the frontend table.
      const rawCurrency = typeof data.currency === 'string' && data.currency ? data.currency : 'USD'
      return {
        invoiceId: String(data.invoiceId ?? d.id),
        invoiceNumber: String(data.invoiceNumber ?? ''),
        date: createdAt?.toDate().toISOString() ?? '',
        totalLocal: Number(data.amountLocal ?? 0),
        currencyCode: rawCurrency,
        pdfStorageRef: data.pdfBase64 ? `inline:${data.invoiceId}` : null,
        status: (data.status as InvoiceSummary['status']) ?? 'PAID',
      }
    })
  } catch (err) {
    console.warn('[invoiceService.getInvoicesForUser] failed', err)
    return []
  }
}

export async function getInvoicePdfBase64(uid: string, invoiceId: string): Promise<string | null> {
  const snap = await adminDb.doc(`invoices/${invoiceId}`).get()
  if (!snap.exists) return null
  const data = snap.data() as { uid?: string; pdfBase64?: string }
  if (data.uid !== uid) return null
  return data.pdfBase64 || null
}

// ---------------------------------------------------------------------------
// Unified billing / purchase history (Settings → Billing tab)
//
// Merges the formal `invoices` (paid cycles, with downloadable PDF) with raw
// `payments` attempts — including pending / failed / needs_review records that
// never produced an invoice. invoiceId === txnid === payments doc id, so the
// two collections join on the document id.
//
// Equality-only queries (no orderBy) so NO composite index is required; the
// list is sorted newest-first and capped in memory.
// ---------------------------------------------------------------------------

export type BillingHistoryStatus = 'PAID' | 'FAILED' | 'PENDING' | 'REVIEW'

export interface BillingHistoryRow {
  /** txnid — also the invoice id and the PDF download id. */
  id: string
  invoiceNumber: string | null
  /** ISO timestamp — paidAt when available, else createdAt. */
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

function mapPaymentState(state: string): BillingHistoryStatus {
  switch (state) {
    case 'paid':
      return 'PAID'
    case 'failed':
      return 'FAILED'
    case 'needs_review':
    case 'unknown':
      return 'REVIEW'
    default:
      return 'PENDING'
  }
}

const HISTORY_LIMIT = 100

export async function getBillingHistoryForUser(uid: string): Promise<BillingHistoryRow[]> {
  try {
    const [paySnap, invSnap] = await Promise.all([
      adminDb.collection('payments').where('uid', '==', uid).get(),
      adminDb.collection('invoices').where('uid', '==', uid).get(),
    ])

    const invById = new Map<string, Record<string, unknown>>()
    for (const d of invSnap.docs) invById.set(d.id, d.data() as Record<string, unknown>)

    const seen = new Set<string>()
    const rows: BillingHistoryRow[] = []

    for (const d of paySnap.docs) {
      const p = d.data() as Record<string, unknown>
      const inv = invById.get(d.id)
      seen.add(d.id)
      const ts = (p.paidAt as Timestamp | undefined) ?? (p.createdAt as Timestamp | undefined)
      rows.push({
        id: d.id,
        invoiceNumber: (inv?.invoiceNumber as string) ?? null,
        date: ts?.toDate?.().toISOString() ?? '',
        amount: Number(p.amountLocal ?? (inv?.amountLocal as number) ?? 0),
        currencyCode: String(p.currency ?? inv?.currency ?? 'USD'),
        status: mapPaymentState(String(p.state ?? '')),
        plan: (p.plan as string) ?? null,
        cycle: (p.cycle as string) ?? null,
        provider: (p.provider as string) ?? null,
        productinfo: (p.productinfo as string) ?? null,
        hasPdf: Boolean(inv?.pdfBase64),
      })
    }

    // Defensive: surface any invoice without a matching payment doc.
    for (const [id, inv] of invById) {
      if (seen.has(id)) continue
      const ts = inv.createdAt as Timestamp | undefined
      rows.push({
        id,
        invoiceNumber: (inv.invoiceNumber as string) ?? null,
        date: ts?.toDate?.().toISOString() ?? '',
        amount: Number(inv.amountLocal ?? 0),
        currencyCode: String(inv.currency ?? 'USD'),
        status: String(inv.status ?? '') === 'PAID' ? 'PAID' : 'REVIEW',
        plan: (inv.plan as string) ?? null,
        cycle: (inv.cycle as string) ?? null,
        provider: null,
        productinfo: null,
        hasPdf: Boolean(inv.pdfBase64),
      })
    }

    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return rows.slice(0, HISTORY_LIMIT)
  } catch (err) {
    console.warn('[invoiceService.getBillingHistoryForUser] failed', err)
    return []
  }
}
