# Security Audit — Settings & Profile (Sprints 1+2)

**Auditor:** Elena Volkova, Principal Security Engineer
**Scope:** Sprint 1 (Priya, Daniyal, Mei, Rohan) + Sprint 2 (Sofia, Aarav, Tomas, Yuki)
**Mode:** Read-only. No source edits. No rule deploys.
**Verdict:** **NOT READY TO SHIP.** One CRITICAL backend-architecture bug breaks the entire
mutation surface in production. See SEC-001.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 4 |
| MEDIUM   | 6 |
| LOW      | 5 |
| INFO     | 3 |

Top blockers for "done": **SEC-001** (backend client SDK + Firestore rules will reject every
write in production), **SEC-002** (auth middleware uses Identity Toolkit lookup, not Admin SDK
verifyIdToken — accepts arbitrary lookup-able tokens), **SEC-008** (CORS wildcard — acceptable
only because we are bearer-token, but documented), **SEC-005** (Notifications toggles are
cosmetic — reminder scheduler ignores prefs), **SEC-004** (in-memory rate limiter does not
survive restart and is per-instance only).

---

## Findings

### SEC-001 — CRITICAL — Backend uses client Firebase SDK; Firestore rules will reject every write in prod
- **File:** `easebot-backend/src/lib/firebase.ts:1-15`, used by `easebot-backend/src/controllers/accountController.ts:1-3`
- **Description:** `lib/firebase.ts` initializes the **client** SDK (`firebase/app` + `firebase/firestore`) with
  `apiKey`/`authDomain`/`projectId` from env. There is **no** `firebase-admin` import anywhere
  in the backend; no service-account credential init; no `signInWithCustomToken` to elevate the
  Node process. Every `getDoc` / `setDoc` / `updateDoc` in `accountController.ts` therefore runs
  as **anonymous** (request.auth == null).
- **Cross-reference (`firestore.rules`, `Wedding-Ease-Viva-Chat/firestore.rules:8-9`):**
  ```
  match /users/{userId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```
  The deployed rules *require* an authenticated request whose uid matches the doc id.
- **Impact:** **Every mutation will fail with PERMISSION_DENIED in production.** GET /api/account/me,
  PATCH /api/account/profile, PATCH /api/account/preferences, DELETE /api/account/photo,
  POST /api/account/delete — all return 500 from the catch block. This is also true for the
  existing chat/notes/checklists controllers; the only reason they appear to work today is
  that someone is testing against a project with permissive rules or the emulator. **Sprint 1+2
  cannot be called "done" until this is fixed.**
- **Why it works in dev:** Either (a) Firestore is in *test mode* (allow read, write: if true)
  on the staging project, or (b) the dev env points at the emulator with `firebase.json` rules
  not loaded. Either way it is masking the bug.
- **Remediation (Sprint 4 must own):**
  1. Add `firebase-admin` dependency. Initialise once in `lib/firebase.ts` using
     `applicationDefault()` or a service-account JSON resolved from `GOOGLE_APPLICATION_CREDENTIALS`
     / a Secret Manager mount.
  2. Replace all client `db` imports in controllers with the admin Firestore instance.
  3. Replace `requireAuth` middleware (see SEC-002) with admin `verifyIdToken`.
  4. Re-test against the deployed rules — admin SDK bypasses rules so writes succeed; user
     identity is enforced in the controller via `req.user.uid`, not by rules.

### SEC-002 — HIGH — Auth middleware uses Identity Toolkit `accounts:lookup` instead of Admin verifyIdToken
- **File:** `easebot-backend/src/middleware/auth.ts:11-44`
- **Description:** `requireAuth` POSTs the bearer token to
  `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<FIREBASE_API_KEY>`. This is the
  *user-facing* lookup endpoint. It does **not** verify a Firebase ID token's signature, audience,
  issuer, or expiry the way `admin.auth().verifyIdToken()` does. It accepts anything the lookup
  endpoint resolves to a user — including OAuth access tokens or stale tokens within the lookup
  window in some configurations — and adds latency on every request.
- **Impact:** Token-validation correctness gaps; trust boundary established outside the
  application; one-extra-network-hop latency on every authed request; logs of failed lookups end
  up in Google Cloud's auth logs, not the app's; the API key is shipped to identitytoolkit on
  every call.
