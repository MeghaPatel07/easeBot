# Spec — PayU Integration Contract

**Owner:** System Architect (this spec) → Payment Master Agent (implementation)
**File:** `easebot-backend/src/controllers/paymentController.ts` + `easebot-backend/src/routes/payment.ts` + `easebot-backend/src/services/payuClient.ts` + `easebot-backend/src/services/exchangeRateService.ts`
**Status:** Draft v1 — Sprint 1 deliverable
**Grounded in:** PRICING_PRD.md §4.5, §6, §6.5; EXECUTION_PLAN.md §0 guardrails 3/9/10, §8, §5 (UC-26..UC-48), §6 (LH-25..LH-37)
**Depends on:** `subscription-state.md`, `token-meter.md`

Scope: every PayU touchpoint. Route shapes, hash generation, webhook idempotency, server-side rate lock, buyer GST/company fields, top-up cap. Nothing in this spec touches Firebase rules or IAM. Nothing in this spec hardcodes a secret.

**Hard constraint (Guardrail 9):** There is **NO** `/payment/refund` user-facing route. If a PR adds one, the Orchestrator rejects it. Admin chargeback reversal happens out-of-band in the PayU dashboard — this document explicitly does NOT expose that as code.

---

## 1. Routes

All routes live under `/api/payment/*`. Auth: `requireAuth` + strict-auth-unless-noted. Rate limiting: reuse existing `express-rate-limit` bucket per `req.user.uid` — 10 requests / minute for initiate/upgrade/topup, 30/min for verify, unlimited for webhook (but protected by hash+IP allowlist).

### 1.1 Route map

| Route | Method | Auth | Summary |
|---|---|---|---|
| `/api/payment/initiate` | POST | strict | Lock exchange rate, compute amount, return PayU form params + hash |
| `/api/payment/return` | POST | none (PayU POSTs) | Server-to-server reverse-hash verify, redirect user to frontend success/failure |
| `/api/payment/webhook` | POST | none (signed) | Out-of-band confirmation, source of truth, idempotent |
| `/api/payment/verify` | GET | strict | Frontend poll by `txnid` when webhook lags (LH-15) |
| `/api/payment/subscription/cancel` | POST | strict | Set `cancel_at_period_end=true`. No refund. |
| `/api/payment/subscription/reactivate` | POST | strict | Clear cancel flag. |
| `/api/payment/subscription/upgrade` | POST | strict | Plan upgrade flow (Pro → Pro Max), proration from `subscription-state.md` §6 |
| `/api/payment/subscription/downgrade` | POST | strict | Schedule downgrade Pro Max → Pro at period end. No refund. |
| `/api/payment/topup` | POST | strict | One-shot $10 / +2M tokens. Max 10/month hard cap (§7). |

**Intentionally absent:**
- `/api/payment/refund` — does not exist. See top of spec.
- `/api/payment/subscription/change-plan` — covered by upgrade / downgrade routes.

---

## 2. TypeScript request/response interfaces

