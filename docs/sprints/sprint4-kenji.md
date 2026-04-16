# Sprint 4 — Kenji Sato, Senior Full-Stack Engineer

**Date:** 2026-04-14
**Scope:** Frontend critical + major bug fixes from Marcus's Sprint 3 QA report
(C-1 delete account, M-5 email change, M-6/M-7 lying mutations, password change,
M-9 phone rollback) plus two industry-gap features (custom instructions,
sign-out-everywhere).

**Constraint:** Touch ONLY these five files: `useAccount.ts`, `AccountTab.tsx`,
`PersonalizationTab.tsx`, `accountService.ts`, `types/index.ts`. No backend, no
new packages, no Firebase deploy, no rules.

---

## Files changed

1. `Wedding-Ease-Viva-Chat/src/hooks/useAccount.ts`
2. `Wedding-Ease-Viva-Chat/src/services/accountService.ts`
3. `Wedding-Ease-Viva-Chat/src/types/index.ts`
4. `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx`
5. `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PersonalizationTab.tsx`

---

## Fixes

### Bug M-6 / M-7 — useAccount mutations no longer lie
`updateProfile` and `updatePreferences` previously caught and `console.warn`ed
all errors, then resolved as if everything was fine. AccountTab's own
`try/catch` was therefore unreachable on real failures and users saw a green
"Profile updated" toast even when the backend 500'd.

The new implementation re-throws the structured `AccountServiceError` from the
mutation and exposes a `MutationResult = { ok, error? }` shape plus
`isUpdatingProfile` / `isUpdatingPreferences` for callers that prefer to bind
to the TanStack Query state. Every existing call site already uses
`try/catch`, so they immediately benefit without modification.

### Bug C-1 — Delete account button now actually deletes
- Added `accountService.deleteAccount()` → `DELETE /api/account/delete`.
- `handleSubmitDelete` calls it inside the dialog. On success it calls
  `auth.signOut()` and `window.location.href = '/'`. On failure it shows a
  destructive toast and leaves the dialog open so the user can retry.
- The case-sensitive email-match gate is preserved.

### Bug M-6 — Real password change (Firebase Auth client-side)
`handleSubmitPasswordChange` now performs:
1. `EmailAuthProvider.credential(currentEmail, currentPassword)`
2. `reauthenticateWithCredential(auth.currentUser, cred)`
3. `updatePassword(auth.currentUser, newPassword)`

All five strength rules are still enforced via `passwordIsStrong()`. Firebase
error codes (`auth/wrong-password`, `auth/invalid-credential`,
`auth/weak-password`, `auth/too-many-requests`, `auth/requires-recent-login`)
are mapped to human messages. Plaintext lives only in component state and is
wiped on `closePasswordDialog()`. Nothing is logged. There is **no** backend
call — the previous "501 stub" path is gone.

### Bug M-5 — Real email change with reauth
`handleSubmitEmailChange` now:
- Validates the new address with a simple regex.
- Detects provider via `hasPasswordProvider` / `hasGoogleProvider`.
- Reauths via `reauthenticateWithCredential` (password) or
  `reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider())` (Google).
- Calls `verifyBeforeUpdateEmail(auth.currentUser, newEmail)` so Firebase
  sends the verification mail and updates the address only on click-through.
- Surfaces a "Verification sent to <newEmail>" toast.
- Maps `auth/wrong-password`, `auth/invalid-email`, `auth/email-already-in-use`,
  `auth/too-many-requests`, `auth/requires-recent-login`, and
  `auth/popup-closed-by-user`.
- Does **not** write Firestore — Firebase propagates on verification.

The submit button is now disabled until the email validates and (for password
users) the current password is filled.

### Bug M-9 — Phone rollback
The identity rollback snapshot now includes `phoneCountryCode` and
`phoneNational` alongside `name` and `nickname`. A failed save no longer leaves
the form in a stale-edit state.

### Industry-gap #2 — Custom instructions card (PersonalizationTab)
New "Custom instructions" card with two `<Textarea>` fields:
- "What should Easebot know about you?" → `profile.about`
- "How should Easebot respond?" → `profile.responseStyle`

Both have a 1500-char hard cap, a live counter, optimistic save, and rollback
on failure via the now-honest `updateProfile`. Added optional `about?: string`
and `responseStyle?: string` to `UserProfile` in `types/index.ts` and to
`ProfilePatch` in `accountService.ts`.

### Sign out everywhere
New non-destructive button inside the Connected Accounts card. Calls
`accountService.signOutEverywhere()` →
`POST /api/account/sign-out-everywhere`. On success: `auth.signOut()` then
redirect to `/`. On failure: destructive toast, button re-enabled.

---

## NEW backend dependency — flag for Ravi / Liu

1. **`POST /api/account/sign-out-everywhere`** — Ravi is adding this in
   parallel. Endpoint must reauthorize the caller, then revoke refresh tokens
   for every session (Firebase Admin `revokeRefreshTokens(uid)`) and return
   204. The frontend already calls it.

2. **`PATCH /api/account/profile` allow-list** — the frontend now sends
   `about` and `responseStyle` on the custom-instructions save. The current
   backend whitelist will silently drop them. **Action:** Ravi/Liu must add
   both fields to the profile patch schema and persist them alongside the
   other free-form profile fields. Until then the feature is UX-only — values
   are not stored. Acceptable for the demo per Sprint 4 spec.

3. **`DELETE /api/account/delete`** — already "live (soft)" per Marcus's QA
   notes. The frontend now actually invokes it; please confirm it returns 204
   on success and a non-2xx on failure.

---

## Constraints honoured

- **Files touched:** exactly the five listed above. No other files modified.
- **No new dependencies:** all Firebase Auth helpers (`EmailAuthProvider`,
  `GoogleAuthProvider`, `reauthenticateWithCredential`,
  `reauthenticateWithPopup`, `updatePassword`, `verifyBeforeUpdateEmail`) come
  from the already-installed `firebase/auth` package.
- **No backend, no Firebase deploy, no rules.**
- **No plaintext logging** — passwords never leave component state and are
  wiped on dialog close in every code path.
- **Errors surface to UI** — silent swallows removed from `useAccount`.

---

## Build result

`npm run build` from `Wedding-Ease-Viva-Chat/`:
```
vite v5.4.10 building for production...
✓ 3763 modules transformed.
✓ built in 4.27s
```
Zero TypeScript errors, zero new warnings (pre-existing 1.15 MB chunk size
warning unchanged — out of scope, called out in Marcus's report).

## Manual verification

- `/?settings=account` renders.
- Delete button → `apiDeleteAccount()` → `auth.signOut()` → redirect (traced).
- Change password → `EmailAuthProvider.credential` →
  `reauthenticateWithCredential` → `updatePassword` (traced).
- Change email → reauth → `verifyBeforeUpdateEmail` (traced).
- Identity save failure path: rollback snapshot now restores all four fields
  including phone (traced through `handleSaveIdentity`).
- Custom instructions save failure path: rollback restores both textareas.
