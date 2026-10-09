import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react'
import type { UserProfile } from '@/types'
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogleAuth,
  signOutUser,
  restoreSession,
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
  sendPhoneOtpServer,
  verifyPhoneOtpServer,
  type AppUser,
  type OtpPurpose,
} from '@/services/authService'
import { getAccountMe } from '@/services/accountService'
import { setCurrentUser } from '@/lib/authState'
import { identify, reset, register, track, setUserProperties, startReplay } from '@/lib/analytics'

export type { OtpPurpose }

interface AuthContextValue {
  user: AppUser | null
  profile: UserProfile | null
  loading: boolean
  isHandlingAuth: React.MutableRefObject<boolean>
  signUp: (name: string, email: string, phone: string | null, password: string) => Promise<{ uid: string; email: string; name: string; phone: string | null }>
  signIn: (email: string, password: string) => Promise<AppUser>
  signInWithGoogle: (allowSignUp?: boolean) => Promise<AppUser>
  signOut: () => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  sendForgotPasswordOtp: (email: string) => Promise<void>
  verifyForgotPasswordOtp: (email: string, otp: string) => Promise<{ resetToken: string }>
  updatePasswordByEmail: (email: string, resetToken: string, newPassword: string) => Promise<void>
  resendVerification: (email: string, password: string) => Promise<void>
  // WhatsApp-OTP phone auth (the code is generated and checked on the server)
  sendPhoneOtpWhatsApp: (e164: string, purpose: OtpPurpose) => Promise<void>
  verifyPhoneOtpWhatsApp: (e164: string, code: string, purpose: OtpPurpose) => Promise<boolean>
  signUpPhone: (name: string, realEmail: string, e164: string) => Promise<{ uid: string; derivedEmail: string; name: string; phone: string; realEmail: string }>
  confirmPhoneSignup: (e164: string) => Promise<void>
  signInPhone: (e164: string) => Promise<AppUser>
  rotatePhonePassword: (e164: string) => Promise<AppUser>
  markEmailUserVerifiedAfterPhoneOtp: (email: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const isHandlingAuth = useRef(false)

  /** Loads the profile for a freshly signed-in user and publishes both; PostHog identify + super props as before. */
  const establish = async (u: AppUser): Promise<AppUser> => {
    setUser(u)
    setCurrentUser(u)
    try {
      const me = await getAccountMe()
      setProfile(me.profile)
      const planTier = me.plan?.tier ?? 'free'
      identify(u.uid, { email: u.email ?? undefined, plan_tier: planTier })
      register({ is_authenticated: true, plan_tier: planTier })
      startReplay({ isPaying: planTier !== 'free', route: typeof window !== 'undefined' ? window.location.pathname : undefined })
    } catch (err) {
      console.error('[AuthContext] profile load failed', err)
    }
    return u
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const restored = await restoreSession()
      if (cancelled) return
      if (restored && !isHandlingAuth.current) await establish(restored)
      if (!cancelled) { setCurrentUser(restored, true); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Auth methods ─────────────────────────────────────────────────────────

  const withAuth = async <T,>(fn: () => Promise<T>): Promise<T> => {
    isHandlingAuth.current = true
    try {
      return await fn()
    } finally {
      isHandlingAuth.current = false
    }
  }

  const handleSignUp = (name: string, email: string, phone: string | null, password: string) =>
    withAuth(async () => {
      const r = await signUpWithEmail(name, email, phone, password)
      identify(r.uid, { email })
      setUserProperties({ signup_source: 'email', created_at: new Date().toISOString() })
      track('signup_completed', { method: 'email', is_guest_conversion: false })
      return r
    })

  const handleSignIn = (email: string, password: string) =>
    withAuth(async () => {
      const u = await establish(await signInWithEmail(email, password))
      track('login_completed', { method: 'email' })
      return u
    })

  const handleGoogleSignIn = (allowSignUp = true) =>
    withAuth(async () => {
      const { user: u } = await signInWithGoogleAuth(allowSignUp)
      await establish(u)
      track('login_completed', { method: 'google' })
      return u
    })

  const handleSignOut = async () => {
    track('logout')
    await signOutUser(user?.uid)
    setUser(null)
    setCurrentUser(null)
    setProfile(null)
    reset()
    register({ is_authenticated: false })
  }

  const handleSignUpPhone = (name: string, realEmail: string, e164: string) => signUpWithPhoneCredential(name, e164, realEmail)

  const handleConfirmPhoneSignup = (e164: string) =>
    withAuth(async () => {
      const u = await establish(await completePhoneSignupAfterOtp(e164))
      track('signup_completed', { method: 'phone' })
      void u
    })

  const handleSignInPhone = (e164: string) =>
    withAuth(async () => {
      const u = await establish(await signInWithPhoneCredential(e164))
      track('login_completed', { method: 'phone' })
      return u
    })

  const handleRotatePhonePassword = (e164: string) => withAuth(async () => establish(await rotatePhoneCredentialAfterOtp(e164)))

  const handleMarkVerified = (email: string, password: string) =>
    withAuth(async () => {
      // The unverified-recovery OTP already produced a session on the server; applying it signs the user in.
      await markEmailUserVerifiedAfterPhoneOtp(email, password)
      const restored = await restoreSession()
      if (restored) await establish(restored)
    })

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
        forgotPassword: sendForgotPasswordEmail,
        sendForgotPasswordOtp,
        verifyForgotPasswordOtp,
        updatePasswordByEmail,
        resendVerification: resendVerificationEmail,
        sendPhoneOtpWhatsApp: sendPhoneOtpServer,
        verifyPhoneOtpWhatsApp: verifyPhoneOtpServer,
        signUpPhone: handleSignUpPhone,
        confirmPhoneSignup: handleConfirmPhoneSignup,
        signInPhone: handleSignInPhone,
        rotatePhonePassword: handleRotatePhonePassword,
        markEmailUserVerifiedAfterPhoneOtp: handleMarkVerified,
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
