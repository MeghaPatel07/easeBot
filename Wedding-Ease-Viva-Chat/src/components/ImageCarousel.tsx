import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ImageActions } from './ImageActions'
import { useChatAttachments } from '@/contexts/ChatAttachmentsContext'

interface ImageCarouselProps {
  imageUrls: string[]
  aspectRatio?: string // '1024x1024' | '1024x1536' | '1536x1024'
  onSaveToGallery?: (imageUrl: string) => void
  onDelete?: (imageUrl: string) => void
  isGuest?: boolean
  /** Show "Made with TheWeddingBot" watermark overlay (free-tier images). */
  watermarked?: boolean
  /** Prompt that generated these images — used to label the chat attachment. */
  prompt?: string
}

/** Stable id derived from a URL so addAttachment can dedup. */
function attachmentIdFromUrl(url: string): string {
  return `img-${url.split('?')[0].slice(-48)}`
}

/** Fullscreen image preview overlay */
function ImagePreview({
  imageUrls,
  initialIndex,
  onClose,
  onSaveToGallery,
  onDelete,
  onAttachToChat,
  isGuest,
}: {
  imageUrls: string[]
  initialIndex: number
  onClose: () => void
  onSaveToGallery?: (imageUrl: string) => void
  onDelete?: (imageUrl: string) => void
  onAttachToChat?: (imageUrl: string) => void
  isGuest?: boolean
}) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + imageUrls.length) % imageUrls.length)
    setScale(1)
  }, [imageUrls.length])

  const next = useCallback(() => {
    setIndex(i => (i + 1) % imageUrls.length)
    setScale(1)
  }, [imageUrls.length])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, 3))
      else if (e.key === '-') setScale(s => Math.max(s - 0.25, 0.5))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  // Prevent body scroll when preview is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-overlay-scrim/90 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-overlay-surface/10 hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Zoom controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-overlay-surface/10 rounded-full px-3 py-1.5 backdrop-blur-sm">
        <button
          onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(s - 0.25, 0.5)) }}
          className="h-7 w-7 rounded-full hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-overlay-text/70 text-xs min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(s + 0.25, 3)) }}
          className="h-7 w-7 rounded-full hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation arrows */}
      {imageUrls.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-overlay-surface/10 hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-overlay-surface/10 hover:bg-overlay-surface/20 text-overlay-text flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Main image */}
      <div
        className="flex items-center justify-center w-full h-full p-8 sm:p-12"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrls[index]}
          alt={`Preview ${index + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-200 select-none"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />
      </div>

      {/* Bottom bar: actions + counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <div onClick={(e) => e.stopPropagation()}>
          <ImageActions
            imageUrl={imageUrls[index]}
            onSaveToGallery={onSaveToGallery ? () => onSaveToGallery(imageUrls[index]) : undefined}
            onDelete={onDelete ? () => onDelete(imageUrls[index]) : undefined}
            onAttachToChat={onAttachToChat ? () => onAttachToChat(imageUrls[index]) : undefined}
            variant="preview"
            isGuest={isGuest}
          />
        </div>
        {imageUrls.length > 1 && (
          <div className="flex items-center gap-2">
            {imageUrls.map((url, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIndex(i); setScale(1) }}
                className={`w-10 h-10 rounded-md overflow-hidden border-2 transition-all ${i === index
                  ? 'border-primary shadow-md shadow-primary/30'
                  : 'border-foreground/20 opacity-60 hover:opacity-100'
                  }`}
              >
                <img src={url} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
            <span className="text-foreground/50 text-xs ml-1">{index + 1}/{imageUrls.length}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

/** Watermark overlay for free-tier images. */
function WatermarkOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-end justify-end p-3">
      <span className="bg-overlay-scrim/50 text-overlay-text/70 text-[10px] font-medium px-2 py-1 rounded-md backdrop-blur-sm">
        Made with TheWeddingBot
      </span>
    </div>
  )
}

export function ImageCarousel({ imageUrls, aspectRatio, onSaveToGallery, onDelete, isGuest, watermarked, prompt }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const navigate = useNavigate()
  const { addAttachment } = useChatAttachments()

  // Stage the (AI-generated) image as a reference for the user's next chat
  // message, close the preview, and route to the chat so the chip is visible.
  const handleAttachToChat = useCallback((imageUrl: string) => {
    addAttachment({
      kind: 'image',
      id: attachmentIdFromUrl(imageUrl),
      title: prompt?.slice(0, 60) || 'AI-generated image',
      preview: prompt?.slice(0, 200),
      payload: { url: imageUrl, prompt },
    })
    toast.success('Image attached — ask Viva about it in chat')
    setPreviewOpen(false)
    navigate('/')
  }, [addAttachment, navigate, prompt])

  if (imageUrls.length === 0) return null

  // Determine aspect ratio class
  const arClass = aspectRatio === '1024x1536' ? 'aspect-[2/3]'
    : aspectRatio === '1536x1024' ? 'aspect-[3/2]'
      : 'aspect-square'

  // Single image
  if (imageUrls.length === 1) {
    return (
      <>
        <div className="mt-2 mb-2 relative group w-full max-w-[calc(100%-1rem)] sm:max-w-sm md:max-w-md motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
          <img
            src={imageUrls[0]}
            alt="Generated"
            className={`w-full ${arClass} max-h-[60vh] sm:max-h-none object-cover rounded-xl shadow-lg cursor-pointer hover:brightness-95 transition-all`}
            onClick={() => setPreviewOpen(true)}
          />
          {watermarked && <WatermarkOverlay />}
          <ImageActions imageUrl={imageUrls[0]} onSaveToGallery={onSaveToGallery ? () => onSaveToGallery(imageUrls[0]) : undefined} onDelete={onDelete ? () => onDelete(imageUrls[0]) : undefined} onAttachToChat={() => handleAttachToChat(imageUrls[0])} isGuest={isGuest} />
        </div>
        {previewOpen && (
          <ImagePreview
            imageUrls={imageUrls}
            initialIndex={0}
            onClose={() => setPreviewOpen(false)}
            onSaveToGallery={onSaveToGallery}
            onDelete={onDelete}
            onAttachToChat={handleAttachToChat}
            isGuest={isGuest}
          />
        )}
      </>
    )
  }

  // Multiple variants
  return (
    <>
      <div className="mt-2 mb-2 space-y-2 w-full max-w-[calc(100%-1rem)] sm:max-w-md md:max-w-lg motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        {/* Main selected image */}
        <div className="relative group">
          <img
            src={imageUrls[activeIndex]}
            alt={`Variant ${activeIndex + 1}`}
            className={`w-full ${arClass} max-h-[60vh] sm:max-h-none object-cover rounded-xl shadow-lg cursor-pointer hover:brightness-95 transition-all`}
            onClick={() => setPreviewOpen(true)}
          />
          {watermarked && <WatermarkOverlay />}
          <ImageActions
            imageUrl={imageUrls[activeIndex]}
            onSaveToGallery={onSaveToGallery ? () => onSaveToGallery(imageUrls[activeIndex]) : undefined}
            onDelete={onDelete ? () => onDelete(imageUrls[activeIndex]) : undefined}
            onAttachToChat={() => handleAttachToChat(imageUrls[activeIndex])}
            isGuest={isGuest}
          />
          {/* Navigation arrows */}
          {imageUrls.length > 1 && (
            <>
              <button
                onClick={() => setActiveIndex(i => (i - 1 + imageUrls.length) % imageUrls.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-overlay-scrim/50 hover:bg-overlay-scrim/70 text-overlay-text flex items-center justify-center backdrop-blur-sm transition-colors"
              >
                <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button
                onClick={() => setActiveIndex(i => (i + 1) % imageUrls.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-overlay-scrim/50 hover:bg-overlay-scrim/70 text-overlay-text flex items-center justify-center backdrop-blur-sm transition-colors"
              >
                <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </>
          )}
        </div>
        {/* Thumbnails */}
        <div className="flex gap-1.5 sm:gap-2 justify-center">
          {imageUrls.map((url, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`w-11 h-11 sm:w-14 sm:h-14 rounded-lg overflow-hidden border-2 transition-all ${i === activeIndex
                ? 'border-primary shadow-md shadow-primary/20'
                : 'border-transparent opacity-60 hover:opacity-100'
                }`}
            >
              <img src={url} alt={`Variant ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <p className="text-center text-2xs sm:text-3xs text-foreground/40">
          {activeIndex + 1} of {imageUrls.length} variants
        </p>
      </div>
      {previewOpen && (
        <ImagePreview
          imageUrls={imageUrls}
          initialIndex={activeIndex}
          onClose={() => setPreviewOpen(false)}
          onSaveToGallery={onSaveToGallery}
          onDelete={onDelete}
          onAttachToChat={handleAttachToChat}
          isGuest={isGuest}
        />
      )}
    </>
  )
}
