import weddingEaseLogo from '@/assets/images/Wedding ease.png'
import { track } from '@/lib/analytics'

const WEDDINGEASE_URL = 'https://weddingease.ai'

interface WeddingEaseFloaterProps {
  isFixed?: boolean;
  className?: string;
}

// Desktop-only floater. On mobile (<640px) the logo lives in the header next
// to the theme toggle (see ChatHeader.tsx) because a fixed bottom-right
// element collides with the mic button and obscures focusable controls in the
// bottom-right corner (e.g. FAQ chevrons, share buttons), violating WCAG
// 2.4.11 Focus Not Obscured. The wrapper is fully removed from the layout on
// mobile via `hidden sm:block` + `pointer-events-none sm:pointer-events-auto`
// so it can never intercept pointer events on small screens even if a parent
// CSS reset re-enables display.
export default function WeddingEaseFloater({ isFixed = true, className = "" }: WeddingEaseFloaterProps) {
  const handleClick = () => {
    try { track('weddingease_floater_clicked') } catch { /* analytics is best-effort */ }
  }

  return (
    <a
      // href={WEDDINGEASE_URL}
      href="#"
      // target="_blank"
      rel="noopener noreferrer"
      // onClick={handleClick}
      aria-label="Visit WeddingEase home"
      title="Visit WeddingEase"
      data-testid="weddingease-floater"
      className={`hidden sm:block pointer-events-none sm:pointer-events-auto group cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 ${isFixed ? "fixed bottom-6 right-6 z-[60]" : "relative flex-shrink-0"
        } ${className}`}
    >
      <div className={`relative rounded-full shadow-[0_8px_30px_rgb(181,83,44,0.3)] border-2 border-[#B5532C]/20 bg-white/80 backdrop-blur-sm flex items-center justify-center overflow-hidden ${isFixed ? "w-16 h-16 md:w-20 md:h-20" : "w-12 h-12 md:w-14 md:h-14"
        }`}>
        <img
          src={weddingEaseLogo}
          alt=""
          className="w-full h-full object-contain p-1"
          draggable={false}
        />
      </div>
      <div className="absolute inset-0 rounded-full bg-[#B5532C]/10 animate-ping -z-10" aria-hidden="true" />
    </a>
  )
}

