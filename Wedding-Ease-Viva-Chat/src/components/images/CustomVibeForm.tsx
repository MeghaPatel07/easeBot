import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Lock } from 'lucide-react'
import { track } from '@/lib/analytics'

interface CustomVibeFormProps {
  onSubmit: (vibe: { title: string; descriptors: string[] }) => void
}

export function CustomVibeForm({ onSubmit }: CustomVibeFormProps) {
  const [title, setTitle] = useState('')
  const [descriptorText, setDescriptorText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parseDescriptors = (raw: string): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of raw.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
    return out
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Please give your vibe a name.')
      return
    }
    if (trimmedTitle.length > 40) {
      setError('Vibe name must be 40 characters or fewer.')
      return
    }

    const descriptors = parseDescriptors(descriptorText)
    if (descriptors.length < 3) {
      setError('Add at least 3 style descriptors (comma-separated).')
      return
    }
    if (descriptors.length > 12) {
      setError('Keep it to 12 descriptors or fewer.')
      return
    }
    for (const d of descriptors) {
      if (d.length < 2 || d.length > 30) {
        setError(`"${d}" is the wrong length — each descriptor should be 2–30 characters.`)
        return
      }
    }

    // No PII — we don't send the title or descriptor text.
    track('custom_vibe_created', {})
    onSubmit({ title: trimmedTitle, descriptors })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-foreground/[0.03] p-4 sm:p-5">
      <div className="space-y-2">
        <Label htmlFor="custom-vibe-title">Vibe name</Label>
        <Input
          id="custom-vibe-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 40))}
          maxLength={40}
          placeholder="e.g. Monsoon Mehendi"
          aria-label="Vibe name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="custom-vibe-descriptors">Style descriptors</Label>
        <Textarea
          id="custom-vibe-descriptors"
          value={descriptorText}
          onChange={(e) => setDescriptorText(e.target.value)}
          placeholder="Ivory, Gold, Damask, Mughal arches, …"
          rows={3}
          aria-label="Style descriptors, comma separated"
        />
        <p className="text-xs text-foreground/90">3–12 descriptors, comma-separated. Each 2–30 characters.</p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <Button type="submit" className="w-full gap-2 sm:w-auto">
        <Lock className="h-4 w-4" aria-hidden="true" />
        Lock this vibe
      </Button>
    </form>
  )
}
