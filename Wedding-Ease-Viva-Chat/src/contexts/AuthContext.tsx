import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react'
import { onAuthStateChanged, User, ConfirmationResult, RecaptchaVerifier } from 'firebase/auth'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
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

      if (firebaseUser) {
        const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))

        if (!profileSnap.exists()) {
          setUser(null)
          setProfile(null)
        } else {
          const profileData = profileSnap.data() as UserProfile

          // Sync Firebase emailVerified → Firestore
          if (firebaseUser.emailVerified && !profileData.isVerified) {
            await updateDoc(doc(db, 'users', firebaseUser.uid), {
              isVerified: true,
              isValidated: true,
              verifiedAt: serverTimestamp(),
            })
            profileData.isVerified = true
            profileData.isValidated = true
          }

          if (!profileData.isVerified && !profileData.isValidated && !firebaseUser.emailVerified) {
            // Not verified — sign out silently (authflow.md §9)
            await signOutUser(firebaseUser.uid)
            setUser(null)
            setProfile(null)
          } else {
            setUser(firebaseUser)
            setProfile(profileData)
            // PostHog: identify + super props. Safe to call on every auth change;
            // posthog dedupes on same distinct_id + property set.
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
        }
      } else {
        setUser(null)
        setProfile(null)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

  // ── Auth methods ─────────────────────────────────────────────────────────

  const handleSignUp = async (name: string, email: string, phone: string | null, password: string) => {
    isHandlingAuth.current = true
    try {
      return await signUpWithEmail(name, email, phone, password)
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
