# Authentication Flows

Documents the current **Sign Up** and **Forgot Password** flows for the Wedding Ease user interface.

Route entry: `/auth?mode=signup` or `/auth?mode=signin` → `src/pages/Auth.tsx` renders either `SignUpStep` or `SignInStep` inside a single card.

Auth state, Firestore writes, OTP, and Cloud Function calls are centralized in `src/contexts/AuthContext.tsx` (exposed via the `useAuth()` hook).

---

## 1. Sign Up Flow

**Component:** `src/components/auth/SignUpStep.tsx`
**Context methods used:** `signUp`, `signInWithGoogle`, `sendManualVerificationEmail`, `sendPhoneOTP`, `verifyUserPhone`

The sign-up component is a small state machine driven by `step`:

```
'form'  →  'choice'  →  'verifying'  →  'success'
```

### Step A — `form` (collect details)
File: `SignUpStep.tsx:367-498`

Fields collected:
- Full name
- Email
- Phone (with country code via `PhoneInput`, validated through `onValidityChange`)
- Password + confirm password (min 6 chars, must match)
- Terms checkbox (required)

Pre-population: if the user arrived via `?source=contact`, name/email/phone are filled from `localStorage.weddingease_contact_data` (`SignUpStep.tsx:57-71`).

`validateForm()` (`SignUpStep.tsx:100-113`) blocks submit until all rules pass.

### Step B — `signUp` (create Auth + Firestore record)
File: `AuthContext.tsx:262-408`

1. `createUserWithEmailAndPassword(auth, email, password)` — Firebase Auth is the gatekeeper for email uniqueness.
2. **Orphaned-account recovery** (`AuthContext.tsx:277-323`): if `auth/email-already-in-use` is thrown, the code:
   - Tries to sign in with the supplied password — if a verified Firestore profile exists, it surfaces `auth/email-already-in-use`.
   - Otherwise hits `POST {VITE_API_BASE_URL}/auth/cleanup-orphaned` to delete the stale Auth record, then retries creation.
   - If cleanup fails, surfaces `auth/email-linked-to-social` (likely Google account).
3. **Phone duplicate check** (`AuthContext.tsx:331-337`): `UserService.getUserByPhone(phone)` — sign-out + throw if a different user already owns the phone.
4. `firebaseUpdateProfile` sets `displayName` (and `photoURL` if a profile image was supplied).
5. `UserService.createUserWithCompleteData(...)` writes the Firestore `users/{uid}` document (`AuthContext.tsx:354-359`).
6. **Free-consultation backfill** (`AuthContext.tsx:362-372`): if `BookingService.getFreeConsultationByEmail(email)` finds a prior booking, mark `isfree_cons_used: true` on the user and stamp `uId` onto the booking.
7. `ensureUserSession(uid, name)` allocates a chat session via `ChatService.createSession` and stores `sessionId` on the user doc (`AuthContext.tsx:225-259`).
8. **Important:** the user is **immediately signed out** (`firebaseSignOut(auth)` at `AuthContext.tsx:395`) so a page refresh doesn't grant access. Verification must happen in the same browser session via the `signupUser` state held in `SignUpStep`.

After `signUp` resolves, `SignUpStep` saves `{uid, email, name, phone}` into `signupUser` state and advances to `step = 'choice'` (`SignUpStep.tsx:121-127`).

### Step C — `choice` (pick verification method)
File: `SignUpStep.tsx:249-295`

Two cards: **Verify via Email** and **Verify via Phone** (the phone card is disabled if no phone was given).

Handler `handleSelectVerification(method)` (`SignUpStep.tsx:133-161`):
- **Email**: `sendManualVerificationEmail(email, uid, name)` → invokes the `sendVerificationEmail` Cloud Function (`AuthContext.tsx:1016-1024`). Then sets `step = 'verifying'`.
- **Phone**: `sendPhoneOTP(phone)` → routes through `OtpService.sendOtp` (WhatsApp, default) or `TwilioService.sendOTP` (SMS) based on `VITE_USE_WHATSAPP_OTP` (`AuthContext.tsx:736-752`). Sets `step = 'verifying'`, starts a 30 s resend timer.

### Step D — `verifying` (complete verification)
File: `SignUpStep.tsx:297-365`

**Email path:**
- Shows a "Check your inbox" panel and a Resend button (`handleResendEmail` re-invokes `sendManualVerificationEmail`).
- A live `onSnapshot` listener on `users/{uid}` (`SignUpStep.tsx:85-98`) advances to `'success'` as soon as the doc has `isVerified` or `isValidated === true`.
  The user clicks the link in the email → the link target hits the `verifyUserAccount` Cloud Function (`AuthContext.tsx:1026-1037`) which flips those flags.

**Phone path:**
- 6-input OTP grid; auto-advances on input, auto-submits when all six digits are entered (`handleOtpChange`).
- Resend OTP unlocks after the 30 s countdown.
- Submit calls `verifyUserPhone(uid, phone, otp)` (`AuthContext.tsx:1061-1088`) which verifies via WhatsApp/Twilio then writes `{ isVerified: true, isValidated: true, verifiedAt }` to Firestore.

### Step E — `success`
File: `SignUpStep.tsx:233-247`

