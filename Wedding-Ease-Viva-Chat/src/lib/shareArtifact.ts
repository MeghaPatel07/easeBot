import { createSharedChat } from '@/services/chatService'

/**
 * Kind of artifact being shared. Accepted for future differentiation
 * (e.g. "Share checklist link" vs "Share image link"). For now all kinds
 * resolve to the same shared-chat URL — the shared thread page shows
 * the full conversation including the artifact in context.
 */
export type ArtifactKind =
  | 'image'
  | 'checklist'
  | 'calendar'
  | 'product'
  | 'note'
  | 'message'

const KIND_LABEL: Record<ArtifactKind, string> = {
  image: 'image',
  checklist: 'checklist',
  calendar: 'event',
  product: 'recommendation',
  note: 'note',
  message: 'response',
}

/** Lightweight bottom-center toast to mirror the app's existing toast style. */
function showToast(msg: string) {
  const toast = document.createElement('div')
  toast.textContent = msg
  toast.className =
    'fixed bottom-20 left-1/2 -translate-x-1/2 bg-surface-toast/95 text-white text-xs px-4 py-2 rounded-full shadow-lg z-[10001] animate-in fade-in border border-accent-gold/40'
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2600)
}

/** Copy a string to the clipboard with an input-fallback for older browsers. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const input = document.createElement('input')
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }
}

/**
 * Share an artifact rendered inside a chat thread.
 *
 * Under the hood this reuses the existing thread-level share flow:
 * `createSharedChat(threadId, title)` → build `/share/:id` URL →
 * copy to clipboard → show a toast. The shared thread page renders
 * the whole conversation, so the artifact is visible in context.
 *
 * If `threadId` is undefined (edge case — e.g. pre-first-save guest thread)
 * we fall back to copying the current page URL so the user still gets
 * something useful on their clipboard.
 */
export async function shareArtifact(
  threadId: string | null | undefined,
  title: string | null | undefined,
  kind: ArtifactKind = 'message',
): Promise<void> {
  const kindLabel = KIND_LABEL[kind] ?? 'artifact'

  if (!threadId) {
    await copyToClipboard(window.location.href)
    showToast(`Link copied — includes this ${kindLabel}`)
    return
  }

  try {
    const shareId = await createSharedChat(threadId, title || 'Shared chat')
    const shareUrl = `${window.location.origin}/share/${shareId}`
    await copyToClipboard(shareUrl)
    showToast(`Thread link copied — includes this ${kindLabel}`)
  } catch (err) {
    console.error('[shareArtifact] error:', err)
    showToast('Could not create share link. Please try again.')
  }
}
