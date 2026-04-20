import React, { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Sparkles, Image, Loader2, Trash2, ZoomIn, ZoomOut, MessageSquarePlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ImageActions } from '@/components/ImageActions'
import { getUserImages, deleteUserImage, type UserImage } from '@/services/galleryService'
import { useChatAttachments } from '@/contexts/ChatAttachmentsContext'
import type { GalleryFilter } from '@/types'

interface GalleryViewProps {
  userId: string
  filter?: GalleryFilter
  vibeId?: string | null
}

export default function GalleryView({ userId, filter, vibeId }: GalleryViewProps) {
  const [images, setImages] = useState<UserImage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [scale, setScale] = useState(1)
  const navigate = useNavigate()
  const { addAttachment } = useChatAttachments()

  // Stage the image as a reference in the chat attachment tray so the user
  // can ask Viva about it from their next message. Closes the preview (if
  // open) and routes to '/' so the ChatInput chip is immediately visible.
  const handleAttachToChat = useCallback((img: UserImage, e?: React.MouseEvent) => {
    e?.stopPropagation()
    addAttachment({
      kind: 'image',
      id: img.id,
      title: img.prompt?.slice(0, 60) || 'AI-generated image',
      preview: img.prompt?.slice(0, 200),
      payload: { imageId: img.id, url: img.url, prompt: img.prompt, mode: img.mode },
    })
    toast.success('Image attached — ask Viva about it in chat')
    setSelectedIndex(null)
    setScale(1)
    navigate('/')
  }, [addAttachment, navigate])

  // Fetch images from Firestore
  const refetchImages = useCallback(() => {
    let cancelled = false
    setLoading(true)
    getUserImages(userId, { filter, vibeId }).then(imgs => {
      if (!cancelled) {
        setImages(imgs)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [userId, filter, vibeId])

  useEffect(() => {
    return refetchImages()
  }, [refetchImages])

  useEffect(() => {
    const handler = () => { refetchImages() }
    window.addEventListener('easebot:gallery-refresh', handler)
    return () => window.removeEventListener('easebot:gallery-refresh', handler)
  }, [refetchImages])

  // Keyboard navigation for preview
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (selectedIndex === null) return
      if (e.key === 'Escape') { setSelectedIndex(null); setScale(1) }
      else if (e.key === 'ArrowLeft') { setSelectedIndex(i => (i !== null && i > 0 ? i - 1 : i)); setScale(1) }
      else if (e.key === 'ArrowRight') { setSelectedIndex(i => (i !== null && i < images.length - 1 ? i + 1 : i)); setScale(1) }
      else if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, 3))
      else if (e.key === '-') setScale(s => Math.max(s - 0.25, 0.5))
    },
    [selectedIndex, images.length]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Lock body scroll when preview is open
  useEffect(() => {
    if (selectedIndex !== null) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [selectedIndex])

  const handleDelete = async (img: UserImage, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await deleteUserImage(img.id)
      setImages(prev => prev.filter(i => i.id !== img.id))
      if (selectedIndex !== null) {
        if (images.length <= 1) setSelectedIndex(null)
        else if (selectedIndex >= images.length - 1) setSelectedIndex(images.length - 2)
      }
    } catch (err) {
      console.error('[GalleryView] delete error:', err)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <p className="text-sm text-foreground/50">Loading gallery...</p>
      </div>
    )
  }

  // Empty state
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <p className="text-sm text-foreground/50 max-w-xs leading-relaxed">
          No images yet. Ask TheWeddingBot to generate some visuals.
        </p>
      </div>
    )
  }

  const currentImage = selectedIndex !== null ? images[selectedIndex] : null

  return (
    <>
      {/* Header: count */}
      <div className="flex items-center gap-2 mb-3">
        <Image className="h-4 w-4 text-foreground/40" />
        <span className="text-xs text-foreground/50">
          {images.length} image{images.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-8 gap-2">
        {images.map((img, idx) => (
          <button
            key={img.id}
            onClick={() => { setSelectedIndex(idx); setScale(1) }}
            className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer min-h-[44px] bg-foreground/[0.04] border border-foreground/[0.08]"
          >
            <img
              src={img.url}
              alt={img.prompt || 'Generated image'}
              className="w-full h-full object-cover rounded-xl"
              loading="lazy"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <p className="text-3xs text-foreground/80 truncate">{img.prompt}</p>
              <p className="text-3xs text-foreground/50">
                {img.createdAt?.toDate?.().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) ?? ''}
              </p>
            </div>
            {/* Action buttons on hover (top-right): Attach to chat + Delete */}
            <div className="absolute top-1.5 right-1.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
              <button
                onClick={(e) => handleAttachToChat(img, e)}
                aria-label="Attach image to chat"
                className="h-10 w-10 sm:h-7 sm:w-7 rounded-full bg-overlay-scrim/50 hover:bg-primary/80 text-overlay-text/80 hover:text-primary-foreground flex items-center justify-center transition-colors"
              >
                <MessageSquarePlus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
              <button
                onClick={(e) => handleDelete(img, e)}
                aria-label="Delete image"
                className="h-10 w-10 sm:h-7 sm:w-7 rounded-full bg-overlay-scrim/50 hover:bg-destructive/80 text-overlay-text/70 hover:text-destructive-foreground flex items-center justify-center transition-colors"
              >
                <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
            </div>
          </button>
        ))}
      </div>

      {/* Full-screen preview */}
      {currentImage && selectedIndex !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-overlay-scrim/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
          onClick={() => { setSelectedIndex(null); setScale(1) }}
        >
          {/* Close */}
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedIndex(null); setScale(1) }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-overlay-surface/10 hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Zoom controls */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-overlay-surface/10 rounded-full px-3 py-1.5 backdrop-blur-sm">
            <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(s - 0.25, 0.5)) }} className="h-7 w-7 rounded-full hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-overlay-text/70 text-xs min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
            <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(s + 0.25, 3)) }} className="h-7 w-7 rounded-full hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors">
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* Prev */}
          {selectedIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedIndex(i => (i !== null ? i - 1 : i)); setScale(1) }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-overlay-surface/10 hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next */}
          {selectedIndex < images.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedIndex(i => (i !== null ? i + 1 : i)); setScale(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-overlay-surface/10 hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Main image */}
          <div className="flex items-center justify-center w-full h-full p-8 sm:p-12" onClick={(e) => e.stopPropagation()}>
            <img
              src={currentImage.url}
              alt={currentImage.prompt || 'Preview'}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-200 select-none"
              style={{ transform: `scale(${scale})` }}
              draggable={false}
            />
          </div>

          {/* Bottom bar: actions + prompt */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 max-w-lg" onClick={(e) => e.stopPropagation()}>
            <ImageActions
              imageUrl={currentImage.url}
              onDelete={() => handleDelete(currentImage)}
              onAttachToChat={() => handleAttachToChat(currentImage)}
              variant="preview"
            />
            {currentImage.prompt && (
              <p className="text-center text-xs text-foreground/50 px-4 line-clamp-2">
                {currentImage.prompt}
              </p>
            )}
            <p className="text-center text-2xs text-foreground/30">
              {selectedIndex + 1} of {images.length}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