Shows the success card; after 2 s `onSignupComplete()` runs which navigates to `returnTo` (or `/`) — see `Auth.tsx:64-74`.

The post-auth redirect in `Auth.tsx:36-53` is the safety net: as soon as `user.emailVerified || user.phoneVerified` flips to true, it navigates away.

### Google sign-up (alternative)
`handleGoogleSignUp` (`SignUpStep.tsx:224-231`) → `signInWithGoogle(true)` (`AuthContext.tsx:519-670`). Google users are auto-marked `isVerified: true` so they bypass the choice/verifying steps.

---

## 2. Forgot Password Flow

> **Note:** there are two implementations in the repo. Only the in-line one inside `SignInStep.tsx` is reachable from the live `/auth` route. The standalone `src/components/auth/ForgotPassword.tsx` component is only wired into `AuthContainer.tsx`, which itself is imported but never routed — treat it as legacy.

### Active flow — inside `SignInStep.tsx`
**Component:** `src/components/auth/SignInStep.tsx`
**Context methods used:** `sendForgotPasswordOtp`, `updatePasswordByEmail`
**Direct service:** `UserService.getUserByEmail`

Triggered from the "Forgot password?" link below the password field (`SignInStep.tsx:885-891`), which sets `isForgotPassword = true` and `forgotPasswordStep = 1`. The current value of the email field is pre-filled.

State machine (`forgotPasswordStep`):

```
1: Email  →  2: OTP  →  3: New Password  →  4: Success
```

#### Step 1 — Request OTP
`handleFpEmailSubmit` (`SignInStep.tsx:220-297`)
- Validates email present + regex match.
- Calls `sendForgotPasswordOtp(email)` → invokes the `sendForgotPasswordOtp` Cloud Function (`AuthContext.tsx:887-903`). The Cloud Function generates an OTP, persists it on the Firestore user doc as `forgotPasswordOtp`, and emails it.
- Maps backend error codes to user messages: `VALIDATION_ERROR`, `USER_NOT_FOUND`, `USER_PROFILE_NOT_FOUND`, `INTERNAL_ERROR`.
- On success: clears OTP digits, starts a 30 s resend timer, advances to step 2.

#### Step 2 — Verify OTP
UI: 6-input grid (`fp-otp-*`), auto-advance + backspace nav (`handleFpOtpChange`, `handleFpOtpKeyDown`).
Submit handler `handleFpOtpSubmit` (`SignInStep.tsx:317-345`):
- Fetches the user via `UserService.getUserByEmail(email)`.
- Reads `user.userData.forgotPasswordOtp` directly from Firestore and string-compares it to the entered OTP.
- Errors: missing user → "No account found"; missing stored OTP → "OTP has expired"; mismatch → "Incorrect OTP".
- On match: clears password fields, advances to step 3.

Resend OTP (`SignInStep.tsx:673`) simply re-calls `sendForgotPasswordOtp` and resets the timer.

#### Step 3 — Set new password
`handleFpPasswordSubmit` (`SignInStep.tsx:347-364`)
- Requires `fpNewPassword === fpConfirmPassword` and length ≥ 8.
- Calls `updatePasswordByEmail(email, newPassword)` → invokes the `updateUserAccountPassword` Cloud Function (`AuthContext.tsx:865-885`) which uses Admin SDK to set the password on the matching Auth user.
- Advances to step 4.

#### Step 4 — Success
Shows confirmation; user can return to sign-in (which clears `isForgotPassword`).

### Legacy flow — `ForgotPassword.tsx` (not currently routed)
File: `src/components/auth/ForgotPassword.tsx`
- Single-screen email input → `useAuth().resetPassword(email)` → `sendPasswordResetEmail(auth, email)` (Firebase's built-in reset email; **not** the OTP flow above).
- Used only inside `AuthContainer.tsx` (`AuthContainer.tsx:6, 193-195`), which is imported by `ProtectedRoute.tsx` but `ProtectedRoute` actually navigates to `/auth` instead of rendering it. The component is effectively dead code.

---

## Quick reference

| Concern | Location |
| --- | --- |
| Route | `src/pages/Auth.tsx` (renders `SignUpStep` / `SignInStep`) |
| Sign-up UI state machine | `src/components/auth/SignUpStep.tsx` |
| Sign-in + forgot password UI | `src/components/auth/SignInStep.tsx` |
| Auth + Firestore writes | `src/contexts/AuthContext.tsx` |
| Phone OTP transport (WhatsApp/SMS) | `src/services/otpService.ts`, `src/services/twilioService.ts` (toggled by `VITE_USE_WHATSAPP_OTP`) |
| Cloud Functions invoked | `sendVerificationEmail`, `verifyUserAccount`, `sendForgotPasswordOtp`, `updateUserAccountPassword` |
| Orphaned-Auth cleanup endpoint | `POST {VITE_API_BASE_URL}/auth/cleanup-orphaned` |
| User CRUD helpers | `src/services/userService.ts` (`getUser`, `getUserByEmail`, `getUserByPhone`, `createUserWithCompleteData`) |
| Legacy forgot-password screen | `src/components/auth/ForgotPassword.tsx` (unrouted) |
