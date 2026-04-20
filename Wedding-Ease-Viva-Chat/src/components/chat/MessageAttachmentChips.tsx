import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ListChecks, Calendar, Image as ImageIcon, File as FileIcon, AlertTriangle, Bell } from 'lucide-react'
import type { MessageAttachment, MessageAttachmentKind } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// MessageAttachmentChips
// -----------------------------------------------------------------------------
// Renders the attachments pinned to a user message as compact clickable chips.
// Each chip resolves its `id` against `knownIds` — when present, clicking the
// chip routes to the source artifact; when missing (because the user deleted
// the note/checklist/timeline event/gallery image since sending), the chip
// shows a greyed "Deleted artifact" state and is not clickable.
//
// Navigation paths mirror App.tsx route definitions:
//   note      → /:userId/notes/:noteId       (focused)
//   checklist → /:userId/planner/:checklistId (focused)
//   timeline  → /:userId/timeline            (list — no focus deeplink yet)
//   image     → /:userId/gallery             (list — no focus deeplink yet)
// ─────────────────────────────────────────────────────────────────────────────

export interface KnownArtifactIds {
  notes: Set<string>
  checklists: Set<string>
  timelines: Set<string>
  images: Set<string>
  reminders: Set<string>
}

interface Props {
  attachments: MessageAttachment[]
  knownIds: KnownArtifactIds
  userId: string
}

const ICONS: Record<MessageAttachmentKind, React.ElementType> = {
  note: FileText,
  checklist: ListChecks,
  timeline: Calendar,
  image: ImageIcon,
  file: FileIcon,
  reminder: Bell,
}

function hrefFor(
  attachment: MessageAttachment,
  userId: string,
): string | null {
  if (!userId) return null
  switch (attachment.kind) {
    case 'note':      return `/${userId}/notes/${attachment.id}`
    case 'checklist': return `/${userId}/planner/${attachment.id}`
    case 'timeline':  return `/${userId}/timeline`
    case 'image':     return `/${userId}/gallery`
    case 'reminder':  return `/${userId}/reminders`
    default:          return null
  }
}

function isKnown(
  attachment: MessageAttachment,
  knownIds: KnownArtifactIds,
): boolean {
  switch (attachment.kind) {
    case 'note':      return knownIds.notes.has(attachment.id)
    case 'checklist': return knownIds.checklists.has(attachment.id)
    case 'timeline':  return knownIds.timelines.has(attachment.id)
    case 'image':     return knownIds.images.has(attachment.id)
    case 'reminder':  return knownIds.reminders.has(attachment.id)
    case 'file':      return true // files aren't stored as artifacts today
    default:          return false
  }
}

const truncate = (s: string, n = 40) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s

function isSafeHttpUrl(u?: string): boolean {
  if (!u) return false
  return u.startsWith('http://') || u.startsWith('https://')
}

export default function MessageAttachmentChips({
  attachments,
  knownIds,
  userId,
}: Props) {
  const navigate = useNavigate()
  if (!attachments || attachments.length === 0) return null

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {attachments.map((att) => {
        const known = isKnown(att, knownIds)
        const Icon = ICONS[att.kind] ?? FileIcon
        const href = known ? hrefFor(att, userId) : null

        // Deleted artifact — greyed, not clickable, shows a warning glyph.
        if (!known) {
          return (
            <div
              key={`${att.kind}:${att.id}`}
              title="This artifact has been deleted"
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-foreground/[0.04] border border-foreground/[0.06] text-xs text-foreground/35 line-through decoration-white/30"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-cat-budget/60 flex-shrink-0" />
              <span>Deleted {att.kind}</span>
            </div>
          )
        }

        return (
          <button
            key={`${att.kind}:${att.id}`}
            type="button"
            onClick={() => {
              if (href) navigate(href)
            }}
            title={att.preview ?? att.title}
            className="flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full bg-primary/[0.12] border border-primary/25 text-xs text-primary-bright [.light_&]:bg-primary/[0.18] [.light_&]:border-primary/40 [.light_&]:text-primary hover:bg-primary/20 hover:border-primary/40 transition-colors max-w-[220px]"
          >
            {att.kind === 'image' && isSafeHttpUrl(att.url) ? (
              <img
                src={att.url}
                alt=""
                className="h-4 w-4 rounded object-cover flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            )}
            <span className="truncate">{truncate(att.title)}</span>
          </button>
        )
      })}
    </div>
  )
}
