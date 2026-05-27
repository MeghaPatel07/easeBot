import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react'
import { onAuthStateChanged, User, ConfirmationResult, RecaptchaVerifier } from 'firebase/auth'
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import type { UserProfile } from '@/types'
import {
  SESSION_KEY,
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogleAuth,
  signOutUser,
  sendPhoneOtp,
  verifyPhoneOtp,
  sendForgotPasswordEmail,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  updatePasswordByEmail,
  resendVerificationEmail,
  signUpWithPhoneCredential,
  completePhoneSignupAfterOtp,
  signInWithPhoneCredential,
  rotatePhoneCredentialAfterOtp,
  markEmailUserVerifiedAfterPhoneOtp,
} from '@/services/authService'
import {
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  type OtpPurpose,
} from '@/services/whatsappOtpService'
import { identify, reset, register, track, setUserProperties, startReplay } from '@/lib/analytics'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isHandlingAuth: React.MutableRefObject<boolean>
  signUp: (name: string, email: string, phone: string | null, password: string) => Promise<{ uid: string; email: string; name: string; phone: string | null }>
  signIn: (email: string, password: string) => Promise<User>
  signInWithGoogle: (allowSignUp?: boolean) => Promise<User>
  signOut: () => Promise<void>
  sendOtp: (phone: string, verifier: RecaptchaVerifier) => Promise<ConfirmationResult>
  verifyOtp: (result: ConfirmationResult, otp: string) => Promise<UserProfile>
  forgotPassword: (email: string) => Promise<void>
  sendForgotPasswordOtp: (email: string) => Promise<void>
  verifyForgotPasswordOtp: (email: string, otp: string) => Promise<{ resetToken: string }>
  updatePasswordByEmail: (email: string, resetToken: string, newPassword: string) => Promise<void>
  resendVerification: (email: string, password: string) => Promise<void>
  // WhatsApp-OTP phone auth
  sendPhoneOtpWhatsApp: (e164: string, purpose: OtpPurpose) => Promise<void>
  verifyPhoneOtpWhatsApp: (e164: string, code: string, purpose: OtpPurpose) => Promise<boolean>
  signUpPhone: (name: string, realEmail: string, e164: string) => Promise<{ uid: string; derivedEmail: string; name: string; phone: string; realEmail: string }>
  confirmPhoneSignup: (e164: string) => Promise<void>
  signInPhone: (e164: string) => Promise<User>
  rotatePhonePassword: (e164: string) => Promise<User>
  markEmailUserVerifiedAfterPhoneOtp: (email: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const isHandlingAuth = useRef(false)
  // WE-20260527-170: live subscription to users/{uid} so every consumer of
  // useAuth().profile sees the same fan-out as useAccount() — no stale F5-only
  // fields like name / email / voiceId / toneSettings / responseStyle.
  const profileUnsubRef = useRef<Unsubscribe | null>(null)

  useEffect(() => {
    // Step 1 — sessionStorage check (authflow.md §9 — future Twilio/WhatsApp phone sessions)
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      try {
        setProfile(JSON.parse(raw) as UserProfile)
        setLoading(false)
        return // stop — no Firebase listener needed for phone sessions
      } catch {
        sessionStorage.removeItem(SESSION_KEY)
      }
    }

    // Step 2 — Firebase onAuthStateChanged (authflow.md §9)
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Guard against race conditions during signup/Google OAuth
      if (isHandlingAuth.current) return

      // Tear down any prior profile listener — auth flipped to a different
      // user or signed out, so the old subscription is no longer relevant.
      profileUnsubRef.current?.()
      profileUnsubRef.current = null

      if (!firebaseUser) {
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      // Subscribe to the user doc so AuthContext.profile is realtime. Both
      // useAuth() and useAccount() (which fans out via TanStack invalidation
      // on mutation) now observe the same Firestore source of truth.
      let firstSnapshot = true
      profileUnsubRef.current = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        async (snap) => {
          if (!snap.exists()) {
            // Profile doc was deleted (admin tool, etc.) — drop the session.
            setUser(null)
            setProfile(null)
            setLoading(false)
            firstSnapshot = false
            return
          }

          const profileData = snap.data() as UserProfile

          // Sync Firebase emailVerified → Firestore once per session. This is
          // a no-op on subsequent snapshots (the condition flips false after
          // the Firestore write fans back through this same listener).
          if (firebaseUser.emailVerified && !profileData.isVerified) {
            try {
              await updateDoc(doc(db, 'users', firebaseUser.uid), {
                isVerified: true,
                isValidated: true,
                verifiedAt: serverTimestamp(),
              })
              // Optimistic — the snapshot fan-out will confirm.
              profileData.isVerified = true
              profileData.isValidated = true
            } catch (err) {
              console.error('failed to sync emailVerified to Firestore', err)
            }
          }

          // First snapshot only: gate sign-in on verification status. Later
          // snapshots must NOT silently sign the user out (otherwise a
          // pending Firestore write that momentarily lacks the flag would
          // boot them mid-session).
          if (
            firstSnapshot &&
            !profileData.isVerified &&
            !profileData.isValidated &&
            !firebaseUser.emailVerified
          ) {
            await signOutUser(firebaseUser.uid)
            setUser(null)
            setProfile(null)
            setLoading(false)
            firstSnapshot = false
            return
          }

          setUser(firebaseUser)
          setProfile(profileData)
          setLoading(false)

          // PostHog: identify + super props on first snapshot only. posthog
          // dedupes on the same distinct_id + property set, but emitting on
          // every Firestore change would be noisy.
          if (firstSnapshot) {
            const planTier = (profileData as { plan?: string }).plan ?? 'free'
            identify(firebaseUser.uid, {
              email: firebaseUser.email ?? undefined,
              plan_tier: planTier,
            })
            register({
              is_authenticated: true,
              plan_tier: planTier,
            })
            startReplay({
              isPaying: planTier !== 'free',
              route: typeof window !== 'undefined' ? window.location.pathname : undefined,
            })
          }

          firstSnapshot = false
        },
        (err) => {
          // Don't blow away the existing profile on a transient listener
          // error — just log; the next reconnect will resume.
          console.error('AuthContext profile snapshot error', err)
          setLoading(false)
        },
      )
    })

    return () => {
      // StrictMode double-mount safe: both onAuthStateChanged + the profile
      // listener get cleaned up here, so the second mount starts fresh.
      profileUnsubRef.current?.()
      profileUnsubRef.current = null
      unsubscribe()
    }
  }, [])

  // ── Auth methods ─────────────────────────────────────────────────────────

  const handleSignUp = async (name: string, email: string, phone: string | null, password: string) => {
    isHandlingAuth.current = true
    try {
      const firebaseUser = await signUpWithEmail(name, email, phone, password)
      identify(firebaseUser.uid, { email: firebaseUser.email ?? undefined })
      setUserProperties({ signup_source: 'email', created_at: new Date().toISOString() })
      track('signup_completed', { method: 'email', is_guest_conversion: false })
      return firebaseUser
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleSignIn = async (email: string, password: string) => {
    isHandlingAuth.current = true
    try {
      const firebaseUser = await signInWithEmail(email, password)
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
      if (profileSnap.exists()) setProfile(profileSnap.data() as UserProfile)
      setUser(firebaseUser)
      identify(firebaseUser.uid, { email: firebaseUser.email ?? undefined })
      track('login_completed', { method: 'email' })
      return firebaseUser
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleGoogleSignIn = async (allowSignUp = true) => {
    isHandlingAuth.current = true
    try {
      const { user: firebaseUser } = await signInWithGoogleAuth(allowSignUp)
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as UserProfile
        setProfile(profileData)
      }
      setUser(firebaseUser)
      identify(firebaseUser.uid, { email: firebaseUser.email ?? undefined })
      // Firebase stamps creationTime === lastSignInTime for first login; use that
      // to distinguish signup from login (within 5s tolerance).
      const created = firebaseUser.metadata.creationTime
      const last = firebaseUser.metadata.lastSignInTime
      const isNewUser = created && last && Math.abs(new Date(created).getTime() - new Date(last).getTime()) < 5_000
      if (isNewUser) {
        setUserProperties({ signup_source: 'google', created_at: new Date().toISOString() })
        track('signup_completed', { method: 'google', is_guest_conversion: false })
      } else {
        track('login_completed', { method: 'google' })
      }
      return firebaseUser
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleSignOut = async () => {
    track('logout')
    // Drop the profile snapshot before signing out so we don't get a stray
    // permission-denied error from a listener that's still attached when
    // Firestore rules re-evaluate sans auth (WE-20260527-170).
    profileUnsubRef.current?.()
    profileUnsubRef.current = null
    await signOutUser(user?.uid)
    setUser(null)
    setProfile(null)
    reset()
    register({ is_authenticated: false })
  }

  const handleSendOtp = (phone: string, verifier: RecaptchaVerifier) =>
    sendPhoneOtp(phone, verifier)

  const handleVerifyOtp = async (result: ConfirmationResult, otp: string) => {
    isHandlingAuth.current = true
    try {
      const prof = await verifyPhoneOtp(result, otp)
      setProfile(prof)
      return prof
    } finally {
      isHandlingAuth.current = false
    }
  }

  // ── WhatsApp-OTP Phone Auth ─────────────────────────────────────────────

  const handleSendPhoneOtpWhatsApp = (e164: string, purpose: OtpPurpose) =>
    sendWhatsAppOtp(e164, purpose)

  const handleVerifyPhoneOtpWhatsApp = (e164: string, code: string, purpose: OtpPurpose) =>
    verifyWhatsAppOtp(e164, code, purpose)

  const handleSignUpPhone = async (name: string, realEmail: string, e164: string) => {
    // signUpWithPhoneCredential creates the account, stores the credential
    // locally, then signs out. We'll sign back in after OTP verify.
    return await signUpWithPhoneCredential(name, e164, realEmail)
  }

  // Spec asked for confirmPhoneSignup(uid); we accept an E.164 instead because
  // we need the phone to look up the local credential to re-sign in after
  // the post-signup sign-out. UID-based lookup isn't possible (Firestore rules
  // require auth.uid match). See report for justification.
  const handleConfirmPhoneSignup = async (e164: string) => {
    isHandlingAuth.current = true
    try {
      const firebaseUser = await completePhoneSignupAfterOtp(e164)
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
      if (profileSnap.exists()) setProfile(profileSnap.data() as UserProfile)
      setUser(firebaseUser)
      identify(firebaseUser.uid, { email: firebaseUser.email ?? undefined })
      track('signup_completed', { method: 'phone' })
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleSignInPhone = async (e164: string) => {
    isHandlingAuth.current = true
    try {
      const firebaseUser = await signInWithPhoneCredential(e164)
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
      if (profileSnap.exists()) setProfile(profileSnap.data() as UserProfile)
      setUser(firebaseUser)
      identify(firebaseUser.uid, { email: firebaseUser.email ?? undefined })
      track('login_completed', { method: 'phone' })
      return firebaseUser
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleRotatePhonePassword = async (e164: string) => {
    isHandlingAuth.current = true
    try {
      const firebaseUser = await rotatePhoneCredentialAfterOtp(e164)
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
      if (profileSnap.exists()) setProfile(profileSnap.data() as UserProfile)
      setUser(firebaseUser)
      return firebaseUser
    } finally {
      isHandlingAuth.current = false
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isHandlingAuth,
        signUp: handleSignUp,
        signIn: handleSignIn,
        signInWithGoogle: handleGoogleSignIn,
        signOut: handleSignOut,
        sendOtp: handleSendOtp,
        verifyOtp: handleVerifyOtp,
        forgotPassword: sendForgotPasswordEmail,
        sendForgotPasswordOtp,
        verifyForgotPasswordOtp,
        updatePasswordByEmail,
        resendVerification: resendVerificationEmail,
        sendPhoneOtpWhatsApp: handleSendPhoneOtpWhatsApp,
        verifyPhoneOtpWhatsApp: handleVerifyPhoneOtpWhatsApp,
        signUpPhone: handleSignUpPhone,
        confirmPhoneSignup: handleConfirmPhoneSignup,
        signInPhone: handleSignInPhone,
        rotatePhonePassword: handleRotatePhonePassword,
        markEmailUserVerifiedAfterPhoneOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
