import React, { useEffect, useRef, useState } from 'react'
import { Paperclip, Send, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Local AspectRatio union — types/index.ts does not currently export one.
// 'auto' means: let the model pick based on the prompt (no override sent).
export type AspectRatio = 'auto' | '1024x1024' | '1024x1536' | '1536x1024' | '1024x1792'

const ASPECT_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1024x1024', label: 'Square' },
  { value: '1024x1536', label: 'Portrait' },
  { value: '1536x1024', label: 'Landscape' },
  { value: '1024x1792', label: 'Tall' },
]

const STORAGE_KEY = 'imagesHub.lastAspectRatio'
const MAX_FILE_BYTES = 8 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface VibeComposerProps {
  vibeTitle: string | null
  onSubmit: (input: { prompt: string; aspectRatio: AspectRatio; referenceImage: File | null }) => Promise<void>
  isSubmitting: boolean
}

export function VibeComposer({ vibeTitle, onSubmit, isSubmitting }: VibeComposerProps) {
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('auto')
  const [referenceImage, setReferenceImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Hydrate persisted aspect ratio.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as AspectRatio | null
      if (stored && ASPECT_OPTIONS.some((o) => o.value === stored)) {
        setAspectRatio(stored)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, aspectRatio)
    } catch {
      /* ignore */
    }
  }, [aspectRatio])

  // Auto-resize the textarea (1–4 rows).
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * 4 + 16
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }, [prompt])

  // Preview lifecycle.
  useEffect(() => {
    if (!referenceImage) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(referenceImage)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [referenceImage])

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Image must be 8 MB or smaller.')
      return
    }
    setReferenceImage(file)
  }

  const canSubmit = prompt.trim().length > 0 && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    await onSubmit({
      prompt: prompt.trim(),
      aspectRatio,
      referenceImage,
    })
    setPrompt('')
    setReferenceImage(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const placeholder = vibeTitle
    ? 'What do you want to see? — e.g. Mandap, Bridal lehenga, Save-the-date'
    : 'Describe an image — e.g. Royal mandap with marigold florals'

  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-3 shadow-lg shadow-black/10 backdrop-blur-xl supports-[backdrop-filter]:bg-white/[0.06] sm:p-4">
      {vibeTitle && (
        <div className="mb-2 text-xs text-white/60">
          Styled with: <b className="text-white">{vibeTitle}</b> vibe
        </div>
      )}

      <Textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Image prompt"
        rows={1}
        className="min-h-[44px] resize-none border-0 bg-transparent p-2 text-sm text-white placeholder:text-white/40 shadow-none focus-visible:ring-0"
      />

      {previewUrl && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] p-1.5 backdrop-blur-md">
          <img
            src={previewUrl}
            alt="Reference preview"
            className="h-12 w-12 rounded object-cover"
          />
          <span className="max-w-[140px] truncate text-xs text-white/90">
            {referenceImage?.name}
          </span>
          <button
            type="button"
            onClick={() => setReferenceImage(null)}
            aria-label="Remove reference image"
            className="rounded-full p-1 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
          <SelectTrigger
            className="h-9 w-auto min-w-[120px] border-white/15 bg-white/[0.06] text-xs text-white backdrop-blur-md hover:bg-white/[0.1]"
            aria-label="Aspect ratio"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFilePick}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-white/15 bg-white/[0.06] text-white backdrop-blur-md hover:bg-white/[0.1] hover:text-white"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach reference image"
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Reference</span>
        </Button>

        <div className="ml-auto">
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            aria-label="Generate image"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isSubmitting ? 'Creating…' : 'Create'}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
