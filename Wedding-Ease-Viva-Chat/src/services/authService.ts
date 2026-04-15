import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  EmailAuthProvider,
  updatePassword,
  type AuthCredential,
} from 'firebase/auth'
import {
  getPhoneCredential,
  storePhoneCredential,
  type PhoneCredential,
} from '@/services/phoneCredentialStore'
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import { validatePassword } from '@/utils/passwordPolicy'
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import type { UserProfile, AuthFlowError } from '@/types'

export const SESSION_KEY = 'wedding_ease_user'

// Phone-created accounts use a derived Firebase Auth email so the SDK can
// authenticate them via email/password. The user's real email lives on the
// Firestore profile. This constant + helper are the single source of truth
// for that derived address — never hardcode the literal anywhere else.
export const DERIVED_EMAIL_DOMAIN = 'phone.weddingease.local'

export function isDerivedPhoneEmail(email?: string | null): boolean {
  return !!email && email.endsWith(`@${DERIVED_EMAIL_DOMAIN}`)
}

// ── Error mapping (authflow.md §11) ─────────────────────────────────────────

export function mapAuthError(code: string): string {
  const map: Record<string, string> = {
    'auth/user-not-found': 'Account does not exist, please sign up',
    'auth/wrong-password': 'Incorrect password',
    'auth/invalid-email': 'Invalid email address',
    'auth/email-already-in-use': 'An account with this email already exists',
    'auth/email-linked-to-social': 'This email is linked to a Google account',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/too-many-requests': 'Too many failed attempts, try again later',
    'auth/invalid-credential': 'Incorrect email or password',
    'auth/popup-closed-by-user': '',
    'UNVERIFIED_ACCOUNT': 'Please verify your account before signing in',
    'GOOGLE_ACCOUNT_NOT_FOUND': 'No account found with this Google email. Please sign up first.',
    'PHONE_DUPLICATE': 'An account with this phone number already exists',
    'PHONE_NOT_FOUND': 'No account found with this phone number',
    'USER_NOT_FOUND': 'No account found with this email address',
    'EMAIL_OWNED_BY_GOOGLE': 'This email is already registered with Google. Please continue with Google.',
    'LINK_GOOGLE_TO_PASSWORD': 'This email already has a password account. Enter your password to link Google.',
    'WEAK_PASSWORD_POLICY': 'Password does not meet strength requirements',
    'PHONE_DEVICE_MISMATCH': 'This phone is not registered on this device. Please use email sign-in, or sign up again on this device.',
    'USE_PHONE_SIGNIN': 'This account was created with a phone number. Please sign in with your phone.',
    'USE_EMAIL_SIGNIN': 'This account was created with email. Please sign in with email and password.',
  }
  return map[code] ?? 'Something went wrong. Please try again.'
}

function makeAuthError(code: string, extra?: Partial<AuthFlowError>): AuthFlowError {
  const err = new Error(mapAuthError(code)) as AuthFlowError
  err.code = code
  Object.assign(err, extra)
  return err
}

// ── Firestore user doc builder ────────────────────────────────────────────────

function buildNewUserDoc(
  uid: string,
  name: string,
  email: string,
  phone: string | null,
  isVerified: boolean,
  authMethod: 'email' | 'phone' = 'email',
): Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'verifiedAt'> & {
  createdAt: ReturnType<typeof serverTimestamp>
  lastLoginAt: null
  verifiedAt: null
} {
  let phoneCountryCode: string | null = null
  let phoneNational: string | null = null
  if (phone) {
    try {
      const parsed = parsePhoneNumberFromString(phone)
      if (parsed?.isValid()) {
        phoneCountryCode = parsed.country ?? null
        phoneNational = parsed.nationalNumber as string
      }
    } catch { /* leave nulls */ }
  }
  return {
    uid,
    name,
    email,
    phone,
    phoneCountryCode,
    phoneNational,
    isVerified,
    isValidated: isVerified,
    verifiedAt: null,
    favourites: [],
    weddingDate: null,
    budget: null,
    partnerName: null,
    preferredLanguage: 'en',
    isPremium: false,
    role: null,
    usage: null,
    createdAt: serverTimestamp(),
    lastLoginAt: null,
    forgotPasswordOtp: null,
    activeVibe: null,
    authMethod,
  }
}

// ── Sign Up (authflow.md §2) ──────────────────────────────────────────────────

