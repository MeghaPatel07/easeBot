import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Star, Loader2 } from 'lucide-react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

// ── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'How do I start planning my wedding?',
    a: 'Once you sign in, you can jump right in using quick actions and occasion chips on the home screen. Just tap a chip like "Find a venue" or "Plan my reception" and TheWeddingBot will walk you through it step by step.',
  },
  {
    q: 'What AI modes are available?',
    a: 'TheWeddingBot offers four specialized modes: Planner (timeline and logistics), Stylist (decor, outfits, aesthetics), Knowledge (vendor research, traditions, etiquette), and Assistant (general help, reminders, quick answers). You can switch modes from the mode selector in the chat.',
  },
  {
    q: 'How do I generate wedding images?',
    a: 'Head to the Image Hub from the sidebar. Pick a vibe (or create a custom one), and TheWeddingBot will generate mood boards, decor concepts, and outfit ideas tailored to your style. You can save, share, or regenerate any image.',
  },
  {
    q: 'Can I share my conversations?',
    a: 'Yes! Every chat thread has a share button in the top bar. Tap it to generate a shareable link that anyone can view — no sign-in required for the viewer.',
  },
  {
    q: 'How do I track my wedding budget?',
    a: 'Open the Budget Dashboard from the sidebar. You can set a total budget, add line items by category (venue, catering, decor, etc.), and track spent vs. remaining in real time. TheWeddingBot can also suggest budget-friendly alternatives during your chats.',
  },
  {
    q: 'What are the subscription plans?',
    a: 'We offer three tiers: Free (limited messages and basic features), Pro at ₹1/month (higher limits, image generation, priority responses), and Pro Max at $39/month (unlimited messages, all image styles, advanced planning tools, and priority support).',
  },
  {
    q: 'How do I invite my partner?',
    a: 'Use the Collaborate feature in the sidebar. Enter your partner\'s email and they\'ll receive an invitation to join your wedding workspace. Once they accept, you can both chat with TheWeddingBot and see each other\'s saved items.',
  },
  {
    q: 'Is my data private?',
    a: 'Absolutely. Your conversations and personal details are encrypted and stored securely. You can export or delete your data at any time from Settings > Data & Privacy. We comply with GDPR and never sell your information to third parties.',
  },
  {
    q: 'How do I change my AI\'s tone?',
    a: 'Go to Settings > AI Behavior. You can adjust TheWeddingBot\'s personality on sliders for formality, enthusiasm, and detail level. You can also set custom instructions so TheWeddingBot remembers your preferences across sessions.',
  },
  {
    q: 'How do I contact support?',
    a: 'You\'re in the right place! Switch to the "Support & Feedback" tab above to submit a bug report, feature request, billing question, or general feedback. Our team typically responds within 24 hours.',
  },
]

// ── Category options ─────────────────────────────────────────────────────────

