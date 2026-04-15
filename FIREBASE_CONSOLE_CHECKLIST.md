# Firebase Console Checklist — Manual Changes

**Purpose:** Track every Firebase console change the human operator must make by hand, because agents are blocked by Guardrail 2 (no permissions / rules / rights changes from code).

**Scope:** Everything that cannot be expressed as a code commit — Firestore rules, indexes, TTL policies, IAM roles, authorized domains, Cloud Scheduler jobs, Secret Manager entries.

**Legend:**
- 🔴 **PRE-LIVE (blocker)** — must be done before shipping pricing to real users
- 🟡 **PRE-LIVE (recommended)** — strongly recommended but can ship without it for a soft launch
- 🟢 **POST-SPRINT (can defer)** — nice-to-have, add when scaling up or hardening

Each entry includes: what to change, where in the console, why, and which sprint / file flagged it.

---

## 1. Firestore — Security Rules

### 1.1 🔴 New collection write rules
Several new collections are introduced by the pricing work. Each needs a rule that mirrors the existing pattern (owner-only read/write on user-scoped data, server-only writes on system data).

New collections:

| Path | Read | Write | Notes |
|---|---|---|---|
| `users/{uid}/subscription/current` | `request.auth.uid == uid` | **server only** (Admin SDK) | Tier must never be mutable from client |
| `users/{uid}/subscription/history/{txId}` | `request.auth.uid == uid` | **server only** | Append-only audit log |
| `users/{uid}/usage/{yyyymm}` | `request.auth.uid == uid` | **server only** | Token meter ledger |
| `users/{uid}/invoices/{invoiceId}` | `request.auth.uid == uid` | **server only** | Receipts + PDF URLs |
| `guests/{guestId}` | `false` (no client read) | **server only** | Counters for guest tier |
| `counters/invoices/{yyyymm}` | `false` | **server only** | Monotonic invoice sequence |
| `invoiceJobs/{jobId}` | `false` | **server only** | Async invoice render queue |
| `payments/{txnid}` | `request.auth.uid == resource.data.uid` | **server only** | Raw PayU txn records |

**Action:** Firebase Console → Firestore → Rules → paste updated `firestore.rules`. Sprint 3 QA will block ship until Rules Playground passes a test vector (Payment Master agent will publish the vector to `.orchestrator/specs/firestore-rules-tests.md` during Sprint 2).

**Why human:** Guardrail 2 forbids agents from touching rules. Agent produces the rule text; human reviews and publishes.

### 1.2 🔴 Keep existing rules intact
Do not remove existing rules for `users/{uid}`, `chats/{chatId}`, `reminders/{reminderId}`, etc. The pricing work only *adds* collections.

---

## 2. Firestore — Composite Indexes

Composite indexes are needed where queries order+filter on multiple fields. Firebase Console will auto-detect missing indexes on first query and log a direct "create index" link in the server console — easiest path is to run the queries once on staging and click the links.

| Query | Collection | Fields | When needed |
|---|---|---|---|
| Scan for period-end tick | `users/{uid}/subscription/current` (collectionGroup) | `state` ASC, `currentPeriodEnd` ASC | Sprint 3 (subscription scheduler) |
| List user invoices newest first | `users/{uid}/invoices` | `issuedAt` DESC | Sprint 3 (PlanBillingTab history) |
| Dunning-free renew-fail audit | `users/{uid}/subscription/history` (collectionGroup) | `trigger` ASC, `triggeredAt` DESC | Sprint 4 (admin dashboard) |
| Guest cleanup by last-seen | `guests` | `lastSeenAt` ASC | Sprint 2 (guest TTL fallback) — skip if TTL policy below is enabled |

**🟡 Action:** Sprint 3 Backend agent will print the exact index URLs in QA logs. Click each, hit "Create index", wait for build. Index build can take minutes on a warm collection.

---

## 3. Firestore — TTL Policies

### 3.1 🟡 Guest document TTL
`guests/{guestId}` documents accumulate forever if not cleaned. Each doc gets a `ttlExpiresAt` field (set by backend to `now + 7d` on every guest request). A Firestore TTL policy on this field auto-deletes stale docs.

**Action:** Firebase Console → Firestore → TTL → Create policy
- Collection: `guests`
- Field: `ttlExpiresAt`

**Why human:** TTL policy creation is a console-only operation (no API from Admin SDK for policy definition in most regions). **If you skip this, Sprint 2 adds an in-process `guestCleanupCron.ts` as a fallback** — but the TTL policy is the preferred path because it's free and Firestore-native.

### 3.2 🟢 Invoice job queue TTL (optional)
`invoiceJobs/{jobId}` are ephemeral — once the PDF is rendered and uploaded to Storage, the job doc is useless. Set TTL on `completedAt + 30d` for housekeeping.

---

## 4. IAM — Service Account Roles

### 4.1 🟢 Firebase Authentication Admin (only if custom claims chosen)

**Decision locked:** we are using Firestore tier mirror (`users/{uid}.tierMirror`) as the authoritative read path for `authMiddleware.ts`. This avoids needing the Firebase Auth Admin role on the service account in Sprints 1–3.

