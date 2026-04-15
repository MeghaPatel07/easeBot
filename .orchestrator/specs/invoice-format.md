# Spec — Invoice Format

**Owner:** System Architect (this spec) → Payment Master Agent (implementation)
**File:** `easebot-backend/src/services/invoiceTemplate.ts` + `easebot-backend/src/services/invoiceService.ts` + `easebot-backend/src/services/invoiceQueue.ts`
**Status:** Draft v1 — Sprint 1 deliverable (implementation lands in Sprint 3)
**Grounded in:** PRICING_PRD.md §4.5, §8.9, §6.5; EXECUTION_PLAN.md §8.2, §9, LH-30
**Depends on:** `payu-contract.md`, `subscription-state.md`

One invoice per successful paid event. PDF generated asynchronously — tier grant never waits on a PDF. Seller block comes from environment variables and the module hard-fails if the legal entity is unconfigured. Buyer GST block is optional per-checkout. Three tax branches: India+GSTIN, India no-GSTIN, non-India. Dual currency display (local + USD FYI line).

**Reuses:** existing `services/emailService.ts` for delivery. This spec does NOT reimplement mail.

---

## 1. Full field list (matches EXECUTION_PLAN.md §9.2)

```ts
export interface Invoice {
  // --- Identity ---
  invoiceId: string                    // Firestore doc id, same as invoiceNumber
  invoiceNumber: string                // EB-YYYYMM-NNNNNN (monotonic per month)
  date: string                         // ISO date of generation
  status: 'PAID' | 'PENDING' | 'VOID'  // v1 only ever emits PAID

  // --- Seller (from env, hard-coded at module load) ---
  seller: {
    name: string                       // LEGAL_ENTITY_NAME — required or throw
    addressLine1: string
    addressLine2: string
    city: string
    state: string
    postalCode: string
    country: string                    // ISO-2
    gstin: string | null               // LEGAL_ENTITY_GSTIN (null if not Indian entity)
    pan: string | null
    supportEmail: string
    website: string
  }

  // --- Buyer (from /payment/initiate body, stored on payments/{txnid}) ---
  buyer: {
    displayName: string                // Firebase user's displayName or email
    companyName: string | null         // optional, printed as "Bill to" if set
    email: string
    gstin: string | null               // 15-char Indian GSTIN if provided
    billingAddress: {
      line1: string | null
      line2: string | null
      city: string | null
      state: string | null
      postalCode: string | null
      country: string                  // ISO-2, required
    }
  }

  // --- Line items ---
  line: {
    plan: 'pro_monthly' | 'pro_annual' | 'pro_6mo' | 'promax_monthly' | 'promax_annual' | 'topup'
    description: string                // e.g. "Easebot Pro — Monthly (2026-04-14 → 2026-05-14)"
    periodStart: string | null         // ISO; null for topup
    periodEnd:   string | null         // ISO; null for topup
    quantity: 1
    subtotalUsd: number                // canonical USD price (PRICES_USD[...])
  }

  // --- Credits (upgrade flows only) ---
  credits: Array<{
    description: string                // "Credit from unused Pro (annual, 185 days)"
    amountUsd: number                  // negative number
  }>
  forwardCreditAppliedUsd: number      // credit consumed from subscription.forwardCreditUsd
  forwardCreditIssuedUsd: number       // new forward credit created by this invoice

  // --- Currency ---
  currency: {
    code: string                       // ISO-4217, e.g. "INR"
    exchangeRate: number               // 1 USD = N LOCAL, captured at /payment/initiate
    rateCapturedAt: string             // ISO timestamp
  }

  // --- Money (both local and USD shown) ---
  subtotalLocal: number                // displayed in buyer's currency
  subtotalUsd:   number                // FYI line
  taxBranch: 'IN_B2B' | 'IN_B2C' | 'INTL_NA'
  taxLines: Array<{
    label: string                      // "CGST 9%" / "SGST 9%" / "IGST 18%" / "GST 18%" / "Tax N/A"
    rate: number                       // 0.09 / 0.18 / 0
    amountLocal: number
  }>
  totalLocal: number
  totalUsd:   number                   // = subtotalUsd + sum(taxLines converted, or 0 non-IN)

  // --- Payment trace ---
  payment: {
    txnid: string
    mihpayid: string | null            // PayU's own id, from webhook payload
    method: string | null              // e.g. "CC XXXX-1234" — from gateway response if available
    paidAt: string                     // ISO
  }

  // --- Notes (appended to the bottom of the PDF) ---
  notes: string[]                      // e.g. ["Top-up tokens never expire.", "Buyer responsible for own jurisdiction."]

  // --- Storage metadata ---
  createdAt: string                    // ISO
  pdfStorageRef: string | null         // bucket path, null until queue completes
  emailSentAt: string | null
}
```

