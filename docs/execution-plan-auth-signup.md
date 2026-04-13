# Execution Plan — Section 1: Auth & Sign-Up Flow

Source: `docs/improvement.md` §1
Scope: 4 items — (1.1) Google OAuth verification, (1.2) Country code dropdown, (1.3) Password strength, (1.4) Duplicate account detection across Email + Google OAuth.

Stack snapshot (verified in repo):
- Firebase Auth (client SDK 12.10.0) + Firestore, project `wedding-ease-dc99a`
- Firebase Admin SDK 12.2.0 on Express backend (token verify only)
- Forms: plain React state in `SignUpModal.tsx` / `SignInModal.tsx` (no RHF/Zod in auth forms)
- All auth logic centralised in `src/services/authService.ts`
- Users keyed by Firebase UID at Firestore `users/{uid}`; UserProfile type at `src/types/index.ts:49-72`

Primary files this plan touches:
- `Wedding-Ease-Viva-Chat/src/services/authService.ts`
- `Wedding-Ease-Viva-Chat/src/components/auth/SignUpModal.tsx`
- `Wedding-Ease-Viva-Chat/src/components/auth/SignInModal.tsx`
- `Wedding-Ease-Viva-Chat/src/types/index.ts`
- `Wedding-Ease-Viva-Chat/firestore.rules` (index only)
- Firebase/Google Cloud Console (out-of-repo config)

---

## 1.1 — Google OAuth "unverified app" warning

### Root cause
This warning is **not a code bug**. It comes from Google Cloud's OAuth consent screen being in **Testing** mode for project `wedding-ease-dc99a`, combined with a **sensitive scope** (`https://www.googleapis.com/auth/calendar`) being requested at `authService.ts:195`. Sensitive + restricted scopes trigger Google's unverified-app interstitial until the OAuth consent screen is submitted for verification and approved.

### Execution steps (Google Cloud + Firebase Console — no repo changes required for the warning itself, but repo changes to tighten scope usage)

**Phase A — Console configuration (owner: project admin)**
1. Open Google Cloud Console → project `wedding-ease-dc99a` → **APIs & Services → OAuth consent screen**.
2. Set **User Type = External**, **Publishing status = In production**.
3. Fill App information:
   - App name: `WeddingEase`
   - User support email: support@weddingease.ai (confirm exact address with founder)
   - App logo: upload 120×120 WeddingEase logo (PNG, <1 MB)
   - Application home page: `https://weddingease.ai`
   - Privacy policy: `https://weddingease.ai/privacy`
   - Terms of service: `https://weddingease.ai/terms`
   - Authorized domains: `weddingease.ai`, `wedding-ease-dc99a.firebaseapp.com`
   - Developer contact email
4. **Scopes**: add exactly what is requested in code today. Right now `authService.ts:195` requests `.../auth/calendar` (a **sensitive + restricted** scope). Two options:
   - **Preferred (fast path):** downgrade scope until Calendar is actually used in production. Delete line 195 (see Phase B). Only `openid`, `email`, `profile` (non-sensitive) will be requested → **no verification needed → warning disappears immediately**.
   - **Full path:** keep calendar scope and submit for Google verification. This requires: a recorded demo video showing the OAuth flow and scope usage, a published privacy policy, domain verification via Google Search Console, and 4–6 weeks of Google review. Only do this if Calendar integration is an immediate launch requirement.
5. Add production domain to **Firebase Console → Authentication → Settings → Authorized domains** (`weddingease.ai` and any staging subdomain). This is independent of the warning but required before public launch.

**Phase B — Repo changes to match the chosen scope path**

*If taking the preferred (fast) path:*
- File: `Wedding-Ease-Viva-Chat/src/services/authService.ts`
- Delete line 195: `provider.addScope('https://www.googleapis.com/auth/calendar')`
- Remove `googleAccessToken` plumbing on lines 207–208, 225, 232, and return value on line 236. Simplify return type on line 193 to `Promise<import('firebase/auth').User>`.
- Remove `googleCalendarToken` field from `UserProfile` (`src/types/index.ts`) and from `buildNewUserDoc` (line 88). Ripgrep `googleCalendarToken` to catch call sites before deleting the field.
- Add a short comment at the top of `signInWithGoogleAuth`: `// Only requests default openid+email+profile scopes. Calendar access, when added, must go through incremental consent after Google verification is complete.`