```ts
// ---------- shared ----------

export type Plan = 'pro' | 'promax'
export type BillingCycle = 'monthly' | 'annual' | '6mo'

export interface GstInfo {
  companyName?: string                 // optional, printed on invoice as Bill-to
  gstin?: string                       // optional, 15-char Indian GSTIN (regex in §6)
}

export interface BillingAddress {
  country: string                      // ISO-2, required
  state?: string
  postalCode?: string
  line1?: string
  line2?: string
  city?: string
}

// ---------- /payment/initiate ----------

export interface InitiatePaymentRequest {
  plan: Plan
  billingCycle: BillingCycle
  billingAddress: BillingAddress       // required; PayU needs it
  companyName?: string
  gstin?: string
}

export interface InitiatePaymentResponse {
  txnid: string                        // generated server-side, unique
  amount: string                       // "1299.00" — string to avoid float drift
  currency: string                     // ISO-4217, e.g. "INR"
  exchangeRate: number                 // captured at this moment; stamped on payments/{txnid}
  productinfo: string                  // "Easebot Pro Monthly" etc.
  firstname: string                    // from user profile
  email: string
  udf1: string                         // uid
  udf2: string                         // plan
  udf3: string                         // billingCycle
  udf4: string                         // upgradeFromPlan or ''
  udf5: string                         // reserved, empty string for now
  hash: string                         // sha512(...) per §5
  surl: string                         // PAYU_RETURN_URL
  furl: string                         // PAYU_FAILURE_URL
  payuBaseUrl: string                  // PAYU_BASE_URL (sandbox or prod)
  merchantKey: string                  // PAYU_MERCHANT_KEY (public-facing id, not the salt)
}

// ---------- /payment/return (PayU → backend) ----------

export interface PayuReturnPayload {
  // Standard PayU return fields (names match PayU docs exactly — do not rename)
  mihpayid: string
  mode: string
  status: 'success' | 'failure' | 'pending' | string
  key: string
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  udf1: string
  udf2: string
  udf3: string
  udf4: string
  udf5: string
  hash: string                         // to be verified
  error?: string
  error_Message?: string
}

// No JSON response — /payment/return redirects the user to the frontend.

// ---------- /payment/webhook ----------

export interface PayuWebhookPayload extends PayuReturnPayload {
  // PayU webhook includes additional fields — subset we consume:
  net_amount_debit?: string
  addedon?: string
  payment_source?: string
}

// Response: always 200 { ok: true } unless the hash is invalid (→ 400).
// Idempotency: second webhook with same txnid → 200 no-op.

// ---------- /payment/verify ----------

export interface VerifyRequest { txnid: string }
export interface VerifyResponse {
  txnid: string
  state: 'pending' | 'paid' | 'failed' | 'unknown'
  subscriptionState?: string           // if tier grant has landed
  amount?: string
  currency?: string
  invoiceId?: string
}

// ---------- /payment/subscription/cancel ----------

export interface CancelRequest { clientRequestId: string }
export interface CancelResponse {
  ok: true
  cancelAtPeriodEnd: true
  currentPeriodEnd: string             // ISO
  message: string                      // user-facing
}

// ---------- /payment/subscription/reactivate ----------

export interface ReactivateRequest { clientRequestId: string }
export interface ReactivateResponse {
  ok: true
  cancelAtPeriodEnd: false
  currentPeriodEnd: string
}

// ---------- /payment/subscription/upgrade ----------

export interface UpgradeRequest {
  toPlan: 'promax'
  billingCycle: BillingCycle
  billingAddress: BillingAddress
  companyName?: string
  gstin?: string
}

export interface UpgradeResponse {
  // Two shapes: either PayU redirect needed, or free upgrade (charge $0)
  kind: 'redirect' | 'free'
  txnid: string
  chargeNowUsd: number                 // 0 for free upgrade
  creditAppliedUsd: number
  newForwardCreditUsd: number
  // if kind === 'redirect': same fields as InitiatePaymentResponse
  redirect?: InitiatePaymentResponse
}

// ---------- /payment/subscription/downgrade ----------

export interface DowngradeRequest {
  toPlan: 'pro'
  clientRequestId: string
}

export interface DowngradeResponse {
  ok: true
  scheduledFor: string                 // ISO = current period end
  message: string
}

// ---------- /payment/topup ----------

export interface TopupRequest {
  billingAddress: BillingAddress
  companyName?: string
  gstin?: string
}

export interface TopupResponse extends InitiatePaymentResponse {
  packSizeTokens: 2_000_000
  priceUsd: 10
}
```

No JSON response hides a schema — every field is typed here. Payment Master implements exactly these shapes; Frontend consumes exactly these shapes.

---

## 3. USD canonical price table

Single source of truth. Hard-coded in the backend — lifted straight from PRD §4.

```ts
// services/payuClient.ts (or a pure constants module)
export const PRICES_USD = {
  pro: {
    monthly: 14.99,
    annual:  119.00,
    '6mo':    49.00,                   // Sprint 4 / experiment
  },
  promax: {
    monthly: 39.00,
    annual: 299.00,
    '6mo':    0,                       // not offered for Pro Max in v1 — reject
  },
  topup: {
    priceUsd: 10.00,
    tokens:  2_000_000,
  },
} as const
```