- **Remediation:** Replace with `admin.auth().verifyIdToken(token, /*checkRevoked*/ true)` once
  Admin SDK lands per SEC-001. Drop `FIREBASE_API_KEY` from the backend env entirely.

### SEC-003 — HIGH — `requireStrictAuth` correctly applied, but pass-through gate depends on broken upstream
- **File:** `easebot-backend/src/controllers/accountController.ts:13-21`, `routes/account.ts:23-35`
- **Description:** Every account route does include `requireStrictAuth`. The wrapper itself is
  correct (rejects when `req.user?.uid` is missing). However it inherits SEC-002's weak token
  verification. Once SEC-002 is fixed this becomes LOW.
- **Impact:** Any token that satisfies `accounts:lookup` will pass strict auth.
- **Remediation:** Fix SEC-002.

### SEC-004 — HIGH — In-memory per-uid rate limiter has multiple gaps
- **File:** `easebot-backend/src/controllers/accountController.ts:29-53`
- **Description:**
  1. **Per-instance, not per-uid-globally** — `mutationBuckets` is a `Map` in process memory.
     With ≥2 backend pods (Railway/Cloud Run autoscale) an attacker just round-robins replicas
     and gets 10× nodes/min effectively.
  2. **Resets on restart** — restart loop resets buckets. Liveness probes that recycle pods are
     a free reset.
  3. **No cleanup** — buckets are never evicted. With many uids this is an unbounded leak
     (small, but real).
  4. **10/min may be loose for password/email/delete** — these are particularly sensitive
     mutations. Recommend separate, tighter buckets (e.g., 3/hour for delete; 5/hour for
     password change once it lands).
  5. **No global ceiling** — a compromised account can still issue 600 mutations/hour to one
     pod.
- **Impact:** Insufficient brute-force / abuse protection on the mutation surface.
- **Remediation:** Move to Redis-backed limiter (or `express-rate-limit` with `rate-limit-redis`)
  keyed on `uid`. Add per-endpoint stricter buckets for password/email/delete. Add an LRU eviction.

### SEC-005 — HIGH — Notifications toggles are cosmetic; reminderScheduler ignores user prefs
- **Files:** `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/NotificationsTab.tsx:1-80`,
  `easebot-backend/src/services/reminderScheduler.ts` (no preference read), `easebot-backend/src/services/reminderService.ts`
- **Description:** Grep for `preferences.notifications` / `emailReminders` / `whatsappReminders`
  inside `easebot-backend/src/services` returns **zero** matches. The reminder scheduler delivers
  email + WhatsApp regardless of what the user toggled in the Settings UI. The PATCH
  `/api/account/preferences` endpoint correctly persists the flags to Firestore at
  `preferences.notifications.*` (`accountController.ts:326-335`), but the delivery layer
  never reads them.
- **Impact:** **Compliance / trust issue.** A user who turns OFF "WhatsApp reminders" in the UI
  will still receive WhatsApp messages. Risk of CAN-SPAM/GDPR-class complaints, especially the
  productUpdates and tips channels which a user reasonably expects to be opt-out.
- **Remediation:** In `reminderScheduler.ts` (and `emailService.ts` / WhatsApp service), read
  the user doc's `preferences.notifications` before each send. Skip if the relevant channel flag
  is false. Add an integration test.

### SEC-006 — MEDIUM — `handleGetMe` returns full Firestore user doc verbatim, leaking server-managed fields
- **File:** `easebot-backend/src/controllers/accountController.ts:126-140`
- **Description:** `res.json({ uid, email, profile, ...planBlock })` where `profile = snap.data()`.
  The whole document is sent to the client, including any internal fields (`isPremium`, `isVerified`,
  `createdAt`, server bookkeeping like `deletedAt`, `deletionPending`, future PII). The frontend
  then trusts this to render `tier`, `verified`, etc.
- **Impact:** (a) Possible PII leak if internal flags accumulate. (b) Lets a user *learn* their
  own deletion-pending state, which may or may not be desired. (c) Couples the API response shape
  to the storage shape — schema migrations break the client.
- **Remediation:** Whitelist the keys returned. Mirror the allow-list from `ALLOWED_PROFILE_FIELDS`
  plus a small set of server-derived flags.