One Firestore doc per invoice at `invoices/{invoiceId}`. PDF bytes live in Firebase Storage at `gs://{bucket}/invoices/{YYYY-MM}/{invoiceNumber}.pdf` with a signed URL generated on demand (never stored in the doc).

---

## 2. Seller block sourced from env

```ts
// services/invoiceTemplate.ts — top of file, runs at module load
const SELLER_NAME = process.env.LEGAL_ENTITY_NAME?.trim() ?? ''
if (!SELLER_NAME) {
  throw new Error(
    '[invoiceTemplate] LEGAL_ENTITY_NAME is not set. ' +
    'Invoices cannot be emitted without a seller identity. ' +
    'Configure the LEGAL_ENTITY_* environment variables and restart the server.'
  )
}

const SELLER = {
  name:         SELLER_NAME,
  addressLine1: process.env.LEGAL_ENTITY_ADDRESS_LINE_1 ?? '',
  addressLine2: process.env.LEGAL_ENTITY_ADDRESS_LINE_2 ?? '',
  city:         process.env.LEGAL_ENTITY_CITY ?? '',
  state:        process.env.LEGAL_ENTITY_STATE ?? '',
  postalCode:   process.env.LEGAL_ENTITY_POSTAL_CODE ?? '',
  country:      (process.env.LEGAL_ENTITY_COUNTRY ?? '').toUpperCase(),
  gstin:        process.env.LEGAL_ENTITY_GSTIN || null,
  pan:          process.env.LEGAL_ENTITY_PAN || null,
  supportEmail: process.env.LEGAL_ENTITY_SUPPORT_EMAIL ?? '',
  website:      process.env.LEGAL_ENTITY_WEBSITE ?? '',
} as const
```

**Hard-fail rule:** the throw above happens at `import` time of any module that imports `invoiceTemplate`. On a misconfigured environment, the backend refuses to start instead of silently emitting invoices with a blank seller block. This is enforced in code, not docs — grep for `LEGAL_ENTITY_NAME` in a PR review: the throw must be there.

Supplementary sanity checks (warn, not throw): if `LEGAL_ENTITY_COUNTRY === 'IN'` and `LEGAL_ENTITY_GSTIN` is empty, log a startup warning — it's probably a misconfig.

---

## 3. GST handling — three branches

Computed from `{ buyerCountry, buyerGstin, sellerCountry, sellerState, buyerState }`.

### 3.1 Branch selection

```ts
function selectTaxBranch(buyer: Invoice['buyer']): 'IN_B2B' | 'IN_B2C' | 'INTL_NA' {
  const isIndianBuyer = buyer.billingAddress.country === 'IN'
  if (!isIndianBuyer) return 'INTL_NA'
  if (buyer.gstin) return 'IN_B2B'
  return 'IN_B2C'
}
```

### 3.2 `IN_B2B` — India buyer with valid GSTIN