export async function signUpWithEmail(
  name: string,
  email: string,
  phone: string | null,
  password: string
): Promise<{ uid: string; email: string; name: string; phone: string | null }> {
  // Defense-in-depth: client form also validates, but never trust it.
  if (!validatePassword(password).ok) {
    throw makeAuthError('WEAK_PASSWORD_POLICY')
  }

  // Duplicate-provider preflight — prevents fragmenting identity across methods.
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email)
    if (methods.includes('google.com')) throw makeAuthError('EMAIL_OWNED_BY_GOOGLE')
    if (methods.includes('password')) throw makeAuthError('auth/email-already-in-use')
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'EMAIL_OWNED_BY_GOOGLE' || code === 'auth/email-already-in-use') throw err
    // fetch failed for a non-duplicate reason — fall through and let createUser surface it
  }

  let credential
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password)
  } catch (err: any) {
    throw makeAuthError(err.code ?? err.message)
  }

  const user = credential.user

  try {
    // Phone duplicate check
    if (phone) {
      const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', phone)))
      if (!snap.empty) {
        await firebaseSignOut(auth)
        throw makeAuthError('PHONE_DUPLICATE')
      }
    }

    await updateProfile(user, { displayName: name })

    // Firestore doc — isVerified: false until email confirmed
    await setDoc(doc(db, 'users', user.uid), buildNewUserDoc(user.uid, name, email, phone, false))

    // Send Firebase verification email
    await sendEmailVerification(user)

    // Sign out — user must verify before accessing app (authflow.md §2)
    await firebaseSignOut(auth)

    return { uid: user.uid, email, name, phone }
  } catch (err) {
    try { await user.delete() } catch {}
    throw err
  }
}

export async function resendVerificationEmail(email: string, password: string): Promise<void> {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  await sendEmailVerification(credential.user)
  await firebaseSignOut(auth)
}

// ── Sign In (authflow.md §3) ──────────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string) {
  let credential
  try {
    credential = await signInWithEmailAndPassword(auth, email, password)
  } catch (err: any) {
    // Check Firestore to distinguish "not found" vs "wrong password"
    if (err.code === 'auth/invalid-credential') {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)))
      if (snap.empty) throw makeAuthError('auth/user-not-found')
    }
    throw makeAuthError(err.code ?? err.message)
  }

  const user = credential.user
  const profileSnap = await getDoc(doc(db, 'users', user.uid))

  if (!profileSnap.exists()) {
    // Re-create stub profile, sign out
    await setDoc(doc(db, 'users', user.uid), buildNewUserDoc(user.uid, user.displayName ?? '', email, null, false))
    await firebaseSignOut(auth)
    throw makeAuthError('UNVERIFIED_ACCOUNT', { uid: user.uid, email, name: user.displayName ?? '', phone: null })
  }

  const profile = profileSnap.data() as UserProfile

  // Lock by identity origin: phone-created accounts cannot sign in via the
  // email/password form. Lazy-backfill `authMethod` when missing — derive it
  // from the Firebase Auth email shape so older docs stay consistent.
  let authMethod = profile.authMethod
  if (!authMethod) {
    authMethod = isDerivedPhoneEmail(user.email) ? 'phone' : 'email'
    try { await updateDoc(doc(db, 'users', user.uid), { authMethod }) } catch { /* best-effort */ }
  }
  if (authMethod === 'phone') {
    await firebaseSignOut(auth)
    throw makeAuthError('USE_PHONE_SIGNIN')
  }

  // Firebase emailVerified → sync to Firestore
  if (user.emailVerified && !profile.isVerified) {
    await updateDoc(doc(db, 'users', user.uid), {
      isVerified: true,
      isValidated: true,
      verifiedAt: serverTimestamp(),
    })
  } else if (!profile.isVerified && !user.emailVerified) {
    await firebaseSignOut(auth)
    throw makeAuthError('UNVERIFIED_ACCOUNT', {
      uid: user.uid,
      email,
      name: profile.name,
      phone: profile.phone,
    })
  }

  await updateDoc(doc(db, 'users', user.uid), { lastLoginAt: serverTimestamp() })
  return user
}

// ── Google OAuth (authflow.md §4) ─────────────────────────────────────────────

