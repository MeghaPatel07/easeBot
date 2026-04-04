import { useState } from 'react'
import { UserPlus, Mail, Phone, CheckCircle, Loader2 } from 'lucide-react'
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

type Step = 'form' | 'verifying' | 'success'

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

const initialForm = { name: '', email: '', phone: '', password: '', confirmPassword: '', terms: false }

export default function SignUpModal({ open, onOpenChange, onSwitchToSignIn, initialEmail }: Props) {
  const { signUp, signInWithGoogle } = useAuth()

  const [step, setStep] = useState<Step>('form')
  const [form, setForm] = useState(() => ({ ...initialForm, email: initialEmail ?? '' }))
  const [errors, setErrors] = useState<Partial<Record<keyof typeof initialForm, string>>>({})
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signedUpEmail, setSignedUpEmail] = useState('')
  const [signedUpName, setSignedUpName] = useState('')

  const set = (field: keyof typeof initialForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: field === 'terms' ? e.target.checked : e.target.value }))

  function validate(): boolean {
    const e: Partial<Record<keyof typeof initialForm, string>> = {}
    if (!form.name.trim()) e.name = 'Full name is required'
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email is required'
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters'
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match'
    if (!form.terms) e.terms = 'You must accept the terms'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setAuthError('')
    setLoading(true)
    try {
      const result = await signUp(
        form.name.trim(),
        form.email.trim(),
        form.phone.trim() || null,
        form.password
      )
      setSignedUpEmail(result.email)
      setSignedUpName(result.name)
      setStep('verifying')
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        reset()
        onOpenChange(false)
        onSwitchToSignIn()
      } else {
        setAuthError(mapAuthError(err.code ?? err.message))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setAuthError('')
    setLoading(true)
    try {
      await signInWithGoogle(true)
      setStep('success')
      setTimeout(() => { onOpenChange(false); reset() }, 1500)
    } catch (err: any) {
      const msg = mapAuthError(err.code ?? err.message)
      if (msg) setAuthError(msg)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep('form')
    setForm(initialForm)
    setErrors({})
    setAuthError('')
    setSignedUpEmail('')
    setSignedUpName('')
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-[480px] glass-panel rounded-[2rem] p-0 border border-white/60 shadow-[0_32px_64px_-12px_rgba(44,46,42,0.1)] overflow-hidden">
        <div className="max-h-[90dvh] overflow-y-auto custom-scrollbar p-6 md:p-10">
          {/* ── Step: form ── */}
          {step === 'form' && (
            <>
              <DialogHeader className="text-center space-y-4">
                <div className="flex flex-col items-center">
                  <div className="text-[2.5rem] font-headline italic font-bold text-primary tracking-tight leading-none mb-1">Viva</div>
                  <div className="font-label uppercase tracking-[0.2em] text-2xs text-stone-400">Digital Concierge</div>
                </div>
                <DialogTitle className="font-headline text-3xl tracking-tight">Create Your Account</DialogTitle>
                <DialogDescription className="text-stone-500 text-sm">
                  Join thousands of couples planning their perfect wedding with Viva.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {/* Google */}
                <button
                  onClick={handleGoogle}
                  disabled={loading}
                  className="w-full h-14 rounded-xl bg-white border border-stone-200 flex items-center justify-center gap-3 text-stone-800 font-medium hover:bg-stone-50 hover:border-stone-300 transition-all disabled:opacity-50"
                >
                  <GoogleIcon /> Continue with Google
                </button>

                <div className="flex items-center gap-4 my-4">
                  <div className="h-[1px] flex-1 bg-stone-200"></div>
                  <span className="font-label uppercase tracking-widest text-2xs text-stone-400">or sign up with email</span>
                  <div className="h-[1px] flex-1 bg-stone-200"></div>
                </div>

                {/* Full name */}
                <div className="space-y-1">
                  <label className="font-label uppercase tracking-widest text-label text-stone-500 ml-1">Full Name</label>
                  <Input value={form.name} onChange={set('name')} placeholder="Jane Smith" className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all placeholder:text-stone-400 text-base sm:text-sm" />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="font-label uppercase tracking-widest text-label text-stone-500 ml-1">Email</label>
                  <Input type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all placeholder:text-stone-400 text-base sm:text-sm" />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                {/* Phone (optional) */}
                <div className="space-y-1">
                  <label className="font-label uppercase tracking-widest text-label text-stone-500 ml-1">Phone <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+1 555 123 4567" className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all placeholder:text-stone-400 text-base sm:text-sm" />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="font-label uppercase tracking-widest text-label text-stone-500 ml-1">Password</label>
                  <Input type="password" value={form.password} onChange={set('password')} placeholder="Min 6 characters" className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all placeholder:text-stone-400 text-base sm:text-sm" />
                  {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                </div>

                {/* Confirm */}
                <div className="space-y-1">
                  <label className="font-label uppercase tracking-widest text-label text-stone-500 ml-1">Confirm Password</label>
                  <Input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" className="h-14 px-6 rounded-xl bg-border border-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all placeholder:text-stone-400 text-base sm:text-sm" />
                  {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
                </div>

                {/* Terms */}
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={form.terms}
                    onChange={set('terms')}
                    className="mt-0.5 h-4 w-4 rounded border-stone-300"
                  />
                  <label htmlFor="terms" className="text-xs text-muted-foreground">
                    I agree to the <span className="underline cursor-pointer">Terms of Service</span> and <span className="underline cursor-pointer">Privacy Policy</span>
                  </label>
                </div>
                {errors.terms && <p className="text-xs text-red-500">{errors.terms}</p>}

                {authError && <p className="text-sm text-red-500 text-center">{authError}</p>}

                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Create Account
                </Button>

                <p className="text-center text-sm">
                  <span className="text-muted-foreground">Already have an account? </span>
                  <Button variant="link" className="p-0 h-auto font-semibold" onClick={switchToSignIn}>
                    Sign in
                  </Button>
                </p>
              </div>
            </>
          )}

          {/* ── Step: verifying ── */}
          {step === 'verifying' && (
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
                  <p className="font-medium text-stone-800">Check your inbox</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We sent a verification link to <span className="font-medium text-stone-700">{signedUpEmail}</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Click the link in the email to activate your account, then sign in.
                  </p>
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={switchToSignIn}
                >
                  Go to Sign In
                </Button>
                <p className="text-xs text-muted-foreground">
                  Didn't receive it?{' '}
                  <Button variant="link" className="p-0 h-auto text-xs" onClick={() => setStep('form')}>
                    Go back and try again
                  </Button>
                </p>
              </div>
            </>
          )}

          {/* ── Step: success (Google sign-up) ── */}
          {step === 'success' && (
            <div className="py-8 space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <div>
                <p className="text-xl font-semibold elegant-heading">Welcome to EaseBot! ✨</p>
                <p className="text-sm text-muted-foreground mt-1">Hello, {signedUpName || 'there'} 👋</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