### SEC-007 — MEDIUM — Mass-assignment via `handleUpdatePreferences` dotted-path write is mostly safe but trusts key allowlist only
- **File:** `easebot-backend/src/controllers/accountController.ts:305-349`
- **Description:** Profile PATCH (`handleUpdateProfile`) correctly rejects unknown keys
  (`return badRequest(res, 'Unknown field: ${key}')`, line 152) — good. Preferences PATCH allows
  only top-level `theme`, `density`, `language`, `notifications`, `dataTrainingOptOut` — also good.
  However, **other** client-controlled write paths could still set arbitrary fields if any future
  endpoint forgets the allow-list pattern. There is no central schema (Zod is in
  `package.json` and unused here). No prototype-pollution risk because we never spread
  `req.body` into `update`.
- **Impact:** Today: low. Future regression risk: medium. Also: `setDoc(..., {merge:true})` on
  line 202 with `update.profileUpdatedAt = serverTimestamp()` mutates the local validated
  `update` object — fine because the only writer is the controller, but worth noting.
- **Remediation:** Define Zod schemas (already a dep) for every PATCH body. Reject on parse
  failure with the same `VALIDATION_ERROR` shape.

### SEC-008 — MEDIUM — CORS is wildcard `*`
- **File:** `easebot-backend/src/app.ts:46-52`
- **Description:** `cors({ origin: '*', credentials: false })`. The comment correctly notes
  this is safe for bearer-token auth (no cookies, browser sends Authorization explicitly).
