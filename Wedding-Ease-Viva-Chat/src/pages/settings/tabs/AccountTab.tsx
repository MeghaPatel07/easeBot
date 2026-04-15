// AccountTab — Sprint 2 (Sofia). Settings & Profile redesign, PRD §6.2–6.7.
//
// Implements the full Account hub: profile header, identity, email, password,
// connected providers, and danger zone. Touches ONLY this file. All endpoints
// owned by Rohan that currently respond 501 are degraded to a polite toast,
// never a crash. Plaintext passwords never live longer than the dialog.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { auth } from '@/lib/firebase'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'
import { useAuth } from '@/contexts/AuthContext'
import { useAccount } from '@/hooks/useAccount'
import { useToast } from '@/hooks/use-toast'
import {
  deleteAccount as apiDeleteAccount,
  signOutEverywhere as apiSignOutEverywhere,
  type ProfilePatch,
} from '@/services/accountService'
import { isDerivedPhoneEmail } from '@/services/authService'
import type { UserProfile } from '@/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import TabShell from './_TabShell'
import {
  Check,
  X,
  ShieldCheck,
  Mail,
  Lock,
  Link2,
  Trash2,
  AlertTriangle,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null, email?: string | null): string {
  const src = (name || email || '?').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function planLabel(plan: 'free' | 'pro' | 'premium' | undefined): string {
  switch (plan) {
    case 'pro':
      return 'Pro'
    case 'premium':
      return 'Premium'
    default:
      return 'Free'
  }
}

interface PasswordRule {
  id: 'len' | 'upper' | 'lower' | 'digit' | 'special'
  label: string
  test: (s: string) => boolean
}

const PASSWORD_RULES: PasswordRule[] = [
  { id: 'len', label: 'At least 8 characters', test: (s) => s.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (s) => /[A-Z]/.test(s) },
  { id: 'lower', label: 'One lowercase letter', test: (s) => /[a-z]/.test(s) },
  { id: 'digit', label: 'One digit', test: (s) => /[0-9]/.test(s) },
  {
    id: 'special',
    label: 'One special character',
    test: (s) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(s),
  },
]

function passwordIsStrong(s: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(s))
}

// Reads provider IDs straight off Firebase Auth's currentUser as a fallback for
// linkedProviders. Sprint 1 backfill may not have populated Firestore yet.
function readFirebaseProviders(): Array<'password' | 'google.com'> {
  const u = auth.currentUser
  if (!u) return []
  return u.providerData
    .map((p) => p.providerId)
    .filter((id): id is 'password' | 'google.com' => id === 'password' || id === 'google.com')
}

// ── Component ────────────────────────────────────────────────────────────────

