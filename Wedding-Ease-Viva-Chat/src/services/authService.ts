import { api, ApiError, getToken, setToken } from './apiClient'
import type { AuthFlowError } from '@/types'

export const SESSION_KEY = 'wedding_ease_user'

// Phone-created accounts historically used a derived address; kept so stored profiles still render.
export const DERIVED_EMAIL_DOMAIN = 'phone.weddingease.local'

export function isDerivedPhoneEmail(email?: string | null): boolean {
  return !!email && email.endsWith(`@${DERIVED_EMAIL_DOMAIN}`)
}

/** The signed-in identity as the UI needs it (was a Firebase `User`). */
export interface AppUser {
  uid: string
  email: string | null
  displayName: string | null
  phoneNumber: string | null
  photoURL: string | null
  emailVerified: boolean
  providerData: { providerId: 'password' | 'google.com' | 'phone' }[]
  metadata: { creationTime?: string; lastSignInTime?: string }
  getIdToken(): Promise<string>
}

interface ServerUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  photoURL: string | null
  isVerified: boolean
  authProviders: ('email' | 'google' | 'phone')[]
}

const PROVIDER = { email: 'password', google: 'google.com', phone: 'phone' } as const

export function toAppUser(u: ServerUser, now = new Date().toISOString()): AppUser {
  return {
    uid: u.id,
    email: u.email,
    displayName: u.name,
    phoneNumber: u.phone,
    photoURL: u.photoURL,
    emailVerified: u.isVerified,
    providerData: (u.authProviders.length ? u.authProviders : ['email']).map((p) => ({ providerId: PROVIDER[p] })),
    metadata: { creationTime: now, lastSignInTime: now },
    getIdToken: async () => getToken() ?? '',
  }
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
    'USER_PROFILE_NOT_FOUND': 'No account found with this email address',
    'OTP_NOT_FOUND': 'No reset request found. Please request a new code.',
    'OTP_EXPIRED': 'Code has expired. Please request a new one.',
    'OTP_INVALID': 'Incorrect code. Please try again.',
    'RESET_TOKEN_INVALID': 'Reset session expired. Please start over.',
    'EMAIL_OWNED_BY_GOOGLE': 'This email is already registered with Google. Please continue with Google.',
    'LINK_GOOGLE_TO_PASSWORD': 'This email already has a password account. Enter your password to link Google.',
    'WEAK_PASSWORD_POLICY': 'Password does not meet strength requirements',
    'PHONE_DEVICE_MISMATCH': 'This phone is not registered on this device. Please use email sign-in, or sign up again on this device.',
    'USE_PHONE_SIGNIN': 'This account was created with a phone number. Please sign in with your phone.',
    'USE_EMAIL_SIGNIN': 'This account was created with email. Please sign in with email and password.',
    'NETWORK_ERROR': 'Network error. Please check your connection and try again.',
    'FORGOT_PASSWORD_ERROR': 'Something went wrong. Please try again.',
  }
  return map[code] ?? 'Something went wrong. Please try again.'
}

function makeAuthError(code: string, extra?: Partial<AuthFlowError>): AuthFlowError {
  const err = new Error(mapAuthError(code)) as AuthFlowError
  err.code = code
  Object.assign(err, extra)
  return err
}

/** Server codes → the Firebase-style codes the modals already branch on. */
const SERVER_TO_LEGACY: Record<string, string> = {
  EMAIL_IN_USE: 'auth/email-already-in-use',
  USER_NOT_FOUND: 'auth/user-not-found',
  WRONG_PASSWORD: 'auth/wrong-password',
  RATE_LIMITED: 'auth/too-many-requests',
  PHONE_IN_USE: 'PHONE_DUPLICATE',
}

function fail(e: unknown): never {
  if (e instanceof ApiError) {
    const code = SERVER_TO_LEGACY[e.code ?? ''] ?? e.code ?? 'auth/unknown'
    const b = (e.body ?? {}) as Record<string, unknown>
    const err = makeAuthError(code, { uid: b.uid as string | undefined, email: b.email as string | undefined, phone: (b.phone as string | undefined) ?? null })
    err.message = e.message || err.message
    ;(err as AuthFlowError & { name?: string }).name = String(b.name ?? '')
    throw err
  }
  throw makeAuthError('NETWORK_ERROR')
}

