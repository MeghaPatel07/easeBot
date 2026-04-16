# Sprint 1 — Rohan Kapoor (Backend)

**Track:** Settings & User Profile redesign — backend foundation
**PRD:** `docs/prd-settings-profile.md` §8
**Status:** Complete (Sprint 1 scope)

## Backend confirmed at

`/Users/krish/Desktop/easebot/easebot-backend/` — Express + TypeScript, dev script `npm run dev` (nodemon + ts-node).

## Files created

- `easebot-backend/src/controllers/accountController.ts` — handlers + strict-auth wrapper + per-uid mutation limiter.
- `easebot-backend/src/routes/account.ts` — route module mapping the 11 endpoints.

## Files modified (registration only)

- `easebot-backend/src/app.ts`
  - Line 9: `import accountRouter from './routes/account'`
  - Line 77 (inside the existing `mountRoutes(prefix)` helper): `app.use(\`${prefix}/account\`, accountRouter)` — automatically gets mounted under both `/api/account` and `/api/v1/account`. No existing route touched.

No other existing file was modified.

## Endpoints

All resolve under both `/api/account/*` and `/api/v1/account/*` via the existing `mountRoutes('/api')` / `mountRoutes('/api/v1')` helper. File:line refers to `easebot-backend/src/routes/account.ts`.

| Method | Path | File:line | Handler | Status |
|---|---|---|---|---|
| GET    | `/api/account/me`              | routes/account.ts:24 | `handleGetMe`              | live |
| GET    | `/api/account/plan`            | routes/account.ts:25 | `handleGetPlan`            | live |
| GET    | `/api/account/export`          | routes/account.ts:26 | `handleExportStub`         | 501 stub |
| PATCH  | `/api/account/profile`         | routes/account.ts:29 | `handleUpdateProfile`      | live |
| POST   | `/api/account/photo`           | routes/account.ts:30 | `handleUploadPhotoStub`    | 501 stub |
| DELETE | `/api/account/photo`           | routes/account.ts:31 | `handleDeletePhoto`        | live |
| POST   | `/api/account/email/change`    | routes/account.ts:32 | `handleEmailChangeStub`    | 501 stub |
| POST   | `/api/account/password/change` | routes/account.ts:33 | `handlePasswordChangeStub` | 501 stub |
| POST   | `/api/account/plan/checkout`   | routes/account.ts:34 | `handleCheckoutStub`       | 501 stub |
| POST   | `/api/account/delete`          | routes/account.ts:35 | `handleSoftDelete`         | live (soft) |
| PATCH  | `/api/account/preferences`     | routes/account.ts:36 | `handleUpdatePreferences`  | live |

## Auth middleware

The shared middleware is `easebot-backend/src/middleware/auth.ts:11` — `requireAuth(req, res, next)`. It verifies a Firebase ID token via Identity Toolkit `accounts:lookup` and attaches `req.user = { uid, email }`. **Important:** it deliberately calls `next()` without setting `req.user` when no token is supplied, so anonymous (guest) requests can still reach chat/notes endpoints.

Account endpoints must never serve anonymous traffic, so I added a thin local wrapper inside the new controller (NOT a modification to the shared middleware):

- `accountController.ts:14` — `requireStrictAuth(req, res, next)` invokes the existing `requireAuth`, then 401s if `req.user?.uid` is missing.

This keeps the existing middleware semantics untouched while enforcing the stricter "must be logged in" contract for `/api/account/*`. `uid` is always read from `req.user.uid` (the verified token) — `req.body.uid` is never trusted.

## Validation approach

Lightweight hand-written type checks (no new deps). The codebase already has `zod` available, but the existing notes/checklists controllers use plain runtime checks, so I followed that pattern for consistency.

- `PATCH /profile` — strict allow-list of fields (`name`, `nickname`, `phone`, `phoneCountryCode`, `phoneNational`, `weddingDate`, `budget`, `partnerName`, `role`); per-field type checks; phone format regex; `weddingDate` parsed via `Date.parse`; `role` constrained to an enum; rejects unknown keys with 400; 400 if no valid fields supplied.
- `PATCH /preferences` — allow-list for `theme` (`system|light|dark`), `density` (`comfortable|compact`), `language` (non-empty string ≤ 16 chars), `notifications.{emailReminders,whatsappReminders,productUpdates,tips}` (all booleans), `dataTrainingOptOut` (boolean). Unknown keys rejected.
- All validation failures return `{ error, code: 'VALIDATION_ERROR' }` with 400.
- Success/error response shapes match existing controllers (notes/checklists) and the global `errorHandler` conventions: `{ error, code }` for failures, `{ ok: true, ... }` for mutations.

## Rate-limit strategy

The project has `express-rate-limit` (`apiRateLimiter`, `imageRateLimiter`) but those are IP-keyed and shared globally. The PRD requires **per-user** 10/min for mutations. Rather than reconfigure a shared limiter, I added a tiny in-memory token bucket scoped to the new file:

- `accountController.ts:32` — `rateLimitMutations` middleware.
- Map keyed on `req.user.uid`. 10 requests / 60 s window. On exhaustion: 429 with `{ error, code: 'RATE_LIMITED', retryAfterMs }`.
- Applied only to mutating routes (`POST`/`PATCH`/`DELETE`) in `routes/account.ts`. `GET /me`, `GET /plan`, `GET /export` skip it (they're idempotent and the existing global IP-based `apiRateLimiter` still applies upstream in `app.ts:67`).
- In-memory limiter is fine for single-instance dev. Multi-instance prod will need Redis or `express-rate-limit` with a shared store — flagged for a future sprint.

No new npm packages were installed.

## Firestore access

Reused the existing client SDK `db` from `easebot-backend/src/lib/firebase.ts:15` — same pattern as `notesService`, `checklistService`, `usageService`, `reminderService`. The PRD mentions "admin SDK" but the project does not currently use `firebase-admin` anywhere (`grep -r firebase-admin src/` → 0 hits). To stay consistent with existing patterns and avoid adding a new dependency / re-init in this sprint, I stuck with the client SDK that's already wired and known-working. Switching to admin SDK can be a follow-up sprint with a single coordinated change point.

User doc path: `users/{uid}` (matches all existing services).

Defaults applied when fields are missing:
- `plan = 'free'`
- `usage = { messagesUsed: 0, messagesAllowed: 100, periodStart: null, periodEnd: null }`

## Verification

- `npx tsc --noEmit` → exit 0 (clean)
- `PORT=3099 ENABLE_REMINDER_SCHEDULER=false npm run dev` → boots cleanly:
  ```
  [easebot] Server running on http://0.0.0.0:3099
  [easebot] Speech & Translation pipeline: ON
  [easebot] Reminder scheduler disabled via env
  ```
- `curl http://localhost:3099/api/account/me` (no Authorization header) →
  ```
  HTTP 401
  {"error":"Authentication required","code":"UNAUTHORIZED"}
  ```
- `curl -H "Authorization: Bearer not-a-real-token" http://localhost:3099/api/account/me` →
  ```
  HTTP 401
  {"error":"Invalid or expired token"}
  ```
- Server killed after verification.

## Constraints respected

- No Firebase deploy.
- No edits to `firestore.rules`, `storage.rules`, `firebase.json`, or any `functions/` directory.
- No existing route, controller, middleware, or service was modified — only added two new files plus a single import + single mount line in `app.ts`.
- No new npm packages installed.
- No secrets hardcoded; auth path reuses `process.env.FIREBASE_API_KEY` already wired in `middleware/auth.ts`.
