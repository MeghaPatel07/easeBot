import { useState, useEffect, useRef } from 'react'

// Detect initial reduce-motion preference safely for SSR / non-browser envs.
const getInitialReduceMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animates text character-by-character (typewriter effect).
 * When `targetText` grows (e.g. from streaming chunks), the hook
 * reveals the new characters one at a time at `speed` ms per char.
 * When streaming is done (`isAnimating` = false) the full text is
 * shown immediately so there's no lingering delay.
 *
 * Accessibility (WCAG 2.2.2 / 2.3.3): when the user has
 * `prefers-reduced-motion: reduce` set, the RAF loop is skipped and
 * the full target text is shown synchronously. CSS media queries cannot
 * reach JS-driven animation, so we gate it here explicitly.
 */
export function useTypewriter(
  targetText: string,
  isAnimating: boolean,
  speed: number = 12,        // ms per character
  charsPerTick: number = 2,  // characters revealed per tick
) {
  const [displayedText, setDisplayedText] = useState(targetText)
  const [reduceMotion, setReduceMotion] = useState<boolean>(getInitialReduceMotion)
  const indexRef = useRef(targetText.length)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef(performance.now())

  // Subscribe to changes in the user's reduce-motion preference at runtime.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (event: MediaQueryListEvent) => setReduceMotion(event.matches)
    setReduceMotion(mql.matches)
    // Safari < 14 lacks addEventListener on MediaQueryList; fall back to addListener.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])

  // When animation stops OR reduce-motion is on, flush the full text immediately.
  useEffect(() => {
    if (!isAnimating || reduceMotion) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      indexRef.current = targetText.length
      setDisplayedText(targetText)
    }
  }, [isAnimating, targetText, reduceMotion])

  useEffect(() => {
    // Honor the user's motion preference: skip the RAF loop entirely.
    if (!isAnimating || reduceMotion) return

    const tick = (now: number) => {
      const elapsed = now - lastTickRef.current
      if (elapsed >= speed) {
        const advance = Math.max(1, Math.floor(elapsed / speed) * charsPerTick)
        indexRef.current = Math.min(indexRef.current + advance, targetText.length)
        setDisplayedText(targetText.slice(0, indexRef.current))
        lastTickRef.current = now
      }

      if (indexRef.current < targetText.length) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    // If there's new text to reveal, kick off the animation
    if (indexRef.current < targetText.length) {
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [targetText, isAnimating, speed, charsPerTick, reduceMotion])

  return displayedText
}