async function call<T>(path: string, json?: unknown, method?: string): Promise<T> {
  try {
    return await api<T>(path, json === undefined ? { method: method ?? 'GET' } : { json, method })
  } catch (e) {
    fail(e)
  }
}

// ── Session ────────────────────────────────────────────────────────────────────

export interface Session { token: string; user: ServerUser }
let cached: Session | null = null

/** Persists the token and returns the signed-in user. */
export function applySession(s: Session): AppUser {
  setToken(s.token)
  cached = null
  return toAppUser(s.user)
}

/** Restores the user for a stored token (or `null`). */
export async function restoreSession(): Promise<AppUser | null> {
  if (!getToken()) return null
  try {
    const { user } = await api<{ user: ServerUser }>('/auth/me')
    return toAppUser(user)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setToken(null)
    return null
  }
}

// ── Email sign-up / sign-in ────────────────────────────────────────────────────

export interface SignedUp { uid: string; email: string; name: string; phone: string | null }
let pendingEmailUid: string | null = null

/** Creates the account and sends the verification email; there is no session until it is verified. */
export async function signUpWithEmail(name: string, email: string, phone: string | null, password: string): Promise<SignedUp> {
  const r = await call<{ uid: string; email: string; name: string; phone: string | null }>('/auth/signup', { name, email, password, phone })
  pendingEmailUid = r.uid
  return { uid: r.uid, email: r.email ?? email, name: r.name ?? name, phone: r.phone ?? null }
}

export async function signInWithEmail(email: string, password: string): Promise<AppUser> {
  try {
    return applySession(await api<Session>('/auth/login', { json: { email, password } }))
  } catch (e) {
    if (e instanceof ApiError && e.code === 'UNVERIFIED_ACCOUNT') pendingEmailUid = ((e.body ?? {}) as { uid?: string }).uid ?? pendingEmailUid
    fail(e)
  }
}

/** Polled by the "check your inbox" screen. */
export async function isEmailVerified(uid: string): Promise<boolean> {
  try {
    return (await api<{ verified: boolean }>(`/auth/verification-status?uid=${encodeURIComponent(uid)}`)).verified
  } catch {
    return false
  }
}

/** `password` is no longer needed (the server resends by account id); kept for call-site compatibility. */
export async function resendVerificationEmail(_email: string, _password?: string, uid?: string): Promise<void> {
  const id = uid ?? pendingEmailUid
  if (!id) throw makeAuthError('USER_NOT_FOUND')
  await call('/auth/resend-verification', { uid: id })
}

// ── Google ─────────────────────────────────────────────────────────────────────

interface GsiCredentialResponse { credential?: string }
interface GsiApi { accounts: { id: { initialize(o: { client_id: string; callback: (r: GsiCredentialResponse) => void; cancel_on_tap_outside?: boolean }): void; prompt(cb?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void } } }
declare global { interface Window { google?: GsiApi } }

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(makeAuthError('NETWORK_ERROR'))
    document.head.appendChild(s)
  })
}

/** Google Identity Services → ID token → `/auth/google` (the server verifies it and finds/creates the account by email). */
export async function signInWithGoogleAuth(allowSignUp = true): Promise<{ user: AppUser; googleAccessToken: string | null }> {
  const cfg = await call<{ enabled: boolean; clientId: string | null }>('/auth/google/config')
  if (!cfg.enabled || !cfg.clientId) throw makeAuthError('auth/popup-closed-by-user')
  await loadGsi()
  const idToken = await new Promise<string>((resolve, reject) => {
    window.google!.accounts.id.initialize({ client_id: cfg.clientId!, cancel_on_tap_outside: true, callback: (r) => (r.credential ? resolve(r.credential) : reject(makeAuthError('auth/popup-closed-by-user'))) })
    window.google!.accounts.id.prompt((n) => { if (n.isNotDisplayed() || n.isSkippedMoment()) reject(makeAuthError('auth/popup-closed-by-user')) })
  })
  try {
    const s = await api<Session>('/auth/google', { json: { idToken, allowSignUp } })
    return { user: applySession(s), googleAccessToken: null }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'GOOGLE_ACCOUNT_NOT_FOUND') throw makeAuthError('GOOGLE_ACCOUNT_NOT_FOUND')
    fail(e)
  }
}

