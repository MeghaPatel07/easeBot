import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, Share2, Bookmark, Check, Loader2, Copy, Link, X, Trash2, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { track } from '@/lib/analytics'

interface ImageActionsProps {
  imageUrl: string
  onSaveToGallery?: () => void
  isSaved?: boolean
  onDelete?: () => void
  /** Stage this image as a chat attachment so the user can reference it
   *  in their next message to Viva. When provided, renders a
   *  MessageSquarePlus action button alongside the other actions. */
  onAttachToChat?: () => void
  /** 'overlay' (default): absolute positioned, hover-reveal on desktop.
   *  'preview': inline flex, always visible, larger buttons — for fullscreen lightbox. */
  variant?: 'overlay' | 'preview'
  /** Hide share & save-to-gallery buttons for guest users */
  isGuest?: boolean
  /** Stable id for analytics. Falls back to a URL-derived slug so events
   *  always carry an identifier. */
  imageId?: string
  /** Where the user is interacting with this image — 'chat' bubble or
   *  standalone 'gallery'. Used for image_downloaded source property. */
  source?: 'chat' | 'gallery'
}

/** Derive a stable, non-PII analytics id from a URL when no explicit id is
 *  provided. Uses the last segment of the path (trims query) so the same
 *  image generates the same id across sessions. */
function imageIdFromUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? ''
    return seg.slice(-48) || 'unknown'
  } catch {
    return url.split('?')[0].split('/').pop()?.slice(-48) || 'unknown'
  }
}

