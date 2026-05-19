import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Loader2, Sparkles, Heart, Calendar, MessageSquare, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { mapAuthError } from '@/services/authService'
import { track } from '@/lib/analytics'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://easebot-production.up.railway.app'

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const PROMO_FEATURES = [
  { icon: MessageSquare, text: 'Save and revisit your planning conversations' },
  { icon: Heart, text: 'Get personalized style and vibe recommendations' },
  { icon: Sparkles, text: 'Generate mood boards and wedding imagery' },
  { icon: Calendar, text: 'Track budgets, timelines, and checklists' },
]

type Step = 'entry' | 'password' | 'fp-email' | 'fp-otp' | 'fp-newpass' | 'fp-success'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextUrl = searchParams.get('next') || '/'

  const { user, signIn, signInWithGoogle } = useAuth()

  const [step, setStep] = useState<Step>('entry')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  // Forgot password state
  const [fpEmail, setFpEmail] = useState('')
  const [fpOtp, setFpOtp] = useState(['', '', '', '', '', ''])
  const [fpNewPassword, setFpNewPassword] = useState('')
  const [fpConfirmPassword, setFpConfirmPassword] = useState('')
  const [fpShowNewPass, setFpShowNewPass] = useState(false)
  const [fpShowConfirmPass, setFpShowConfirmPass] = useState(false)
  const [fpLoading, setFpLoading] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([])

  // Redirect when user is authenticated
  useEffect(() => {
    if (user) navigate(nextUrl, { replace: true })
  }, [user, nextUrl, navigate])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    track('signup_started', { method: 'google' })
    try {
      await signInWithGoogle(true)
    } catch (err: any) {
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setError(msg)
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }
    setError('')
    setStep('password')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError('Please enter your password')
      return
    }
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: any) {
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password'
      ) {
        setError('Invalid email or password. Check your credentials or sign up for a new account.')
      } else {
        const msg = mapAuthError(err.code ?? err.message)
        if (msg) setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot Password Handlers ──────────────────────────────────────────────

  const handleFpSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const targetEmail = fpEmail.trim()
    if (!targetEmail) {
      setError('Please enter your email address')
      return
    }
    setError('')
    setFpLoading(true)
    track('password_reset_requested')
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send code')
        return
      }
      setStep('fp-otp')
      setResendCooldown(60)
      setFpOtp(['', '', '', '', '', ''])
      setTimeout(() => otpInputsRef.current[0]?.focus(), 100)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  const handleFpResendOtp = async () => {
    if (resendCooldown > 0) return
    setError('')
    setFpLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to resend code')
        return
      }
      setResendCooldown(60)
      setFpOtp(['', '', '', '', '', ''])
      otpInputsRef.current[0]?.focus()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...fpOtp]
    newOtp[index] = value.slice(-1)
    setFpOtp(newOtp)
    setError('')
    // Auto-advance
    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !fpOtp[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const newOtp = [...fpOtp]
    for (let i = 0; i < text.length; i++) {
      newOtp[i] = text[i]
    }
    setFpOtp(newOtp)
    const nextIdx = Math.min(text.length, 5)
    otpInputsRef.current[nextIdx]?.focus()
  }

  const handleFpVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const code = fpOtp.join('')
    if (code.length !== 6) {
      setError('Please enter the 6-digit code')
      return
    }
    setError('')
    setFpLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail.trim(), otp: code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Verification failed')
        return
      }
      setResetToken(data.resetToken)
      track('password_reset_otp_verified')
      setStep('fp-newpass')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  const handleFpResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fpNewPassword) {
      setError('Please enter a new password')
      return
    }
    if (fpNewPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (fpNewPassword !== fpConfirmPassword) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setFpLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fpEmail.trim(),
          resetToken,
          newPassword: fpNewPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to reset password')
        return
      }
      track('password_reset_completed')
      setStep('fp-success')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  const resetForgotPassword = () => {
    setStep('entry')
    setFpEmail('')
    setFpOtp(['', '', '', '', '', ''])
    setFpNewPassword('')
    setFpConfirmPassword('')
    setResetToken('')
    setError('')
    setFpShowNewPass(false)
    setFpShowConfirmPass(false)
  }

  if (user) return null

  // ── Shared input class ────────────────────────────────────────────────────
  const inputCls = 'w-full rounded-xl border border-foreground/[0.12] bg-foreground/[0.04] px-4 py-3 text-sm text-foreground/90 placeholder-foreground/30 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all'
  const btnPrimary = 'w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50'

  // ── Render Steps ──────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {

      // ─── Entry: Google + Email ─────────────────────────────────────────
      case 'entry':
        return (
          <>
            <h1 className="font-headline text-3xl md:text-4xl tracking-tight text-foreground mb-2">
              Plan Your Dream Wedding
            </h1>
            <p className="text-sm text-foreground/50 mb-8">
              Sign in to get AI-powered planning, personalized recommendations, and 24/7 support.
            </p>

            {error && (
              <div role="alert" className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-foreground/[0.12] bg-foreground/[0.04] px-4 py-3 text-sm font-medium text-foreground/90 hover:bg-foreground/[0.08] hover:border-foreground/[0.2] transition-all disabled:opacity-50"
            >
              {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
              Continue With Google
            </button>

            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-foreground/[0.08]" />
              <span className="text-2xs uppercase tracking-widest text-foreground/30">Or</span>
              <div className="flex-1 h-px bg-foreground/[0.08]" />
            </div>

            <form onSubmit={handleEmailContinue} className="space-y-3">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                className={inputCls}
                autoComplete="email"
                autoFocus
              />
              <button type="submit" className={btnPrimary}>
                Continue With Email
              </button>
            </form>
          </>
        )

      // ─── Password ─────────────────────────────────────────────────────
      case 'password':
        return (
          <>
            <button
              type="button"
              onClick={() => { setStep('entry'); setPassword(''); setError('') }}
              className="flex items-center gap-2 text-sm text-foreground/50 hover:text-foreground/80 transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />Back
            </button>

            <h1 className="font-headline text-3xl md:text-4xl tracking-tight text-foreground mb-2">
              Welcome Back
            </h1>
            <p className="text-sm text-foreground/50 mb-8">
              Enter your password for <span className="text-foreground/70">{email}</span>
            </p>

            {error && (
              <div role="alert" className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  className={`${inputCls} pr-11`}
                  autoComplete="current-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button type="submit" disabled={loading} className={btnPrimary}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Sign In'}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => { setFpEmail(email); setError(''); setStep('fp-email') }}
                className="text-foreground/40 hover:text-foreground/70 transition-colors"
              >
                Forgot password?
              </button>
              <Link to="/" className="text-primary/80 hover:text-primary transition-colors">
                Create an account
              </Link>
            </div>
          </>
        )

      // ─── Forgot Password: Enter Email ──────────────────────────────────
      case 'fp-email':
        return (
          <>
            <button
              type="button"
              onClick={resetForgotPassword}
              className="flex items-center gap-2 text-sm text-foreground/50 hover:text-foreground/80 transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />Back to Sign In
            </button>

            <h1 className="font-headline text-3xl md:text-4xl tracking-tight text-foreground mb-2">
              Reset Password
            </h1>
            <p className="text-sm text-foreground/50 mb-8">
              Enter the email address associated with your account. We'll send you a verification code.
            </p>

            {error && (
              <div role="alert" className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleFpSendOtp} className="space-y-3">
              <input
                type="email"
                placeholder="Enter your email"
                value={fpEmail}
                onChange={(e) => { setFpEmail(e.target.value); setError('') }}
                className={inputCls}
                autoComplete="email"
                autoFocus
              />
              <button type="submit" disabled={fpLoading} className={btnPrimary}>
                {fpLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Send Verification Code'}
              </button>
            </form>
          </>
        )

      // ─── Forgot Password: Enter OTP ────────────────────────────────────
      case 'fp-otp':
        return (
          <>
            <button
              type="button"
              onClick={() => { setStep('fp-email'); setError(''); setFpOtp(['', '', '', '', '', '']) }}
              className="flex items-center gap-2 text-sm text-foreground/50 hover:text-foreground/80 transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />Back
            </button>

            <h1 className="font-headline text-3xl md:text-4xl tracking-tight text-foreground mb-2">
              Enter Verification Code
            </h1>
            <p className="text-sm text-foreground/50 mb-8">
              We sent a 6-digit code to <span className="text-foreground/70">{fpEmail}</span>
            </p>

            {error && (
              <div role="alert" className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleFpVerifyOtp} className="space-y-5">
              {/* OTP input boxes */}
              <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                {fpOtp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { otpInputsRef.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-semibold rounded-xl border border-foreground/[0.12] bg-foreground/[0.04] text-foreground/90 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={fpLoading || fpOtp.join('').length !== 6}
                className={btnPrimary}
              >
                {fpLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Verify Code'}
              </button>
            </form>

            <div className="mt-4 text-center">
              {resendCooldown > 0 ? (
                <p className="text-xs text-foreground/40">
                  Resend code in <span className="text-foreground/60 font-medium">{resendCooldown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleFpResendOtp}
                  disabled={fpLoading}
                  className="text-xs text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
                >
                  Didn't receive a code? Resend
                </button>
              )}
            </div>
          </>
        )

      // ─── Forgot Password: New Password ─────────────────────────────────
      case 'fp-newpass':
        return (
          <>
            <button
              type="button"
              onClick={() => { setStep('fp-otp'); setError(''); setFpNewPassword(''); setFpConfirmPassword('') }}
              className="flex items-center gap-2 text-sm text-foreground/50 hover:text-foreground/80 transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />Back
            </button>

            <h1 className="font-headline text-3xl md:text-4xl tracking-tight text-foreground mb-2">
              Create New Password
            </h1>
            <p className="text-sm text-foreground/50 mb-8">
              Your identity has been verified. Set a new password for your account.
            </p>

            {error && (
              <div role="alert" className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleFpResetPassword} className="space-y-3">
              <div className="relative">
                <input
                  type={fpShowNewPass ? 'text' : 'password'}
                  placeholder="New password"
                  value={fpNewPassword}
                  onChange={(e) => { setFpNewPassword(e.target.value); setError('') }}
                  className={`${inputCls} pr-11`}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setFpShowNewPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60 transition-colors"
                  tabIndex={-1}
                >
                  {fpShowNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={fpShowConfirmPass ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={fpConfirmPassword}
                  onChange={(e) => { setFpConfirmPassword(e.target.value); setError('') }}
                  className={`${inputCls} pr-11`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setFpShowConfirmPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60 transition-colors"
                  tabIndex={-1}
                >
                  {fpShowConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fpNewPassword && fpNewPassword.length < 6 && (
                <p className="text-2xs text-foreground/40">Password must be at least 6 characters</p>
              )}
              <button type="submit" disabled={fpLoading} className={btnPrimary}>
                {fpLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Reset Password'}
              </button>
            </form>
          </>
        )

      // ─── Forgot Password: Success ──────────────────────────────────────
      case 'fp-success':
        return (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 border border-success/20">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h1 className="font-headline text-3xl md:text-4xl tracking-tight text-foreground mb-2">
              Password Updated
            </h1>
            <p className="text-sm text-foreground/50 mb-8">
              Your password has been successfully reset. You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={resetForgotPassword}
              className={btnPrimary}
            >
              Sign In
            </button>
          </div>
        )
    }
  }

  return (
    <div className="gradient-bg min-h-screen text-foreground/90">
      {/* Top nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10 md:py-6">
        <Link to="/" className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-headline text-lg text-foreground tracking-tight">TheWeddingBot</span>
        </Link>
        <Link
          to="/pricing"
          className="text-xs text-foreground/50 hover:text-foreground/80 transition-colors"
        >
          View Plans
        </Link>
      </header>

      {/* Main content */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-8 pb-16 md:pt-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
          {/* Left — Auth form */}
          <div className="flex-1 max-w-md mx-auto lg:mx-0">
            {renderStep()}

            <p className="mt-8 text-2xs text-foreground/30 leading-relaxed">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="text-foreground/50 hover:text-foreground/70 underline underline-offset-2">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-foreground/50 hover:text-foreground/70 underline underline-offset-2">
                Privacy Policy
              </Link>.
            </p>
          </div>

          {/* Right — Promo card */}
          <div className="flex-1 max-w-md mx-auto lg:mx-0 lg:mt-4">
            <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] backdrop-blur-sm p-6 md:p-8">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-2xs uppercase tracking-widest text-primary/80 font-semibold">
                  What You Get
                </span>
              </div>

              <div className="space-y-4">
                {PROMO_FEATURES.map(({ icon: Icon, text }, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm text-foreground/70 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-5 border-t border-foreground/[0.06]">
                <p className="text-xs text-foreground/40 leading-relaxed">
                  Free accounts include 10 messages per session. Upgrade to Pro for unlimited planning conversations, image generation, and more.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
