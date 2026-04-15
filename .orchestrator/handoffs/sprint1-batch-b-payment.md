# Sprint 1 · Batch B · Payment Master — Handoff

**Tickets closed:** PAY-001, PAY-002
**Date:** 2026-04-14
**Branch:** optimization
**tsc --noEmit:** PASS (backend)

---

## 1. `.env.example` diffs

### `easebot-backend/.env.example`
Appended three blocks to the existing file (existing content untouched):

- `# --- PayU (Sprint 2 live) ---` → `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_BASE_URL=https://test.payu.in`, `PAYU_WEBHOOK_SECRET`, `PAYU_RETURN_URL=http://localhost:5173/payment/return`, `PAYU_FAILURE_URL=http://localhost:5173/payment/failure`
- `# --- Currency / exchange rate (server-side) ---` → `EXCHANGE_RATE_API_KEY`
- `# --- Legal entity (invoice seller block) ---` → `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS_LINE_1/2`, `LEGAL_ENTITY_CITY`, `LEGAL_ENTITY_STATE`, `LEGAL_ENTITY_POSTAL_CODE`, `LEGAL_ENTITY_COUNTRY`, `LEGAL_ENTITY_GSTIN`, `LEGAL_ENTITY_PAN`, `LEGAL_ENTITY_SUPPORT_EMAIL`, `LEGAL_ENTITY_WEBSITE`

All values empty except `PAYU_BASE_URL`, `PAYU_RETURN_URL`, `PAYU_FAILURE_URL` which are non-secret defaults per EXECUTION_PLAN §8.2. Grep-verified no high-entropy tokens introduced.

### `Wedding-Ease-Viva-Chat/.env.example`
Appended:

- `VITE_EXCHANGE_RATE_API_KEY=` (empty)
- `VITE_IP_GEOLOCATION_API_KEY=f92eea25a17246a09563543976ca23d7` — the one sanctioned placeholder (guardrail exception; already public, user-provided as shared fallback).

---

## 2. Utilities created

### `easebot-backend/src/utils/payuHash.ts`
Pure functions, zero I/O:

- `buildPayuHashString(input)` — canonical forward pre-hash string, `key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt` (6 pipes between udf5 and salt, per payu-contract.md §5).
- `generatePayuHash(input)` — lowercase hex SHA-512 of the forward pre-hash.
- `buildPayuResponseHashString(payload, salt)` — reverse formula `salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key` (6 pipes between status and udf5).
- `verifyPayuResponseHash(payload, expectedHash, salt)` — constant-time compare via `crypto.timingSafeEqual`.

Uses Node's built-in `crypto`. No new npm deps. Not imported by any controller (PAY-010 will wire).

### `easebot-backend/src/utils/rateLock.ts`
Pure, in-process, 60-second per-currency cache wrapping a stub fetcher:

- `getLockedRate(targetCurrency)` → `{ rate, fetchedAt, currency, source: 'live' | 'cache' | 'stub' }`
- USD short-circuits to 1.0.
- Sanity guard: throws `ExchangeRateOutOfRangeError` on `rate <= 0` or `rate > 10_000` (LH-33).
- `fetchRateStub` currently returns 1.0 with a `console.warn` line. Sprint 2 PAY-011 swaps this body for `exchangeRateService.fetchLiveRate('USD', target)`.
- Exposes `__setNowForTesting` / `__clearCacheForTesting` hooks for deterministic cache-TTL tests.

### Tests
`easebot-backend/src/utils/__tests__/payuHash.test.ts` (6 tests) and `.../rateLock.test.ts` (5 tests). No test runner wired — files compile cleanly under `tsc --noEmit` and export `runPayuHashTests` / `runRateLockTests` runners. Executed manually via `ts-node --transpile-only`: **11/11 passed**.

---

## 3. Hash test vectors used

Self-consistent fixtures (PayU does not publish a cross-merchant reference vector; their "test hash generator" is merchant-keyed):

```
key        : JBZaLc
txnid      : EB-TEST-123
amount     : 1299.00
productinfo: Easebot Pro Monthly
firstname  : Krish
email      : test@example.com
udf1       : uid_abc
udf2       : pro
udf3       : monthly
udf4       : (empty)
udf5       : (empty)
salt       : eCwWELxi
```

**Forward pre-hash:**
```
JBZaLc|EB-TEST-123|1299.00|Easebot Pro Monthly|Krish|test@example.com|uid_abc|pro|monthly||||||||eCwWELxi
```
**Forward SHA-512:**
`cf166effa0ad4fc251f215641f85424c6a8c94507864326d7ec97c1093b1d836b2eae21119aee363282672523f562c791c9d6ac3eeb842925b0ac79967304cc2`

**Reverse pre-hash (status=success):**
```
eCwWELxi|success||||||||monthly|pro|uid_abc|test@example.com|Krish|Easebot Pro Monthly|1299.00|EB-TEST-123|JBZaLc
```
**Reverse SHA-512:**
`d0898abf6aa6cb154541a13a8b7027b66b9b635413a36850b8c3c7acd7600631a0c2f5b096b56340d24fe75e4f664326dd30a2c6839634b9b976a8666c621f02`

Tamper test (change amount → 1.00) asserts `verifyPayuResponseHash` returns false.

---

## 4. Open questions for Sprint 2

### PAY-010 (routes)
1. **PayU IP allowlist.** Spec §8 mentions a middleware. Source IPs need to be captured from PayU's sandbox docs before wiring — flag to human to fetch and document as a comment in `.env.example`.
2. **Return vs. webhook race.** Both paths call `verifyPayuResponseHash`. Confirm the state-machine transition is idempotent on `txnid` when return arrives first (covered by `payments/{txnid}.state` check, but needs an integration test).
3. **udf5 reserved field.** Currently always empty. If we ever need a sixth UDF (e.g. A/B cohort), the hash string shape changes zero — just populate it. Document the decision before filling.

### PAY-011 (rate lock live)
1. **`exchangeRateService.ts` does not exist in the tree yet.** BE-003 was supposed to scaffold it; not present as of this batch. `rateLock.ts` compiles standalone and does NOT import the missing file. PAY-011 should (a) create the service, (b) replace `fetchRateStub` with a call to it, (c) extend the test file with a mocked-fetch happy path and a mocked-fetch over-range rejection.
2. **60s TTL vs. upstream rate limits.** Spec §14 flags this as potentially needing bump to 5min under load. Leave `TTL_MS` as a `const` for now; promote to config only if PAY-011's live fetcher hits rate limits in sandbox testing.
3. **Cache is process-local.** Multi-instance backends will fetch N times per minute (once per node). Acceptable for now (PRD volume is low). Flag for horizontal-scale epoch.

### No test runner
Backend `package.json` has no jest/vitest. Sprint 2 should add vitest (dev dep only) so the `.test.ts` files run in CI. Until then the runner functions must be called manually.

---

## 5. Verification log

```
$ cd easebot-backend && npx tsc --noEmit
(exit 0, no output)

$ npx ts-node --transpile-only -e '… run both test runners …'
[rateLock] exchangeRateService not wired yet (PAY-011); returning stub rate 1.0 for USD→INR
[rateLock] exchangeRateService not wired yet (PAY-011); returning stub rate 1.0 for USD→EUR
[rateLock] exchangeRateService not wired yet (PAY-011); returning stub rate 1.0 for USD→EUR
payuHash: { passed: 6, failed: 0 }
rateLock: { passed: 5, failed: 0 }
```

No routes mounted, no controllers touched, no npm deps added, no real secrets introduced. Ready for Sprint 2 PAY-010.