type TicketCategory =
  | 'bug'
  | 'feature'
  | 'billing'
  | 'feedback'
  | 'other'

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'billing', label: 'Billing Issue' },
  { value: 'feedback', label: 'General Feedback' },
  { value: 'other', label: 'Other' },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function Help() {
  const { user, profile } = useAuth()
  const { toast } = useToast()

  // Form state
  const [category, setCategory] = useState<TicketCategory | ''>('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isLoggedIn = !!user && !!profile

  // ── Validation ───────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!category) return 'Please select a category.'
    if (!subject.trim()) return 'Please enter a subject.'
    if (description.trim().length < 20)
      return 'Description must be at least 20 characters.'
    if (!isLoggedIn && !guestName.trim()) return 'Please enter your name.'
    if (!isLoggedIn && !guestEmail.trim()) return 'Please enter your email.'
    if (
      !isLoggedIn &&
      guestEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())
    )
      return 'Please enter a valid email address.'
    return null
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validate()
    if (error) {
      toast({ title: 'Validation error', description: error, variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      await addDoc(collection(db, 'support_tickets'), {
        userId: user?.uid ?? null,
        userEmail: isLoggedIn ? profile!.email : guestEmail.trim(),
        userName: isLoggedIn ? profile!.name : guestName.trim(),
        category,
        subject: subject.trim(),
        description: description.trim(),
        rating: category === 'feedback' ? rating : null,
        status: 'open',
        createdAt: serverTimestamp(),
      })

      toast({
        title: 'Ticket submitted',
        description: 'Thanks for reaching out! We\'ll get back to you soon.',
      })

      // Reset form
      setCategory('')
      setSubject('')
      setDescription('')
      setRating(0)
      setGuestName('')
      setGuestEmail('')
    } catch (err) {
      toast({
        title: 'Something went wrong',
        description: (err as Error)?.message ?? 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="gradient-bg min-h-screen text-foreground/90/85 font-body">
      {/* Background blurs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-[28rem] h-[28rem] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-12 md:py-16">
        {/* Back link */}
        <Link
          to="/"
          aria-label="Back to TheWeddingBot home"
          className="inline-flex items-center gap-2 text-sm text-foreground/90 hover:text-foreground/90/90 transition mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to TheWeddingBot
        </Link>

        {/* Header */}
        <header className="mb-10">
          <p className="font-label uppercase tracking-[0.2em] text-2xs text-foreground/60 mb-3">
            Support
          </p>
          <h1 className="font-headline text-4xl md:text-5xl tracking-tight text-foreground/90 mb-3">
            Help &amp; Feedback
          </h1>
          <p className="text-sm text-foreground/90">
            Find answers to common questions or send us a message.
          </p>
        </header>

        {/* Tabs */}
        <Tabs defaultValue="faq" className="w-full">
          <TabsList className="w-full bg-[hsl(22.5deg_25.6%_50.98%/5%)] backdrop-blur-2xl border-0 rounded-xl h-12 p-1 mb-8">
            <TabsTrigger
              value="faq"
              className="flex-1 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-foreground/90 transition-all h-10"
            >
              FAQ / Help
            </TabsTrigger>
            <TabsTrigger
              value="support"
              className="flex-1 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-foreground/90 transition-all h-10"
            >
              Support &amp; Feedback
            </TabsTrigger>
          </TabsList>

          {/* ── FAQ tab ──────────────────────────────────────────────────── */}
          <TabsContent value="faq">
            <div className="rounded-2xl bg-card/90 border border-border/50 shadow-card backdrop-blur-2xl p-6 md:p-8">
              <Accordion type="single" collapsible className="space-y-1">
                {FAQ_ITEMS.map((item, i) => (
                  <AccordionItem
                    key={i}
                    value={`faq-${i}`}
                    className="border-border/40"
                  >
                    <AccordionTrigger className="text-left text-foreground/90/90 hover:text-primary hover:no-underline py-5 text-[15px]">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-foreground/90 leading-relaxed text-sm">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </TabsContent>

          {/* ── Support & Feedback tab ───────────────────────────────────── */}
          <TabsContent value="support">
            <div className="rounded-2xl bg-card/90 border border-border/50 shadow-card backdrop-blur-2xl p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Guest-only name + email */}
                {!isLoggedIn && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground/90 text-sm">Your name</Label>
                      <Input
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Jane Doe"
                        className="border-0 text-foreground/90/90 placeholder:text-foreground/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground/90 text-sm">Email</Label>
                      <Input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="jane@example.com"
                        className="border-0 text-foreground/90/90 placeholder:text-foreground/50"
                      />
                    </div>
                  </div>
                )}

                {/* Category */}
                <div className="space-y-2">
                  <Label className="text-foreground/90 text-sm">Category</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as TicketCategory)}
                  >
                    <SelectTrigger className="border-0 text-foreground/90/90">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <Label className="text-foreground/90 text-sm">Subject</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief summary of your issue or idea"
                    className="border-0 text-foreground/90/90 placeholder:text-foreground/50"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-foreground/90 text-sm">Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell us more (at least 20 characters)..."
                    rows={5}
                    className="border-0 text-foreground/90/90 placeholder:text-foreground/50 resize-none"
                  />
                  <p className="text-xs text-foreground/50">
                    {description.trim().length}/20 characters minimum
                  </p>
                </div>

                {/* Star rating — only for General Feedback */}
                {category === 'feedback' && (
                  <div className="space-y-2">
                    <Label className="text-foreground/90 text-sm">
                      How would you rate your experience?
                    </Label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                          aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`h-7 w-7 transition-colors ${
                              star <= (hoverRating || rating)
                                ? 'fill-primary text-primary'
                                : 'text-foreground/30'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto bg-primary hover:bg-primary/80 text-primary-foreground font-medium rounded-xl h-11 px-8"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
              </form>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