*If taking the full path:*
- Keep code as-is.
- Add a gating env flag `VITE_GOOGLE_CALENDAR_ENABLED` checked before `provider.addScope(...)`, so dev/staging (unverified) and prod (verified) can diverge cleanly.

**Acceptance criteria**
- New incognito Google sign-in on staging shows the normal Google account chooser with **no "Google hasn't verified this app"** screen.
- `signInWithGoogleAuth` still returns a signed-in Firebase user and creates/updates the Firestore user doc.
- Existing users with `googleCalendarToken` in Firestore are unaffected (field is ignored if removed, or retained if keeping the flag).

**Risks**
- Dropping the calendar scope breaks any code path that reads `googleCalendarToken`. Ripgrep before deleting.
- Changing OAuth consent screen while users are mid-session has **no session impact** (existing ID tokens remain valid); only new consent prompts are affected.

---

## 1.2 — Country code dropdown for phone

### Current state
- Signup phone input: `SignUpModal.tsx:173` — single free-text `Input type="tel"` bound to `form.phone`.
- Sign-in phone OTP input: `SignInModal.tsx:431-441` — same pattern, bound to local `phone` state.
- Firestore shape: `UserProfile.phone: string | null` (`types/index.ts:53`) — stored exactly as typed.
- Phone duplicate check: `authService.ts:110-117` — `where('phone', '==', phone)` equality match on raw string.
- OTP send: `authService.ts:245-250` — `signInWithPhoneNumber(auth, phoneNumber, …)` requires E.164 (`+<country><number>`); currently depends on user typing the `+` prefix correctly.
- No phone library installed. No validation schema.

### Execution steps

**Step 1 — Install `libphonenumber-js`**
```
cd Wedding-Ease-Viva-Chat
npm install libphonenumber-js
```
~145 KB, tree-shakeable, used by every major auth product. It provides country metadata, E.164 formatting, and validation.

**Step 2 — Create reusable PhoneInput component**
- New file: `Wedding-Ease-Viva-Chat/src/components/auth/PhoneInput.tsx`
- Props: `{ value: { countryCode: string; national: string }; onChange: (v) => void; error?: string; disabled?: boolean }`
- Renders a `Select` (use existing `@/components/ui/select`) for country code beside the existing `Input`.
- Country list: derived from `getCountries()` + `getCountryCallingCode()` in `libphonenumber-js/min`. Sort alphabetically by country name. Default to `IN` (India) since WeddingEase is India-first and PayU is the stated primary gateway (`improvement.md` §2).
- Display format in dropdown: `🇮🇳 India (+91)`. Flags can be unicode regex from ISO2 → regional indicator symbols (8 lines of code; no additional dep).
- Internally, the component's `onChange` should emit **both** parts so the parent can store the split form and derive E.164 on submit.

**Step 3 — Update `UserProfile` type**
- File: `src/types/index.ts:53`
- Replace `phone: string | null` with:
  ```ts
  phone: string | null              // E.164, e.g. "+919876543210" — canonical form used for equality checks and Firebase Phone Auth
  phoneCountryCode: string | null   // ISO-3166-1 alpha-2, e.g. "IN" — preserved so UI can re-render the dropdown
  phoneNational: string | null      // the national-significant part as entered, e.g. "9876543210"
  ```
- Update `buildNewUserDoc` (`authService.ts:61-90`) to accept and persist all three fields. Keep `phone` as the canonical E.164 for backwards-compatible equality queries.

**Step 4 — Wire `SignUpModal.tsx`**
- Change `initialForm` (line 33) to:
  ```ts
  const initialForm = { name: '', email: '', phoneCountry: 'IN', phoneNational: '', password: '', confirmPassword: '', terms: false }
  ```
- Replace the phone input block at lines 170–174 with `<PhoneInput value={{ countryCode: form.phoneCountry, national: form.phoneNational }} onChange={…} error={errors.phoneNational} />`.
- In `validate()` (line 49), if `form.phoneNational` is non-empty, validate with `isValidPhoneNumber(national, country)` from `libphonenumber-js`; on failure set `errors.phoneNational = 'Enter a valid phone number'`.
- In `handleSubmit()` (line 60), before calling `signUp`, convert to E.164:
  ```ts
  const e164 = form.phoneNational
    ? parsePhoneNumber(form.phoneNational, form.phoneCountry as CountryCode).number
    : null
  ```
  Pass `e164` (canonical) plus the split fields through a revised `signUp` signature.

