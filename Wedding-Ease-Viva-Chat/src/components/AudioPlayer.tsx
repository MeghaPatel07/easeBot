import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Square, X, Loader2, AlertCircle, RotateCcw } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error'

interface Props {
  audioUrl: string
  onEnded?: () => void
  onError?: () => void
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const
const SPEED_STORAGE_KEY = 'audio-player-speed-idx'
const BAR_COUNT = 40
const BAR_HEIGHTS = [
  3, 5, 8, 6, 4, 7, 9, 5, 3, 6, 8, 4, 7, 5, 9, 6,
  3, 8, 5, 7, 4, 6, 9, 5, 3, 7, 8, 4, 6, 5, 7, 3,
  5, 8, 4, 6, 7, 3, 9, 5,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function loadSpeedIndex(): number {
  try {
    const stored = localStorage.getItem(SPEED_STORAGE_KEY)
    if (stored !== null) {
      const idx = Number(stored)
      if (idx >= 0 && idx < SPEEDS.length) return idx
    }
  } catch {
    // localStorage unavailable – fall through
  }
  return 1 // default 1x
}

function saveSpeedIndex(idx: number): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(idx))
  } catch {
    // silently ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioPlayer({ audioUrl, onEnded, onError, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const [state, setState] = useState<PlayerState>('idle')
  const [progress, setProgress] = useState(0)          // 0 – 1
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(loadSpeedIndex)
  const [errorMsg, setErrorMsg] = useState('')

  const speed = SPEEDS[speedIdx]

  // ── Sync playback rate whenever speed changes ──────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  // ── Animation-frame based progress (smoother than timeupdate) ──────────
  const tick = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.duration) {
      setCurrentTime(audio.currentTime)
      setProgress(audio.currentTime / audio.duration)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (state === 'playing') {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, tick])

  // ── Auto-play on mount / URL change ────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    setState('loading')
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)
    setErrorMsg('')
    audio.load()
  }, [audioUrl])

  // ── Audio event handlers ───────────────────────────────────────────────
  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (!audio) return
    setDuration(audio.duration)
    audio.playbackRate = speed
    // Auto-play once metadata is ready.
    // If browser blocks autoplay (gesture context expired after async TTS fetch),
    // fall back to 'paused' — user can tap the play button which IS a gesture.
    audio.play().then(() => {
      setState('playing')
    }).catch((err) => {
      console.warn('[AudioPlayer] Autoplay blocked, tap play to start:', err?.message)
      setState('paused')
    })
  }

  const handleEnded = () => {
    setState('ended')
    setProgress(1)
    onEnded?.()
  }

  const handleError = () => {
    const audio = audioRef.current
    const code = audio?.error?.code
    const msg = audio?.error?.message
    console.error('[AudioPlayer] Audio error:', { code, msg, src: audioUrl?.slice(0, 60) })
    setState('error')
    setErrorMsg(msg || 'Failed to load audio')
    onError?.()
  }

  // ── Controls ───────────────────────────────────────────────────────────
  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (state === 'playing') {
      audio.pause()
      setState('paused')
      return
    }

    // Resume from paused, stopped, or ended
    if (state === 'ended' || state === 'stopped') {
      audio.currentTime = 0
    }
    audio.play().then(() => {
      setState('playing')
    }).catch(() => {
      setState('error')
      setErrorMsg('Playback failed')
    })
  }

  const handleStop = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setProgress(0)
    setCurrentTime(0)
    setState('stopped')
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const bar = progressBarRef.current
    if (!audio || !bar || !audio.duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setCurrentTime(audio.currentTime)
    setProgress(ratio)
  }

  const cycleSpeed = () => {
    setSpeedIdx(prev => {
      const next = (prev + 1) % SPEEDS.length
      saveSpeedIndex(next)
      return next
    })
  }

  const handleRetry = () => {
    const audio = audioRef.current
    if (!audio) return
    setState('loading')
    setErrorMsg('')
    audio.load()
  }

  // ── Derived state ─────────────────────────────────────────────────────
  const isLoading = state === 'loading' || state === 'idle'
  const isPlaying = state === 'playing'
  const isError = state === 'error'
  const canInteract = !isLoading && !isError

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1 bg-foreground/[0.08] border border-foreground/[0.12] rounded-xl px-2 sm:px-3 py-2 sm:py-2.5 w-full max-w-sm shadow-lg backdrop-blur-sm">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
      />

      {/* ── Error state ──────────────────────────────────────────────── */}
      {isError && (
        <div className="flex items-center gap-2 py-1">
          <AlertCircle size={14} className="text-destructive flex-shrink-0" />
          <span className="text-xs text-destructive-subtle flex-1 truncate">{errorMsg}</span>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-subtle transition-colors"
          >
            <RotateCcw size={12} />
            Retry
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="h-5 w-5 flex items-center justify-center text-foreground/40 hover:text-foreground/70 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* ── Main player (hidden during error) ────────────────────────── */}
      {!isError && (
        <>
          {/* Top row: controls + waveform */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Play / Pause button */}
            <button
              onClick={togglePlay}
              disabled={isLoading}
              className="h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:bg-primary-subtle active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-primary/30"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isLoading ? (
                <Loader2 size={16} className="sm:!w-3.5 sm:!h-3.5 animate-spin" />
              ) : isPlaying ? (
                <Pause size={16} fill="currentColor" className="sm:!w-3.5 sm:!h-3.5" />
              ) : (
                <Play size={16} fill="currentColor" className="sm:!w-3.5 sm:!h-3.5 ml-0.5" />
              )}
            </button>

            {/* Waveform / progress bar */}
            <div
              ref={progressBarRef}
              onClick={canInteract ? handleSeek : undefined}
              className={`relative flex-1 h-8 flex items-center gap-[2px] overflow-hidden ${canInteract ? 'cursor-pointer' : 'cursor-default'}`}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label="Audio progress"
            >
              {Array.from({ length: BAR_COUNT }).map((_, i) => {
                const h = BAR_HEIGHTS[i % BAR_HEIGHTS.length]
                const filled = i / BAR_COUNT <= progress
                // Slight bounce for active bar during playback
                const isActive = isPlaying && Math.abs(i / BAR_COUNT - progress) < 1 / BAR_COUNT
                return (
                  <div
                    key={i}
                    className={`w-[2px] rounded-full flex-shrink-0 transition-all duration-150 ${
                      filled
                        ? 'bg-primary'
                        : 'bg-foreground/[0.12]'
                    } ${isActive ? 'scale-y-125' : ''}`}
                    style={{
                      height: `${h * 2.5}px`,
                      transformOrigin: 'center',
                    }}
                  />
                )
              })}

              {/* Loading shimmer overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-pulse rounded" />
              )}
            </div>

            {/* Speed button */}
            <button
              onClick={cycleSpeed}
              disabled={isLoading}
              className="h-10 sm:h-auto px-1.5 sm:px-0 text-[11px] sm:text-[10px] font-bold text-foreground/65 sm:text-foreground/50 hover:text-primary w-10 sm:w-9 text-center flex-shrink-0 transition-colors tabular-nums disabled:cursor-not-allowed rounded"
              aria-label={`Playback speed ${speed}x`}
            >
              {speed}x
            </button>

            {/* Stop button — bumped to 36×36 (mobile) / 24×24 (desktop) and
                brighter (white/70 vs white/30) so it's actually visible during
                playback on a phone. Previously h-6 w-6 with text-foreground/30 +
                10px icon was effectively invisible on the burgundy theme. */}
            <button
              onClick={handleStop}
              disabled={!canInteract}
              className="h-9 w-9 sm:h-6 sm:w-6 rounded-full sm:rounded flex items-center justify-center text-foreground/70 sm:text-foreground/40 hover:text-foreground hover:bg-foreground/10 flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Stop"
            >
              <Square size={14} className="sm:!w-2.5 sm:!h-2.5" fill="currentColor" />
            </button>

            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="h-9 w-9 sm:h-6 sm:w-6 rounded-full sm:rounded flex items-center justify-center text-foreground/60 sm:text-foreground/30 hover:text-foreground hover:bg-foreground/10 flex-shrink-0 transition-colors"
                aria-label="Close player"
              >
                <X size={16} className="sm:!w-3 sm:!h-3" />
              </button>
            )}
          </div>

          {/* Bottom row: time display */}
          <div className="flex justify-between text-[10px] text-foreground/40 px-3 sm:px-10 select-none">
            <span className="tabular-nums">{fmt(currentTime)}</span>
            <span className="tabular-nums">{isLoading ? '--:--' : fmt(duration)}</span>
          </div>
        </>
      )}
    </div>
  )
}
