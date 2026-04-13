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
  resendVerificationEmail,
  signUpWithPhoneCredential,
  completePhoneSignupAfterOtp,
  signInWithPhoneCredential,
  rotatePhoneCredentialAfterOtp,
} from '@/services/authService'
import {
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  type OtpPurpose,
} from '@/services/whatsappOtpService'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  googleCalendarToken: string | null
  isHandlingAuth: React.MutableRefObject<boolean>
  signUp: (name: string, email: string, phone: string | null, password: string) => Promise<{ uid: string; email: string; name: string; phone: string | null }>
  signIn: (email: string, password: string) => Promise<User>
  signInWithGoogle: (allowSignUp?: boolean) => Promise<User>
  signOut: () => Promise<void>
  sendOtp: (phone: string, verifier: RecaptchaVerifier) => Promise<ConfirmationResult>
  verifyOtp: (result: ConfirmationResult, otp: string) => Promise<UserProfile>
  forgotPassword: (email: string) => Promise<void>
  resendVerification: (email: string, password: string) => Promise<void>
  // WhatsApp-OTP phone auth
  sendPhoneOtpWhatsApp: (e164: string, purpose: OtpPurpose) => Promise<void>
  verifyPhoneOtpWhatsApp: (e164: string, code: string, purpose: OtpPurpose) => Promise<boolean>
  signUpPhone: (name: string, realEmail: string, e164: string) => Promise<{ uid: string; derivedEmail: string; name: string; phone: string; realEmail: string }>
  confirmPhoneSignup: (e164: string) => Promise<void>
  signInPhone: (e164: string) => Promise<User>
  rotatePhonePassword: (e164: string) => Promise<User>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleCalendarToken, setGoogleCalendarToken] = useState<string | null>(null)
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
            if (profileData.googleCalendarToken) setGoogleCalendarToken(profileData.googleCalendarToken)
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
      return firebaseUser
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleGoogleSignIn = async (allowSignUp = true) => {
    isHandlingAuth.current = true
    try {
      const { user: firebaseUser, googleAccessToken } = await signInWithGoogleAuth(allowSignUp)
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as UserProfile
        setProfile(profileData)
        if (profileData.googleCalendarToken) setGoogleCalendarToken(profileData.googleCalendarToken)
      }
      setUser(firebaseUser)
      if (googleAccessToken) setGoogleCalendarToken(googleAccessToken)
      return firebaseUser
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleSignOut = async () => {
    await signOutUser(user?.uid)
    setUser(null)
    setProfile(null)
    setGoogleCalendarToken(null)
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
        googleCalendarToken,
        isHandlingAuth,
        signUp: handleSignUp,
        signIn: handleSignIn,
        signInWithGoogle: handleGoogleSignIn,
        signOut: handleSignOut,
        sendOtp: handleSendOtp,
        verifyOtp: handleVerifyOtp,
        forgotPassword: sendForgotPasswordEmail,
        resendVerification: resendVerificationEmail,
        sendPhoneOtpWhatsApp: handleSendPhoneOtpWhatsApp,
        verifyPhoneOtpWhatsApp: handleVerifyPhoneOtpWhatsApp,
        signUpPhone: handleSignUpPhone,
        confirmPhoneSignup: handleConfirmPhoneSignup,
        signInPhone: handleSignInPhone,
        rotatePhonePassword: handleRotatePhonePassword,
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