- Seller is Indian too (assumed — flagged if not, see §8 concern 3).
- Determine intra-state vs inter-state by comparing `buyer.billingAddress.state` to `seller.state`:
  - **Intra-state:** two lines — `CGST 9%` + `SGST 9%` (= 18% total)
  - **Inter-state:** one line — `IGST 18%`
- Each tax line is computed on `subtotalLocal` and written into `taxLines`.
- Invoice shows buyer's GSTIN in the "Buyer GSTIN" row; seller's GSTIN in the seller block.

### 3.3 `IN_B2C` — India buyer, no GSTIN

- One consolidated line: `GST 18%` at rate `0.18`, computed on `subtotalLocal`.
- No split. `label: 'GST 18% (consolidated)'`.

### 3.4 `INTL_NA` — non-India buyer

- One line: `Tax: N/A` with `rate: 0, amountLocal: 0`.
- Appended note: `"Buyer is responsible for tax compliance in their own jurisdiction."`
- No VAT. No sales tax. No MOSS. v2 concern.

---

## 4. Dual currency display (PRD §4.5 requirement)

Every invoice shows **both** the charged-amount in local currency AND a USD equivalent as an FYI line:

```
Subtotal:                 ₹1,299.00
  (USD equivalent:        $14.85 at 1 USD = ₹87.48 captured 2026-04-14)
GST 18%:                    ₹233.82
Total charged:            ₹1,532.82
  (USD equivalent:        $17.52)
```

Rules:
- `exchangeRate` is snapshotted on `payments/{txnid}` at `/payment/initiate`. The invoice displays this exact rate — NOT a fresh rate.
- Local amounts are authoritative — they are what the card was charged.
- USD amounts are display-only and may drift by a cent due to rounding (LH-37 — accepted). Each invoice has a small footnote: `"USD figures are indicative, based on the exchange rate locked at checkout."`
- For USD-native buyers, the USD line is omitted (collapses to a single-currency invoice).

---

## 5. PDF library recommendation — `pdfkit`