If `plan='promax', billingCycle='6mo'` is requested, `/payment/initiate` returns 400. Validation lives next to this constant.

---

## 4. Server-side rate lock flow (§8.7 of the execution plan)

On every `/payment/initiate` call:

```
1. Read user's country from req.body.billingAddress.country
    - NOT from IP (users can VPN). The billing address they typed is the source.
    - Frontend pre-fills from GeolocationService, user may edit. LH-36.

2. Map country → currency via a tiny table in currencyFormat.ts:
      IN → INR, US → USD, GB → GBP, DE/FR/ES/IT/NL/etc → EUR,
      AU → AUD, CA → CAD, JP → JPY, AE → AED, SG → SGD, default → USD

3. rate = await exchangeRateService.getLockedRate(fromCurrency='USD', toCurrency=localCcy)
    - Calls https://v6.exchangerate-api.com/v6/{EXCHANGE_RATE_API_KEY}/pair/USD/{localCcy}
    - Sanity check: reject if rate <= 0 OR rate > 10000 (LH-33)
    - Sanity check: reject if response older than 24h
    - Cache one entry per currency for 60 seconds in process memory (LH-34)
    - On failure: throw ExchangeRateUnavailableError → route returns 503 (LH-42)

4. amountUsd  = PRICES_USD[plan][billingCycle]
   amountLocal = roundPerTable(amountUsd * rate, localCcy)   // rounding table §8.8

5. Generate txnid: `EB-${Date.now()}-${crypto.randomUUID().slice(0,8)}`

6. Stamp payments/{txnid}:
     {
       uid, plan, billingCycle, companyName, gstin, billingAddress,
       amountUsd, amountLocal, currency: localCcy, exchangeRate: rate,
       state: 'pending', createdAt: serverTimestamp(),
       hashInput: '…|hash material for verify…',
     }

7. Compute hash (§5) from merchant-visible fields

8. Return InitiatePaymentResponse

9. Frontend submits the form to payuBaseUrl/_payment. User is now on PayU.
```

Key invariants:
- **Rate is frozen on `payments/{txnid}`.** Subsequent webhooks / returns use this stored rate — they do NOT re-fetch. No arbitrage (LH-31, LH-32).
- **If the user abandons and reopens pricing an hour later → new `/payment/initiate` → new txnid → new rate.** No stale-quote honoring (UC-43).
- **The server's amount is authoritative.** Return and webhook handlers compare the returned `amount` against the stored `amountLocal` and reject mismatches (LH-25).

### 4.1 `exchangeRateService.getLockedRate` signature

```ts
// services/exchangeRateService.ts (NEW — Payment Master owns)
export async function getLockedRate(
  from: 'USD',
  to: string,                          // ISO-4217, e.g. 'INR'
): Promise<{ rate: number; fetchedAt: string; source: 'live' | 'cache' }>

// Internal 60s memory cache, shared across requests in the same minute.
// No Firestore cache — this is a process-local concern and a stale cache
// hit is preferable to a burst of API calls under load.
```

The `/payment/initiate` handler is the **only** caller. No other controller or module reads from this service.

---

## 5. Hash generation (PayU v1 formula — MUST match exactly)

PayU's canonical form:

```
hash = sha512(
  key | txnid | amount | productinfo | firstname | email |
  udf1 | udf2 | udf3 | udf4 | udf5 |
  | | | | | | SALT
)
```

The six empty pipes between `udf5` and `SALT` represent udf6–udf10 + `|` separators; they are blank in our usage. The exact string form is (pseudo):

