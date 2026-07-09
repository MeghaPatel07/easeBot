import weddingEaseLogo from '@/assets/images/welogofinal.avif'
import { track } from '@/lib/analytics'

const WEDDINGEASE_URL = 'https://weddingease.ai'

interface WeddingEaseFloaterProps {
  isFixed?: boolean;
  className?: string;
}

// Desktop-only floater. On mobile the logo lives in the header next to the
// theme toggle (see ChatHeader.tsx) because a fixed bottom-right element
// collides with the mic button on small screens.
export default function WeddingEaseFloater({ isFixed = true, className = "" }: WeddingEaseFloaterProps) {
  const handleClick = () => {
    try { track('weddingease_floater_clicked') } catch { /* analytics is best-effort */ }
  }

  return (
    <a
      href={WEDDINGEASE_URL}
      // href="#"
      // target="_blank"
      rel="noopener noreferrer"
      // onClick={handleClick}
      aria-label="Open WeddingEase in a new tab"
      title="Visit WeddingEase"
      className={`hidden sm:block group cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 ${isFixed ? "fixed bottom-6 right-6 z-[60]" : "relative flex-shrink-0"
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
      <div className="absolute inset-0 rounded-full bg-[#B5532C]/10 animate-ping -z-10" />
    </a>
  )
}

