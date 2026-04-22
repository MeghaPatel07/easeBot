import { useEffect, useState } from 'react'
import { posthog } from '@/lib/analytics'
import { track } from '@/lib/analytics'

const STORAGE_KEY = 'ph_consent'

/**
 * Minimal consent banner. When the user has made no choice yet, PostHog is
 * opted-out by default (no events captured). Choosing "Accept" opts in; choosing
 * "Decline" keeps it opted-out permanently.
 */
export default function AnalyticsConsent(): JSX.Element | null {
  const [needsChoice, setNeedsChoice] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'accepted') {
      posthog.opt_in_capturing?.()
    } else if (stored === 'declined') {
      posthog.opt_out_capturing?.()
    } else {
      posthog.opt_out_capturing?.()
      setNeedsChoice(true)
    }
  }, [])

  if (!needsChoice) return null

  const accept = (): void => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    posthog.opt_in_capturing?.()
    track('analytics_consent_changed', { consent: 'accepted' })
    setNeedsChoice(false)
  }
  const decline = (): void => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    posthog.opt_out_capturing?.()
    track('analytics_consent_changed', { consent: 'declined' })
    setNeedsChoice(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed bottom-4 left-1/2 z-[100] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-foreground/[0.12] bg-background/95 backdrop-blur-md p-4 shadow-xl"
    >
      <p className="text-xs text-foreground/70 leading-relaxed mb-3">
        We use privacy-friendly analytics to improve your planning experience. No
        chat content or personal details are sent — only anonymous usage patterns.
      </p>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={decline}
          className="text-xs text-foreground/50 hover:text-foreground/80 px-3 py-1.5 rounded-lg transition-colors"
        >
          Decline
        </button>
        <button
          onClick={accept}
          className="text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