```
`${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`
```

Implementation rules:
- Use Node's `crypto.createHash('sha512')`. Encode to lowercase hex.
- Never in the browser — the salt is server-only. The frontend receives only the finished hash string.
- `amount` is a string ("1299.00"), matching exactly what is posted in the form. If we send the number `1299`, PayU computes its hash on `"1299"` and we'll mismatch. Freeze as `.toFixed(2)` at hash time and at form-submission time.

### 5.1 Return / webhook reverse hash

On return or webhook, PayU sends the reverse hash:

```
hash = sha512(
  SALT | status |
  | | | | | |
  udf5 | udf4 | udf3 | udf2 | udf1 |
  email | firstname | productinfo | amount | txnid | key
)
```

(Order is reversed + prefixed with SALT and status.) Implementation computes and compares; mismatch → reject with 400 and log a security event (LH-29).

### 5.2 `udf` mapping (same everywhere)

| Field | Value |
|---|---|
| `udf1` | `uid` (the Firebase user id) |
| `udf2` | `plan` (`'pro'` or `'promax'` or `'topup'`) |
| `udf3` | `billingCycle` (`'monthly'`, `'annual'`, `'6mo'`, or `'topup'`) |
| `udf4` | `upgradeFromPlan` (`'pro'` on an upgrade flow; empty string for new purchases and top-ups) |
| `udf5` | reserved — empty string. Do not use. |

---

## 6. GSTIN validation and company-info handling (§8.9)

```ts
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
```

On `/payment/initiate`, `/payment/subscription/upgrade`, `/payment/topup`:

```
if (body.gstin != null && body.gstin !== '') {
  if (!GSTIN_REGEX.test(body.gstin)) {
    return 400 { error: 'invalid_gstin', field: 'gstin' }
  }
}

if (body.companyName != null && (typeof body.companyName !== 'string' || body.companyName.length > 200)) {
  return 400 { error: 'invalid_company_name' }
}
```

Both fields are stored on `payments/{txnid}`. On payment success, they're copied onto `invoices/{invoiceId}`. They are NOT written to `users/{uid}` — a user may buy for themselves this month and for a client the next; each invoice is its own billing entity.

UC-45 / UC-46 / UC-47 / UC-48 test matrix:
- UC-45: IN + GSTIN → invoice shows CGST/SGST split
- UC-46: invalid GSTIN → 400 before PayU
- UC-47: IN + no GSTIN → consolidated 18% B2C line
- UC-48: non-IN + companyName no GSTIN → invoice "Bill to: {companyName}", tax N/A

Actual invoice rendering lives in `invoice-format.md` — this spec only validates and stores.

---

## 7. Top-up cap enforcement (PRD §4.4 + UC-25a)

On `/payment/topup`:

```
const usage = await tokenMeter.getUsage({ kind:'user', id:uid, tier:resolvedTier })
if (usage.extrasPurchasedThisMonth >= 10) {
  return 409 Conflict {
    error: 'topup_cap_exceeded',
    message: 'Monthly top-up limit reached (10 packs). Resets on the 1st.',
    nextResetAt: firstOfNextUtcMonth().toISOString(),
  }
}
```

The cap lives in the backend, not in the frontend. Frontend also hides the button after 10 — double-defense.

After successful webhook, `tokenMeter.addExtras(uid, 2_000_000, txnid)` is called. That function enforces the same cap inside the transaction for race safety, and uses `txnid` as its idempotency key so a duplicated webhook cannot add 4M tokens.

---

## 8. Webhook idempotency (LH-26, LH-28, UC-34)

`payments/{txnid}` doc states:

```ts
type PaymentState =
  | 'pending'        // set on initiate
  | 'paid'           // set on first successful webhook or verified return
  | 'failed'         // set on first failure webhook or verified return
  | 'unknown'        // manual review queue (LH-27)
```

Webhook handler pseudocode:

```
1. Verify hash (§5.1). Invalid → 400, log, no state change.
2. Read payments/{txnid}. Not found → create (initiate didn't happen; rare).
3. Check current state:
      'paid'   → no-op, return 200 { ok:true, duplicate:true }
      'failed' → no-op, return 200 { ok:true, duplicate:true, final:true }
      'pending' →
          4a. Verify amount matches stored amountLocal (LH-25). Mismatch → set state='unknown', alert, return 400.
          4b. Compute new state from payload.status:
                'success' → state='paid'
                'failure' → state='failed'
                other     → state='unknown'
          4c. If 'paid':
                - Fire state-machine transition (purchase | upgrade | renew_success | topup)
                  using txnid as idempotency key. See subscription-state.md §7.
                - For topup: call tokenMeter.addExtras(uid, 2_000_000, txnid).
                - Queue invoice job (async, see invoice-format.md §7).
                - Write payments/{txnid}.state = 'paid' + paidAt + gatewayResponse.
          4d. Return 200 { ok:true }.
5. PayU IP allowlist check runs as a tiny middleware before all of this. Source IPs documented in .env.example as a comment.
```

Return handler (user redirect) is a mirror with the same hash verification, but its job is to redirect the user to `/payment/success` or `/payment/failure` on the frontend. It does NOT make authoritative state changes — it may update `payments/{txnid}` to 'paid' if it arrives first, but the webhook is still the canonical path. Both paths are idempotent on `txnid`.

---

## 9. `/payment/verify` (LH-15)

Frontend polls this endpoint by `txnid` after the user returns from PayU if the webhook hasn't landed yet. Read-only:

```
GET /api/payment/verify?txnid=EB-…
  Auth: strict (uid must match payments/{txnid}.uid)

Response:
  { txnid, state, subscriptionState?, amount?, currency?, invoiceId? }
```

The handler does NOT trigger state transitions itself — it only reads. If `state === 'pending'` for more than 5 minutes, the frontend shows a "please contact support" message; backend operators can reconcile manually via the PayU dashboard.

---

## 10. Currency policy (PRD §4.5)

- **Base currency:** USD. Every value in `PRICES_USD` is authoritative.
- **Display:** frontend `GeolocationService` + `ExchangeRateService` — out of scope for this spec, owned by Frontend.
- **Charge:** server-side `exchangeRateService.getLockedRate` at `/payment/initiate` — **authoritative**.
- **No regional SKUs.** Guardrail 10.
- **No refunds on rate movements.** PRD §6.5.
- **Invoice shows both local and USD**, with the captured exchange rate (see `invoice-format.md`).

---

## 11. Security checklist (mapped to loopholes)

| LH | Mitigation in this spec |
|---|---|
| LH-25 Server-side amount verification | §8 step 4a, §4 invariant "server's amount is authoritative" |
| LH-26 Webhook replay | §8 state machine on `payments/{txnid}` — duplicate paid → no-op |
| LH-27 Unknown PayU status | §8 step 4b — state becomes 'unknown', alert operator |
| LH-28 User closes tab during PayU | `/payment/verify` covers recovery |
| LH-29 Tampered hash | §5.1 reverse hash check → 400 + security log |
| LH-33 Absurd rate from API | §4 step 3 sanity check |
| LH-34 Rate API rate-limits | §4.1 60s in-memory cache per currency |
| LH-36 User manipulates currency | §4 step 1 uses billingAddress.country, not IP, for the rate. The display currency is the user's choice; the rate is deterministic from their billing country. |

Additional:
- HTTPS only — enforced at reverse proxy, no code.
- No sensitive data in logs: redact `email` to `k***@d***`, redact `txnid` to last 6 chars. Shared helper in `utils/logRedact.ts` (new, Payment Master owns).
- Rate limiting: extend `middleware/rateLimiter.ts`. Do not introduce a new rate-limiter library.

---

## 12. Environment variables (consumed; no secrets in code)

From `.env.example`:

```
PAYU_MERCHANT_KEY=
PAYU_MERCHANT_SALT=
PAYU_BASE_URL=https://test.payu.in
PAYU_WEBHOOK_SECRET=
PAYU_RETURN_URL=http://localhost:5173/payment/return
PAYU_FAILURE_URL=http://localhost:5173/payment/failure

EXCHANGE_RATE_API_KEY=

LEGAL_ENTITY_NAME=
LEGAL_ENTITY_ADDRESS_LINE_1=
LEGAL_ENTITY_ADDRESS_LINE_2=
LEGAL_ENTITY_CITY=
LEGAL_ENTITY_STATE=
LEGAL_ENTITY_POSTAL_CODE=
LEGAL_ENTITY_COUNTRY=
LEGAL_ENTITY_GSTIN=
LEGAL_ENTITY_PAN=
LEGAL_ENTITY_SUPPORT_EMAIL=
LEGAL_ENTITY_WEBSITE=
```

- All read at startup (not per-request).
- `PAYU_MERCHANT_SALT` and `PAYU_WEBHOOK_SECRET` NEVER appear in any response, log, or frontend bundle.
- `paymentController` refuses to boot if `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_BASE_URL`, or `EXCHANGE_RATE_API_KEY` are empty — prints a loud error and exits. No silent "works-but-broken" mode.

---

## 13. Test matrix (QA hooks)

- UC-26 Buy Pro → webhook → tier=pro within 5s → invoice emailed
- UC-27 User cancels at PayU → tier stays free, no charge
- UC-28 PayU failure → tier stays free, error banner
- UC-29 Upgrade mid-cycle → new invoice with proration line (state machine §6)
- UC-30 Downgrade schedule (no immediate drop)
- UC-31 / UC-32 Cancel / reactivate
- UC-33 Refund denied (no route exists)
- UC-34 / LH-26 Duplicate webhook → idempotent
- UC-35 Invalid signature → 400 + log
- UC-36 Pro Max shows "current plan" with no upgrade CTA (frontend + 409 backend defense)
- UC-37 / LH-14 Buy same plan → 409
- UC-38..UC-44 Currency matrix
- UC-45..UC-48 GST matrix
- LH-25 Tamper amount → reject
- LH-28 Tab close → /verify recovers
- LH-31..LH-37 Currency attack surface — all covered in §4 and §10

---

## 14. Open architectural concerns

1. **PayU Subscription SI mandate auto-renewal.** This spec treats renewals as incoming webhooks (`renew_success` / `renew_fail`). The actual SI mandate setup (mandate registration, debit flow) is PayU-side UX that happens inside PayU's redirect. Payment Master should verify that PayU's "Easebot sandbox" account supports SI mandates before Sprint 3 — if not, annual plans must be one-shot (user resubscribes manually at year end). Flag to human.

2. **PayU return handler is public.** `/payment/return` cannot require auth because PayU is the HTTP client. Hash verification is the only gate. A crafted `return` with a forged hash would be rejected, but log level on failures must be high so we notice probing.

3. **60s cache on exchange rate.** Two users in the same minute get the same rate. A third user in the next minute gets a fresh rate. Under extreme load, we might fall back to per-5-minute caching if the exchangerate-api free tier rate-limits us. Flagged; if we need longer TTL, the cache TTL becomes a config.

4. **`payments/{txnid}` collection is NOT subscoped under a user.** It's top-level. This is fine for Admin-SDK reads but potentially surfaces in Firebase rules if the frontend ever tries to read these docs directly. **Flag:** the frontend should NEVER read `payments/{txnid}` directly; `/payment/verify` is the only path. If Frontend ever writes a direct-read, it would need a rules change → Guardrail 2 → stop.

5. **Downgrade is a separate route from upgrade.** The EXECUTION_PLAN.md §8.3 table lists `/payment/subscription/upgrade` but not `/payment/subscription/downgrade`. I've added it for clarity (the state-machine needs a trigger surface, and "downgrade is a cancel with a side flag" would hide it in `/cancel`). **Flag:** if the Orchestrator prefers to fold downgrade into `/cancel?downgradeTo=pro`, that's a cosmetic change — mark it before implementation.

6. **`LEGAL_ENTITY_*` env vars are a hard dependency of the invoice module.** See `invoice-format.md` — if `LEGAL_ENTITY_NAME` is empty, the module throws at boot. The payment module does NOT throw on empty legal-entity vars (PayU can still fire), but the first successful payment will fail to emit an invoice and land in the retry queue. Decide: should `/payment/initiate` also pre-flight the legal-entity config? Recommend yes — it's a cheap sanity check and surfaces misconfiguration early.
