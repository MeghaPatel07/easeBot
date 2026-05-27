import { useEffect, useRef, useState } from 'react'
import { posthog } from '@/lib/analytics'
import { track } from '@/lib/analytics'

const STORAGE_KEY = 'ph_consent'
/** CSS custom property used by the rest of the app to reserve layout space
 *  while the consent banner is visible. Apply via:
 *    padding-bottom: var(--analytics-consent-height, 0px)
 *  on any container whose bottom-most content would otherwise be hidden by
 *  the fixed banner card. The var is cleared (back to 0px) once the user
 *  accepts or declines. */
const CSS_VAR = '--analytics-consent-height'

/**
 * Minimal consent banner. When the user has made no choice yet, PostHog is
 * opted-out by default (no events captured). Choosing "Accept" opts in; choosing
 * "Decline" keeps it opted-out permanently.
 *
 * Layout contract:
 * - The outer wrapper covers the visible card's footprint but uses
 *   `pointer-events: none` so taps that miss the card pass straight through
 *   to underlying content (chat input, mode chips, etc).
 * - The visible card sets `pointer-events: auto` so its buttons still work.
 * - While mounted, the component measures its own height and exposes it as
 *   `--analytics-consent-height` on `<html>`, so the chat input wrapper and
 *   other scroll containers can reserve clearance and avoid being obscured.
 */
export default function AnalyticsConsent(): JSX.Element | null {
  const [needsChoice, setNeedsChoice] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

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

  // Measure banner height and expose it as a CSS variable so layout-anchored
  // content (chat input wrapper, scroll containers on /pricing, /help, etc.)
  // can reserve clearance instead of being overlapped.
  useEffect(() => {
    if (!needsChoice) {
      document.documentElement.style.removeProperty(CSS_VAR)
      return
    }
    const el = cardRef.current
    if (!el) return
    const update = (): void => {
      // 16px matches the banner's `bottom-4` offset so content stops a touch
      // above the card rather than flush against it.
      const total = Math.ceil(el.getBoundingClientRect().height) + 16
      document.documentElement.style.setProperty(CSS_VAR, `${total}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty(CSS_VAR)
    }
  }, [needsChoice])

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
    // Wrapper is fixed to the bottom of the viewport but does NOT intercept
    // pointer events — only the card itself does. This keeps the chat input,
    // mode-switch chips, and other below-the-fold controls clickable when the
    // banner happens to sit on top of them.
    <div
      className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-4 pointer-events-none"
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-label="Analytics consent"
        className="pointer-events-auto w-[min(92vw,520px)] rounded-2xl border border-foreground/[0.12] bg-background/95 backdrop-blur-md p-4 shadow-xl"
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
    </div>
  )
}
