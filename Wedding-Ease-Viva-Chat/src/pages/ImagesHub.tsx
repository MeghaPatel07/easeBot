import React, { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useImageHubSubmit } from '@/hooks/useImageHubSubmit'
import type { SendMessageOptions } from '@/hooks/useChat'
import type { GalleryFilter, VibeCategory, VibePreset } from '@/types'
import { VIBE_PRESETS } from '@/data/vibePresets'
import { VibeComposer } from '@/components/images/VibeComposer'
import { GalleryFilterBar } from '@/components/images/GalleryFilterBar'
import GalleryView from '@/components/GalleryView'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'

interface ImagesHubProps {
  sendMessage: (text: string, options: SendMessageOptions) => Promise<void>
  startNewChat: () => void
}

export default function ImagesHub({ sendMessage, startNewChat }: ImagesHubProps) {
  const { user } = useAuth()
  const [selectedPreset, setSelectedPreset] = useState<VibePreset | null>(null)
  const { submit, isSubmitting } = useImageHubSubmit({
    sendMessage,
    startNewChat,
    vibeTitle: selectedPreset?.title,
    vibeDescriptors: selectedPreset?.descriptors,
    vibeDescription: selectedPreset?.description,
  })

  const [filter, setFilter] = useState<GalleryFilter>('generated')

  const handlePresetToggle = (preset: VibePreset) => {
    setSelectedPreset((curr) => (curr?.id === preset.id ? null : preset))
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-6 pb-2 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Images</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Describe what you want. Pick a style if you like. Generate.
        </p>
      </header>

      {user ? (
        <div className="space-y-4">
          {/* Optional preset chips, grouped by category */}
          {(
            [
              { key: 'theme', label: 'Theme' },
              { key: 'attire', label: 'Attire' },
              { key: 'venue', label: 'Venue' },
              { key: 'decor', label: 'Decor' },
              { key: 'stationery', label: 'Stationery' },
            ] as { key: VibeCategory; label: string }[]
          ).map((group) => {
            const groupPresets = VIBE_PRESETS.filter((p) => p.category === group.key)
            if (groupPresets.length === 0) return null
            return (
              <div key={group.key} className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {groupPresets.map((preset) => {
                    const active = selectedPreset?.id === preset.id
                    const swatch = `linear-gradient(135deg, ${preset.gradientFrom}, ${preset.gradientTo})`
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handlePresetToggle(preset)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                          active
                            ? 'border-white/30 bg-white/[0.14] text-white shadow-sm'
                            : 'border-white/15 bg-white/[0.06] text-white/60 hover:border-white/25 hover:bg-white/[0.1] hover:text-white'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                          style={{ background: swatch }}
                        />
                        {preset.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <VibeComposer
            vibeTitle={selectedPreset?.title ?? null}
            onSubmit={submit}
            isSubmitting={isSubmitting}
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white/[0.04] p-5 text-center shadow-lg shadow-black/10 backdrop-blur-xl">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold">Sign in to create images</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your gallery is tied to your account.
          </p>
          <Button className="mt-3" onClick={() => window.location.assign('/')}>
            Sign in
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">My Images</h2>
        <GalleryFilterBar filter={filter} onChange={setFilter} />
        <GalleryView userId={user?.uid ?? ''} filter={filter} />
      </section>
    </main>
  )
}
