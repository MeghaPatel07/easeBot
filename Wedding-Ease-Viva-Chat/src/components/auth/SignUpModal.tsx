import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react'
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
import { mapAuthError } from '@/services/authService'
import PhoneInput, { toE164, isValidPhone, type PhoneInputValue } from './PhoneInput'
import { validatePassword, describeIssue, PASSWORD_MIN_LENGTH } from '@/utils/passwordPolicy'

type Tab = 'email' | 'phone'
type EmailStep = 'form' | 'verifying'
type PhoneStep = 'form' | 'otp' | 'success'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchToSignIn: () => void
  initialEmail?: string
}

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const initialEmailForm = {
  name: '',
  email: '',
  phone: { countryCode: 'IN' as const, national: '' } as PhoneInputValue,
  password: '',
  confirmPassword: '',
  terms: false,
}

const initialPhoneForm = {
  name: '',
  email: '',
  phone: { countryCode: 'IN' as const, national: '' } as PhoneInputValue,
  terms: false,
}

const OTP_RESEND_COOLDOWN = 30
const OTP_EXPIRY_SECONDS = 5 * 60

function PasswordStrengthMeter({ password }: { password: string }) {
  const { score } = validatePassword(password)
  const colors = ['bg-red-500', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500']
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong']
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < score ? colors[score] : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] font-label uppercase tracking-widest text-white/40 w-16 text-right">
        {labels[score]}
      </span>
    </div>
  )
}

