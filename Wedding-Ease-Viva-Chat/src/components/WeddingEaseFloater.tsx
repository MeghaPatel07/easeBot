import weddingEaseLogo from '@/assets/images/Wedding ease.png'
import { track } from '@/lib/analytics'

const WEDDINGEASE_URL = 'https://weddingease.ai'

// Desktop-only floater. On mobile the logo lives in the header next to the
// theme toggle (see ChatHeader.tsx) because a fixed bottom-right element
// collides with the mic button on small screens.
export default function WeddingEaseFloater() {
  const handleClick = () => {
    try { track('weddingease_floater_clicked') } catch { /* analytics is best-effort */ }
  }

  return (
    <a
      href={WEDDINGEASE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      aria-label="Open WeddingEase in a new tab"
      title="Visit WeddingEase"
      className="hidden sm:block fixed bottom-6 right-6 z-[60] group cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
    >
      <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full shadow-[0_8px_30px_rgb(181,83,44,0.3)] border-2 border-[#B5532C]/20 bg-white/80 backdrop-blur-sm flex items-center justify-center overflow-hidden">
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
