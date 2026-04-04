import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, Sparkles, Image } from 'lucide-react'
import { ImageActions } from '@/components/ImageActions'
import type { Message } from '@/hooks/useChat'

interface GalleryViewProps {
  messages: Message[]
}

interface GalleryImage {
  url: string
  prompt: string
  timestamp: Date
}

export default function GalleryView({ messages }: GalleryViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Flatten all images from messages
  const images = useMemo<GalleryImage[]>(() => {
    const result: GalleryImage[] = []
    for (const msg of messages) {
      const prompt = msg.text || ''
      const ts = msg.timestamp

      if (msg.imageUrls && msg.imageUrls.length > 0) {
        for (const url of msg.imageUrls) {
          result.push({ url, prompt, timestamp: ts })
        }
      } else if (msg.imageUrl) {
        result.push({ url: msg.imageUrl, prompt, timestamp: ts })
      }
    }
    return result
  }, [messages])

  // Keyboard navigation for preview modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (selectedIndex === null) return
      if (e.key === 'Escape') {
        setSelectedIndex(null)
      } else if (e.key === 'ArrowLeft') {
        setSelectedIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))
      } else if (e.key === 'ArrowRight') {
        setSelectedIndex((prev) =>
          prev !== null && prev < images.length - 1 ? prev + 1 : prev
        )
      }
    },
    [selectedIndex, images.length]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Empty state
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-[#C6944A]" />
        </div>
        <p className="text-sm text-white/50 max-w-xs leading-relaxed">
          No images yet. Ask Viva to generate some wedding visuals!
        </p>
      </div>
    )
  }

  const currentImage = selectedIndex !== null ? images[selectedIndex] : null

  return (
    <>
      {/* Count badge */}
      <div className="flex items-center gap-2 mb-3">
        <Image className="h-4 w-4 text-white/40" />
        <span className="text-xs text-white/50">
          {images.length} image{images.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {images.map((img, idx) => (
          <button
            key={`${img.url}-${idx}`}
            onClick={() => setSelectedIndex(idx)}
            className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer min-h-[44px] bg-white/[0.04] border border-white/[0.08]"
          >
            <img
              src={img.url}
              alt={img.prompt || 'Generated image'}
              className="w-full h-full object-cover rounded-xl"
              loading="lazy"
            />
            {/* Hover gradient with timestamp */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <p className="text-3xs text-white/60 truncate">
                {img.timestamp.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            {/* ImageActions overlay */}
            <ImageActions imageUrl={img.url} />
          </button>
        ))}
      </div>

      {/* Full-screen preview modal */}
      {currentImage && selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setSelectedIndex(null)}
        >
          {/* Close */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedIndex(null)
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Prev */}
          {selectedIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedIndex((i) => (i !== null ? i - 1 : i))
              }}
              className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors z-10"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next */}
          {selectedIndex < images.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedIndex((i) => (i !== null ? i + 1 : i))
              }}
              className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors z-10"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Image */}
          <div
            className="max-w-3xl max-h-[80vh] relative group"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage.url}
              alt={currentImage.prompt || 'Preview'}
              className="max-h-[75vh] rounded-xl object-contain"
            />
            <ImageActions imageUrl={currentImage.url} />
          </div>

          {/* Prompt text */}
          {currentImage.prompt && (
            <p className="absolute bottom-8 text-center text-xs text-white/50 max-w-md px-4 line-clamp-3">
              {currentImage.prompt}
            </p>
          )}
        </div>
      )}
    </>
  )
}