**Step 5 — Update `signUpWithEmail` signature**
- `authService.ts:94-135` — change phone parameter from `phone: string | null` to a structured object `phone: { e164: string; countryCode: string; national: string } | null`.
- Update the duplicate check on line 112 to match on canonical E.164: `where('phone', '==', phone.e164)`. This is a **breaking equality check**: any existing Firestore docs with non-E.164 phone strings will not collide with new normalized values. Acceptable pre-launch; needs a one-time migration (see Step 7) if production data already exists.
- Update `buildNewUserDoc` call on line 122 to pass the new split fields.

**Step 6 — Wire `SignInModal.tsx`**
- Lines 431–441 (phone tab): replace the `Input` with `<PhoneInput …/>` identically.
- Wherever the component calls `sendPhoneOtp(phone, recaptcha)`, pass the E.164 string built from `parsePhoneNumber(national, country).number`.
- Verify OTP flow (`authService.ts:252-270`): the `where('phone', '==', user.phoneNumber)` check on line 260 already uses E.164 because Firebase returns E.164 in `user.phoneNumber`. This now works correctly because new signups store E.164 in the same format.

**Step 7 — One-time backfill (only if production users exist)**
- New script: `Wedding-Ease-Viva-Chat/scripts/backfill-phone-e164.ts` — iterate `users` collection; for each doc with a non-null `phone`, attempt `parsePhoneNumber(phone)`; if parseable, write back canonical E.164 + split fields; if not, log and leave a sentinel for manual review.
- Run against staging first, commit to git, run against prod with explicit founder approval.

**Step 8 — Firestore index**
- `firestore.rules` (or Firebase Console → Indexes) — no composite index needed, but confirm the single-field index on `phone` exists (Firestore auto-indexes single fields by default).

**Acceptance criteria**
- On signup, user can pick country from dropdown; national number input rejects invalid formats inline.
- Stored Firestore doc has `phone` in E.164 (e.g. `+919876543210`), `phoneCountryCode: "IN"`, `phoneNational: "9876543210"`.
- Phone OTP sign-in with the same user succeeds without manual `+` typing.
- Duplicate phone detection catches `+919876543210` vs `09876543210` vs `9876543210` entered in India.

**Risks**
- Bundle size: `libphonenumber-js/min` is ~145 KB. Import from `libphonenumber-js/min` not the full package to keep it small.
- Existing non-E.164 Firestore data breaks duplicate detection until backfill runs.

---

## 1.3 — Password strength enforcement

### Current state
- Only rule: `form.password.length < 6` at `SignUpModal.tsx:53`.
- Error map entry at `authService.ts:39` still claims "at least 6 characters".
- No shared password validator, no Zod schema in auth forms, no strength meter.
- Firebase Auth's own `auth/weak-password` only fires at <6 chars on the server side — cannot be relied upon to enforce complexity.

