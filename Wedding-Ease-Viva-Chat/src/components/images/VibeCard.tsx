import React from 'react'
import type { VibePreset } from '@/types'

interface VibeCardProps {
  preset: VibePreset
  onSelect: (preset: VibePreset) => void
}

export function VibeCard({ preset, onSelect }: VibeCardProps) {
  const handleActivate = () => onSelect(preset)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleActivate()
    }
  }

  const swatch = `linear-gradient(135deg, ${preset.gradientFrom}, ${preset.gradientTo})`

  return (
    <button
      type="button"
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      aria-label={`Lock vibe: ${preset.title}`}
      className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-[1px] hover:border-border hover:bg-card hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className="h-9 w-9 shrink-0 rounded-full ring-1 ring-black/5"
        style={{ background: swatch }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {preset.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {preset.subtitle}
        </span>
      </span>
    </button>
  )
}
