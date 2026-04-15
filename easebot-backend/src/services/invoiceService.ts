/**
 * invoiceService — async invoice generation + storage + email.
 *
 * Sprint 1 SKELETON: public surface only. Sprint 3 (PAY-020) adds:
 *   - pdfkit-based renderer in invoiceTemplate.ts  [needs npm install — see below]
 *   - in-process queue worker (invoiceQueue.ts)
 *   - real Firestore writes to `invoices/{id}` and `counters/invoices/{ym}`
 *   - email dispatch via existing emailService.ts
 *
 * Grounded in: .orchestrator/specs/invoice-format.md (authoritative).
 *
 * DEFERRED DEPENDENCY — Sprint 3 PAY-020 must `npm install pdfkit` (and its
 * @types). Sprint 1 intentionally does NOT install it (guardrail 5). The
 * skeleton uses plain `unknown`-returning stubs so tsc passes without the
 * dep present.
 *
 * TODO (Sprint 3, invoice-format.md §3): at first-function-call time, assert
 * that `process.env.LEGAL_ENTITY_NAME` is set. The spec says "throw at
 * module load", but Sprint 1 defers this to runtime so `tsc --noEmit` and
 * a bare `import` don't require env vars to be configured. Move the throw
 * into invoiceTemplate.ts's module-load path once the renderer is wired.
 */

// ---------------------------------------------------------------------------
// Job / invoice shapes
// ---------------------------------------------------------------------------

/**
 * A queue job enqueued by paymentController after a paid webhook.
 * Minimal shape for Sprint 1; Sprint 3 may extend with `attempts`,
 * `nextAttemptAt`, etc. per spec §7.1.
 */
export interface InvoiceJob {
  jobId: string
  kind: 'render_invoice'
  invoiceId: string
}

/**
 * Summary row returned by getInvoicesForUser. The full Invoice shape
 * (spec §1) lives in Sprint 3 when the PDF template is built.
 */
export interface InvoiceSummary {
  invoiceId: string
  invoiceNumber: string
  date: string
  totalLocal: number
  currencyCode: string
  pdfStorageRef: string | null
  status: 'PAID' | 'PENDING' | 'VOID'
}

const NOT_IMPLEMENTED = 'not_implemented_sprint_3'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue an invoice render job. Called synchronously from
 * paymentController.handleWebhook after tier grant — non-blocking so tier
 * grant never waits on PDF rendering (LH-30).
 *
 * Sprint 1: stub. Sprint 3: writes to `invoiceJobs/{jobId}` and nudges the
 * in-process worker.
 */
export async function queueInvoice(_job: InvoiceJob): Promise<void> {
  throw new Error(NOT_IMPLEMENTED)
}

/**
 * Render a queued invoice to PDF and stream it to Firebase Storage.
 * Called by the in-process queue worker. Returns the storage ref on
 * success (e.g. `invoices/2026-04/EB-202604-000001.pdf`).
 *
 * Sprint 1: stub. Sprint 3: uses pdfkit + adminStorage.
 */
export async function renderInvoicePdf(_jobId: string): Promise<string> {
  throw new Error(NOT_IMPLEMENTED)
}

/**
 * Read-only list of a user's invoices for the /settings/billing page.
 * Ordered newest first. Returns signed download URLs via a separate
 * helper (not inlined here) when a row is expanded.
 *
 * Sprint 1: stub.
 */
export async function getInvoicesForUser(_uid: string): Promise<InvoiceSummary[]> {
  throw new Error(NOT_IMPLEMENTED)
}