export default function SignUpModal({ open, onOpenChange, onSwitchToSignIn, initialEmail }: Props) {
  const {
    signUp,
    signInWithGoogle,
    signUpPhone,
    sendPhoneOtpWhatsApp,
    verifyPhoneOtpWhatsApp,
    confirmPhoneSignup,
  } = useAuth()

  const [tab, setTab] = useState<Tab>('email')

  // Email flow
  const [emailStep, setEmailStep] = useState<EmailStep>('form')
  const [emailForm, setEmailForm] = useState(() => ({ ...initialEmailForm, email: initialEmail ?? '' }))
  const [emailErrors, setEmailErrors] = useState<Record<string, string>>({})
  const [emailAuthError, setEmailAuthError] = useState('')
  const [signedUpEmail, setSignedUpEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Phone flow
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('form')
  const [phoneForm, setPhoneForm] = useState(initialPhoneForm)
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({})
  const [phoneAuthError, setPhoneAuthError] = useState('')
  const [phoneE164, setPhoneE164] = useState<string | null>(null)
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneResendTimer, setPhoneResendTimer] = useState(0)
  const [phoneExpiryTimer, setPhoneExpiryTimer] = useState(0)
  const [signedUpName, setSignedUpName] = useState('')

  // Google flow
  const [googleSuccess, setGoogleSuccess] = useState(false)

  const [loading, setLoading] = useState(false)

  // Timers
  useEffect(() => {
    if (phoneResendTimer <= 0) return
    const id = setTimeout(() => setPhoneResendTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [phoneResendTimer])
  useEffect(() => {
    if (phoneExpiryTimer <= 0) return
    const id = setTimeout(() => setPhoneExpiryTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [phoneExpiryTimer])

  // ── Email handlers ───────────────────────────────────────────────────────

  const setEmailField = (field: keyof typeof initialEmailForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEmailForm(f => ({ ...f, [field]: field === 'terms' ? e.target.checked : e.target.value }))

  function validateEmailForm(): boolean {
    const e: Record<string, string> = {}
    if (!emailForm.name.trim()) e.name = 'Full name is required'
    if (!emailForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)) e.email = 'Valid email is required'
    if (emailForm.phone.national && !isValidPhone(emailForm.phone)) e.phone = 'Enter a valid phone number'
    const pw = validatePassword(emailForm.password)
    if (!pw.ok) e.password = pw.issues.map(describeIssue).join(' · ')
    if (emailForm.password !== emailForm.confirmPassword) e.confirmPassword = 'Passwords do not match'
    if (!emailForm.terms) e.terms = 'You must accept the terms'
    setEmailErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleEmailSubmit() {
    if (!validateEmailForm()) return
    setEmailAuthError('')
    setLoading(true)
    try {
      const e164 = toE164(emailForm.phone)
      const result = await signUp(
        emailForm.name.trim(),
        emailForm.email.trim(),
        e164,
        emailForm.password,
      )
      setSignedUpEmail(result.email)
      setSignedUpName(result.name)
      setEmailStep('verifying')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'auth/email-already-in-use') {
        reset()
        onOpenChange(false)
        onSwitchToSignIn()
      } else if (e.code === 'EMAIL_OWNED_BY_GOOGLE') {
        setEmailAuthError('This email is already registered with Google. Use the Google tab above.')
      } else {
        setEmailAuthError(mapAuthError(e.code ?? e.message ?? 'auth/unknown'))
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Phone handlers ───────────────────────────────────────────────────────

  const setPhoneField = (field: 'name' | 'email' | 'terms') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPhoneForm(f => ({ ...f, [field]: field === 'terms' ? e.target.checked : e.target.value }))

  function validatePhoneForm(): boolean {
    const e: Record<string, string> = {}
    if (!phoneForm.name.trim()) e.name = 'Full name is required'
    if (!phoneForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoneForm.email)) e.email = 'Valid email is required for recovery'
    if (!phoneForm.phone.national || !isValidPhone(phoneForm.phone)) e.phone = 'Enter a valid phone number'
    if (!phoneForm.terms) e.terms = 'You must accept the terms'
    setPhoneErrors(e)
    return Object.keys(e).length === 0
  }

  async function handlePhoneSubmit() {
    if (!validatePhoneForm()) return
    setPhoneAuthError('')
    setLoading(true)
    try {
      const e164 = toE164(phoneForm.phone)
      if (!e164) {
        setPhoneAuthError('Invalid phone number')
        return
      }
      // 1) Create the derived credential FIRST (so credential is stored on device
      //    regardless of OTP outcome — per spec requirement f).
      const result = await signUpPhone(phoneForm.name.trim(), phoneForm.email.trim(), e164)
      setPhoneE164(e164)
      setSignedUpName(result.name)
      // 2) Send OTP.
      await sendPhoneOtpWhatsApp(e164, 'signup')
      setPhoneOtp('')
      setPhoneResendTimer(OTP_RESEND_COOLDOWN)
      setPhoneExpiryTimer(OTP_EXPIRY_SECONDS)
      setPhoneStep('otp')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'auth/email-already-in-use') {
        setPhoneAuthError('A phone account already exists for this number. Try signing in.')
      } else {
        setPhoneAuthError(mapAuthError(e.code ?? e.message ?? 'auth/unknown'))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handlePhoneResend() {
    if (!phoneE164) return
    setPhoneAuthError('')
    setLoading(true)
    try {
      await sendPhoneOtpWhatsApp(phoneE164, 'signup')
      setPhoneResendTimer(OTP_RESEND_COOLDOWN)
      setPhoneExpiryTimer(OTP_EXPIRY_SECONDS)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      setPhoneAuthError(mapAuthError(e.code ?? e.message ?? 'auth/unknown'))
    } finally {
      setLoading(false)
    }
  }

  async function handlePhoneVerify() {
    if (!phoneE164) return
    if (phoneOtp.length < 6) { setPhoneAuthError('Enter the 6-digit code'); return }
    setPhoneAuthError('')
    setLoading(true)
    try {
      const ok = await verifyPhoneOtpWhatsApp(phoneE164, phoneOtp, 'signup')
      if (!ok) {
        setPhoneAuthError('Incorrect or expired code')
        return
      }
      await confirmPhoneSignup(phoneE164)
      setPhoneStep('success')
      setTimeout(() => { onOpenChange(false); reset() }, 1500)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      setPhoneAuthError(mapAuthError(e.code ?? e.message ?? 'auth/unknown'))
    } finally {
      setLoading(false)
    }
  }

  // ── Google handler ───────────────────────────────────────────────────────

  async function handleGoogle() {
    setEmailAuthError('')
    setLoading(true)
    try {
      await signInWithGoogle(true)
      setGoogleSuccess(true)
      setTimeout(() => { onOpenChange(false); reset() }, 1500)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const msg = mapAuthError(e.code ?? e.message ?? 'auth/unknown')
      if (msg) setEmailAuthError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Reset & close ────────────────────────────────────────────────────────

  function reset() {
    setTab('email')
    setEmailStep('form')
    setEmailForm({ ...initialEmailForm, email: initialEmail ?? '' })
    setEmailErrors({})
    setEmailAuthError('')
    setSignedUpEmail('')
    setSignedUpName('')
    setShowPassword(false)

    setPhoneStep('form')
    setPhoneForm(initialPhoneForm)
    setPhoneErrors({})
    setPhoneAuthError('')
    setPhoneE164(null)
    setPhoneOtp('')
    setPhoneResendTimer(0)
    setPhoneExpiryTimer(0)

    setGoogleSuccess(false)
  }

  function handleClose(val: boolean) {
    if (!val) reset()
    onOpenChange(val)
  }

  function switchToSignIn() {
    reset()
    onOpenChange(false)
    onSwitchToSignIn()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-[440px] glass-panel rounded-2xl p-0 border border-white/[0.08] bg-[#0F0D0C]/90 backdrop-blur-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden">
        {/* Decorative blurs */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-h-[90dvh] overflow-y-auto custom-scrollbar p-6 md:p-8">
          {/* Success (google) */}
          {googleSuccess && (
            <div className="py-8 space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <div>
                <p className="text-xl font-semibold elegant-heading">Welcome to EaseBot!</p>
                <p className="text-sm text-white/90 mt-1">Hello, {signedUpName || 'there'}</p>
              </div>
            </div>
          )}

          {/* Email verifying */}
          {!googleSuccess && emailStep === 'verifying' && (
            <>
              <DialogHeader>
                <DialogTitle className="elegant-heading">Verify Your Email</DialogTitle>
              </DialogHeader>
              <div className="py-6 space-y-4 text-center">
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div>
                  <p className="font-medium text-white/85">Check your inbox</p>
                  <p className="text-sm text-white/90 mt-1">
                    We sent a verification link to <span className="font-medium text-white/70">{signedUpEmail}</span>
                  </p>
                  <p className="text-sm text-white/90 mt-2">
                    Click the link in the email to activate your account, then sign in.
                  </p>
                </div>
                <Button className="w-full h-10 rounded-full bg-primary hover:bg-primary/90" onClick={switchToSignIn}>
                  Go to Sign In
                </Button>
                <p className="text-xs text-white/90">
                  Didn't receive it?{' '}
                  <Button variant="link" className="p-0 h-auto text-xs" onClick={() => setEmailStep('form')}>
                    Go back and try again
                  </Button>
                </p>
              </div>
            </>
          )}

          {/* Phone success */}
          {!googleSuccess && phoneStep === 'success' && (
            <div className="py-8 space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <div>
                <p className="text-xl font-semibold elegant-heading">Welcome to EaseBot!</p>
                <p className="text-sm text-white/90 mt-1">Hello, {signedUpName || 'there'}</p>
              </div>
            </div>
          )}

          {/* Default form (tabs) */}
          {!googleSuccess && emailStep === 'form' && phoneStep !== 'success' && phoneStep !== 'otp' && (
            <>
              {/* Header — left-aligned */}
              <DialogHeader className="text-left space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-primary">Begin your journey</p>
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                  Start planning<br />your <span className="text-primary">story</span>
                </DialogTitle>
                <DialogDescription className="sr-only">Create your account</DialogDescription>
              </DialogHeader>

              {/* Tabs */}
              <div className="flex bg-white/[0.03] border border-white/[0.06] p-1 rounded-full gap-1 mt-6 mb-6">
                {(['email', 'phone'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t === 'email' ? 'email' : 'phone')
                      setEmailAuthError('')
                      setPhoneAuthError('')
                    }}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-full transition-all ${(t === 'email' && tab === 'email') || (t === 'phone' && tab === 'phone') ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/40 hover:text-white/60'}`}
                  >
                    {t === 'email' ? <><Mail className="inline h-3.5 w-3.5 mr-1.5" />Email</> : <><Phone className="inline h-3.5 w-3.5 mr-1.5" />Phone</>}
                  </button>
                ))}
              </div>

              {/* Email tab */}
              {tab === 'email' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Full name</label>
                    <Input value={emailForm.name} onChange={setEmailField('name')} placeholder="Enter your name" className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90" />
                    {emailErrors.name && <p className="text-xs text-red-400">{emailErrors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Email</label>
                    <Input type="email" value={emailForm.email} onChange={setEmailField('email')} placeholder="Enter your mail" className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90" />
                    {emailErrors.email && <p className="text-xs text-red-400">{emailErrors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">
                      Phone <span className="text-white/30 font-normal">(optional)</span>
                    </label>
                    <PhoneInput
                      value={emailForm.phone}
                      onChange={(v) => setEmailForm(f => ({ ...f, phone: v }))}
                      placeholder="98765 43210"
                      error={emailErrors.phone}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={emailForm.password}
                        onChange={setEmailField('password')}
                        placeholder={`Min ${PASSWORD_MIN_LENGTH} characters`}
                        className="h-12 pl-4 pr-12 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(s => !s)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {emailForm.password && <PasswordStrengthMeter password={emailForm.password} />}
                    {emailErrors.password && <p className="text-xs text-red-400">{emailErrors.password}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Confirm password</label>
                    <Input type="password" value={emailForm.confirmPassword} onChange={setEmailField('confirmPassword')} placeholder="Re-enter your password" className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90" />
                    {emailErrors.confirmPassword && <p className="text-xs text-red-400">{emailErrors.confirmPassword}</p>}
                  </div>

                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="email-terms"
                      checked={emailForm.terms}
                      onChange={setEmailField('terms')}
                      className="mt-0.5 h-4 w-4 rounded border-white/[0.12] bg-transparent"
                    />
                    <label htmlFor="email-terms" className="text-xs text-white/40">
                      I agree to the{' '}
                      <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary/80 hover:text-primary underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary/80 hover:text-primary underline">
                        Privacy Policy
                      </Link>
                    </label>
                  </div>
                  {emailErrors.terms && <p className="text-xs text-red-400">{emailErrors.terms}</p>}

                  {emailAuthError && <p className="text-sm text-red-400">{emailAuthError}</p>}

                  <Button
                    className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 mt-1"
                    onClick={handleEmailSubmit}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Begin your journey
                  </Button>
                </div>
              )}

              {/* Phone tab */}
              {tab === 'phone' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Full name</label>
                    <Input value={phoneForm.name} onChange={setPhoneField('name')} placeholder="Enter your name" className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90" />
                    {phoneErrors.name && <p className="text-xs text-red-400">{phoneErrors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Email (for recovery)</label>
                    <Input type="email" value={phoneForm.email} onChange={setPhoneField('email')} placeholder="Enter your mail" className="h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-white/25 text-sm text-white/90" />
                    {phoneErrors.email && <p className="text-xs text-red-400">{phoneErrors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-white/50 ml-1">Phone number</label>
                    <PhoneInput
                      value={phoneForm.phone}
                      onChange={(v) => setPhoneForm(f => ({ ...f, phone: v }))}
                      placeholder="98765 43210"
                      error={phoneErrors.phone}
                    />
                  </div>

                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="phone-terms"
                      checked={phoneForm.terms}
                      onChange={setPhoneField('terms')}
                      className="mt-0.5 h-4 w-4 rounded border-white/[0.12] bg-transparent"
                    />
                    <label htmlFor="phone-terms" className="text-xs text-white/40">
                      I agree to the{' '}
                      <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary/80 hover:text-primary underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary/80 hover:text-primary underline">
                        Privacy Policy
                      </Link>
                    </label>
                  </div>
                  {phoneErrors.terms && <p className="text-xs text-red-400">{phoneErrors.terms}</p>}

                  <p className="text-xs text-white/30">
                    We'll send a 6-digit code to your WhatsApp. Phone sign-in will only work on this device.
                  </p>

                  {phoneAuthError && <p className="text-sm text-red-400">{phoneAuthError}</p>}

                  <Button
                    className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 mt-1"
                    onClick={handlePhoneSubmit}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send OTP on WhatsApp
                  </Button>
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

              {/* Switch to sign in */}
              <p className="text-center text-sm text-white/40 mt-5">
                Already have an account?{' '}
                <button className="text-primary font-semibold hover:underline" onClick={switchToSignIn}>
                  Sign in
                </button>
              </p>
            </>
          )}

          {/* Phone OTP step */}
          {!googleSuccess && phoneStep === 'otp' && (
            <>
              <DialogHeader className="text-left space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-primary">Verification</p>
                <DialogTitle className="font-headline text-[1.75rem] leading-tight tracking-tight text-white">
                  Verify your <span className="text-primary">phone</span>
                </DialogTitle>
                <DialogDescription className="text-sm text-white/40">
                  Enter the 6-digit code we sent via WhatsApp to {phoneE164}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 mt-6">
                <p className="text-xs text-white/40">
                  Expires in {Math.floor(phoneExpiryTimer / 60)}:{(phoneExpiryTimer % 60).toString().padStart(2, '0')}
                </p>
                <div className="space-y-2">
                  <label className="text-xs text-white/50 ml-1">Verification code</label>
                  <Input
                    value={phoneOtp}
                    onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="h-12 rounded-2xl bg-transparent border border-white/[0.12] text-center tracking-widest text-lg text-white/90"
                    onKeyDown={e => e.key === 'Enter' && handlePhoneVerify()}
                  />
                </div>
                {phoneAuthError && <p className="text-sm text-red-400">{phoneAuthError}</p>}
                <Button
                  className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/20 hover:bg-primary/90"
                  onClick={handlePhoneVerify}
                  disabled={loading || phoneOtp.length < 6}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verify & Create Account
                </Button>
                <div className="flex justify-between items-center text-xs text-white/35">
                  <button
                    type="button"
                    onClick={handlePhoneResend}
                    disabled={loading || phoneResendTimer > 0}
                    className="hover:text-primary disabled:opacity-50 transition-colors"
                  >
                    {phoneResendTimer > 0 ? `Resend in ${phoneResendTimer}s` : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhoneStep('form'); setPhoneAuthError('') }}
                    className="hover:text-primary transition-colors"
                  >
                    Change details
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