export function AccountTab() {
  const { profile: authProfile, signOut } = useAuth()
  const { profile: accountProfile, plan, updateProfile } = useAccount()
  const { toast } = useToast()

  const profile: UserProfile | null = accountProfile ?? authProfile ?? null

  // Identity-origin lock (single source of truth for the whole tab):
  //   - phone-based accounts can edit their email but NOT their phone
  //   - email-based accounts can edit their phone but NOT their email
  // Trust the persisted `authMethod` if present; otherwise infer from the
  // Firebase Auth email shape via `isDerivedPhoneEmail`.
  const isPhoneBased = useMemo(() => {
    if (profile?.authMethod === 'phone') return true
    if (profile?.authMethod === 'email') return false
    return isDerivedPhoneEmail(auth.currentUser?.email ?? null)
  }, [profile?.authMethod, profile?.uid])

  // Derive split phone fields from the combined `phone` E.164 value when the
  // split fields aren't persisted (legacy/Firestore-only records).
  const derivedPhone = useMemo(() => {
    const cc = profile?.phoneCountryCode ?? ''
    const nat = profile?.phoneNational ?? ''
    if (cc || nat) return { cc, nat }
    if (!profile?.phone) return { cc: '', nat: '' }
    const parsed = parsePhoneNumberFromString(profile.phone)
    if (parsed) return { cc: `+${parsed.countryCallingCode}`, nat: parsed.nationalNumber }
    // Fallback: if string starts with +, treat first chunk as CC.
    const m = /^(\+\d{1,3})(\d+)$/.exec(profile.phone)
    return m ? { cc: m[1], nat: m[2] } : { cc: '', nat: profile.phone }
  }, [profile?.phone, profile?.phoneCountryCode, profile?.phoneNational])

  // ── Identity card local form state ────────────────────────────────────────
  const [name, setName] = useState(profile?.name ?? '')
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [phoneCountryCode, setPhoneCountryCode] = useState(derivedPhone.cc)
  const [phoneNational, setPhoneNational] = useState(derivedPhone.nat)
  const [savingIdentity, setSavingIdentity] = useState(false)

  // Sync local form when profile loads/updates from outside.
  useEffect(() => {
    setName(profile?.name ?? '')
    setNickname(profile?.nickname ?? '')
    setPhoneCountryCode(derivedPhone.cc)
    setPhoneNational(derivedPhone.nat)
  }, [profile?.uid, profile?.name, profile?.nickname, derivedPhone.cc, derivedPhone.nat])

  const identityDirty =
    name !== (profile?.name ?? '') ||
    nickname !== (profile?.nickname ?? '') ||
    (!isPhoneBased && (
      phoneCountryCode !== derivedPhone.cc ||
      phoneNational !== derivedPhone.nat
    ))

  const handleSaveIdentity = async () => {
    if (!identityDirty || savingIdentity) return
    setSavingIdentity(true)
    // Sprint 4 (Kenji) M-9 fix: rollback snapshot now includes phone fields.
    const original = {
      name: profile?.name ?? '',
      nickname: profile?.nickname ?? '',
      phoneCountryCode: derivedPhone.cc,
      phoneNational: derivedPhone.nat,
    }
    const patch: ProfilePatch = {
      name: name.trim(),
      nickname: nickname.trim() || undefined,
    }
    if (!isPhoneBased) {
      patch.phone =
        phoneCountryCode.trim() && phoneNational.trim()
          ? `${phoneCountryCode.trim()}${phoneNational.trim()}`
          : null
    }
    try {
      await updateProfile(patch)
      toast({ title: 'Profile updated', description: 'Your details have been saved.' })
    } catch (err) {
      toast({
        title: 'Could not save',
        description: (err as Error)?.message ?? 'Please try again.',
        variant: 'destructive',
      })
      // Rollback local state — full snapshot including phone (M-9).
      setName(original.name)
      setNickname(original.nickname)
      setPhoneCountryCode(original.phoneCountryCode)
      setPhoneNational(original.phoneNational)
    } finally {
      setSavingIdentity(false)
    }
  }

  // ── Email change ──────────────────────────────────────────────────────────
  const providers = useMemo(() => {
    const fromProfile = profile?.linkedProviders
    if (fromProfile && fromProfile.length > 0) return fromProfile
    return readFirebaseProviders()
  }, [profile?.linkedProviders, profile?.uid])

  const hasPasswordProvider = providers.includes('password')
  const hasGoogleProvider = providers.includes('google.com')

  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)

  const closeEmailDialog = () => {
    setEmailDialogOpen(false)
    setReauthPassword('')
    setNewEmail('')
  }

  // Sprint 4 (Kenji) M-5 fix: real Firebase Auth email change pipeline.
  const isValidEmail = (v: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

  const handleSubmitEmailChange = async () => {
    if (emailSubmitting) return
    const target = newEmail.trim()
    if (!isValidEmail(target)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      })
      return
    }
    const currentUser = auth.currentUser
    if (!currentUser) {
      toast({
        title: 'Not signed in',
        description: 'Please sign in again and retry.',
        variant: 'destructive',
      })
      return
    }
    setEmailSubmitting(true)
    try {
      // Phone-created accounts: the Firebase Auth identity is bound to a
      // derived `phone_*@phone.weddingease.local` address that the user can
      // never see. The "email" field they edit here is purely a Firestore
      // display value used for reminders / contact, so we bypass the Firebase
      // Auth verifyBeforeUpdateEmail flow entirely and PATCH the profile.
      if (isPhoneBased) {
        await updateProfile({ email: target })
        toast({
          title: 'Email updated',
          description: 'Your contact email has been saved.',
        })
        closeEmailDialog()
        return
      }
      // Reauth based on linked provider.
      if (hasPasswordProvider) {
        if (!currentUser.email) throw new Error('No email on account')
        if (!reauthPassword) {
          toast({
            title: 'Password required',
            description: 'Enter your current password to confirm.',
            variant: 'destructive',
          })
          setEmailSubmitting(false)
          return
        }
        const cred = EmailAuthProvider.credential(currentUser.email, reauthPassword)
        await reauthenticateWithCredential(currentUser, cred)
      } else if (hasGoogleProvider) {
        const provider = new GoogleAuthProvider()
        await reauthenticateWithPopup(currentUser, provider)
      }
      // Firebase will send a verification email to the NEW address; the
      // email field updates only after the user clicks the link. We must
      // NOT write Firestore directly — Firebase handles propagation.
      await verifyBeforeUpdateEmail(currentUser, target)
      toast({
        title: 'Verification sent',
        description: `Check ${target} to confirm the change.`,
      })
      closeEmailDialog()
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      let message = (err as Error)?.message ?? 'Please try again.'
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        message = 'That password is incorrect.'
      } else if (code === 'auth/invalid-email') {
        message = 'That email address is not valid.'
      } else if (code === 'auth/email-already-in-use') {
        message = 'That email is already in use by another account.'
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.'
      } else if (code === 'auth/requires-recent-login') {
        message = 'Please sign out and sign back in, then retry.'
      } else if (code === 'auth/popup-closed-by-user') {
        message = 'Google sign-in was cancelled.'
      }
      toast({ title: 'Could not change email', description: message, variant: 'destructive' })
    } finally {
      setEmailSubmitting(false)
    }
  }

  // ── Password change ───────────────────────────────────────────────────────
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  // Wipe plaintext state every time the dialog closes.
  const closePasswordDialog = () => {
    setPasswordDialogOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword
  const canSubmitPassword =
    currentPassword.length > 0 && passwordIsStrong(newPassword) && passwordsMatch

  // Sprint 4 (Kenji) M-6 fix: real Firebase Auth password change. Runs
  // entirely client-side via the Firebase Auth SDK — no backend call. We
  // never log or persist the plaintext; values live only in component state
  // and are wiped on dialog close.
  const handleSubmitPasswordChange = async () => {
    if (!canSubmitPassword || passwordSubmitting) return
    const currentUser = auth.currentUser
    if (!currentUser || !currentUser.email) {
      toast({
        title: 'Not signed in',
        description: 'Please sign in again and retry.',
        variant: 'destructive',
      })
      return
    }
    setPasswordSubmitting(true)
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, currentPassword)
      await reauthenticateWithCredential(currentUser, cred)
      await updatePassword(currentUser, newPassword)
      toast({
        title: 'Password updated',
        description: 'Your new password is now active.',
      })
      closePasswordDialog()
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      let message = 'Please try again.'
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        message = 'Your current password is incorrect.'
      } else if (code === 'auth/weak-password') {
        message = 'That password is too weak. Please choose a stronger one.'
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.'
      } else if (code === 'auth/requires-recent-login') {
        message = 'Please sign out and sign back in, then retry.'
      }
      toast({
        title: 'Could not update password',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setPasswordSubmitting(false)
    }
  }

  // ── Connected accounts ────────────────────────────────────────────────────
  const [linkingGoogle, setLinkingGoogle] = useState(false)
  const handleLinkGoogle = async () => {
    if (linkingGoogle) return
    const currentUser = auth.currentUser
    if (!currentUser) {
      toast({
        title: 'Not signed in',
        description: 'Please sign in again and retry.',
        variant: 'destructive',
      })
      return
    }
    setLinkingGoogle(true)
    try {
      const provider = new GoogleAuthProvider()
      await linkWithPopup(currentUser, provider)
      toast({
        title: 'Google linked',
        description: 'You can now sign in with Google.',
      })
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      let message = (err as Error)?.message ?? 'Please try again.'
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        message = 'That Google account is already linked to another user.'
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        message = 'Google sign-in was cancelled.'
      } else if (code === 'auth/provider-already-linked') {
        message = 'Google is already linked to this account.'
      }
      toast({ title: 'Could not link Google', description: message, variant: 'destructive' })
    } finally {
      setLinkingGoogle(false)
    }
  }

  // ── Delete account ────────────────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setDeleteConfirmEmail('')
  }

  const canSubmitDelete =
    !!profile?.email && deleteConfirmEmail === profile.email // case-sensitive

  // Sprint 4 (Kenji) C-1 fix: real backend delete + sign-out + redirect.
  const handleSubmitDelete = async () => {
    if (!canSubmitDelete || deleteSubmitting) return
    setDeleteSubmitting(true)
    try {
      await apiDeleteAccount()
      // On success: terminate the session and bounce to landing. We do not
      // close the dialog first — the page is about to navigate away.
      try {
        await auth.signOut()
      } catch {
        /* ignore — we're navigating away anyway */
      }
      window.location.href = '/'
    } catch (err) {
      toast({
        title: 'Could not delete account',
        description: (err as Error)?.message ?? 'Please try again later.',
        variant: 'destructive',
      })
      setDeleteSubmitting(false)
      // Dialog stays open per spec so user can retry.
    }
  }

  // ── Sign out of all devices ───────────────────────────────────────────────
  const [signOutAllSubmitting, setSignOutAllSubmitting] = useState(false)
  const handleSignOutEverywhere = async () => {
    if (signOutAllSubmitting) return
    setSignOutAllSubmitting(true)
    try {
      await apiSignOutEverywhere()
      try {
        await auth.signOut()
      } catch {
        /* ignore */
      }
      window.location.href = '/'
    } catch (err) {
      toast({
        title: 'Could not sign out everywhere',
        description: (err as Error)?.message ?? 'Please try again later.',
        variant: 'destructive',
      })
      setSignOutAllSubmitting(false)
    }
  }

  // signOut from AuthContext is no longer the primary delete path — the new
  // implementation calls auth.signOut() directly so the redirect is atomic.
  // Keep the reference live so the import is honored if/when AuthContext
  // adds extra teardown side-effects we want to hook into.
  void signOut

  // ── Render ────────────────────────────────────────────────────────────────
  const initials = getInitials(profile?.name, profile?.email)
  const tier = plan?.tier ?? profile?.plan
  const verified = !!profile?.isVerified

  return (
    <TabShell
      title="Account"
      description="Manage your identity, sign-in, and account lifecycle."
    >
      {/* 1. Profile header */}
      <Card className="bg-card border-border p-6">
        <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:gap-6 md:text-left">
          <Avatar className="h-24 w-24 border border-border">
            <AvatarFallback className="bg-muted text-foreground text-xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-1 flex-col gap-1">
            <div className="flex flex-col items-center gap-2 md:flex-row md:items-center">
              <h3 className="text-lg font-semibold text-foreground">
                {profile?.name || 'Unnamed user'}
              </h3>
              <Badge
                variant="secondary"
                className="bg-muted text-muted-foreground border-border"
              >
                {planLabel(tier)} plan
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground break-all">
              {profile?.email ?? 'No email on file'}
            </p>
          </div>
        </div>
      </Card>

      {/* 2. Identity card */}
      <Card className="bg-card border-border p-6">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Identity</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Your name, nickname, and phone number.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="account-name" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="min-h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-nickname" className="text-sm font-medium">
                Nickname
              </Label>
              <Input
                id="account-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="What should we call you?"
                className="min-h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">Shown in chat headers.</p>
            </div>

            <div className="space-y-2">
              {/* <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Phone</Label>
                {isPhoneBased && (
                  <Badge
                    variant="secondary"
                    className="bg-muted text-muted-foreground border-border"
                  >
                    Locked
                  </Badge>
                )}
              </div> */}
              <div className="flex gap-2">
                <Input
                  id="account-phone-cc"
                  value={phoneCountryCode}
                  onChange={(e) => setPhoneCountryCode(e.target.value)}
                  placeholder="+1"
                  inputMode="tel"
                  aria-label="Country code"
                  disabled={isPhoneBased}
                  readOnly={isPhoneBased}
                  className="min-h-11 w-24 bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                />
                <Input
                  id="account-phone-num"
                  value={phoneNational}
                  onChange={(e) => setPhoneNational(e.target.value)}
                  placeholder="555 123 4567"
                  inputMode="tel"
                  aria-label="National phone number"
                  disabled={isPhoneBased}
                  readOnly={isPhoneBased}
                  className="min-h-11 flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                />
              </div>
              {isPhoneBased && (
                <p className="text-xs text-muted-foreground">
                  This account was created with phone sign-in, so the phone number
                  is the primary identifier and cannot be changed.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveIdentity}
              disabled={!identityDirty || savingIdentity}
              className="min-h-11 min-w-11 bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {savingIdentity ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. Email card */}
      <Card className="bg-card border-border p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Mail aria-hidden="true" className="mt-1 h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Email</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Used for sign-in and notifications.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 break-all text-sm text-foreground">
              <span>{profile?.email ?? '—'}</span>
              {verified ? (
                <Badge
                  variant="secondary"
                  className="bg-muted text-muted-foreground border-border"
                >
                  <ShieldCheck aria-hidden="true" className="mr-1 h-3 w-3" />
                  Verified
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-muted text-muted-foreground border-border"
                >
                  Unverified
                </Badge>
              )}
            </div>

            {isPhoneBased ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmailDialogOpen(true)}
                className="min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Change email
              </Button>
            ):null
            // ) : (
            //   <Badge
            //     variant="secondary"
            //     className="bg-muted text-muted-foreground border-border"
            //   >
            //     <Lock aria-hidden="true" className="mr-1 h-3 w-3" />
            //     Locked
            //   </Badge>
            // )}
}
          </div>
          {!isPhoneBased && (
            <p className="text-xs text-muted-foreground">
              This account was created with email sign-in, so your email is the
              primary identifier and cannot be changed.
            </p>
          )}
        </div>
      </Card>

      {/* 4. Password card — only for password users on email-based accounts */}
      {hasPasswordProvider && !isPhoneBased && (
        <Card className="bg-card border-border p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Lock aria-hidden="true" className="mt-1 h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Password</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use a strong password unique to WeddingEase.
                </p>
              </div>
            </div>

            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordDialogOpen(true)}
                className="min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Change password
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 5. Connected accounts */}
      <Card className="bg-card border-border p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Link2 aria-hidden="true" className="mt-1 h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Connected accounts</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Sign-in methods linked to this account.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <span>Email &amp; password</span>
                {hasPasswordProvider && (
                  <Badge
                    variant="secondary"
                    className="bg-muted text-muted-foreground border-border"
                  >
                    Linked
                  </Badge>
                )}
              </div>
              {!hasPasswordProvider && (
                <span className="text-xs text-muted-foreground">Not linked</span>
              )}
            </div>

            <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <span>Google</span>
                {hasGoogleProvider && (
                  <Badge
                    variant="secondary"
                    className="bg-muted text-muted-foreground border-border"
                  >
                    Linked
                  </Badge>
                )}
              </div>
              {!hasGoogleProvider && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLinkGoogle}
                  disabled={linkingGoogle}
                  className="min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {linkingGoogle ? 'Linking…' : 'Link Google'}
                </Button>
              )}
            </div>
          </div>

          {/* Sprint 4 (Kenji): Sign out of all devices. Non-destructive gray. */}
          <Separator className="bg-border" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Sign out of all devices</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Revokes every active session, including this one. You will need to sign in again.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleSignOutEverywhere}
              disabled={signOutAllSubmitting}
              className="min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {signOutAllSubmitting ? 'Signing out…' : 'Sign out everywhere'}
            </Button>
          </div>
        </div>
      </Card>

      {/* 6. Danger zone */}
      <Card className="border-destructive/60 bg-card p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 text-destructive" />
            <div className="flex-1">
              <h3 className="text-base font-semibold text-destructive">Danger zone</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Deleting your account is permanent. This cannot be undone.
              </p>
            </div>
          </div>

          <Separator className="bg-border" />

          <div className="flex justify-start">
            <Button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="min-h-11 min-w-11 bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
              Delete account
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Email change dialog ──────────────────────────────────────────── */}
      <AlertDialog
        open={emailDialogOpen}
        onOpenChange={(o) => (o ? setEmailDialogOpen(true) : closeEmailDialog())}
      >
        <AlertDialogContent className="bg-card text-foreground border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Change email</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {hasGoogleProvider && !hasPasswordProvider
                ? 'You will be asked to re-confirm your Google sign-in to continue.'
                : 'Confirm your current password, then enter the new email.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-4">
            {hasPasswordProvider && (
              <div className="space-y-2">
                <Label htmlFor="reauth-password" className="text-sm font-medium">
                  Current password
                </Label>
                <Input
                  id="reauth-password"
                  type="password"
                  autoComplete="current-password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  className="min-h-11 bg-input border-border text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-email" className="text-sm font-medium">
                New email
              </Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                className="min-h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={closeEmailDialog}
              className="min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmitEmailChange}
              disabled={
                emailSubmitting ||
                !isValidEmail(newEmail) ||
                (hasPasswordProvider && reauthPassword.length === 0)
              }
              className="min-h-11 min-w-11 bg-primary text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {emailSubmitting ? 'Submitting…' : 'Send verification'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Password change dialog ───────────────────────────────────────── */}
      <AlertDialog
        open={passwordDialogOpen}
        onOpenChange={(o) => (o ? setPasswordDialogOpen(true) : closePasswordDialog())}
      >
        <AlertDialogContent className="bg-card text-foreground border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Change password</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Pick a new password that meets all of the requirements below.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="current-password" className="text-sm font-medium">
                Current password
              </Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="min-h-11 bg-input border-border text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="min-h-11 bg-input border-border text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium">
                Confirm new password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="min-h-11 bg-input border-border text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
            </div>

            <ul className="flex flex-col gap-1" aria-label="Password requirements">
              {PASSWORD_RULES.map((r) => {
                const ok = r.test(newPassword)
                return (
                  <li
                    key={r.id}
                    className={`flex items-center gap-2 text-xs ${
                      ok ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {ok ? (
                      <Check aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      <X aria-hidden="true" className="h-3 w-3" />
                    )}
                    <span>{r.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={closePasswordDialog}
              className="min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmitPasswordChange}
              disabled={!canSubmitPassword || passwordSubmitting}
              className="min-h-11 min-w-11 bg-primary text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {passwordSubmitting ? 'Updating…' : 'Update password'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete account dialog ────────────────────────────────────────── */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(o) => (o ? setDeleteDialogOpen(true) : closeDeleteDialog())}
      >
        <AlertDialogContent className="bg-card text-foreground border-destructive/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This is irreversible. Your profile, chats, notes, and checklists
              will be scheduled for permanent deletion. To confirm, type your
              email address exactly:{' '}
              <span className="font-medium text-foreground break-all">
                {profile?.email ?? ''}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-confirm-email" className="text-sm font-medium">
              Type your email to confirm
            </Label>
            <Input
              id="delete-confirm-email"
              type="email"
              autoComplete="off"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={profile?.email ?? ''}
              className="min-h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={closeDeleteDialog}
              className="min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmitDelete}
              disabled={!canSubmitDelete || deleteSubmitting}
              className="min-h-11 min-w-11 bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {deleteSubmitting ? 'Deleting…' : 'Delete account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TabShell>
  )
}

export default AccountTab