### Industry baseline (NIST 800-63B + OWASP ASVS 4.0 adapted for 2026)
- **Minimum length: 10** (NIST says 8 min; OWASP ASVS L2 says 12; 10 is a defensible middle ground for consumer product and matches what ChatGPT, Notion, Linear use).
- At least one lowercase letter.
- At least one uppercase letter.
- At least one digit.
- At least one symbol from `!@#$%^&*()_+-=[]{};':"\|,.<>/?~` `.
- **Reject top-N common passwords** — ship a small denylist (top 1,000 from SecLists `10k-most-common.txt`, trimmed) embedded at build time.
- Explicitly do **not** enforce forced rotation — NIST deprecates that. No expiry.
- Max length 128 (prevents DoS via `createUserWithEmailAndPassword`).

### Execution steps

**Step 1 — Shared validator**
- New file: `Wedding-Ease-Viva-Chat/src/utils/passwordPolicy.ts`
- Exports:
  ```ts
  export const PASSWORD_MIN_LENGTH = 10
  export const PASSWORD_MAX_LENGTH = 128
  export type PasswordIssue = 'tooShort' | 'tooLong' | 'missingLower' | 'missingUpper' | 'missingDigit' | 'missingSymbol' | 'tooCommon'
  export function validatePassword(pw: string): { ok: boolean; issues: PasswordIssue[]; score: 0|1|2|3|4 }
  export function describeIssue(i: PasswordIssue): string
  ```
- Embed denylist as a `Set<string>` from a generated `commonPasswords.ts` (run a one-off script that reads SecLists and writes the top 1000 into a TS export; commit the generated file; do not fetch at runtime).
- `score` is a simple 0–4 bucket based on number of classes satisfied + length bonus — powers the strength meter without pulling in `zxcvbn` (which is ~800 KB).

**Step 2 — Use it in `SignUpModal.tsx`**
- Replace line 53 with:
  ```ts
  const { ok, issues } = validatePassword(form.password)
  if (!ok) e.password = issues.map(describeIssue).join(' · ')
  ```
- Update placeholder on line 179 from `"Min 6 characters"` to `"At least 10 characters, mixed case, digit, symbol"`.
- Add a live strength meter below the password input: a 4-segment bar bound to `validatePassword(form.password).score`, colored grey→red→orange→yellow→green. Re-evaluate on every `onChange`.
- Add a show/hide password toggle (eye icon from `lucide-react`) — small usability win that makes a strict policy less frustrating.

**Step 3 — Use it in forgot-password flow**
- `SignInModal.tsx` forgot-password step (search for `sendForgotPasswordEmail` usage) — Firebase reset link currently lets users set any password ≥6 chars. **This is a gap Firebase handles server-side and we cannot override from the client**. Document as a known limitation; the practical mitigation is Firebase Auth's built-in `auth/weak-password` (≥6) plus the reset email only being triggered from our flow for existing accounts.
- Best we can do: add a note in the reset-password UI telling the user the policy, so they set a strong password on the Firebase-hosted reset page. Low effort, partial coverage.

**Step 4 — Update error map**
- `authService.ts:39` — change message to `"Password does not meet strength requirements"`. Keep the key `auth/weak-password` as Firebase's server-side rejection fallback.

**Step 5 — Tests**
- New file: `Wedding-Ease-Viva-Chat/src/utils/passwordPolicy.test.ts` (if Vitest is configured — check `package.json`; if not, defer tests and rely on manual QA).
- Cases: empty, 9-char strong, 10-char missing symbol, 10-char all classes, 129-char, `"Password1!"` (in denylist — should reject), unicode password (should accept if length passes — do not reject unicode).

**Acceptance criteria**
- `"password"` → rejected (too short, no upper, no digit, no symbol, common).
- `"Password1!"` → rejected (common).
- `"Sunset#Violin42"` → accepted, score 4.
- Strength meter updates on each keystroke with no noticeable lag.

**Risks**
- Users with weak existing passwords are **not** force-rotated (intentional; NIST guidance). New policy applies to signups and manual resets only.
- Denylist is a snapshot — update annually.

---

## 1.4 — Duplicate account detection (Email + Google OAuth merge)

### Current state and exact failure
- Firestore keyed by Firebase UID: `users/{uid}` (`authService.ts:122`, `211`, `220`).
- Firebase Auth's default setting is **"One account per email address"** (confirm in Firebase Console → Authentication → Settings → User actions). When enabled, attempting to `signInWithPopup(Google)` for an email that already has a `password` provider throws `auth/account-exists-with-different-credential` — **but the current code at `authService.ts:198-205` catches any error and just rethrows with `makeAuthError(err.code)`**. There is no handler that recognises this specific code and guides the user to merge.
- Conversely, creating a new email/password account for an email that already has a Google provider throws `auth/email-already-in-use` on line 104; `SignUpModal.tsx:75-78` catches it and silently switches the user to the sign-in modal with no explanation.
- No call to `fetchSignInMethodsForEmail`, no `linkWithCredential` anywhere in the codebase.

**The fix is not to create two UIDs and reconcile them.** It is to use Firebase's built-in provider linking so the Firebase UID stays stable and all providers point at the same `users/{uid}` Firestore doc.

### Chosen strategy — "Google OAuth wins, link password on first collision"
Rationale (matches `improvement.md` wording "preferring the Google OAuth login"):
- Google is a stronger identity proof than a password.
- Users who signed up with email/password and later click "Continue with Google" should land in the same account; their password remains linked so they can still sign in with email/password.
- New sign-ups must be blocked from creating a second email/password account when Google already owns that email.

### Execution steps

**Step 1 — Verify the Firebase Auth project setting**
- Firebase Console → Authentication → Settings → "Multiple accounts per email address" — **must be OFF** (i.e. "One account per email address" ON). This is the default; confirm it is still set. If it is currently OFF, switching it may require merging existing duplicate accounts before the flip. Check user count first; if zero collisions exist, flip and proceed.

**Step 2 — Add `fetchSignInMethodsForEmail` preflight to signup**
- File: `authService.ts`, inside `signUpWithEmail` (lines 94–135).
- Before `createUserWithEmailAndPassword` on line 102, add:
  ```ts
  const methods = await fetchSignInMethodsForEmail(auth, email)
  if (methods.includes('google.com')) {
    throw makeAuthError('EMAIL_OWNED_BY_GOOGLE')
  }
  if (methods.includes('password')) {
    throw makeAuthError('auth/email-already-in-use')
  }
  ```
- Add `'EMAIL_OWNED_BY_GOOGLE'` to the error map (line 32) with message `"This email is registered with Google. Please continue with Google."`
- Import `fetchSignInMethodsForEmail` at the top of the file.

**Step 3 — Handle `EMAIL_OWNED_BY_GOOGLE` in `SignUpModal.tsx`**
- File: `SignUpModal.tsx`, `handleSubmit` function (lines 60–85).
- Extend the catch branch on line 74:
  ```ts
  } else if (err.code === 'EMAIL_OWNED_BY_GOOGLE') {
    setAuthError('This email is already registered with Google. Click "Continue with Google" above.')
  }
  ```
- Optional polish: auto-highlight the Google button when this error fires.

**Step 4 — Handle the reverse direction in Google OAuth**
- File: `authService.ts`, `signInWithGoogleAuth` (lines 193–237).
- Catch `auth/account-exists-with-different-credential` explicitly:
  ```ts
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') { … }
    if (err.code === 'auth/account-exists-with-different-credential') {
      // Email already owns a password account. Surface a flow that asks user for their password,
      // signs them in with password, then links the Google credential to that UID.
      throw makeAuthError('LINK_GOOGLE_TO_PASSWORD', { email: err.customData?.email, pendingCred: GoogleAuthProvider.credentialFromError(err) })
    }
    throw makeAuthError(err.code ?? err.message)
  }
  ```
- Extend `AuthFlowError` type (`types/index.ts`, search for `AuthFlowError`) to carry `pendingCred?: AuthCredential` and `email?: string`.

**Step 5 — Link-on-password UX in `SignInModal.tsx`**
- When `SignInModal` or `SignUpModal` receives `LINK_GOOGLE_TO_PASSWORD`, open an inline "link accounts" step:
  - Prefill email (read-only) from `err.email`.
  - Prompt: "An account with this email already exists. Enter your password to link your Google account."
  - Password input + submit → call a new helper `linkPendingGoogleCredential(email, password, pendingCred)`:
    ```ts
    export async function linkPendingGoogleCredential(email, password, pendingCred) {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      await linkWithCredential(cred.user, pendingCred)
      await updateDoc(doc(db, 'users', cred.user.uid), {
        isVerified: true, isValidated: true, lastLoginAt: serverTimestamp(),
      })
      return cred.user
    }
    ```
  - Imports: `linkWithCredential` from `firebase/auth`.
- After linking, the same `users/{uid}` doc is shared by both providers; no duplicate Firestore data exists.

**Step 6 — "Forgot password" path when user only has Google**
- `sendForgotPasswordEmail` (`authService.ts:274-282`) currently checks Firestore for the email. Add a methods check:
  ```ts
  const methods = await fetchSignInMethodsForEmail(auth, email)
  if (!methods.includes('password') && methods.includes('google.com')) {
    throw makeAuthError('EMAIL_OWNED_BY_GOOGLE')
  }
  ```
- This prevents the confusing "we sent you a reset link" response when the account has no password to reset.

**Step 7 — Decide what to do on Google sign-in when email is already `isVerified=false`**
- Edge case: user signed up with email/password, **never verified**, then tries Google.
- `createUserWithEmailAndPassword` already created a Firebase Auth user. Firebase's "one account per email" will refuse to create a second provider on that UID without linking, so Google popup will throw `account-exists-with-different-credential`.
- Desired behavior: allow the Google popup to proceed, link the Google credential to the unverified-password UID, mark `isVerified: true` (Google already verified the email), and continue. Step 5's helper handles this cleanly if the user remembers their password. If they do not, fall back to the "delete unverified stub and recreate via Google" escape hatch — but that requires Admin SDK and cannot be done client-side. Add a backend endpoint `POST /auth/reclaim-unverified` protected by a fresh-challenge email OTP if this becomes a recurring support issue post-launch. **Out of scope for v1** — document as a known edge case.

**Step 8 — Tests / manual QA matrix**
| Starting state | Action | Expected |
|---|---|---|
| No account | Signup email/password | Account created, verify email sent |
| Password account exists, verified | Click "Continue with Google" | Prompted for password, linked, signed in on same UID |
| Google account exists | Signup email/password | Blocked with `EMAIL_OWNED_BY_GOOGLE` message |
| Google account exists | Forgot password | Blocked with `EMAIL_OWNED_BY_GOOGLE` message |
| Password + Google already linked | Sign in with either | Works, single UID |
| Unverified password stub | Continue with Google | Either: linked if user enters password, or documented failure |

### Acceptance criteria
- Impossible to end up with two Firebase Auth users (two UIDs) for the same email address.
- `fetchSignInMethodsForEmail` is consulted on every email-collision boundary (signup, Google popup error, forgot-password).
- All flows that end with a signed-in user point at a single `users/{uid}` Firestore doc.
- Google popup errors are surfaced to the user as clear, recoverable prompts — not raw Firebase codes.

### Risks
- `linkWithCredential` requires the user to prove the other factor (the password). Users who forgot their password cannot auto-link. Mitigation: the forgot-password flow already exists; users can reset password, sign in, and then link Google from a future "Settings → Connected accounts" screen. Consider adding that settings screen as part of §5 (Settings & Profile) — cross-reference in the improvement doc.
- Firebase Console "One account per email" setting changes are global and non-trivial to reverse. Verify once, do not toggle in prod.

---

## Execution order, dependencies, and rollout

Recommended order (lowest risk → highest):
1. **1.3 Password strength** — self-contained, pure validation, no data migration. ~0.5 day.
2. **1.2 Country code dropdown** — depends on schema change + optional data backfill. ~1 day + backfill window.
3. **1.4 Duplicate account detection** — depends on nothing in repo but needs Firebase Console verification. ~1 day.
4. **1.1 Google OAuth warning** — mostly out-of-repo console work; repo cleanup is trivial. Can be done in parallel. Console approval may take weeks if taking the full verification path.

Single branch per item; single PR per item. Each PR:
- Runs existing typecheck and lint.
- Includes a short `docs/` note if user-facing copy changes.
- Must be tested on staging against the real Firebase project before merging to `main`.

Staging verification gate for all four: the **QA matrix** in §1.4 Step 8 plus a signup → verify → sign in → Google-link full round-trip, executed by a human on staging.

---

## Files to be touched (summary)

| File | Items | Change type |
|---|---|---|
| `src/services/authService.ts` | 1.1, 1.2, 1.4 | Modify — add `fetchSignInMethodsForEmail`, `linkWithCredential`, structured phone, optional scope removal |
| `src/components/auth/SignUpModal.tsx` | 1.2, 1.3, 1.4 | Modify — PhoneInput wiring, password policy wiring, new error branches |
| `src/components/auth/SignInModal.tsx` | 1.2, 1.4 | Modify — PhoneInput in phone tab, account-link inline step |
| `src/components/auth/PhoneInput.tsx` | 1.2 | **New** |
| `src/utils/passwordPolicy.ts` | 1.3 | **New** |
| `src/utils/commonPasswords.ts` | 1.3 | **New** (generated) |
| `src/types/index.ts` | 1.2, 1.4 | Modify — `UserProfile` phone fields, `AuthFlowError` pendingCred |
| `scripts/backfill-phone-e164.ts` | 1.2 | **New** (one-off, only if prod users exist) |
| Firebase Console (out-of-repo) | 1.1, 1.4 | OAuth consent screen, authorized domains, one-account-per-email verification |
| `package.json` | 1.2 | `libphonenumber-js` dependency |

No backend (`functions/`) changes required for this section.
