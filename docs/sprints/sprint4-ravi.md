# Sprint 4 — Ravi Desai (Backend)

**Owner:** Ravi Desai, Senior Backend Engineer
**Scope:** SEC-001, SEC-002, SEC-004, SEC-009 from Elena Volkova's Sprint 3 audit.
**Out of scope:** firestore.rules, storage.rules, firebase.json, functions/, any
controller other than `accountController.ts`, `reminderScheduler.ts` (Liu Wei).

---

## Summary of changes

### 1. `firebase-admin` installed
- Added the `firebase-admin` npm package to `easebot-backend`. Local install only;
  nothing deployed to Firebase.

### 2. New: `easebot-backend/src/lib/firebaseAdmin.ts`
- Singleton initializer for the Admin SDK.
- Credential resolution order:
  1. `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON string)
  2. `GOOGLE_APPLICATION_CREDENTIALS` (file path; consumed by `applicationDefault()`)
  3. `applicationDefault()` fallback with a `console.warn` if neither env var is set.
- Exports: `adminApp`, `adminAuth`, `adminDb`.
- The legacy client `lib/firebase.ts` is left intact — every other controller/service
  in the codebase still uses the client SDK as it does today.

### 3. `middleware/auth.ts` — verifyIdToken (SEC-002)
- Replaced the Identity Toolkit `accounts:lookup` REST call with
  `adminAuth.verifyIdToken(token, /* checkRevoked */ true)`.
- Anonymous (no-token) pass-through behavior PRESERVED — required by chat/notes/etc.
- Invalid/expired tokens → `401`. Valid tokens → `req.user = { uid, email, ... }`.
- `FIREBASE_API_KEY` is no longer used here (still referenced by other code paths
  outside this sprint's scope).

### 4. `controllers/accountController.ts` — admin Firestore + new features (SEC-001, SEC-004, SEC-009)
- All Firestore reads/writes now use `adminDb` (no more client `db`).
  Per-user authorization continues to be enforced in-controller via `req.user.uid`.
- `serverTimestamp` and `deleteField` switched to `firebase-admin/firestore` `FieldValue`.
- Added a **second rate-limit bucket**: `rateLimitSensitive` — 5/hour/uid — for
  `email/change`, `password/change`, `delete`, and the new `sign-out-everywhere`.
  The 10/min/uid bucket (`rateLimitMutations`) is still applied to all mutations
  including the sensitive ones (defense in depth).
- **Deletion gate** in `requireStrictAuth`: after `verifyIdToken` succeeds, the
  middleware checks the user doc's `deletionPending` flag. If `true`, responds
  `403 { error: 'Account pending deletion', code: 'ACCOUNT_DELETED' }`. The check
  is **skipped** for `GET /me` and `POST /delete` so users can still observe and
  cancel. A 30-second per-uid cache (`deletionCache`) avoids a Firestore read on
  every request.
- `handleSoftDelete` now calls `adminAuth.revokeRefreshTokens(uid)` after marking
  `deletionPending: true`. The deletion cache is invalidated immediately so the
  gate fires on the next call. Revoke errors are logged but do not fail the
  delete (the soft-delete flag is the source of truth).
- New handler `handleSignOutEverywhere`: calls `revokeRefreshTokens(uid)` and
  responds `200 { ok: true, message: 'Signed out on all devices' }`.

### 5. `routes/account.ts`
- New route `POST /api/account/sign-out-everywhere`.
- Sensitive endpoints now layered with both `rateLimitMutations` AND `rateLimitSensitive`.

---

## New / required env vars

| Var                              | Required?                        | Purpose                                                    |
|----------------------------------|----------------------------------|------------------------------------------------------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON`  | one of these two in production   | Full service-account JSON (preferred; fits Secret Manager) |
| `GOOGLE_APPLICATION_CREDENTIALS` | one of these two in production   | Path to the service-account JSON file on disk              |

If neither is set, the backend will boot with a `console.warn` and fall back to
`applicationDefault()`. Admin SDK calls will fail until credentials are provided.
The server **does not crash** in this state, intentionally — local development
against the emulator can still proceed.

`FIREBASE_API_KEY` is no longer read by `middleware/auth.ts`. It is still used
by the legacy client SDK init in `lib/firebase.ts` (kept for the rest of the
codebase) and may be removed in a future sprint that migrates remaining services.

---

## Verification

- `npx tsc --noEmit` in `easebot-backend` → **0 errors**.
- `PORT=39411 npx ts-node src/server.ts` (no creds) →
  - logs the credential warning,
  - server starts on port 39411,
  - reminderScheduler starts as expected,
  - graceful SIGTERM shutdown is clean.
- No `firebase deploy`, `gcloud`, or rules edits were performed.
- Other controllers and services were not modified; they continue to use the
  client SDK and compile clean.

---

## Things explicitly NOT done (out of scope)

- SEC-005 (notifications preference enforcement in reminderScheduler) — Liu Wei
  owns this in parallel.
- SEC-006 (whitelist `/me` response shape).
- SEC-008 (CORS lockdown).
- SEC-020 (delete-flow UX reconciliation).
- Migrating notes/checklists/usage/timeline/etc. services from client SDK to
  Admin SDK. Out of scope for this fix; tracked for a follow-up sprint.
