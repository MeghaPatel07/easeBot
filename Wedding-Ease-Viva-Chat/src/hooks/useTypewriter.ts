import { useState, useEffect, useRef } from 'react'

/**
 * Animates text character-by-character (typewriter effect).
 * When `targetText` grows (e.g. from streaming chunks), the hook
 * reveals the new characters one at a time at `speed` ms per char.
 * When streaming is done (`isAnimating` = false) the full text is
 * shown immediately so there's no lingering delay.
 */
export function useTypewriter(
  targetText: string,
  isAnimating: boolean,
  speed: number = 12,        // ms per character
  charsPerTick: number = 2,  // characters revealed per tick
) {
  const [displayedText, setDisplayedText] = useState(targetText)
  const indexRef = useRef(targetText.length)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef(performance.now())

  // When animation stops, flush the full text immediately
  useEffect(() => {
    if (!isAnimating) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      indexRef.current = targetText.length
      setDisplayedText(targetText)
    }
  }, [isAnimating, targetText])

  useEffect(() => {
    if (!isAnimating) return

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
  }, [targetText, isAnimating, speed, charsPerTick])

  return displayedText
}