**Recommended:** [`pdfkit`](https://pdfkit.org) (`npm i pdfkit`).

Why:
- No headless browser. No Chromium. No puppeteer worker pool. Runs inline in a Node process.
- Deterministic layout (you write x/y coordinates or use the built-in flow model). Reproducible for every invoice.
- ~200 KB install, fast boot, no sandbox.
- Streaming API — we pipe straight to a Firebase Storage `createWriteStream` without buffering the whole PDF in memory.

Alternatives considered and rejected:
- `puppeteer-core` + HTML template: heavier (Chromium), slow cold-start, sandbox concerns in serverless.
- `jsPDF`: client-side library, weaker server story.
- `@react-pdf/renderer`: nice DX, but adds a React dep to the backend for nothing.

**Binding:** one thin wrapper `renderInvoicePdf(invoice: Invoice): Readable` in `services/invoiceTemplate.ts`. The caller pipes the returned stream to storage.

---

## 6. Invoice numbering — `EB-YYYYMM-NNNNNN`

Monotonic per month. Zero-padded sequence number with 6 digits.

### 6.1 Counter document

```ts
// counters/invoices/{YYYY-MM}
{
  yearMonth: '2026-04',
  lastSequence: 0,           // integer; next invoice is lastSequence + 1
  updatedAt: Timestamp,
}
```

### 6.2 Allocation flow — atomic transaction

```
async function nextInvoiceNumber(): Promise<string> {
  const ym = currentUtcYearMonth()                 // "2026-04"
  const counterRef = db.doc(`counters/invoices/${ym}`)
  return db.runTransaction(async tx => {
    const snap = await tx.get(counterRef)
    const prev = snap.exists ? (snap.data()?.lastSequence ?? 0) : 0
    const next = prev + 1
    tx.set(counterRef, { yearMonth: ym, lastSequence: next, updatedAt: now }, { merge: true })
    const padded = String(next).padStart(6, '0')
    return `EB-${ym.replace('-', '')}-${padded}`   // e.g. "EB-202604-000001"
  })
}
```

Properties:
- Monotonic within a month, contiguous (no gaps).
- Gaps between months are fine (sequence restarts).
- A failed PDF render does NOT "release" a number — numbers are issued on invoice-doc creation, before the queue runs. This is legally important in jurisdictions that require contiguous numbering (India included).
- If the transaction contends under burst load, Firestore's retry mechanic handles it — the pre-Sprint-3 load test should confirm <100ms p99 allocation.

---

## 7. Async generation — queue + non-blocking

**Rule:** invoice PDF generation MUST NOT block the tier grant. This is LH-30 verbatim. The sequence on a successful webhook:

```
1. Hash verify OK, amount verify OK
2. State-machine transition (purchase / upgrade / renew / topup) — GRANTS tier
3. Create invoices/{invoiceId} doc with { status:'PAID', pdfStorageRef: null, emailSentAt: null }
4. Enqueue a job: { kind:'render_invoice', invoiceId }
5. Respond 200 to PayU
```

The queue runner (`invoiceQueue.ts`) is an in-process worker that polls a Firestore queue collection every N seconds. On each job:

```
6. Load invoices/{invoiceId}
7. renderInvoicePdf(invoice) → Readable
8. Stream to Firebase Storage at invoices/{yyyy-mm}/{invoiceNumber}.pdf
9. Update invoices/{invoiceId}.pdfStorageRef
10. Send email via emailService.sendInvoiceEmail(invoice, signedUrl)
11. Update invoices/{invoiceId}.emailSentAt
12. Ack the queue job (delete).
```

Failure modes (LH-30):
- Step 7 crashes → job retries with exponential backoff (max 5 attempts, caps at 1h). After 5 failures, job moves to `invoiceQueueDLQ` collection. The user's tier is already granted — support emails the operator manually. Never re-grants tier.
- Step 8 storage failure → same retry path.
- Step 10 email failure → `pdfStorageRef` stays populated (download available from billing page); only `emailSentAt` stays null. Retry independently.

The queue runner is a separate module from `paymentController` so a crash in PDF rendering never pollutes the webhook response loop.

### 7.1 Queue representation

```ts
// invoiceJobs/{jobId}
{
  jobId: string,
  kind: 'render_invoice',
  invoiceId: string,
  attempts: number,
  nextAttemptAt: Timestamp,
  lastError: string | null,
  createdAt: Timestamp,
}
```

Polling: every 15 seconds, the runner reads up to 10 jobs where `nextAttemptAt <= now`, processes them in series (not parallel — PDF rendering is CPU-bound and we don't want to starve the main event loop). No Cloud Functions, no Pub/Sub — plain in-process worker. A future move to Cloud Tasks is a v2 concern.

---

## 8. Storage

```
Firestore:  invoices/{invoiceId}     ← Invoice doc
Firestore:  invoiceJobs/{jobId}      ← Queue doc (ephemeral)
Firestore:  counters/invoices/{ym}   ← Number allocator
Firestore:  invoiceQueueDLQ/{id}     ← Dead-letter for failed renders
Storage:    invoices/{yyyy-mm}/{invoiceNumber}.pdf  ← PDF bytes
```

**PDF bytes are NOT inlined in Firestore** — Firestore has a 1 MiB doc cap and base64'd PDFs blow it. Storage is the right home. The Firestore doc holds a **bucket reference**, not the bytes, per §8.3 of the user's task brief.

`pdfStorageRef` format: `invoices/2026-04/EB-202604-000001.pdf` (bucket-relative path). A signed URL with 7-day expiry is generated on demand when `/settings/billing` renders the download link, via `adminStorage.bucket().file(ref).getSignedUrl({ expires: now + 7d })`.

---

## 9. Email delivery

Uses the **existing** `services/emailService.ts`. This spec does NOT re-implement mail sending.

Expected API (if `emailService` doesn't already expose it, Payment Master adds a single function):

```ts
// services/emailService.ts — new function alongside existing ones
export async function sendInvoiceEmail(
  invoice: Invoice,
  pdfDownloadUrl: string,
): Promise<void>
```

Subject line: `"Easebot invoice ${invoice.invoiceNumber} — ${invoice.line.description}"`
Body: short HTML + text alternative. Includes the download link, the buyer's name, the amount, and a line pointing to `/settings/billing` for all invoices.

If email fails, see §7 retry path — the PDF is still downloadable from the billing page.

---

## 10. Test matrix (QA hooks)

- UC-26 Successful buy → invoice doc created, PDF rendered, email sent
- UC-29 Upgrade → invoice has credit line; forwardCreditIssuedUsd populated if applicable
- UC-34 Duplicate webhook → one invoice, not two (idempotency on `txnid` at the subscription layer)
- UC-45 IN+GSTIN → invoice shows CGST/SGST split or IGST based on states
- UC-46 Invalid GSTIN → rejected at `/payment/initiate` before any invoice work
- UC-47 IN no GSTIN → consolidated 18% B2C line
- UC-48 Non-IN with companyName → Bill-to is companyName, tax is N/A
- LH-30 PDF render fails → tier is still granted, job lands in DLQ after retries, no user-facing error
- LH-37 Rounding drift between local and USD → accepted, footnote explains

---

## 11. Open architectural concerns

1. **Monotonic numbering across Sprint 1 → 3 gap.** The counter doc `counters/invoices/{ym}` doesn't exist yet. When the first invoice fires in Sprint 3, the transaction creates it with `lastSequence=1`. That's fine. But if an operator imports historical data or backfills older invoices, the counter must be manually seeded to avoid collisions. Flag: document a `scripts/seed-invoice-counters.ts` placeholder before Sprint 3 starts.

2. **`LEGAL_ENTITY_*` env vars must be present in local dev too.** The hard-fail at module load means a developer without the env vars cannot run the backend. Mitigation: ship `.env.example` with placeholder values (`LEGAL_ENTITY_NAME="Local Dev"`) so `cp .env.example .env` is enough. Do NOT ship real values.

3. **Assumes seller is Indian for Indian GST math.** §3.2 assumes `seller.country === 'IN'`. If `LEGAL_ENTITY_COUNTRY` is something else, the CGST/SGST/IGST math is nonsensical — a non-Indian entity cannot charge Indian GST. The module should check: if `buyer.country === 'IN'` AND `seller.country !== 'IN'`, the tax branch falls through to `INTL_NA` even for an Indian buyer, with a note: `"Buyer is responsible for tax compliance (seller is not GST-registered in India)."` Flag to CEO Agent — this is a legal edge case we should make explicit.

4. **PDF rendering is single-threaded in-process.** Under burst load (100 concurrent paid events), the queue backs up. Average render time should be <500ms per invoice, so 100 invoices = 50 seconds wall-clock while tier grants complete in milliseconds. Acceptable for launch. If burst traffic proves a problem, move to Cloud Tasks in v2.

5. **Storage bucket and Storage rules.** Writing PDFs to Firebase Storage uses the existing Admin SDK credentials — no new IAM. **But:** the frontend reading signed URLs is fine (signed URLs bypass rules). If any frontend read is ever done without a signed URL (direct bucket path), it would need Storage rules changes → **Guardrail 2 — stop and escalate**. Flag: current design avoids this, but a careless refactor could trip it.

6. **No credit notes / voids.** v1 only emits `PAID` invoices. There is no `VOID` path, no credit-note emission for refunds (refunds don't exist). If an admin manually reverses a chargeback via PayU dashboard, no invoice or credit note is auto-generated — the operator handles the paper trail out-of-band. Matches Guardrail 9. Flag to the human for GTM checklist: document this in the internal runbook.
