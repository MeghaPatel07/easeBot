import weddingEaseLogo from '@/assets/images/IMG_0721.png'
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
      className="hidden sm:flex fixed bottom-6 right-6 z-[60] items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
    >
      <img
        src={weddingEaseLogo}
        alt=""
        className="h-14 w-14 object-contain drop-shadow-md"
        draggable={false}
      />
    </a>
  )
}
