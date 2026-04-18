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
import { useAuth } from '@/contexts/AuthContext'
import { mapAuthError, linkPendingGoogleCredential } from '@/services/authService'
import type { AuthCredential } from 'firebase/auth'
import PhoneInput, { toE164, type PhoneInputValue } from './PhoneInput'

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
    if (!email || !password) { setError('Please enter your email and password'); return }
    setError('')
    setLoading(true)
    try {
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, email)
      else localStorage.removeItem(REMEMBER_KEY)
      await signIn(email, password)
      onOpenChange(false)
      reset()
    } catch (err: any) {
      if (err.code === 'UNVERIFIED_ACCOUNT') {
        setUnverifiedUser({ uid: err.uid, email: err.email, name: err.name, phone: err.phone })
        setView('unverified')
      } else if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password'
      ) {
        // No account found — redirect to sign up with email pre-filled
        reset()
        onOpenChange(false)
        onSwitchToSignUp(email)
      } else {
        const msg = mapAuthError(err.code ?? err.message)
        if (msg) setError(msg)
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
      onOpenChange(false)
      reset()
    } catch (err: any) {
      if (err.code === 'LINK_GOOGLE_TO_PASSWORD') {
        setLinkEmail(err.email ?? '')
        setPendingCred((err.pendingCred as AuthCredential) ?? null)
        setView('link-google')
        return
      }
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Phone OTP (WhatsApp) ──────────────────────────────────────────────────

  async function handleSendOtp() {
    const e164 = toE164(phone)
    if (!e164) { setError('Enter a valid phone number'); return }
    setError('')
    setDeviceMismatch(false)
    setLoading(true)
    try {
      await sendPhoneOtpWhatsApp(e164, 'login')
      setOtpSent(true)
      setOtp('')
      setOtpResendTimer(OTP_RESEND_COOLDOWN)
      setOtpExpiryTimer(OTP_EXPIRY_SECONDS)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const msg = mapAuthError(e.code ?? e.message ?? 'auth/unknown')
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    const e164 = toE164(phone)
    if (!e164) { setError('Enter a valid phone number'); return }
    if (!otp || otp.length < 6) { setError('Enter the 6-digit code'); return }
    setError('')
    setLoading(true)
    try {
      const ok = await verifyPhoneOtpWhatsApp(e164, otp, 'login')
      if (!ok) {
        setError('Incorrect or expired code')
        return
      }
      await signInPhone(e164)
      onOpenChange(false)
      reset()
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'PHONE_DEVICE_MISMATCH') {
        setDeviceMismatch(true)
        setError(mapAuthError('PHONE_DEVICE_MISMATCH'))
      } else {
        const msg = mapAuthError(e.code ?? e.message ?? 'auth/unknown')
        if (msg) setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot password — 4-step OTP (authflow.md §6) ────────────────────────

  async function handleFpSendOtp() {
    const target = fpEmail.trim()
    if (!target) { setError('Enter your email'); return }
    setError('')
    setLoading(true)
    try {
      await sendForgotPasswordOtp(target)
      setFpStep('otp')
      setFpOtp(['', '', '', '', '', ''])
      setFpResendTimer(FP_RESEND_COOLDOWN)
      setTimeout(() => fpOtpInputsRef.current[0]?.focus(), 100)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      setError(e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR'))
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
      fpOtpInputsRef.current[0]?.focus()
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      setError(e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR'))
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
    if (code.length !== 6) { setError('Enter the 6-digit code'); return }
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
      setError(e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR'))
    } finally {
      setLoading(false)
    }
  }

  async function handleFpResetPassword() {
    if (!fpNewPassword) { setError('Enter a new password'); return }
    if (fpNewPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (fpNewPassword !== fpConfirmPassword) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      await updatePasswordByEmail(fpEmail.trim(), fpResetToken, fpNewPassword)
      setFpStep('success')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      setError(e.message || mapAuthError(e.code ?? 'FORGOT_PASSWORD_ERROR'))
    } finally {
      setLoading(false)
    }
  }

  // ── Unverified recovery ───────────────────────────────────────────────────

  async function handleResendVerification() {
    if (!resendPassword) { setError('Enter your password to resend verification'); return }
    setError('')
    setLoading(true)
    try {
      await resendVerification(unverifiedUser!.email, resendPassword)
      setResendSent(true)
    } catch (err: any) {
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Link Google to password account ──────────────────────────────────────

  async function handleLinkGoogle() {
    if (!linkPassword) { setError('Enter your password to link Google'); return }
    if (!pendingCred) { setError('Missing pending credential; please try again'); return }
    setError('')
    setLoading(true)
    try {
      await linkPendingGoogleCredential(linkEmail, linkPassword, pendingCred)
      onOpenChange(false)
      reset()
    } catch (err) {
      const e = err as { code?: string; message?: string }
      const msg = mapAuthError(e.code ?? e.message ?? 'auth/unknown')
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-[440px] glass-panel rounded-2xl p-0 border border-white/[0.08] bg-[#0F0D0C]/90 backdrop-blur-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden">
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
                    <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                      Recover your <span className="text-primary">account</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-white/40">
                      Enter your email and we'll send you a 6-digit verification code.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5 mt-6">
                    <div className="space-y-2">
                      <label className="text-xs text-white/50 ml-1">Email</label>
                      <Input
                        type="email"
                        value={fpEmail}
                        onChange={e => setFpEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleFpSendOtp()}
                        placeholder="Enter your mail"
                        className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                      />
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleFpSendOtp} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Send Verification Code
                    </Button>
                    <button
                      type="button"
                      className="w-full h-12 rounded-full bg-transparent border border-white/[0.12] flex items-center justify-center gap-2 text-white/50 text-sm font-medium hover:bg-white/[0.04] hover:border-white/[0.18] transition-all"
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
                    <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                      Enter your <span className="text-primary">code</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-white/40">
                      We sent a 6-digit code to <span className="text-white/70">{fpEmail}</span>
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
                          className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-semibold rounded-xl border border-white/[0.12] bg-white/[0.04] text-white/90 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                        />
                      ))}
                    </div>
                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                    <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleFpVerifyOtp} disabled={loading || fpOtp.join('').length !== 6}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verify Code
                    </Button>
                    <div className="text-center">
                      {fpResendTimer > 0 ? (
                        <p className="text-xs text-white/40">
                          Resend code in <span className="text-white/60 font-medium">{fpResendTimer}s</span>
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
                      className="w-full h-12 rounded-full bg-transparent border border-white/[0.12] flex items-center justify-center gap-2 text-white/50 text-sm font-medium hover:bg-white/[0.04] hover:border-white/[0.18] transition-all"
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
                    <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                      Create a new <span className="text-primary">password</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-white/40">
                      Identity verified. Set a new password for your account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-6">
                    <div className="space-y-2">
                      <label className="text-xs text-white/50 ml-1">New password</label>
                      <div className="relative">
                        <Input
                          type={fpShowNewPass ? 'text' : 'password'}
                          value={fpNewPassword}
                          onChange={e => setFpNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="h-12 pl-4 pr-12 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                        />
                        <button
                          type="button"
                          onClick={() => setFpShowNewPass(s => !s)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60"
                          tabIndex={-1}
                        >
                          {fpShowNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-white/50 ml-1">Confirm password</label>
                      <div className="relative">
                        <Input
                          type={fpShowConfirmPass ? 'text' : 'password'}
                          value={fpConfirmPassword}
                          onChange={e => setFpConfirmPassword(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleFpResetPassword()}
                          placeholder="Re-enter new password"
                          className="h-12 pl-4 pr-12 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                        />
                        <button
                          type="button"
                          onClick={() => setFpShowConfirmPass(s => !s)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60"
                          tabIndex={-1}
                        >
                          {fpShowConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
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
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                  <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                    Password <span className="text-primary">updated</span>
                  </DialogTitle>
                  <p className="text-sm text-white/60">
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
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                  Verify your <span className="text-primary">account</span>
                </DialogTitle>
                <DialogDescription className="text-sm text-white/40">
                  Your account hasn't been verified yet. Resend the verification email below.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-6">
                {!resendSent ? (
                  <>
                    <p className="text-sm text-white/50">
                      Account: <span className="font-medium text-white/70">{unverifiedUser?.email}</span>
                    </p>
                    <div className="space-y-2">
                      <label className="text-xs text-white/50 ml-1">Password (to confirm it's you)</label>
                      <Input
                        type="password"
                        value={resendPassword}
                        onChange={e => setResendPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                      />
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleResendVerification} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Resend Verification Email
                    </Button>
                  </>
                ) : (
                  <div className="text-center space-y-4 py-2">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                    <p className="text-sm text-white/60">
                      Verification email resent to <span className="font-medium text-white/70">{unverifiedUser?.email}</span>.
                      After verifying, sign in again.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className="w-full h-12 rounded-full bg-transparent border border-white/[0.12] flex items-center justify-center gap-2 text-white/50 text-sm font-medium hover:bg-white/[0.04] hover:border-white/[0.18] transition-all"
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
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                  Connect your <span className="text-primary">Google</span>
                </DialogTitle>
                <DialogDescription className="text-sm text-white/40">
                  An account already exists for <span className="font-medium text-white/60">{linkEmail}</span>. Enter your password to link Google sign-in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-6">
                <div className="space-y-2">
                  <label className="text-xs text-white/50 ml-1">Password</label>
                  <Input
                    type="password"
                    value={linkPassword}
                    onChange={e => setLinkPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleLinkGoogle} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Link Google & Sign in
                </Button>
                <button
                  type="button"
                  className="w-full h-12 rounded-full bg-transparent border border-white/[0.12] flex items-center justify-center gap-2 text-white/50 text-sm font-medium hover:bg-white/[0.04] hover:border-white/[0.18] transition-all"
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
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                  Lets continue<br />your <span className="text-primary">story</span>
                </DialogTitle>
                <DialogDescription className="sr-only">Sign in to your account</DialogDescription>
              </DialogHeader>

              {/* Tabs */}
              <div className="flex bg-white/[0.03] border border-white/[0.06] p-1 rounded-full gap-1 mt-6 mb-6">
                {(['email', 'phone'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setError(''); setDeviceMismatch(false) }}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-full transition-all ${tab === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/40 hover:text-white/60'}`}
                  >
                    {t === 'email' ? <><Mail className="inline h-3.5 w-3.5 mr-1.5" />Email</> : <><Phone className="inline h-3.5 w-3.5 mr-1.5" />Phone</>}
                  </button>
                ))}
              </div>

              {/* Email tab */}
              {tab === 'email' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Email</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Enter your mail"
                      className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Password</label>
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignIn()}
                      placeholder="Enter your password"
                      className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-xs text-white/35 hover:text-primary transition-colors"
                        onClick={() => { setView('forgot'); setFpStep('email'); setFpEmail(email); setError('') }}
                      >
                        Forgot Password?
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-sm text-red-400">{error}</p>}

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
                    <label className="text-xs text-white/50 ml-1">Phone Number</label>
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <PhoneInput value={phone} onChange={setPhone} disabled={otpSent} placeholder="98765 43210" />
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleSendOtp}
                        disabled={loading || (otpSent && otpResendTimer > 0)}
                        className="whitespace-nowrap h-12 rounded-2xl border-white/[0.12]"
                      >
                        {loading && !otpSent ? <Loader2 className="h-4 w-4 animate-spin" /> : otpSent ? (otpResendTimer > 0 ? `Resend (${otpResendTimer}s)` : 'Resend') : 'Send OTP'}
                      </Button>
                    </div>
                  </div>

                  {otpSent && (
                    <>
                      <p className="text-xs text-white/40">
                        Code sent via WhatsApp. Expires in {Math.floor(otpExpiryTimer / 60)}:{(otpExpiryTimer % 60).toString().padStart(2, '0')}.
                      </p>
                      <div className="space-y-2">
                        <label className="text-xs text-white/50 ml-1">Verification Code</label>
                        <Input
                          value={otp}
                          onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6-digit code"
                          maxLength={6}
                          className="h-12 rounded-2xl bg-transparent border border-white/[0.12] text-center tracking-widest text-lg text-white/90"
                          onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                        />
                      </div>
                    </>
                  )}

                  {error && (
                    <div className="space-y-2">
                      <p className="text-sm text-red-400">{error}</p>
                      {deviceMismatch && (
                        <Button
                          variant="outline"
                          className="w-full h-12 rounded-2xl border-white/[0.12]"
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
                <div className="h-[1px] flex-1 bg-white/[0.06]"></div>
                <span className="text-xs text-white/30">Or continue with</span>
                <div className="h-[1px] flex-1 bg-white/[0.06]"></div>
              </div>

              {/* Google — bottom */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full h-12 rounded-full bg-transparent border border-white/[0.12] flex items-center justify-center gap-3 text-white/70 text-sm font-medium hover:bg-white/[0.04] hover:border-white/[0.18] transition-all disabled:opacity-50"
              >
                <GoogleIcon /> Continue with Google
              </button>

              {/* Switch to sign up */}
              <p className="text-center text-sm text-white/40 mt-5">
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
