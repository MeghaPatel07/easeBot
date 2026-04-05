import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Square, Loader2 } from 'lucide-react'

interface Props {
  audioUrl: string                    // blob URL from ttsService
  onEnded?: () => void
  onError?: () => void
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

export function AudioPlayer({ audioUrl, onEnded, onError }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)        // 0–1
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(1)         // index into SPEEDS (default 1×)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const speed = SPEEDS[speedIdx]

  // Auto-play when URL is provided
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = speed
    audio.play().catch(() => {})
  }, [audioUrl])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  const handleLoadedMetadata = () => {
    setDuration(audioRef.current?.duration ?? 0)
    setLoading(false)
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    setCurrentTime(audio.currentTime)
    setProgress(audio.currentTime / audio.duration)
  }

  const handleEnded = () => {
    setPlaying(false)
    setProgress(0)
    setCurrentTime(0)
    onEnded?.()
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play(); setPlaying(true) }
  }

  const handleStop = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setPlaying(false)
    setProgress(0)
    setCurrentTime(0)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const bar = progressBarRef.current
    if (!audio || !bar || !audio.duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
  }

  const cycleSpeed = () => setSpeedIdx(i => (i + 1) % SPEEDS.length)

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2 bg-white/80 border border-primary/30 rounded-xl px-3 py-2 w-full max-w-sm shadow-sm">
      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onError={onError}
      />

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        disabled={loading}
        className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 hover:bg-primary-muted transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>

      {/* Waveform / progress bar */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Fake waveform bars */}
        <div
          ref={progressBarRef}
          onClick={handleSeek}
          className="relative h-7 flex items-center gap-[2px] cursor-pointer overflow-hidden"
        >
          {Array.from({ length: 32 }).map((_, i) => {
            const heights = [3,5,8,6,4,7,9,5,3,6,8,4,7,5,9,6,3,8,5,7,4,6,9,5,3,7,8,4,6,5,7,3]
            const h = heights[i % heights.length]
            const filled = i / 32 <= progress
            return (
              <div
                key={i}
                className={`w-[2px] rounded-full flex-shrink-0 transition-colors ${filled ? 'bg-primary' : 'bg-stone-200'}`}
                style={{ height: `${h * 2.5}px` }}
              />
            )
          })}
        </div>

        {/* Time */}
        <div className="flex justify-between text-2xs text-stone-400 px-0.5">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Speed button */}
      <button
        onClick={cycleSpeed}
        className="text-2xs font-bold text-stone-500 hover:text-primary w-8 text-center flex-shrink-0 transition-colors"
      >
        {speed}×
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        className="h-6 w-6 rounded flex items-center justify-center text-stone-400 hover:text-stone-600 flex-shrink-0 transition-colors"
      >
        <Square size={10} fill="currentColor" />
      </button>
    </div>
  )
}