export async function signInWithGoogleAuth(allowSignUp = true): Promise<{ user: import('firebase/auth').User, googleAccessToken: string | null }> {
  const provider = new GoogleAuthProvider()
  let credential
  try {
    credential = await signInWithPopup(auth, provider)
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') {
      const silent = makeAuthError('auth/popup-closed-by-user')
      throw silent
    }
    if (err.code === 'auth/account-exists-with-different-credential') {
      const pendingCred = GoogleAuthProvider.credentialFromError(err)
      const conflictEmail = err.customData?.email as string | undefined
      throw makeAuthError('LINK_GOOGLE_TO_PASSWORD', { email: conflictEmail, pendingCred: pendingCred ?? undefined })
    }
    throw makeAuthError(err.code ?? err.message)
  }

  const googleCred = GoogleAuthProvider.credentialFromResult(credential)
  const googleAccessToken = googleCred?.accessToken ?? null

  const user = credential.user
  const profileSnap = await getDoc(doc(db, 'users', user.uid))
  const isNewUser = !profileSnap.exists()

  if (!allowSignUp && isNewUser) {
    await firebaseSignOut(auth)
    throw makeAuthError('GOOGLE_ACCOUNT_NOT_FOUND')
  }

  if (isNewUser) {
    await setDoc(doc(db, 'users', user.uid), {
      ...buildNewUserDoc(user.uid, user.displayName ?? '', user.email ?? '', user.phoneNumber ?? null, true),
      isVerified: true,
      isValidated: true,
      verifiedAt: serverTimestamp(),
    })
  } else {
    await updateDoc(doc(db, 'users', user.uid), {
      isVerified: true,
      isValidated: true,
      lastLoginAt: serverTimestamp(),
    })
  }

  return { user, googleAccessToken }
}

export async function linkPendingGoogleCredential(
  email: string,
  password: string,
  pendingCred: AuthCredential,
): Promise<import('firebase/auth').User> {
  let passCred
  try {
    passCred = await signInWithEmailAndPassword(auth, email, password)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throw makeAuthError(e.code ?? e.message ?? 'auth/unknown')
  }
  try {
    await linkWithCredential(passCred.user, pendingCred)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throw makeAuthError(e.code ?? e.message ?? 'auth/unknown')
  }
  await updateDoc(doc(db, 'users', passCred.user.uid), {
    isVerified: true,
    isValidated: true,
    lastLoginAt: serverTimestamp(),
  })
  return passCred.user
}

// ── Phone OTP (authflow.md §5) ────────────────────────────────────────────────

export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
}

export async function sendPhoneOtp(
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier)
}

export async function verifyPhoneOtp(
  confirmationResult: ConfirmationResult,
  otpCode: string
): Promise<UserProfile> {
  const credential = await confirmationResult.confirm(otpCode)
  const user = credential.user

  const snap = await getDocs(
    query(collection(db, 'users'), where('phone', '==', user.phoneNumber))
  )
  if (snap.empty) {
    await firebaseSignOut(auth)
    throw makeAuthError('PHONE_NOT_FOUND')
  }

  const profile = snap.docs[0].data() as UserProfile

  // Identity-origin lock: only phone-created accounts may sign in via OTP.
  let authMethod = profile.authMethod
  if (!authMethod) {
    authMethod = isDerivedPhoneEmail(profile.email) ? 'phone' : 'email'
    try { await updateDoc(doc(db, 'users', snap.docs[0].id), { authMethod }) } catch { /* best-effort */ }
  }
  if (authMethod === 'email') {
    await firebaseSignOut(auth)
    throw makeAuthError('USE_EMAIL_SIGNIN')
  }

  await updateDoc(doc(db, 'users', snap.docs[0].id), { lastLoginAt: serverTimestamp() })
  return profile
}

// ── Forgot Password (authflow.md §6) — Firebase reset email ──────────────────

export async function sendForgotPasswordEmail(email: string): Promise<void> {
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)))
  if (snap.empty) throw makeAuthError('USER_NOT_FOUND')
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email)
    if (methods.length > 0 && !methods.includes('password') && methods.includes('google.com')) {
      throw makeAuthError('EMAIL_OWNED_BY_GOOGLE')
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'EMAIL_OWNED_BY_GOOGLE') throw err
    // swallow other fetch errors
  }
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (err: any) {
    throw makeAuthError(err.code ?? err.message)
  }
}

// ── Sign Out (authflow.md §10) ────────────────────────────────────────────────

export async function signOutUser(uid?: string): Promise<void> {
  await firebaseSignOut(auth)
  if (uid) localStorage.removeItem(`weddingease_currency_manually_set_${uid}`)
  localStorage.removeItem('weddingease_currency_manually_set')
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
}

// ── Preferred language (authflow.md §12) ──────────────────────────────────────

export async function updatePreferredLanguage(uid: string, language: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { preferredLanguage: language })
}

// ── WhatsApp-OTP Phone Auth (derived credential strategy) ────────────────────
//
// See /docs/authflow spec: phone users get a real Firebase Auth account with
// a machine-generated password and a fake `phone_*@phone.weddingease.local`
// email. The credential is persisted in localStorage so the device can log
// the user back in after OTP verification. This gives real Firestore write
// access via Firebase Auth without a custom token backend.

const PHONE_PASSWORD_LEN = 32
const PHONE_PASSWORD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function randomAlphaNumeric(length: number): string {
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += PHONE_PASSWORD_ALPHABET[arr[i] % PHONE_PASSWORD_ALPHABET.length]
  }
  return out
}