// Social/share platform configs
const SHARE_PLATFORMS = [
  {
    name: 'WhatsApp',
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    getUrl: (url: string) => `https://wa.me/?text=${encodeURIComponent(url)}`,
    color: 'text-success',
  },
  {
    name: 'Twitter / X',
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    getUrl: (url: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Check out this wedding design from TheWeddingBot!')}`,
    color: 'text-foreground',
  },
  {
    name: 'Pinterest',
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z" />
      </svg>
    ),
    getUrl: (url: string) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(url)}&description=${encodeURIComponent('Wedding inspiration from TheWeddingBot')}`,
    color: 'text-destructive',
  },
  {
    name: 'Email',
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
    getUrl: (url: string) => `mailto:?subject=${encodeURIComponent('TheWeddingBot — Image')}&body=${encodeURIComponent(`Check out this image: ${url}`)}`,
    color: 'text-info',
  },
]

export function ImageActions({ imageUrl, onSaveToGallery, isSaved, onDelete, onAttachToChat, variant = 'overlay', isGuest, imageId, source = 'chat' }: ImageActionsProps) {
  const resolvedImageId = imageId ?? imageIdFromUrl(imageUrl)
  const [downloading, setDownloading] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [imageCopied, setImageCopied] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Close modal on outside click
  useEffect(() => {
    if (!showShareModal) return
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowShareModal(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showShareModal])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wedding-ease-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      track('image_downloaded', { image_id: resolvedImageId, source })
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  const handleCopyImage = async () => {
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      // Convert to PNG for clipboard (clipboard API requires image/png)
      const pngBlob = new Blob([blob], { type: 'image/png' })
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ])
      setImageCopied(true)
      setTimeout(() => setImageCopied(false), 2000)
      track('image_copied', { image_id: resolvedImageId })
    } catch {
      // Fallback: copy URL instead
      handleCopyLink()
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(imageUrl)
    } catch {
      const input = document.createElement('input')
      input.value = imageUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
    track('image_link_copied', { image_id: resolvedImageId })
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        const res = await fetch(imageUrl)
        const blob = await res.blob()
        const file = new File([blob], 'theweddingbot.jpg', { type: blob.type })
        await navigator.share({ files: [file], title: 'TheWeddingBot', text: 'Check out this wedding design!' })
        track('image_shared_to_social', { image_id: resolvedImageId, channel: 'native' })
      } catch {
        // User cancelled or not supported with files — try URL only
        try {
          await navigator.share({ url: imageUrl, title: 'TheWeddingBot' })
          track('image_shared_to_social', { image_id: resolvedImageId, channel: 'native' })
        } catch { /* user cancelled */ }
      }
    }
    setShowShareModal(false)
  }

  return (
    <>
      <div className={
        variant === 'preview'
          ? 'flex gap-2 items-center bg-overlay-surface/10 rounded-full px-3 py-1.5 backdrop-blur-sm'
          : 'absolute top-2 right-2 flex gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200'
      }>
        {/* Download */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={handleDownload} disabled={downloading}
              className={variant === 'preview'
                ? 'h-9 w-9 p-0 rounded-full hover:bg-overlay-surface/20 text-overlay-text'
                : 'h-10 w-10 sm:h-7 sm:w-7 p-0 bg-overlay-scrim/50 hover:bg-overlay-scrim/70 text-overlay-text rounded-lg backdrop-blur-sm'
              }>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Download</p></TooltipContent>
        </Tooltip>

        {/* Copy as image */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={handleCopyImage}
              className={variant === 'preview'
                ? 'h-9 w-9 p-0 rounded-full hover:bg-overlay-surface/20 text-overlay-text'
                : 'h-10 w-10 sm:h-7 sm:w-7 p-0 bg-overlay-scrim/50 hover:bg-overlay-scrim/70 text-overlay-text rounded-lg backdrop-blur-sm'
              }>
              {imageCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{imageCopied ? 'Copied!' : 'Copy image'}</p></TooltipContent>
        </Tooltip>

        {/* Attach to chat — stages image as a reference for the next chat message */}
        {onAttachToChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onAttachToChat() }}
                className={variant === 'preview'
                  ? 'h-9 w-9 p-0 rounded-full hover:bg-primary/40 text-overlay-text'
                  : 'h-10 w-10 sm:h-7 sm:w-7 p-0 bg-overlay-scrim/50 hover:bg-primary/70 text-overlay-text rounded-lg backdrop-blur-sm'
                }>
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Attach to chat</p></TooltipContent>
          </Tooltip>
        )}

        {/* Share — hidden for guests */}
        {!isGuest && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={() => setShowShareModal(true)}
                className={variant === 'preview'
                  ? 'h-9 w-9 p-0 rounded-full hover:bg-overlay-surface/20 text-overlay-text'
                  : 'h-10 w-10 sm:h-7 sm:w-7 p-0 bg-overlay-scrim/50 hover:bg-overlay-scrim/70 text-overlay-text rounded-lg backdrop-blur-sm'
                }>
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Share</p></TooltipContent>
          </Tooltip>
        )}

        {/* Save to gallery — hidden for guests */}
        {!isGuest && onSaveToGallery && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={onSaveToGallery} disabled={isSaved}
                className={variant === 'preview'
                  ? `h-9 w-9 p-0 rounded-full ${isSaved ? 'bg-primary/40 text-overlay-text' : 'hover:bg-overlay-surface/20 text-overlay-text'}`
                  : `h-10 w-10 sm:h-7 sm:w-7 p-0 backdrop-blur-sm rounded-lg ${isSaved ? 'bg-primary/50 text-overlay-text' : 'bg-overlay-scrim/50 hover:bg-overlay-scrim/70 text-overlay-text'}`
                }>
                <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>{isSaved ? 'Saved' : 'Save to gallery'}</p></TooltipContent>
          </Tooltip>
        )}

        {/* Delete */}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={onDelete}
                className={variant === 'preview'
                  ? 'h-9 w-9 p-0 rounded-full hover:bg-destructive/70 text-overlay-text'
                  : 'h-10 w-10 sm:h-7 sm:w-7 p-0 bg-overlay-scrim/50 hover:bg-destructive/70 text-overlay-text rounded-lg backdrop-blur-sm'
                }>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Delete</p></TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Share Modal — portaled to body so transforms/overflow can't clip it */}
      {showShareModal && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-overlay-scrim/40 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
          <div ref={modalRef} className="bg-card-elevated/95 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-modal w-[calc(100%-2rem)] max-w-sm p-5 mx-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground/90">Share image</h3>
              <button onClick={() => setShowShareModal(false)} className="p-1 rounded-lg text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Image preview */}
            <div className="mb-4 rounded-xl overflow-hidden bg-foreground/[0.04] border border-foreground/[0.06]">
              <img src={imageUrl} alt="Share preview" className="w-full h-32 object-cover" />
            </div>

            {/* Copy actions */}
            <div className="space-y-2 mb-4">
              <button
                onClick={handleCopyImage}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.06] transition-all"
              >
                <Copy className="h-4 w-4 text-foreground/40" />
                <span>{imageCopied ? 'Image copied!' : 'Copy image'}</span>
                {imageCopied && <Check className="h-4 w-4 text-success ml-auto" />}
              </button>
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.06] transition-all"
              >
                <Link className="h-4 w-4 text-foreground/40" />
                <span>{linkCopied ? 'Link copied!' : 'Copy link'}</span>
                {linkCopied && <Check className="h-4 w-4 text-success ml-auto" />}
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-foreground/[0.06] mb-4" />

            {/* Social platforms */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
              {SHARE_PLATFORMS.map(platform => (
                <a
                  key={platform.name}
                  href={platform.getUrl(imageUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    const channel = platform.name === 'WhatsApp' ? 'whatsapp'
                      : platform.name === 'Twitter / X' ? 'twitter'
                      : platform.name === 'Pinterest' ? 'pinterest'
                      : platform.name === 'Email' ? 'email'
                      : platform.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
                    track('image_shared_to_social', { image_id: resolvedImageId, channel })
                    setShowShareModal(false)
                  }}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-foreground/[0.06] transition-colors"
                >
                  <div className={`${platform.color}`}>
                    <platform.icon />
                  </div>
                  <span className="text-3xs text-foreground/40">{platform.name}</span>
                </a>
              ))}
            </div>

            {/* Native share (mobile) */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/25 text-sm text-primary font-medium hover:bg-primary/25 transition-colors"
              >
                <Share2 className="h-4 w-4" />
                More sharing options
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
