import React, { useState, useRef, useEffect } from 'react'
import { X, Plus, RotateCcw, Sparkles } from 'lucide-react'
import type { ActiveVibe } from '@/types'
import { VIBE_PRESETS } from '@/data/vibePresets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GlossaryText } from './GlossaryText'

interface VibeDNAStripProps {
  vibe: ActiveVibe
  onAddDescriptor: (d: string) => Promise<void>
  onRemoveDescriptor: (d: string) => Promise<void>
  onChangeVibe: () => void
}

export function VibeDNAStrip({ vibe, onAddDescriptor, onRemoveDescriptor, onChangeVibe }: VibeDNAStripProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const commitAdd = async () => {
    const value = draft.trim()
    if (!value) {
      setAdding(false)
      return
    }
    if (value.length < 2 || value.length > 30) return
    setBusy(true)
    try {
      await onAddDescriptor(value)
      setDraft('')
      setAdding(false)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (d: string) => {
    setBusy(true)
    try {
      await onRemoveDescriptor(d)
    } finally {
      setBusy(false)
    }
  }

  const preset = vibe.presetId
    ? VIBE_PRESETS.find((p) => p.id === vibe.presetId)
    : undefined
  const accentColor = preset?.accentColor ?? 'hsl(var(--primary))'

  return (
    <section
      aria-label={`Active vibe: ${vibe.title}`}
      className="relative rounded-xl border-l-4 bg-card p-4 shadow-sm sm:p-5"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold sm:text-xl">{vibe.title} Vibe</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onChangeVibe}
          aria-label="Change vibe"
          className="gap-1.5"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Change
        </Button>
      </div>

      {vibe.subtitle && (
        <p className="mt-1 text-sm text-foreground/90">
          {/* Specialist terms keep their wording but gain a focusable, screen-
              reader-reachable definition tooltip (WCAG 3.1.3 Unusual Words). */}
          <GlossaryText text={vibe.subtitle} />
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {vibe.descriptors.length === 0 && !adding && (
          <span className="text-sm text-foreground/90">
            Add descriptors to shape your vibe
          </span>
        )}

        {vibe.descriptors.map((d) => (
          <span
            key={d}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground/90 sm:text-sm"
          >
            {/* Chip already holds a remove button, so define terms inline via a
                native <dfn title> to avoid stacking focus stops in each chip. */}
            <GlossaryText text={d} inline />
            <button
              type="button"
              onClick={() => handleRemove(d)}
              disabled={busy}
              aria-label={`Remove ${d}`}
              className="rounded-full p-0.5 hover:bg-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}

        {adding ? (
          <div className="inline-flex items-center gap-1">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitAdd()
                } else if (e.key === 'Escape') {
                  setAdding(false)
                  setDraft('')
                }
              }}
              onBlur={() => void commitAdd()}
              placeholder="New descriptor"
              className="h-8 w-36 text-xs"
              maxLength={30}
              aria-label="New descriptor"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={busy}
            aria-label="Add descriptor"
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs font-medium text-foreground/90 hover:bg-muted hover:text-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:text-sm"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add
          </button>
        )}
      </div>
    </section>
  )
}