**If you later want custom claim fast-path:** grant the runtime service account `Firebase Authentication Admin` role in GCP IAM so `admin.auth().setCustomUserClaims()` can write. Not needed to ship.

### 4.2 🔴 Secret Manager access (if using GCP Secret Manager)
If `.env` is replaced with Secret Manager in production, grant the service account `Secret Manager Secret Accessor` on the specific secrets (`PAYU_MERCHANT_SALT`, `PAYU_WEBHOOK_SECRET`, `EXCHANGE_RATE_API_KEY`).

**Not required** if you ship with `.env` on the VM/container — just make sure `.env` is outside git and has correct file mode (`600`).

---

## 5. Firebase Auth — Authorized Domains

### 5.1 🔴 Add PayU return URL domains
PayU redirects the browser back to `PAYU_RETURN_URL` and `PAYU_FAILURE_URL`. If these domains aren't in Firebase Auth's authorized domain list, session cookies may fail on redirect.

**Action:** Firebase Console → Authentication → Settings → Authorized domains → Add:
- Your production frontend domain (e.g., `easebot.app`)
- Your staging domain (e.g., `staging.easebot.app`)
- `localhost` is already there by default (for dev)

**Why human:** Auth settings are console-only.

### 5.2 🟡 Add PayU's own domains (redirect source) — only if using iframe mode
If you embed PayU in an iframe (we're not — we're using full-page redirect), you'd need to allow `*.payu.in` as an iframe source. Full-page redirect does not need this.

---

## 6. Cloud Scheduler / Cron

### 6.1 🟡 Subscription scheduler (only if NOT using in-process cron)

**Decision locked:** we are running `subscriptionScheduler.ts` in-process in the Express backend (runs every minute, reads `subscription.current` where `currentPeriodEnd <= now AND state IN cancel_scheduled`). This is the simplest path.

**If you later move Easebot to a stateless Cloud Run / Cloud Functions deployment** where the backend doesn't stay running, you'd need:
- Google Cloud Scheduler → create job "easebot-subscription-tick"
- Cron: `* * * * *` (every minute) or `*/5 * * * *` (every 5 min — acceptable lag)
- Target: HTTPS endpoint `https://<backend>/internal/scheduler/tick`
- Auth: OIDC token, audience = backend URL

Not needed for the initial single-server deploy.

### 6.2 🟡 Guest cleanup job fallback (only if not using TTL 3.1)
Same pattern — Cloud Scheduler calling `/internal/scheduler/guest-cleanup`. Only if you opted out of the native Firestore TTL policy.

---

## 7. Storage — Rules and Lifecycle

### 7.1 🔴 Invoice PDF bucket rules
Invoices are rendered to `gs://<bucket>/invoices/{uid}/{invoiceId}.pdf`. Each PDF is served via a Firebase Storage signed URL (short-lived) embedded in the user's PlanBillingTab history.

**Rules:**
```
match /invoices/{uid}/{invoiceId} {
  allow read: if request.auth.uid == uid;
  allow write: if false;  // server only
}
```

**Why human:** Rules only editable via console or gcloud CLI, not from app code.

### 7.2 🟢 Lifecycle policy on invoice PDFs
Keep PDFs for 7 years (Indian tax retention requirement for B2B invoices). Set bucket lifecycle: delete after 2555 days. Nice-to-have; Sprint 4.

---

## 8. Firebase Extensions (not needed)

No extensions needed. We're not using the Stripe extension (PayU instead), no Firebase Email extension (Azure SendGrid flow exists), no image-resize extension.

---

## 9. Monitoring & Alerts

### 9.1 🟡 Budget alerts on Azure OpenAI
Not a Firebase thing, but critical. Set up a spend cap on Azure OpenAI so a runaway token meter bug can't bankrupt the project. Target: daily spend alert at $50, hard monthly cap at $2000 (adjust for actual scale).

### 9.2 🟢 Firestore read budget
Firebase Console → Alerts → set a daily read threshold (e.g., 1M reads) and email-on-breach. Catches runaway query loops.

---

## 10. Summary — Minimum viable pre-live checklist

Before Sprint 4 goes live:

- [ ] 1.1 Publish updated `firestore.rules` with all new collection entries
- [ ] 3.1 Enable TTL policy on `guests/{guestId}` (or accept in-process fallback)
- [ ] 5.1 Add production frontend domain to Firebase Auth authorized domains
- [ ] 7.1 Publish Storage rules for `/invoices/` path
- [ ] 9.1 Azure OpenAI budget alert enabled

Everything else is either deferrable (🟢) or recommended-but-not-blocking (🟡).

---

## Appendix — Things agents CAN do (for context)

These are not in this checklist because agents handle them in code:
- `users/{uid}.tierMirror` field writes (via Admin SDK transaction from `subscriptionStateMachine.ts`)
- Firestore document creation and updates within the existing rules
- `.env.example` updates
- `firestore.indexes.json` file commits (but *enabling* indexes still requires console click or `firebase deploy --only firestore:indexes`, which Guardrail 1 forbids agents from running)
