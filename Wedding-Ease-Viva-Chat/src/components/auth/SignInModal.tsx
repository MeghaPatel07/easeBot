import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, Loader2, CheckCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { mapAuthError, linkPendingGoogleCredential } from '@/services/authService'
import type { AuthCredential } from 'firebase/auth'
import PhoneInput, { toE164, type PhoneInputValue } from './PhoneInput'
import { validatePassword, describeIssue, PASSWORD_MIN_LENGTH, type PasswordIssue } from '@/utils/passwordPolicy'
import { track } from '@/lib/analytics'

type Tab = 'email' | 'phone'
type ForgotStep = 'email' | 'otp' | 'newpass' | 'success'
type View = 'default' | 'forgot' | 'unverified' | 'link-google'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchToSignUp: (prefillEmail?: string) => void
}

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const REMEMBER_KEY = 'wedding_ease_remembered_email'
const OTP_RESEND_COOLDOWN = 30
const OTP_EXPIRY_SECONDS = 5 * 60
const FP_RESEND_COOLDOWN = 60

export default function SignInModal({ open, onOpenChange, onSwitchToSignUp }: Props) {
  const {
    signIn,
    signInWithGoogle,
    sendForgotPasswordOtp,
    verifyForgotPasswordOtp,
    updatePasswordByEmail,
    resendVerification,
    sendPhoneOtpWhatsApp,
    verifyPhoneOtpWhatsApp,
    signInPhone,
    rotatePhonePassword,
  } = useAuth()

  const [tab, setTab] = useState<Tab>('email')
  const [view, setView] = useState<View>('default')

  // Email sign-in
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem(REMEMBER_KEY))

  // Phone sign-in (WhatsApp OTP)
  const [phone, setPhone] = useState<PhoneInputValue>({ countryCode: 'IN', national: '' })
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpResendTimer, setOtpResendTimer] = useState(0)
  const [otpExpiryTimer, setOtpExpiryTimer] = useState(0)
  const [deviceMismatch, setDeviceMismatch] = useState(false)

  // Link Google to existing password account
  const [linkEmail, setLinkEmail] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const [pendingCred, setPendingCred] = useState<AuthCredential | null>(null)

  // Forgot password (email-only OTP flow per authflow.md §6)
  const [fpStep, setFpStep] = useState<ForgotStep>('email')
  const [fpEmail, setFpEmail] = useState('')
  const [fpOtp, setFpOtp] = useState<string[]>(['', '', '', '', '', ''])
  const [fpResetToken, setFpResetToken] = useState('')
  const [fpNewPassword, setFpNewPassword] = useState('')
  const [fpConfirmPassword, setFpConfirmPassword] = useState('')
  const [fpShowNewPass, setFpShowNewPass] = useState(false)
  const [fpShowConfirmPass, setFpShowConfirmPass] = useState(false)
  const [fpResendTimer, setFpResendTimer] = useState(0)
  const fpOtpInputsRef = useRef<(HTMLInputElement | null)[]>([])

  // Unverified recovery
  const [unverifiedUser, setUnverifiedUser] = useState<{ uid: string; email: string; name: string; phone: string | null } | null>(null)
  const [resendPassword, setResendPassword] = useState('')
  const [resendSent, setResendSent] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // OTP countdown timers — signin phone tab
  useEffect(() => {
    if (otpResendTimer <= 0) return
    const id = setTimeout(() => setOtpResendTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [otpResendTimer])
  useEffect(() => {
    if (otpExpiryTimer <= 0) return
    const id = setTimeout(() => setOtpExpiryTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [otpExpiryTimer])
  // Forgot-password resend cooldown
  useEffect(() => {
    if (fpResendTimer <= 0) return
    const id = setTimeout(() => setFpResendTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [fpResendTimer])

  function reset() {
    setTab('email')
    setView('default')
    setPassword('')
    setPhone({ countryCode: 'IN', national: '' })
    setOtp('')
    setLinkEmail('')
    setLinkPassword('')
    setPendingCred(null)
    setOtpSent(false)
    setOtpResendTimer(0)
    setOtpExpiryTimer(0)
    setDeviceMismatch(false)
    setFpStep('email')
    setFpEmail('')
    setFpOtp(['', '', '', '', '', ''])
    setFpResetToken('')
    setFpNewPassword('')
    setFpConfirmPassword('')
    setFpShowNewPass(false)
    setFpShowConfirmPass(false)
    setFpResendTimer(0)
    setUnverifiedUser(null)
    setResendPassword('')
    setResendSent(false)
    setError('')
  }

  function handleClose(val: boolean) {
    if (!val) reset()
    onOpenChange(val)
  }

  function switchToSignUp(prefillEmail?: string) {
    reset()
    onOpenChange(false)
    onSwitchToSignUp(prefillEmail)
  }

  // ── Email sign-in ─────────────────────────────────────────────────────────

  async function handleEmailSignIn() {
    const trimmedEmail = email.trim()
    if (!trimmedEmail && !password) {
      const msg = 'Please enter your email and password'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!trimmedEmail) {
      const msg = 'Email is required'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      const msg = 'Please enter a valid email address'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!password) {
      const msg = 'Password is required'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setLoading(true)
    try {
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, trimmedEmail)
      else localStorage.removeItem(REMEMBER_KEY)
      await signIn(trimmedEmail, password)
      toast.success('Welcome back!')
      onOpenChange(false)
      reset()
    } catch (err: any) {
      const code = err.code ?? err.message
      if (code === 'UNVERIFIED_ACCOUNT') {
        setUnverifiedUser({ uid: err.uid, email: err.email, name: err.name, phone: err.phone })
        setView('unverified')
        toast.warning('Account not verified', {
          description: 'Please verify your email to continue.',
        })
      } else if (code === 'auth/user-not-found') {
        const msg = 'No account found with this email. Please sign up first.'
        setError(msg)
        toast.error('Account not found', { description: msg })
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        const msg = 'Incorrect email or password.'
        setError(msg)
        toast.error('Sign in failed', { description: msg })
      } else if (code === 'auth/too-many-requests') {
        const msg = 'Too many failed attempts. Please try again later.'
        setError(msg)
        toast.error('Too many attempts', { description: msg })
      } else if (code === 'USE_PHONE_SIGNIN') {
        const msg = mapAuthError(code)
        setError(msg)
        toast.error('Use phone sign-in', { description: msg })
      } else if (code === 'auth/network-request-failed' || code === 'NETWORK_ERROR') {
        const msg = 'Network error. Please check your connection and try again.'
        setError(msg)
        toast.error('Network error', { description: msg })
      } else {
        const msg = mapAuthError(code ?? 'auth/unknown')
        if (msg) {
          setError(msg)
          toast.error('Sign in failed', { description: msg })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Google sign-in ────────────────────────────────────────────────────────

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle(false)
      toast.success('Welcome back!', { description: 'Signed in with Google.' })
      onOpenChange(false)
      reset()
    } catch (err: any) {
      const code = err.code ?? err.message
      if (code === 'auth/popup-closed-by-user') return
      if (code === 'LINK_GOOGLE_TO_PASSWORD') {
        setLinkEmail(err.email ?? '')
        setPendingCred((err.pendingCred as AuthCredential) ?? null)
        setView('link-google')
        toast.info('Link your account', {
          description: 'Enter your password to link Google sign-in.',
        })
        return
      }
      if (code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
        const msg = 'No account found with this Google email. Please sign up first.'
        setError(msg)
        toast.error('Account not found', { description: msg })
        return
      }
      const msg = mapAuthError(code)
      if (msg) {
        setError(msg)
        toast.error('Google sign-in failed', { description: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Phone OTP (WhatsApp) ──────────────────────────────────────────────────

  async function handleSendOtp() {
    const e164 = toE164(phone)
    if (!e164) {
      const msg = 'Enter a valid phone number'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setDeviceMismatch(false)
    setLoading(true)
    try {
      await sendPhoneOtpWhatsApp(e164, 'login')
      track('phone_otp_sent', { purpose: 'login' })
      setOtpSent(true)
      setOtp('')
      setOtpResendTimer(OTP_RESEND_COOLDOWN)
      setOtpExpiryTimer(OTP_EXPIRY_SECONDS)
      toast.success('Code sent', { description: `Sent to ${e164} via WhatsApp.` })
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const code = e.code ?? e.message ?? 'auth/unknown'
      if (code === 'PHONE_NOT_FOUND') {
        const msg = 'No account found with this phone number. Please sign up first.'
        setError(msg)
        toast.error('Account not found', { description: msg })
      } else {
        const msg = mapAuthError(code)
        if (msg) {
          setError(msg)
          toast.error('Could not send code', { description: msg })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    const e164 = toE164(phone)
    if (!e164) {
      const msg = 'Enter a valid phone number'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!otp || otp.length < 6) {
      const msg = 'Enter the 6-digit code'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setLoading(true)
    try {
      const ok = await verifyPhoneOtpWhatsApp(e164, otp, 'login')
      if (!ok) {
        const msg = 'Incorrect or expired code'
        setError(msg)
        toast.error('Invalid code', { description: 'The OTP is incorrect or has expired.' })
        return
      }
      track('phone_otp_verified', { purpose: 'login' })
      await signInPhone(e164)
      toast.success('Welcome back!')
      onOpenChange(false)
      reset()
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const code = e.code ?? e.message ?? 'auth/unknown'
      if (code === 'PHONE_DEVICE_MISMATCH') {
        setDeviceMismatch(true)
        const msg = mapAuthError('PHONE_DEVICE_MISMATCH')
        setError(msg)
        toast.error('Device not registered', { description: msg })
      } else {
        const msg = mapAuthError(code)
        if (msg) {
          setError(msg)
          toast.error('Sign in failed', { description: msg })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot password — 4-step OTP (authflow.md §6) ────────────────────────

  async function handleFpSendOtp() {
    const target = fpEmail.trim()
    if (!target) {
      const msg = 'Enter your email'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) {
      const msg = 'Please enter a valid email address'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setLoading(true)
    try {
      await sendForgotPasswordOtp(target)
      setFpStep('otp')
      setFpOtp(['', '', '', '', '', ''])
      setFpResendTimer(FP_RESEND_COOLDOWN)
      toast.success('Code sent', { description: `Check ${target} for the verification code.` })
      setTimeout(() => fpOtpInputsRef.current[0]?.focus(), 100)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const msg = e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR')
      setError(msg)
      toast.error('Could not send code', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  async function handleFpResendOtp() {
    if (fpResendTimer > 0) return
    setError('')
    setLoading(true)
    try {
      await sendForgotPasswordOtp(fpEmail.trim())
      setFpResendTimer(FP_RESEND_COOLDOWN)
      setFpOtp(['', '', '', '', '', ''])
      toast.success('Code resent', { description: `Sent to ${fpEmail.trim()}.` })
      fpOtpInputsRef.current[0]?.focus()
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const msg = e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR')
      setError(msg)
      toast.error('Could not resend code', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  function handleFpOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return
    const next = [...fpOtp]
    next[index] = value.slice(-1)
    setFpOtp(next)
    setError('')
    if (value && index < 5) fpOtpInputsRef.current[index + 1]?.focus()
  }

  function handleFpOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !fpOtp[index] && index > 0) {
      fpOtpInputsRef.current[index - 1]?.focus()
    }
  }

  function handleFpOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = [...fpOtp]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setFpOtp(next)
    fpOtpInputsRef.current[Math.min(text.length, 5)]?.focus()
  }

  async function handleFpVerifyOtp() {
    const code = fpOtp.join('')
    if (code.length !== 6) {
      const msg = 'Enter the 6-digit code'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setLoading(true)
    try {
      const { resetToken } = await verifyForgotPasswordOtp(fpEmail.trim(), code)
      setFpResetToken(resetToken)
      setFpNewPassword('')
      setFpConfirmPassword('')
      setFpStep('newpass')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const msg = e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR')
      setError(msg)
      toast.error('Invalid code', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  async function handleFpResetPassword() {
    if (!fpNewPassword) {
      const msg = 'Enter a new password'
      setError(msg)
      toast.error(msg)
      return
    }
    const pw = validatePassword(fpNewPassword)
    if (!pw.ok) {
      const msg = pw.issues.map(describeIssue).join(' · ')
      setError(msg)
      toast.error('Weak password', { description: msg })
      return
    }
    if (fpNewPassword !== fpConfirmPassword) {
      const msg = 'Passwords do not match'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setLoading(true)
    try {
      await updatePasswordByEmail(fpEmail.trim(), fpResetToken, fpNewPassword)
      setFpStep('success')
      toast.success('Password updated', {
        description: 'You can now sign in with your new password.',
      })
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const msg = e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR')
      setError(msg)
      toast.error('Reset failed', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  // ── Unverified recovery ───────────────────────────────────────────────────

  async function handleResendVerification() {
    if (!resendPassword) {
      const msg = 'Enter your password to resend verification'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setLoading(true)
    try {
      await resendVerification(unverifiedUser!.email, resendPassword)
      setResendSent(true)
      toast.success('Verification email sent', {
        description: `Check ${unverifiedUser!.email} and click the link.`,
      })
    } catch (err: any) {
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) {
        setError(msg)
        toast.error('Could not resend email', { description: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Link Google to password account ──────────────────────────────────────

  async function handleLinkGoogle() {
    if (!linkPassword) {
      const msg = 'Enter your password to link Google'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!pendingCred) {
      const msg = 'Missing pending credential; please try again'
      setError(msg)
      toast.error(msg)
      return
    }
    setError('')
    setLoading(true)
    try {
      await linkPendingGoogleCredential(linkEmail, linkPassword, pendingCred)
      toast.success('Account linked', { description: 'Google sign-in is now connected.' })
      onOpenChange(false)
      reset()
    } catch (err) {
      const e = err as { code?: string; message?: string }
      const msg = mapAuthError(e.code ?? e.message ?? 'auth/unknown')
      if (msg) {
        setError(msg)
        toast.error('Link failed', { description: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-[440px] glass-panel rounded-2xl p-0 border border-foreground/[0.08] bg-card-elevated/90 backdrop-blur-2xl shadow-modal overflow-hidden">
        {/* Decorative blurs */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-h-[90dvh] overflow-y-auto custom-scrollbar p-6 md:p-8">
          {/* ── Forgot Password — 4-step OTP (authflow.md §6) ── */}
          {view === 'forgot' && (
            <>
              {/* Step 1 — Email */}
              {fpStep === 'email' && (
                <>
                  <DialogHeader className="text-left space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-primary">Reset password</p>
                    <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-foreground">
                      Recover your <span className="text-primary">account</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-foreground/40">
                      Enter your email and we'll send you a 6-digit verification code.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5 mt-6">
                    <div className="space-y-2">
                      <label className="text-xs text-foreground/50 ml-1">Email</label>
                      <Input
                        type="email"
                        value={fpEmail}
                        onChange={e => setFpEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleFpSendOtp()}
                        placeholder="Enter your mail"
                        className="h-12 px-4 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90"
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleFpSendOtp} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Send Verification Code
                    </Button>
                    <button
                      type="button"
                      className="w-full h-12 rounded-full bg-transparent border border-foreground/[0.12] flex items-center justify-center gap-2 text-foreground/50 text-sm font-medium hover:bg-foreground/[0.04] hover:border-foreground/[0.18] transition-all"
                      onClick={() => { setView('default'); setError('') }}
                    >
                      <ArrowLeft className="h-4 w-4" /> Back to Sign In
                    </button>
                  </div>
                </>
              )}

              {/* Step 2 — OTP */}
              {fpStep === 'otp' && (
                <>
                  <DialogHeader className="text-left space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-primary">Verification</p>
                    <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-foreground">
                      Enter your <span className="text-primary">code</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-foreground/40">
                      We sent a 6-digit code to <span className="text-foreground/70">{fpEmail}</span>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5 mt-6">
                    <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleFpOtpPaste}>
                      {fpOtp.map((digit, i) => (
                        <input
                          key={i}
                          ref={el => { fpOtpInputsRef.current[i] = el }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={e => handleFpOtpChange(i, e.target.value)}
                          onKeyDown={e => handleFpOtpKeyDown(i, e)}
                          className="w-11 h-12 sm:w-12 sm:h-14 text-center text-xl font-semibold rounded-xl border-2 border-foreground/20 bg-foreground/[0.06] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 focus:bg-foreground/[0.1] transition-all caret-primary"
                        />
                      ))}
                    </div>
                    {error && <p className="text-sm text-destructive text-center">{error}</p>}
                    <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleFpVerifyOtp} disabled={loading || fpOtp.join('').length !== 6}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verify Code
                    </Button>
                    <div className="text-center">
                      {fpResendTimer > 0 ? (
                        <p className="text-xs text-foreground/40">
                          Resend code in <span className="text-foreground/60 font-medium">{fpResendTimer}s</span>
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={handleFpResendOtp}
                          disabled={loading}
                          className="text-xs text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
                        >
                          Didn't receive a code? Resend
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="w-full h-12 rounded-full bg-transparent border border-foreground/[0.12] flex items-center justify-center gap-2 text-foreground/50 text-sm font-medium hover:bg-foreground/[0.04] hover:border-foreground/[0.18] transition-all"
                      onClick={() => { setFpStep('email'); setError('') }}
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </button>
                  </div>
                </>
              )}

              {/* Step 3 — New Password */}
              {fpStep === 'newpass' && (
                <>
                  <DialogHeader className="text-left space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-primary">New password</p>
                    <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-foreground">
                      Create a new <span className="text-primary">password</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-foreground/40">
                      Identity verified. Set a new password for your account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-6">
                    <div className="space-y-2">
                      <label className="text-xs text-foreground/50 ml-1">New password</label>
                      <div className="relative">
                        <Input
                          type={fpShowNewPass ? 'text' : 'password'}
                          value={fpNewPassword}
                          onChange={e => setFpNewPassword(e.target.value)}
                          placeholder={`Min ${PASSWORD_MIN_LENGTH} characters`}
                          className="h-12 pl-4 pr-12 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90"
                        />
                        <button
                          type="button"
                          onClick={() => setFpShowNewPass(s => !s)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/35 hover:text-foreground/60"
                          tabIndex={-1}
                        >
                          {fpShowNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {fpNewPassword && (() => {
                        const { score, issues } = validatePassword(fpNewPassword)
                        const colors = ['bg-destructive', 'bg-destructive', 'bg-warning', 'bg-warning', 'bg-success']
                        const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong']
                        const requirements: { key: PasswordIssue; label: string }[] = [
                          { key: 'tooShort', label: `At least ${PASSWORD_MIN_LENGTH} characters` },
                          { key: 'missingUpper', label: 'One uppercase letter' },
                          { key: 'missingLower', label: 'One lowercase letter' },
                          { key: 'missingDigit', label: 'One number' },
                          { key: 'missingSymbol', label: 'One special character' },
                        ]
                        return (
                          <div className="space-y-2 mt-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 flex gap-1">
                                {[0, 1, 2, 3].map((i) => (
                                  <div
                                    key={i}
                                    className={`h-1 flex-1 rounded-full transition-colors ${
                                      i < score ? colors[score] : 'bg-foreground/10'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-[10px] font-label uppercase tracking-widest text-foreground/40 w-16 text-right">
                                {labels[score]}
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {requirements.map(({ key, label }) => {
                                const met = !issues.includes(key)
                                return (
                                  <li key={key} className={`text-[11px] flex items-center gap-1.5 transition-colors ${met ? 'text-success' : 'text-foreground/30'}`}>
                                    <span className={`inline-block w-3 h-3 rounded-full border text-center leading-3 text-[8px] ${met ? 'border-success bg-success/20' : 'border-foreground/20'}`}>
                                      {met ? '✓' : ''}
                                    </span>
                                    {label}
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })()}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-foreground/50 ml-1">Confirm password</label>
                      <div className="relative">
                        <Input
                          type={fpShowConfirmPass ? 'text' : 'password'}
                          value={fpConfirmPassword}
                          onChange={e => setFpConfirmPassword(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleFpResetPassword()}
                          placeholder="Re-enter new password"
                          className="h-12 pl-4 pr-12 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90"
                        />
                        <button
                          type="button"
                          onClick={() => setFpShowConfirmPass(s => !s)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/35 hover:text-foreground/60"
                          tabIndex={-1}
                        >
                          {fpShowConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleFpResetPassword} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Reset Password
                    </Button>
                  </div>
                </>
              )}

              {/* Step 4 — Success */}
              {fpStep === 'success' && (
                <div className="py-6 space-y-5 text-center mt-4">
                  <CheckCircle className="h-12 w-12 text-success mx-auto" />
                  <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-foreground">
                    Password <span className="text-primary">updated</span>
                  </DialogTitle>
                  <p className="text-sm text-foreground/60">
                    Sign in with your new password.
                  </p>
                  <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={() => { setView('default'); setFpStep('email'); setFpEmail(''); setFpResetToken(''); setFpNewPassword(''); setFpConfirmPassword('') }}>
                    Back to Sign In
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ── Unverified account recovery (authflow.md §7) ── */}
          {view === 'unverified' && (
            <>
              <DialogHeader className="text-left space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-primary">Almost there</p>
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-foreground">
                  Verify your <span className="text-primary">account</span>
                </DialogTitle>
                <DialogDescription className="text-sm text-foreground/40">
                  Your account hasn't been verified yet. Resend the verification email below.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-6">
                {!resendSent ? (
                  <>
                    <p className="text-sm text-foreground/50">
                      Account: <span className="font-medium text-foreground/70">{unverifiedUser?.email}</span>
                    </p>
                    <div className="space-y-2">
                      <label className="text-xs text-foreground/50 ml-1">Password (to confirm it's you)</label>
                      <Input
                        type="password"
                        value={resendPassword}
                        onChange={e => setResendPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="h-12 px-4 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90"
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleResendVerification} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Resend Verification Email
                    </Button>
                  </>
                ) : (
                  <div className="text-center space-y-4 py-2">
                    <CheckCircle className="h-12 w-12 text-success mx-auto" />
                    <p className="text-sm text-foreground/60">
                      Verification email resent to <span className="font-medium text-foreground/70">{unverifiedUser?.email}</span>.
                      After verifying, sign in again.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className="w-full h-12 rounded-full bg-transparent border border-foreground/[0.12] flex items-center justify-center gap-2 text-foreground/50 text-sm font-medium hover:bg-foreground/[0.04] hover:border-foreground/[0.18] transition-all"
                  onClick={() => { setView('default'); setError(''); setResendSent(false) }}
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Sign In
                </button>
              </div>
            </>
          )}

          {/* ── Link Google to existing password account ── */}
          {view === 'link-google' && (
            <>
              <DialogHeader className="text-left space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-primary">Link account</p>
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-foreground">
                  Connect your <span className="text-primary">Google</span>
                </DialogTitle>
                <DialogDescription className="text-sm text-foreground/40">
                  An account already exists for <span className="font-medium text-foreground/60">{linkEmail}</span>. Enter your password to link Google sign-in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-6">
                <div className="space-y-2">
                  <label className="text-xs text-foreground/50 ml-1">Password</label>
                  <Input
                    type="password"
                    value={linkPassword}
                    onChange={e => setLinkPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 px-4 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleLinkGoogle} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Link Google & Sign in
                </Button>
                <button
                  type="button"
                  className="w-full h-12 rounded-full bg-transparent border border-foreground/[0.12] flex items-center justify-center gap-2 text-foreground/50 text-sm font-medium hover:bg-foreground/[0.04] hover:border-foreground/[0.18] transition-all"
                  onClick={() => { setView('default'); setError(''); setLinkPassword(''); setPendingCred(null) }}
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Sign In
                </button>
              </div>
            </>
          )}

          {/* ── Default sign-in view ── */}
          {view === 'default' && (
            <>
              {/* Header — left-aligned */}
              <DialogHeader className="text-left space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-primary">Welcome back</p>
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-foreground">
                  Lets continue<br />your <span className="text-primary">story</span>
                </DialogTitle>
                <DialogDescription className="sr-only">Sign in to your account</DialogDescription>
              </DialogHeader>

              {/* Tabs */}
              <div className="flex bg-foreground/[0.03] border border-foreground/[0.06] p-1 rounded-full gap-1 mt-6 mb-6">
                {(['email', 'phone'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setError(''); setDeviceMismatch(false) }}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-full transition-all ${tab === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/40 hover:text-foreground/60'}`}
                  >
                    {t === 'email' ? <><Mail className="inline h-3.5 w-3.5 mr-1.5" />Email</> : <><Phone className="inline h-3.5 w-3.5 mr-1.5" />Phone</>}
                  </button>
                ))}
              </div>

              {/* Email tab */}
              {tab === 'email' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs text-foreground/50 ml-1">Email</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Enter your mail"
                      className="h-12 px-4 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-foreground/50 ml-1">Password</label>
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignIn()}
                      placeholder="Enter your password"
                      className="h-12 px-4 rounded-2xl bg-transparent border border-foreground/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-foreground/25 text-sm text-foreground/90"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-xs text-foreground/35 hover:text-primary transition-colors"
                        onClick={() => { setView('forgot'); setFpStep('email'); setFpEmail(email); setError('') }}
                      >
                        Forgot Password?
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 mt-2"
                    onClick={handleEmailSignIn}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Continue planning
                  </Button>
                </div>
              )}

              {/* Phone tab (WhatsApp OTP) */}
              {tab === 'phone' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs text-foreground/50 ml-1">Phone Number</label>
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <PhoneInput value={phone} onChange={setPhone} disabled={otpSent} placeholder="98765 43210" />
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleSendOtp}
                        disabled={loading || (otpSent && otpResendTimer > 0)}
                        className="whitespace-nowrap h-12 rounded-2xl border-foreground/[0.12]"
                      >
                        {loading && !otpSent ? <Loader2 className="h-4 w-4 animate-spin" /> : otpSent ? (otpResendTimer > 0 ? `Resend (${otpResendTimer}s)` : 'Resend') : 'Send OTP'}
                      </Button>
                    </div>
                  </div>

                  {otpSent && (
                    <>
                      <p className="text-xs text-foreground/40">
                        Code sent via WhatsApp. Expires in {Math.floor(otpExpiryTimer / 60)}:{(otpExpiryTimer % 60).toString().padStart(2, '0')}.
                      </p>
                      <div className="space-y-2">
                        <label className="text-xs text-foreground/50 ml-1">Verification Code</label>
                        <Input
                          value={otp}
                          onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6-digit code"
                          maxLength={6}
                          className="h-12 rounded-2xl bg-transparent border border-foreground/[0.12] text-center tracking-widest text-lg text-foreground/90"
                          onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                        />
                      </div>
                    </>
                  )}

                  {error && (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">{error}</p>
                      {deviceMismatch && (
                        <Button
                          variant="outline"
                          className="w-full h-12 rounded-2xl border-foreground/[0.12]"
                          onClick={() => { setTab('email'); setError(''); setDeviceMismatch(false) }}
                        >
                          Use Email Sign-In Instead
                        </Button>
                      )}
                    </div>
                  )}

                  {otpSent && (
                    <Button
                      className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 mt-2"
                      onClick={handleVerifyOtp}
                      disabled={loading || otp.length < 6}
                    >
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verify & Sign In
                    </Button>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-4 mt-6 mb-4">
                <div className="h-[1px] flex-1 bg-foreground/[0.06]"></div>
                <span className="text-xs text-foreground/30">Or continue with</span>
                <div className="h-[1px] flex-1 bg-foreground/[0.06]"></div>
              </div>

              {/* Google — bottom */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full h-12 rounded-full bg-transparent border border-foreground/[0.12] flex items-center justify-center gap-3 text-foreground/70 text-sm font-medium hover:bg-foreground/[0.04] hover:border-foreground/[0.18] transition-all disabled:opacity-50"
              >
                <GoogleIcon /> Continue with Google
              </button>

              {/* Switch to sign up */}
              <p className="text-center text-sm text-foreground/40 mt-5">
                Don't have an account?{' '}
                <button className="text-primary font-semibold hover:underline" onClick={() => switchToSignUp()}>
                  Sign up
                </button>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
