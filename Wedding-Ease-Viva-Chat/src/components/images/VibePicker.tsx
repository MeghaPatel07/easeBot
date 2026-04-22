import React from 'react'
import type { VibePreset } from '@/types'
import { VibeCard } from './VibeCard'
import { CustomVibeForm } from './CustomVibeForm'

interface VibePickerProps {
  presets: VibePreset[]
  onSelect: (preset: VibePreset) => void
  onCustomSubmit: (vibe: { title: string; descriptors: string[] }) => void
}

export function VibePicker({ presets, onSelect, onCustomSubmit }: VibePickerProps) {
  return (
    <section aria-label="Pick a wedding vibe" className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What&apos;s the vibe of your wedding?
        </h2>
        <p className="text-sm text-foreground/90">
          Describe your own, or pick a starting point below.
        </p>
      </header>

      {/* Primary: custom vibe form */}
      <CustomVibeForm onSubmit={onCustomSubmit} />

      {/* Secondary: preset row */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wider text-foreground/90">
            Or start from a preset
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {presets.map((preset) => (
            <VibeCard key={preset.id} preset={preset} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </section>
  )
}