export function generateDerivedPhoneCredentials(e164: string): {
  derivedEmail: string
  randomPassword: string
} {
  const digits = e164.replace(/\D/g, '')
  const derivedEmail = `phone_${digits}@${DERIVED_EMAIL_DOMAIN}`
  const randomPassword = randomAlphaNumeric(PHONE_PASSWORD_LEN)
  return { derivedEmail, randomPassword }
}

export async function signUpWithPhoneCredential(
  name: string,
  e164: string,
  realEmail: string,
): Promise<{
  uid: string
  derivedEmail: string
  name: string
  phone: string
  realEmail: string
}> {
  const { derivedEmail, randomPassword } = generateDerivedPhoneCredentials(e164)

  let credential
  try {
    credential = await createUserWithEmailAndPassword(auth, derivedEmail, randomPassword)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throw makeAuthError(e.code ?? e.message ?? 'auth/unknown')
  }

  const user = credential.user

  try {
    await updateProfile(user, { displayName: name })
    await setDoc(
      doc(db, 'users', user.uid),
      buildNewUserDoc(user.uid, name, realEmail, e164, false, 'phone'),
    )

    const stored: PhoneCredential = {
      derivedEmail,
      password: randomPassword,
      realEmail,
      uid: user.uid,
      name,
    }
    await storePhoneCredential(e164, stored)

    // Sign out immediately. The user is not yet OTP-verified; they will be
    // signed back in via `completePhoneSignupAfterOtp` after the OTP succeeds.
    // This avoids onAuthStateChanged firing for an unverified user and racing
    // with the React tree.
    const uid = user.uid
    await firebaseSignOut(auth)
    return { uid, derivedEmail, name, phone: e164, realEmail }
  } catch (err) {
    // Best-effort rollback of the half-created account
    try { await user.delete() } catch { /* ignore */ }
    throw err
  }
}

export async function markPhoneVerified(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    isVerified: true,
    isValidated: true,
    verifiedAt: serverTimestamp(),
  })
}

/**
 * Called after OTP verification: signs in via the stored derived credential
 * and marks the Firestore profile verified. Returns the signed-in user.
 */
export async function completePhoneSignupAfterOtp(
  e164: string,
): Promise<import('firebase/auth').User> {
  const cred = await getPhoneCredential(e164)
  if (!cred) throw makeAuthError('PHONE_DEVICE_MISMATCH')

  let credential
  try {
    credential = await signInWithEmailAndPassword(auth, cred.derivedEmail, cred.password)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throw makeAuthError(e.code ?? e.message ?? 'auth/unknown')
  }

  await updateDoc(doc(db, 'users', credential.user.uid), {
    isVerified: true,
    isValidated: true,
    verifiedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  })

  return credential.user
}

export async function signInWithPhoneCredential(
  e164: string,
): Promise<import('firebase/auth').User> {
  const cred = await getPhoneCredential(e164)
  if (!cred) throw makeAuthError('PHONE_DEVICE_MISMATCH')

  let credential
  try {
    credential = await signInWithEmailAndPassword(auth, cred.derivedEmail, cred.password)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throw makeAuthError(e.code ?? e.message ?? 'auth/unknown')
  }

  await updateDoc(doc(db, 'users', credential.user.uid), {
    lastLoginAt: serverTimestamp(),
  })
  return credential.user
}

/**
 * Phone "forgot password" — since the Firebase account is bound to a fake
 * derived email that cannot receive mail, we cannot use sendPasswordResetEmail.
 * Instead, after the user verifies OTP via WhatsApp, we rotate the
 * machine-generated password in place and update localStorage. The user ends
 * up signed in with the new credential.
 */
export async function rotatePhoneCredentialAfterOtp(
  e164: string,
): Promise<import('firebase/auth').User> {
  const cred = await getPhoneCredential(e164)
  if (!cred) throw makeAuthError('PHONE_DEVICE_MISMATCH')

  let credential
  try {
    credential = await signInWithEmailAndPassword(auth, cred.derivedEmail, cred.password)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throw makeAuthError(e.code ?? e.message ?? 'auth/unknown')
  }

  const newPassword = randomAlphaNumeric(PHONE_PASSWORD_LEN)
  try {
    await updatePassword(credential.user, newPassword)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throw makeAuthError(e.code ?? e.message ?? 'auth/unknown')
  }

  const updated: PhoneCredential = { ...cred, password: newPassword }
  await storePhoneCredential(e164, updated)

  await updateDoc(doc(db, 'users', credential.user.uid), {
    lastLoginAt: serverTimestamp(),
  })

  return credential.user
}
