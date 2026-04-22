import React from 'react'
import type { GalleryFilter } from '@/types'

interface GalleryFilterBarProps {
  filter: GalleryFilter
  onChange: (f: GalleryFilter) => void
}

interface PillDef {
  value: GalleryFilter
  label: string
}

const PILLS: PillDef[] = [
  { value: 'generated', label: 'Generated' },
  { value: 'uploaded', label: 'Your Images' },
]

export function GalleryFilterBar({ filter, onChange }: GalleryFilterBarProps) {
  const pills = PILLS

  return (
    <div
      role="tablist"
      aria-label="Filter gallery"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <div className="flex snap-x gap-2 pb-1">
        {pills.map((pill) => {
          const active = filter === pill.value
          return (
            <button
              key={pill.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(pill.value)}
              className={`snap-start whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-foreground/90 hover:bg-muted/70 hover:text-foreground/90'
              }`}
            >
              {pill.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
