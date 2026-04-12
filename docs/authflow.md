# WeddingEase — Authentication Flow


> **Stack:** Firebase Auth · Firestore · Twilio / WhatsApp OTP · Cloud Functions
> **Entry point:** `/auth?mode=signup` or `/auth?mode=signin`
> **Key files:** `pages/Auth.tsx` · `components/auth/SignUpStep.tsx` · `components/auth/SignInStep.tsx` · `contexts/AuthContext.tsx`


---


## Table of Contents


1. [URL & Page Entry](#1-url--page-entry)
2. [Sign-Up Flow](#2-sign-up-flow)
3. [Sign-In Flow](#3-sign-in-flow)
4. [Google OAuth Flow](#4-google-oauth-flow)
5. [Phone OTP Flow (Sign-In)](#5-phone-otp-flow-sign-in)
6. [Forgot Password Flow](#6-forgot-password-flow)
7. [Unverified Account Recovery](#7-unverified-account-recovery)
8. [Post-Auth Redirect Logic](#8-post-auth-redirect-logic)
9. [Auth State Initialisation](#9-auth-state-initialisation)
10. [Sign-Out Flow](#10-sign-out-flow)
11. [Error Code Mapping](#11-error-code-mapping)
12. [Data Written to Firestore](#12-data-written-to-firestore)


---


## 1. URL & Page Entry


```
/auth?mode=signup          → renders <SignUpStep>
/auth?mode=signin          → renders <SignInStep>
/auth?mode=signin&returnTo=/products   → after login, redirect to /products
/auth?mode=signup&source=contact       → pre-fills form with localStorage contact data
```


`Auth.tsx` reads `mode` and `returnTo` from search params and conditionally renders the correct step component. A `useEffect` watches the `user` context — if the user becomes verified, it automatically navigates to `returnTo` (or `/` if not set).


---


## 2. Sign-Up Flow


### Step overview


```
form  →  choice  →  verifying  →  success
```


### Step 1 — Registration Form (`step = 'form'`)


**Fields collected:**
| Field | Required | Validation |
|---|---|---|
| Full name | ✅ | Non-empty |
| Email | ✅ | Regex format check |
| Phone | Optional | Country-aware via `PhoneInput` |
| Password | ✅ | Min 6 chars |
| Confirm Password | ✅ | Must match password |
| Terms checkbox | ✅ | Must be checked |


**On submit → `AuthContext.signUp(email, password, name, null, phone)`:**


```
1. createUserWithEmailAndPassword(auth, email, password)
   ├── if email-already-in-use:
   │     └── Try signInWithEmailAndPassword to check if it's an orphaned account
   │           ├── Verified Firestore profile exists → throw auth/email-already-in-use
   │           └── No verified profile → call /auth/cleanup-orphaned API, retry creation
   └── Success → firebaseUser


2. Phone duplicate check (Firestore: getUserByPhone)
   └── Duplicate found → firebaseSignOut + throw error


3. firebaseUpdateProfile(displayName, photoURL)


4. UserService.createUserWithCompleteData(uid, { name, email, phone })
   └── Creates Firestore doc at users/{uid} with isVerified: false


5. FreeConsultationService.checkByEmail(email)
   └── If prior booking exists → link freeConsultations + bookings records to new uid


6. firebaseSignOut(auth)   ← user is NOT logged in after signup
7. return newUser (without setting context user)
```


> **Why sign out after signup?** The user must complete email or phone verification before they are allowed to access the app.


**On success:** `setSignupUser({ uid, email, name, phone })` + `setStep('choice')`


---


### Step 2 — Verification Choice (`step = 'choice'`)


User picks how to verify:


| Option | Available when |
|---|---|
| Verify via Email | Always |
| Verify via Phone | Phone number was provided |


---


### Step 3 — Verifying (`step = 'verifying'`)


#### Email path


```
sendManualVerificationEmail(email, uid, name)
  └── Calls Cloud Function: sendVerificationEmail
        └── Sends email with a link containing uid + token
              └── User clicks link → /verify page
                    └── verifyUserAccount(uid, token) Cloud Function
                          └── Sets users/{uid}.isVerified = true
                                └── onSnapshot listener fires
                                      └── setStep('success')
```


**Real-time listener** on `users/{uid}` watches for `isVerified || isValidated` — when Firestore updates, the UI automatically advances to success.


#### Phone (Twilio/WhatsApp OTP) path


```
sendPhoneOTP(phone)
  └── OtpService.sendOtp(phone) [WhatsApp] or TwilioService.sendOTP(phone) [SMS]


User enters 6-digit OTP (auto-submits when all 6 digits entered)
  └── verifyUserPhone(uid, phone, otpCode)
        └── OtpService.verifyOtp / TwilioService.verifyOTP
              └── updateDoc(users/{uid}, { isVerified: true, isValidated: true })
                    └── setStep('success')
```


OTP timer: 30-second countdown before "Resend OTP" is enabled.


---


### Step 4 — Success (`step = 'success'`)


Shows a checkmark + "Welcome to EaseBot". After 2 seconds → `onSignupComplete()` → `Auth.tsx` triggers redirect.


---


## 3. Sign-In Flow


### Email / Password


```
User enters email + password → handleSubmit()
  └── AuthContext.signIn(email, password)
        1. signInWithEmailAndPassword(auth, email, password)
        2. UserService.getUser(uid)
           ├── Doc missing → re-create profile, signOut, throw UNVERIFIED_ACCOUNT
           └── Doc exists
                ├── isVerified = false → signOut, throw UNVERIFIED_ACCOUNT (with uid/email/name/phone attached)
                └── isVerified = true  → build User object, setUser(user), return


On success → onLoginComplete() → Auth.tsx redirect
On UNVERIFIED_ACCOUNT → SignInStep shows verification recovery UI (see §7)
On invalid credentials → checks Firestore to determine "account not found" vs "wrong password"
```


**Remember Me:** If checked, `remembered_email` is saved to `localStorage` and pre-fills the field on next visit.


---


## 4. Google OAuth Flow


### Sign-Up via Google


```
User clicks Google (on SignUpStep) → signInWithGoogle(allowSignUp = true)
  1. signInWithPopup(auth, GoogleAuthProvider)
  2. UserService.getUser(uid)
     └── isNewUser = !userData || (!name && !email)


  If new user:
    3a. UserService.createUserWithCompleteData(uid, { name, email, phone })
    3b. updateDoc(users/{uid}, { isVerified: true, isValidated: true })
        → Google users are verified by default, no email/OTP step needed


  If existing user:
    3a. If not verified → auto-verify via updateDoc
    3b. Update lastLoginAt


  4. setUser(user) → Auth.tsx redirect
```


### Sign-In via Google


```
User clicks Google (on SignInStep) → signInWithGoogle(allowSignUp = false)
  1. signInWithPopup
  2. getUser(uid)
     └── No Firestore profile → signOut, throw GOOGLE_ACCOUNT_NOT_FOUND
  3. Same verified flow as above
  4. setUser(user) → onLoginComplete()
```


---


## 5. Phone OTP Flow (Sign-In)


```
User selects "Phone" tab → enters number → handleSubmit()
  └── signInWithPhoneNumber(normalizedPhone)
        └── OtpService.sendOtp / TwilioService.sendOTP
              └── setShowLoginOtp(true)


User enters OTP → handleVerifyLoginOTP()
  └── verifyPhoneOTP(phone, otp, isSignup = false)
        1. OtpService.verifyOtp / TwilioService.verifyOTP
        2. UserService.getUserByPhone(phone)
           └── Not found → throw "No account found with this phone number"
        3. Update lastLoginAt
        4. Build User object from Firestore data
        5. sessionStorage.setItem('wedding_ease_user', JSON.stringify(user))
        6. setUser(user)
        7. onLoginComplete()
```


> Phone-authenticated sessions are **sessionStorage-based** (not Firebase Auth tokens) because Firebase phone auth has rate limits. `onAuthStateChanged` checks `sessionStorage` first on app load.


---


## 6. Forgot Password Flow


Four steps, all within `SignInStep` when `isForgotPassword = true`:


### Step 1 — Email Input


```
User enters email → handleFpEmailSubmit()
  └── sendForgotPasswordOtp(email)
        └── Cloud Function: sendForgotPasswordOtp
              1. Looks up user by email in Firestore
              2. Generates OTP, stores as users/{uid}.forgotPasswordOtp
              3. Sends email containing the OTP
              └── Returns { success: true } or { success: false, code: ERROR_CODE }


Error codes handled: VALIDATION_ERROR · USER_NOT_FOUND · USER_PROFILE_NOT_FOUND · INTERNAL_ERROR
```


### Step 2 — OTP Verification


```
User enters 6-digit OTP → handleFpOtpSubmit()
  └── UserService.getUserByEmail(email)
        └── Compare entered OTP with users/{uid}.forgotPasswordOtp (Firestore direct read)
              ├── No OTP stored → "OTP expired"
              ├── Mismatch → "Incorrect OTP"
              └── Match → advance to step 3
```


> OTP is verified **client-side against Firestore** (no Cloud Function round-trip for verification). Timer: 30s resend cooldown.


### Step 3 — New Password


```
User enters new password (min 8 chars) + confirm → handleFpPasswordSubmit()
  └── updatePasswordByEmail(email, newPassword)
        └── Cloud Function: updateUserAccountPassword
              └── Firebase Admin SDK updates Auth password for the account
```


### Step 4 — Success


Shows confirmation. "Back to Sign In" resets all forgot-password state.


---


## 7. Unverified Account Recovery


Triggered when `signIn()` throws `UNVERIFIED_ACCOUNT` (error object carries `uid`, `email`, `name`, `phone`).


`SignInStep` switches to a recovery UI:


```
Show "Verify Your Account" panel
  ├── Email Verification
  │     └── sendManualVerificationEmail(email, uid, name)
  │           → Cloud Function sends verification link
  │               → User clicks link → /verify page verifies account
  └── Phone Verification (disabled if no phone on account)
        └── sendPhoneOTP(phone)
              → User enters OTP → verifyUserPhone(uid, phone, otp)
                    → updateDoc isVerified=true, isValidated=true
                          → "Verification Successful!" → prompt to sign in again
```


---


## 8. Post-Auth Redirect Logic


```
Auth.tsx useEffect watches: user + returnTo
  └── if (user && (user.emailVerified || user.phoneVerified))
        ├── returnTo present & not /auth/* → navigate(decodeURIComponent(returnTo))
        └── no returnTo → navigate('/')
```


**`returnTo` is set by:**
- Protected routes: e.g., `/auth?mode=signin&returnTo=/account`
- Wishlist modal: `returnTo = current product page URL`
- Checkout: `returnTo = /checkout`


---


## 9. Auth State Initialisation


On every app load, `AuthContext` runs this sequence **once** in a `useEffect`:


```
1. Check sessionStorage for 'wedding_ease_user'
   └── Found → parse, setUser, setLoading(false), STOP
               (handles phone-auth sessions)


2. Firebase onAuthStateChanged listener
   └── firebaseUser exists:
         a. UserService.getUser(uid) ← fetch Firestore profile
         b. Check isVerified || isValidated
            ├── Not verified + not handling auth → firebaseSignOut, setUser(null)
            └── Verified → build User object, setUser(user)
   └── firebaseUser null → setUser(null)
   └── setLoading(false)
```


`isHandlingAuth` ref prevents the `onAuthStateChanged` listener from signing the user out mid-signup/Google-auth (race condition guard).


---


## 10. Sign-Out Flow


```
AuthContext.signOut()
  1. firebaseSignOut(auth)           ← Firebase session
  2. Remove weddingease_currency_manually_set_{uid} from localStorage
  3. Remove weddingease_currency_manually_set from localStorage
  4. setUser(null)
  5. sessionStorage.removeItem('wedding_ease_user')  ← phone session
  6. localStorage.removeItem('wedding_ease_user')
```


Guest wishlist (`weddingease_guest_wishlist`, `weddingease_guest_collections`) is **not cleared** on sign-out — it persists so the user can recover their saved items.


---


## 11. Error Code Mapping


| Firebase / Custom Code | User-facing Message |
|---|---|
| `auth/user-not-found` | Account does not exist, please signup |
| `auth/wrong-password` | Incorrect password |
| `auth/invalid-email` | Invalid email address |
| `auth/email-already-in-use` | An account with this email already exists |
| `auth/email-linked-to-social` | This email is linked to a Google account |
| `auth/weak-password` | Password must be at least 6 characters |
| `auth/too-many-requests` | Too many failed attempts, try again later |
| `auth/invalid-credential` | Checks Firestore → "Account not found" or "Incorrect password" |
| `auth/popup-closed-by-user` | Silent (no toast, just stops loading) |
| `UNVERIFIED_ACCOUNT` | Triggers verification recovery UI |
| `GOOGLE_ACCOUNT_NOT_FOUND` | No account found with this email |
| Phone duplicate | An account with this phone number already exists |


---


## 12. Data Written to Firestore


### On Sign-Up (email/password)


```
users/{uid}
  name: string
  email: string
  phone: string
  password: ''              (never stored in plain text — Firebase handles auth)
  isVerified: false         → true after email/phone verification
  isValidated: false        → true after verification
  favourites: []
  addresses: {}
  services: []
  defaultAddressId: null
  createdAt: Timestamp
  isfree_cons_used: false
```


### On Google Sign-Up


Same as above but:
```
  isVerified: true          ← set immediately (Google = already verified)
  isValidated: true
  verifiedAt: Timestamp
```


### On Verification Complete


```
users/{uid}
  isVerified: true
  isValidated: true
  verifiedAt: Timestamp.now()
```


### On Forgot Password OTP Send


```
users/{uid}
  forgotPasswordOtp: number   ← 6-digit OTP (Cloud Function writes this)
```


### On Guest Wishlist Migration (after login)


For each guest collection, a new Firestore document is created:
```
wishlist/{auto-id}
  uId: string               ← logged-in user uid
  title: string             ← collection name from localStorage
  desc: string
  createdAt: number
  createdBy: uid
  createdByType: 'user'
  variantIds: VariantDetails[]


users/{uid}
  favourites: [...productIds]   ← all guest product IDs merged in
```


---


## Quick Reference — Component Responsibilities


| Component | Responsibility |
|---|---|
| `pages/Auth.tsx` | Route entry, mode switch, post-auth redirect |
| `components/auth/SignUpStep.tsx` | Sign-up form + verification choice + OTP/email verify |
| `components/auth/SignInStep.tsx` | Sign-in form + phone OTP + forgot password + unverified recovery |
| `contexts/AuthContext.tsx` | Firebase operations, session management, state |
| `pages/Verify.tsx` | Email link verification landing page |
| `components/auth/ProtectedRoute.tsx` | Guards authenticated-only routes |
| `services/userService.ts` | Firestore user CRUD |
| `services/otpService.ts` | WhatsApp OTP send/verify |
| `services/twilioService.ts` | SMS OTP send/verify |
| `services/freeConsultationService.ts` | Free consultation record management |



