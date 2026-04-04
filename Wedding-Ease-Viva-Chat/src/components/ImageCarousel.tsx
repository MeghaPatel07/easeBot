import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ImageActions } from './ImageActions'

interface ImageCarouselProps {
  imageUrls: string[]
  aspectRatio?: string // '1024x1024' | '1024x1536' | '1536x1024'
  onSaveToGallery?: (imageUrl: string) => void
}

export function ImageCarousel({ imageUrls, aspectRatio, onSaveToGallery }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (imageUrls.length === 0) return null

  // Determine aspect ratio class
  const arClass = aspectRatio === '1024x1536' ? 'aspect-[2/3]'
    : aspectRatio === '1536x1024' ? 'aspect-[3/2]'
    : 'aspect-square'

  // Single image
  if (imageUrls.length === 1) {
    return (
      <div className="mt-2 mb-2 relative group w-full max-w-[calc(100%-1rem)] sm:max-w-sm md:max-w-md animate-in fade-in duration-500">
        <img
          src={imageUrls[0]}
          alt="Generated"
          className={`w-full ${arClass} max-h-[60vh] sm:max-h-none object-cover rounded-xl shadow-lg`}
        />
        <ImageActions imageUrl={imageUrls[0]} onSaveToGallery={onSaveToGallery ? () => onSaveToGallery(imageUrls[0]) : undefined} />
      </div>
    )
  }

  // Multiple variants
  return (
    <div className="mt-2 mb-2 space-y-2 w-full max-w-[calc(100%-1rem)] sm:max-w-md md:max-w-lg animate-in fade-in duration-500">
      {/* Main selected image */}
      <div className="relative group">
        <img
          src={imageUrls[activeIndex]}
          alt={`Variant ${activeIndex + 1}`}
          className={`w-full ${arClass} max-h-[60vh] sm:max-h-none object-cover rounded-xl shadow-lg`}
        />
        <ImageActions
          imageUrl={imageUrls[activeIndex]}
          onSaveToGallery={onSaveToGallery ? () => onSaveToGallery(imageUrls[activeIndex]) : undefined}
        />
        {/* Navigation arrows */}
        {imageUrls.length > 1 && (
          <>
            <button
              onClick={() => setActiveIndex(i => (i - 1 + imageUrls.length) % imageUrls.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
            >
              <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
            <button
              onClick={() => setActiveIndex(i => (i + 1) % imageUrls.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
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
            className={`w-11 h-11 sm:w-14 sm:h-14 rounded-lg overflow-hidden border-2 transition-all ${
              i === activeIndex
                ? 'border-[#C6944A] shadow-md shadow-[#C6944A]/20'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <img src={url} alt={`Variant ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      <p className="text-center text-2xs sm:text-3xs text-white/40">
        {activeIndex + 1} of {imageUrls.length} variants
      </p>
    </div>
  )
}