- **Impact:** **Today: acceptable** — CSRF is mitigated by bearer tokens not riding in cookies.
  But: any web origin can call /api/account/* with a leaked token. Combined with weak token
  verification (SEC-002), token theft elsewhere becomes a cross-origin liability.
- **Remediation:** Lock to the production frontend origin(s) once known. Use an env-driven
  allowlist (`CORS_ORIGINS=https://app.weddingease.com,https://staging.weddingease.com`).

### SEC-009 — MEDIUM — `handleSoftDelete` does not revoke refresh tokens; deleted user keeps API access
- **File:** `easebot-backend/src/controllers/accountController.ts:287-300`
- **Description:** Soft-delete merges `{ deletedAt, deletionPending: true }` into the user doc
  but does not call `admin.auth().revokeRefreshTokens(uid)` (cannot — no admin SDK). It also
  does not check `deletionPending` anywhere downstream. A "deleted" user can keep using the API
  with their existing ID token until natural expiry (~1h), and can refresh it indefinitely. The
  GET /me will continue to return their data — there is no `if (data.deletionPending) return 410`
  gate.
- **Impact:** Account deletion is not actually a deletion from the user's perspective.
- **Remediation:** Once admin SDK lands, call `revokeRefreshTokens(uid)` and add a
  `deletionPending` short-circuit in `requireStrictAuth`.

### SEC-010 — MEDIUM — Profile-photo client crop has no SVG smuggling check (and stub backend has no requirements doc)
- **File:** `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx:50-117, 211-242`
- **Description:** Client allow-lists `image/png` and `image/jpeg` and 5 MB cap — good. Crop is
  via `canvas.drawImage` → `toDataURL('image/jpeg')` which strips any embedded scripts. No
  vulnerability **today** because the upload is stubbed (`POST /api/account/photo` → 501).
  However, the MIME check is by `file.type` only (browser-reported, spoofable). When the real
  backend lands it MUST: (a) re-validate MIME by sniffing magic bytes, (b) reject SVG outright,
  (c) re-encode through sharp/imagemagick to strip metadata, (d) enforce max dimensions, (e)
  store with content-type forced to `image/jpeg`, (f) serve from a separate origin/bucket without
  script execution privileges.
- **Impact:** None today; documented for Sprint 2-followup.
- **Remediation:** Document the above as the photo-upload endpoint contract before it ships.

### SEC-011 — LOW — Backend logs error `message` to stdout in `serverError`
- **File:** `easebot-backend/src/controllers/accountController.ts:84-88`
- **Description:** `console.error('[accountController] error:', message)` and then sends the
  same message in the JSON body. Firestore SDK errors can include doc paths and field names.
- **Impact:** Mild info disclosure to the client; verbose logs.
- **Remediation:** Log internally with a request id; return `'Internal error'` to the client
  with the request id for support correlation.

### SEC-012 — LOW — Unused profile field passed silently to Firestore: `weddingDate`/`budget` accept `null` but are never length-bounded for non-string types
- **File:** `easebot-backend/src/controllers/accountController.ts:176-186`
- **Description:** `isISODateLike` accepts up to 40 chars and any `Date.parse`-able string;
  fine. `budget` checked for finite + range. Edge case: NaN is excluded by `Number.isFinite`,
  Infinity excluded — good. No issue, just confirming.
- **Impact:** None.
- **Remediation:** None required.

### SEC-013 — LOW — `ProfileMenu` trusts client-side `profile.plan` for the badge label
- **File:** `Wedding-Ease-Viva-Chat/src/components/ProfileMenu.tsx:128-170`
- **Description:** Falls back from `plan?.tier` to `profile.plan` (the Firestore doc value). A
  user with direct Firestore access (rules allow self-write) can set `plan: 'premium'` on their
  own doc and the UI badge will display Premium. **UI cosmetic only — this does not unlock any
  premium gating, which lives backend-side.** Worth noting because Sprint 4 adds gating; gating
  must NEVER read `profile.plan` from the user doc client-side.
- **Impact:** Bragging-rights spoofing. Real billing entitlement must be derived from Stripe
  webhooks → server-only field → backend gate.
- **Remediation:** When premium gating ships, store entitlement in a `entitlements/{uid}`
  collection that rules block from user writes; surface via backend-only endpoints.

### SEC-014 — LOW — `localStorage` theme persistence not present (good) but profile preference applies before re-auth
- **File:** `Wedding-Ease-Viva-Chat/src/contexts/ThemeContext.tsx:37-85`
- **Description:** No localStorage read/write — theme is sourced from `profile.preferences.theme`
  via `useAuth`. No `JSON.parse`, no `eval`. XSS via theme is not possible. **Pass.** Minor UX
  note: on cold load before profile resolves, theme defaults to `system`, causing a brief flash
  if user had set `light` or `dark`. Not a security issue.
- **Impact:** None.
- **Remediation:** None required.

### SEC-015 — LOW — `?settings=` URL param has correct allow-list; no crash vector
- **File:** `Wedding-Ease-Viva-Chat/src/pages/settings/SettingsShell.tsx:83-95`
- **Description:** `isTabId` checks against `TAB_IDS` and an unknown tab simply leaves the modal
  closed (`open` becomes false). No content injection; React auto-escapes. **Pass.**
- **Impact:** None.
- **Remediation:** None required.

### SEC-016 — INFO — Password dialog state hygiene is correct
- **File:** `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx:300-331`
- **Description:** `closePasswordDialog()` wipes `currentPassword`, `newPassword`,
  `confirmPassword` on close. Submit handler does NOT log plaintext (verified). The strength
  regex enforces 8+, upper, lower, digit, special — matches the documented policy. The submit
  is a 501-stub with no partial state. **Pass.** Sprint 4 must ensure: (a) Inputs cleared on
  unmount as well (currently only on close), (b) plaintext never enters analytics, (c) re-auth
  before update (Firebase requires `reauthenticateWithCredential` + `updatePassword`).
- **Impact:** None today.
- **Remediation:** Add `useEffect` cleanup that clears state on unmount.

### SEC-017 — INFO — Email change dialog is dead-end-safe (501 stub, dialog cleanup correct)
- **File:** `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx:271-297`
- **Description:** `closeEmailDialog` clears reauthPassword + newEmail. Toast message is
  generic; no half-state on failure because nothing happens. **Pass.**
- **Impact:** None today.
- **Remediation:** When real flow lands: `reauthenticateWithCredential` → `updateEmail` →
  `sendEmailVerification` → `revokeRefreshTokens` (admin) → force re-sign-in.

### SEC-018 — INFO — No new npm dependencies introduced by Sprint 1+2 (per scope)
- **Description:** Diff of `package.json` over the last 3 commits shows `libphonenumber-js`
  and `nodemailer` additions, but those belong to the prior reminders sprint, not Settings.
  No new deps added by the Settings work itself. **Pass.**

### SEC-019 — LOW — `applyProfileDefaults` is read-time only and never written back — confirmed safe shim
- **File:** `Wedding-Ease-Viva-Chat/src/services/migrations/userProfileMigration.ts:1-49`
- **Description:** Pure function; no Firestore IO; doesn't override existing values; doesn't
  guess usage counters. **Pass.**

### SEC-020 — MEDIUM — Delete-confirm is case-sensitive but no irreversibility / 30-day grace period UX
- **File:** `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx:343-375, 888-933`
- **Description:** The dialog text says "This is irreversible" and requires exact email match —
  good. But the *backend* implements a 30-day soft-delete grace period (`accountController.ts:294-298`).
  The UI does not surface "you have 30 days to undo this" or any cancellation path. Net: user
  is told it's irreversible while the backend treats it as recoverable.
- **Impact:** UX/trust mismatch and a missed opportunity to reduce regret. Not a security
  vulnerability per se, but a process gap.
- **Remediation:** Either (a) align backend to hard-delete after re-auth, or (b) align UI
  to show grace period + undo path.

---

## Pass-list (checks run, no issue found)

- **PASS** — XSS / `dangerouslySetInnerHTML` — grep across `Wedding-Ease-Viva-Chat/src/pages/settings`
  and ProfileMenu/ThemeContext returns zero matches. React auto-escape covers `partnerName`,
  `nickname`, `email`, etc.
- **PASS** — Plain-text password storage scope — bound to dialog state only; cleared on close.
- **PASS** — Strength regex completeness — 8+/upper/lower/digit/special verified against
  `PASSWORD_RULES` array.
- **PASS** — `?settings=<tab>` allow-list — `isTabId()` rejects anything not in `TAB_IDS`.
- **PASS** — Theme `localStorage` — no localStorage IO; no JSON.parse; no eval.
- **PASS** — `dangerouslySetInnerHTML` — none in scope.
- **PASS** — Photo client validation — MIME allow-list + 5 MB cap + canvas re-encode.
- **PASS** — Profile-update unknown-key rejection — explicit `Unknown field: ${key}` 400.
- **PASS** — Preferences enum constraints — `ALLOWED_THEMES`, `ALLOWED_DENSITIES`,
  `ALLOWED_ROLES`.
- **PASS** — Phone regex — `/^[+\d\s\-().]+$/` with length cap 32; country-code regex
  `/^\+?\d{1,6}$/`. Sufficient.
- **PASS** — Date parse safety — bounded length 40, `Date.parse` accepts only parseable.
- **PASS** — Idempotent photo delete — error on missing doc handled as no-op.
- **PASS** — `requireStrictAuth` is on every account route in `routes/account.ts`. None
  forgotten.
- **PASS** — IDOR — every controller derives `uid` from `req.user!.uid`; no body/query uid is
  ever read. Verified across all 12 handlers.
- **PASS** — `migrations/userProfileMigration.ts` — pure read-time shim, no IO.
- **PASS** — No new npm deps from Sprint 1+2.

---

## Outstanding gaps to fix in Sprint 4

In priority order:

1. **SEC-001 (CRITICAL):** Migrate backend to `firebase-admin`. This is the single must-fix
   blocker. Until done, every PATCH/DELETE/POST in account controller will return 500 in any
   environment with real Firestore rules deployed.
2. **SEC-002 (HIGH):** Replace Identity Toolkit lookup with `admin.auth().verifyIdToken(token, true)`.
3. **SEC-005 (HIGH):** Wire `preferences.notifications` into `reminderScheduler` and
   `emailService`. Settings toggles must actually disable delivery.
4. **SEC-004 (HIGH):** Move rate limiter to Redis; add tighter per-endpoint buckets for
   password/email/delete.
5. **SEC-009 (MEDIUM):** Revoke refresh tokens on soft-delete; gate `requireStrictAuth` against
   `deletionPending`.
6. **SEC-006 (MEDIUM):** Whitelist the GET /me response shape; do not echo full Firestore doc.
7. **SEC-008 (MEDIUM):** Lock CORS to a known frontend allowlist, env-driven.
8. **SEC-020 (MEDIUM):** Reconcile delete-flow UX with the actual 30-day grace period (or
   remove the grace period).
9. **SEC-010 (MEDIUM):** Document and implement the photo-upload backend contract before the
   stub is replaced.
10. **SEC-013 (LOW):** Document the rule that premium entitlement must NEVER be read from the
    user-writable profile doc client-side.
11. **SEC-016 (INFO):** Add `useEffect` unmount cleanup for the password dialog state.
12. **SEC-019 (LOW) / SEC-014 (LOW):** No action; documented as passing.

---

## Verdict

**SHIPPING SPRINTS 1+2 AS-IS WILL PRODUCE A BROKEN SETTINGS SURFACE IN PRODUCTION.** The
backend cannot write to Firestore under the deployed rules. Sprint 3 cannot mark this "done".
Sprint 4 must own at minimum SEC-001 + SEC-002 + SEC-005 before re-audit.
