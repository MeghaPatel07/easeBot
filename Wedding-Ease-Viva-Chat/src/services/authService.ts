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
} from 'firebase/auth'
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
  isVerified: boolean
): Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'verifiedAt'> & {
  createdAt: ReturnType<typeof serverTimestamp>
  lastLoginAt: null
  verifiedAt: null
} {
  return {
    uid,
    name,
    email,
    phone,
    isVerified,
    isValidated: isVerified,
    verifiedAt: null,
    favourites: [],
    weddingDate: null,
    budget: null,
    partnerName: null,
    preferredLanguage: 'en',
    createdAt: serverTimestamp(),
    lastLoginAt: null,
    forgotPasswordOtp: null,
  }
}

// ── Sign Up (authflow.md §2) ──────────────────────────────────────────────────

export async function signUpWithEmail(
  name: string,
  email: string,
  phone: string | null,
  password: string
): Promise<{ uid: string; email: string; name: string; phone: string | null }> {
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
  provider.addScope('https://www.googleapis.com/auth/calendar')
  let credential
  try {
    credential = await signInWithPopup(auth, provider)
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') {
      const silent = makeAuthError('auth/popup-closed-by-user')
      throw silent
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
  await updateDoc(doc(db, 'users', snap.docs[0].id), { lastLoginAt: serverTimestamp() })
  return profile
}

// ── Forgot Password (authflow.md §6) — Firebase reset email ──────────────────

export async function sendForgotPasswordEmail(email: string): Promise<void> {
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)))
  if (snap.empty) throw makeAuthError('USER_NOT_FOUND')
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
