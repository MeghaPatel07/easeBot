import { useState, useRef, useEffect } from 'react'
import { Mail, Phone, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
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
import { mapAuthError, createRecaptchaVerifier } from '@/services/authService'
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth'
import type { AuthFlowError } from '@/types'

type Tab = 'email' | 'phone'
type ForgotStep = 'email-input' | 'sent'
type View = 'default' | 'forgot' | 'unverified'

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
const OTP_COUNTDOWN = 30

export default function SignInModal({ open, onOpenChange, onSwitchToSignUp }: Props) {
  const { signIn, signInWithGoogle, sendOtp, verifyOtp, forgotPassword, resendVerification } = useAuth()

  const [tab, setTab] = useState<Tab>('email')
  const [view, setView] = useState<View>('default')

  // Email sign-in
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem(REMEMBER_KEY))

  // Phone sign-in
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpTimer, setOtpTimer] = useState(0)
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null)
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null)

  // Forgot password
  const [fpStep, setFpStep] = useState<ForgotStep>('email-input')
  const [fpEmail, setFpEmail] = useState('')

  // Unverified recovery
  const [unverifiedUser, setUnverifiedUser] = useState<{ uid: string; email: string; name: string; phone: string | null } | null>(null)
  const [resendPassword, setResendPassword] = useState('')
  const [resendSent, setResendSent] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // OTP countdown timer
  useEffect(() => {
    if (otpTimer <= 0) return
    const id = setTimeout(() => setOtpTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [otpTimer])

  function reset() {
    setTab('email')
    setView('default')
    setPassword('')
    setPhone('')
    setOtp('')
    setOtpSent(false)
    setOtpTimer(0)
    setConfirmResult(null)
    setFpStep('email-input')
    setFpEmail('')
    setUnverifiedUser(null)
    setResendPassword('')
    setResendSent(false)
    setError('')
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear() } catch { }
      recaptchaRef.current = null
    }
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
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Phone OTP ─────────────────────────────────────────────────────────────

  async function handleSendOtp() {
    if (!phone) { setError('Enter your phone number'); return }
    setError('')
    setLoading(true)
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = createRecaptchaVerifier('recaptcha-container')
      }
      const result = await sendOtp(phone, recaptchaRef.current)
      setConfirmResult(result)
      setOtpSent(true)
      setOtpTimer(OTP_COUNTDOWN)
    } catch (err: any) {
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otp || !confirmResult) { setError('Enter the OTP'); return }
    setError('')
    setLoading(true)
    try {
      await verifyOtp(confirmResult, otp)
      onOpenChange(false)
      reset()
    } catch (err: any) {
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot password ───────────────────────────────────────────────────────

  async function handleForgotPassword() {
    if (!fpEmail) { setError('Enter your email'); return }
    setError('')
    setLoading(true)
    try {
      await forgotPassword(fpEmail)
      setFpStep('sent')
    } catch (err: any) {
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setError(msg)
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-[480px] glass-panel rounded-[2rem] p-0 border border-white/60 shadow-[0_32px_64px_-12px_rgba(44,46,42,0.1)] overflow-hidden">
        <div id="recaptcha-container" />
        {/* Decorative blurs */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-h-[90dvh] overflow-y-auto custom-scrollbar p-6 md:p-10">
          {/* ── Forgot Password view ── */}
          {view === 'forgot' && (
            <>
              <DialogHeader>
                <DialogTitle className="elegant-heading">Reset Password</DialogTitle>
                <DialogDescription>
                  {fpStep === 'email-input'
                    ? 'Enter your email and we\'ll send a reset link.'
                    : 'Check your inbox for the reset link.'}
                </DialogDescription>
              </DialogHeader>

              {fpStep === 'email-input' ? (
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <label className="font-label uppercase tracking-widest text-label text-white/50 ml-1">Email</label>
                    <Input
                      type="email"
                      value={fpEmail}
                      onChange={e => setFpEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white/[0.08] transition-all placeholder:text-white/30 text-base sm:text-sm"
                    />
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <Button className="w-full bg-primary hover:bg-primary/90" onClick={handleForgotPassword} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                    Send Reset Link
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => { setView('default'); setError('') }}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                  </Button>
                </div>
              ) : (
                <div className="py-6 space-y-4 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    A password reset link was sent to <span className="font-medium text-white/70">{fpEmail}</span>.
                    Check your inbox.
                  </p>
                  <Button className="w-full bg-primary hover:bg-primary/90" onClick={() => { setView('default'); setFpStep('email-input'); setFpEmail('') }}>
                    Back to Sign In
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ── Unverified account recovery (authflow.md §7) ── */}
          {view === 'unverified' && (
            <>
              <DialogHeader>
                <DialogTitle className="elegant-heading">Verify Your Account</DialogTitle>
                <DialogDescription>
                  Your account hasn't been verified yet. Resend the verification email below.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {!resendSent ? (
                  <>
                    <p className="text-sm text-white/60">
                      Account: <span className="font-medium">{unverifiedUser?.email}</span>
                    </p>
                    <div className="space-y-1">
                      <label className="font-label uppercase tracking-widest text-label text-white/50 ml-1">Password (to confirm it's you)</label>
                      <Input
                        type="password"
                        value={resendPassword}
                        onChange={e => setResendPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white/[0.08] transition-all placeholder:text-white/30 text-base sm:text-sm"
                      />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <Button className="w-full bg-primary hover:bg-primary/90" onClick={handleResendVerification} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Resend Verification Email
                    </Button>
                  </>
                ) : (
                  <div className="text-center space-y-3 py-2">
                    <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Verification email resent to <span className="font-medium">{unverifiedUser?.email}</span>.
                      After verifying, sign in again.
                    </p>
                  </div>
                )}
                <Button variant="ghost" className="w-full" onClick={() => { setView('default'); setError(''); setResendSent(false) }}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                </Button>
              </div>
            </>
          )}

          {/* ── Default sign-in view ── */}
          {view === 'default' && (
            <>
              <DialogHeader className="text-center space-y-4">
                {/* Viva Logo */}
                <div className="flex flex-col items-center">
                  <div className="text-[2.5rem] font-headline italic font-bold text-primary tracking-tight leading-none mb-1">Viva</div>
                  <div className="font-label uppercase tracking-[0.2em] text-2xs text-white/40">Digital Concierge</div>
                </div>
                <DialogTitle className="font-headline text-3xl tracking-tight">Welcome back</DialogTitle>
                <DialogDescription className="text-white/50 text-sm">Your wedding planning journey continues here.</DialogDescription>
              </DialogHeader>

              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full h-14 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center gap-3 text-white/85 font-medium hover:bg-white/[0.06] hover:border-white/20 transition-all mt-2 disabled:opacity-50"
              >
                <GoogleIcon /> Continue with Google
              </button>

              <div className="flex items-center gap-4 my-6">
                <div className="h-[1px] flex-1 bg-white/10"></div>
                <span className="font-label uppercase tracking-widest text-2xs text-white/40">or</span>
                <div className="h-[1px] flex-1 bg-white/10"></div>
              </div>

              {/* Tabs */}
              <div className="flex bg-border p-1 rounded-full gap-1 mb-4">
                {(['email', 'phone'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setError('') }}
                    className={`flex-1 py-2.5 text-xs font-semibold rounded-full transition-all ${tab === t ? 'bg-primary text-white shadow-sm' : 'text-white/60 hover:bg-white/[0.08]'}`}
                  >
                    {t === 'email' ? <><Mail className="inline h-3.5 w-3.5 mr-1" />Email</> : <><Phone className="inline h-3.5 w-3.5 mr-1" />Phone</>}
                  </button>
                ))}
              </div>

              {/* Email tab */}
              {tab === 'email' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="font-label uppercase tracking-widest text-label text-white/50 ml-1">Email</label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white/[0.08] transition-all placeholder:text-white/30 text-base sm:text-sm" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="font-label uppercase tracking-widest text-label text-white/50 ml-1">Password</label>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-xs text-primary"
                        onClick={() => { setView('forgot'); setFpEmail(email); setError('') }}
                      >
                        Forgot password?
                      </Button>
                    </div>
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignIn()}
                      placeholder="••••••••"
                      className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white/[0.08] transition-all placeholder:text-white/30 text-base sm:text-sm"
                    />
                  </div>

                  {/* Remember me */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="remember"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20"
                    />
                    <label htmlFor="remember" className="text-sm text-muted-foreground">Remember me</label>
                  </div>

                  {error && <p className="text-sm text-red-500">{error}</p>}

                  <Button className="w-full h-14 rounded-xl bg-primary text-white font-semibold tracking-wide shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={handleEmailSignIn} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign in
                  </Button>
                </div>
              )}

              {/* Phone tab */}
              {tab === 'phone' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="font-label uppercase tracking-widest text-label text-white/50 ml-1">Phone Number</label>
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+1 555 123 4567"
                        className="bg-white/70 flex-1"
                        disabled={otpSent}
                      />
                      <Button
                        variant="outline"
                        onClick={otpSent ? handleSendOtp : handleSendOtp}
                        disabled={loading || (otpSent && otpTimer > 0)}
                        className="whitespace-nowrap"
                      >
                        {loading && !otpSent ? <Loader2 className="h-4 w-4 animate-spin" /> : otpSent ? (otpTimer > 0 ? `Resend (${otpTimer}s)` : 'Resend') : 'Send OTP'}
                      </Button>
                    </div>
                  </div>

                  {otpSent && (
                    <div className="space-y-1">
                      <label className="font-label uppercase tracking-widest text-label text-white/50 ml-1">Verification Code</label>
                      <Input
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                        placeholder="6-digit code"
                        maxLength={6}
                        className="bg-white/70 text-center tracking-widest text-lg"
                        onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                      />
                    </div>
                  )}

                  {error && <p className="text-sm text-red-500">{error}</p>}

                  {otpSent && (
                    <Button className="w-full bg-primary hover:bg-primary/90" onClick={handleVerifyOtp} disabled={loading || otp.length < 6}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verify & Sign In
                    </Button>
                  )}
                </div>
              )}

              {/* Switch to sign up */}
              <div className="mt-8 text-center">
                <p className="text-white/50 text-sm">
                  Don't have an account?{' '}
                  <button className="text-primary font-bold ml-1 hover:underline" onClick={() => switchToSignUp()}>
                    Sign up
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
