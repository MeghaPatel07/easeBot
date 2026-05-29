import React, { useState } from 'react'
import { MessageSquareHeart, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { auth } from '@/lib/firebase'

// Backend base URL mirrors the rest of the service layer.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://easebot-production.up.railway.app'

export type FeedbackType = 'bug' | 'suggestion' | 'praise' | 'other'

export interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast()
  const [feedback, setFeedback] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState<FeedbackType | ''>('')
  const [submitting, setSubmitting] = useState(false)
  // Track which fields the user has interacted with so we don't yell at them on first paint.
  const [feedbackTouched, setFeedbackTouched] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)

  const reset = () => {
    setFeedback('')
    setEmail('')
    setType('')
    setFeedbackTouched(false)
    setEmailTouched(false)
  }

  const handleClose = (nextOpen: boolean) => {
    if (submitting) return
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  // Per-field validators — used both for inline errors and submit-time guard.
  const feedbackError = (() => {
    const trimmed = feedback.trim()
    if (trimmed.length === 0) return 'Feedback is required.'
    if (trimmed.length < 10) return 'Please share at least 10 characters of feedback.'
    if (trimmed.length > 5000) return 'Feedback is too long (max 5000 characters).'
    return null
  })()

  const emailError = (() => {
    const trimmedEmail = email.trim()
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) return 'Please enter a valid email or leave it blank.'
    return null
  })()

  const validate = (): string | null => feedbackError ?? emailError ?? null
  const canSubmit = !submitting && !feedbackError && !emailError

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) {
      // Surface inline errors on every required field on the next render.
      setFeedbackTouched(true)
      setEmailTouched(true)
      toast({ title: 'Please fix the form', description: err, variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const currentUser = auth.currentUser
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken()
          headers.Authorization = `Bearer ${token}`
        } catch {
          // Token fetch failure is non-fatal — submit as guest.
        }
      }

      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          feedback: feedback.trim(),
          email: email.trim() || undefined,
          type: type || undefined,
          isGuest: !currentUser,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      })

      if (!res.ok) {
        let message = 'Could not send feedback.'
        try {
          const data = await res.json()
          if (data?.error) message = typeof data.error === 'string' ? data.error : message
        } catch {
          // swallow
        }
        throw new Error(message)
      }

      toast({
        title: 'Thanks for the feedback!',
        description: 'We read every note. We appreciate you taking the time.',
      })
      reset()
      onOpenChange(false)
    } catch (e2) {
      toast({
        title: "Couldn't send feedback",
        description: (e2 as Error)?.message ?? 'Please try again in a moment.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[520px] max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-foreground/90 flex items-center gap-2">
            <MessageSquareHeart className="h-5 w-5 text-primary" />
            Send Feedback
          </DialogTitle>
          <DialogDescription className="text-foreground/55">
            Tell us what's working, what's broken, or what you'd love to see next.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label htmlFor="feedback-message" className="text-xs font-medium text-foreground/70">
              Your feedback{' '}
              <span className="text-primary" aria-hidden="true">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <Textarea
              id="feedback-message"
              required
              aria-required="true"
              aria-invalid={feedbackTouched && !!feedbackError}
              aria-describedby={
                feedbackTouched && feedbackError ? 'feedback-message-error' : 'feedback-message-count'
              }
              minLength={10}
              maxLength={5000}
              placeholder="What's on your mind? (min 10 characters)"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              onBlur={() => setFeedbackTouched(true)}
              className="min-h-[120px] rounded-xl border-0 bg-foreground/[0.04] text-sm text-foreground/90 placeholder-foreground/30 focus-visible:ring-1 focus-visible:ring-foreground/10 focus-visible:ring-offset-0 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive/60"
              disabled={submitting}
            />
            {feedbackTouched && feedbackError ? (
              <p id="feedback-message-error" role="alert" className="text-2xs text-destructive">
                {feedbackError}
              </p>
            ) : null}
            <p id="feedback-message-count" className="text-2xs text-foreground/35">
              {feedback.trim().length} / 5000
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-type" className="text-xs font-medium text-foreground/70">
              Type of feedback (optional)
            </label>
            <Select value={type} onValueChange={(v) => setType(v as FeedbackType)} disabled={submitting}>
              <SelectTrigger id="feedback-type" className="rounded-xl">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
                <SelectItem value="praise">Praise</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-email" className="text-xs font-medium text-foreground/70">
              Your email (optional — only if you want a reply)
            </label>
            <Input
              id="feedback-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={emailTouched && !!emailError}
              aria-describedby={emailTouched && emailError ? 'feedback-email-error' : undefined}
              className="rounded-xl border-0 bg-foreground/[0.04] text-sm text-foreground/90 placeholder-foreground/30 focus-visible:ring-1 focus-visible:ring-foreground/10 focus-visible:ring-offset-0 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive/60"
              disabled={submitting}
            />
            {emailTouched && emailError ? (
              <p id="feedback-email-error" role="alert" className="text-2xs text-destructive">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-foreground/10">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={submitting}
              className="px-5 text-foreground/60 hover:text-foreground/90"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className="px-5 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send Feedback'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default FeedbackDialog