/** Accounts are matched by verified email on the server, so there is nothing to link client-side. */
export async function linkPendingGoogleCredential(_email: string, _password: string, _pending: unknown): Promise<AppUser> {
  throw makeAuthError('LINK_GOOGLE_TO_PASSWORD')
}

// ── Forgot password (email OTP; server-verified) ────────────────────────────────

export async function sendForgotPasswordOtp(email: string): Promise<void> {
  await call('/auth/forgot-password/send-otp', { email: email.trim().toLowerCase() })
}
export async function verifyForgotPasswordOtp(email: string, otp: string): Promise<{ resetToken: string }> {
  return call('/auth/forgot-password/verify-otp', { email: email.trim().toLowerCase(), otp: otp.trim() })
}
export async function updatePasswordByEmail(email: string, resetToken: string, newPassword: string): Promise<void> {
  await call('/auth/forgot-password/reset-password', { email: email.trim().toLowerCase(), resetToken, newPassword })
}
/** The Firebase magic-link fallback no longer exists; the OTP flow is the only reset path. */
export const sendForgotPasswordEmail = sendForgotPasswordOtp

// ── Sign out ───────────────────────────────────────────────────────────────────

export async function signOutUser(uid?: string): Promise<void> {
  try { await api('/auth/logout', { method: 'POST' }) } catch { /* stateless token: dropping it is the logout */ }
  setToken(null)
  cached = null
  pendingEmailUid = null
  if (uid) localStorage.removeItem(`weddingease_currency_manually_set_${uid}`)
  localStorage.removeItem('weddingease_currency_manually_set')
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
}

export async function updatePreferredLanguage(_uid: string, language: string): Promise<void> {
  await call('/account/preferences', { language }, 'PATCH')
}

// ── WhatsApp-OTP phone auth (server-verified) ─────────────────────────────────────

export type OtpPurpose = 'signup' | 'login' | 'reset'
let pendingPhoneSignup: { name: string; e164: string; realEmail: string } | null = null

/** Records the sign-up intent; the OTP is requested next (`sendPhoneOtpServer`). */
export async function signUpWithPhoneCredential(name: string, e164: string, realEmail: string) {
  pendingPhoneSignup = { name, e164, realEmail }
  return { uid: '', derivedEmail: '', name, phone: e164, realEmail }
}

export async function sendPhoneOtpServer(e164: string, purpose: OtpPurpose): Promise<void> {
  cached = null
  if (purpose === 'signup') {
    if (pendingPhoneSignup?.e164 === e164) await call('/auth/phone/signup/send', { phone: e164, name: pendingPhoneSignup.name })
    else if (pendingEmailUid) await call('/auth/unverified/send', { uid: pendingEmailUid })
    else throw makeAuthError('USER_PROFILE_NOT_FOUND')
  } else {
    await call('/auth/phone/signin/send', { phone: e164 })
  }
}

/** Verifies the code on the server (which consumes it) and holds the resulting session until the flow's final step applies it. */
export async function verifyPhoneOtpServer(e164: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  try {
    if (purpose === 'signup') {
      cached = pendingPhoneSignup?.e164 === e164
        ? await api<Session>('/auth/phone/signup/verify', { json: { phone: e164, name: pendingPhoneSignup.name, code } })
        : await api<Session>('/auth/unverified/verify', { json: { uid: pendingEmailUid, code } })
    } else {
      cached = await api<Session>('/auth/phone/signin/verify', { json: { phone: e164, code } })
    }
    return true
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 403)) return false
    fail(e)
  }
}

function applyCached(): AppUser {
  if (!cached) throw makeAuthError('OTP_NOT_FOUND')
  return applySession(cached)
}
export const completePhoneSignupAfterOtp = async (_e164: string) => applyCached()
export const signInWithPhoneCredential = async (_e164: string) => applyCached()
export const rotatePhoneCredentialAfterOtp = async (_e164: string) => applyCached()
export const markEmailUserVerifiedAfterPhoneOtp = async (_email: string, _password: string) => { applyCached() }
