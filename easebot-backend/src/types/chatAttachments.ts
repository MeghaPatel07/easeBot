import { z } from 'zod'

/**
 * Kind discriminator for chat attachments. Mirrors the frontend shape so the
 * "Attach to chat" button in NoteHeader / ChecklistHeader / etc. can send
 * structured context that the LLM can actually read during this turn.
 */
export type ChatAttachmentKind = 'note' | 'checklist' | 'timeline' | 'image' | 'file'

export interface ChatAttachment {
  kind: ChatAttachmentKind
  id: string
  title: string
  preview?: string
  // Per-kind payload — validated permissively at the edge; the formatter is
  // defensive about shape (e.g. checklist items, timeline events).
  payload?: unknown
}

// ── Validation limits ───────────────────────────────────────────────────────
export const MAX_ATTACHMENTS_PER_MESSAGE = 5
export const MAX_ID_LENGTH = 128
export const MAX_TITLE_LENGTH = 200
export const MAX_PREVIEW_LENGTH = 2000
// Soft cap on the total formatted-block size injected into the user message.
// Prevents prompt blow-up when multiple long notes are attached at once.
export const MAX_TOTAL_BLOCK_CHARS = 8000

export const ChatAttachmentKindSchema = z.enum(['note', 'checklist', 'timeline', 'image', 'file'])

export const ChatAttachmentSchema = z
  .object({
    kind: ChatAttachmentKindSchema,
    id: z.string().min(1).max(MAX_ID_LENGTH),
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    preview: z.string().max(MAX_PREVIEW_LENGTH).optional(),
    payload: z.unknown().optional(),
  })
  .superRefine((att, ctx) => {
    if (att.kind !== 'image') return
    const payload = att.payload
    if (!payload || typeof payload !== 'object') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload'],
        message: 'image attachment requires a payload object with a url field',
      })
      return
    }
    const url = (payload as Record<string, unknown>).url
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'url'],
        message: 'image payload.url must be a string beginning with http:// or https://',
      })
    }
  })

export const ChatAttachmentsSchema = z
  .array(ChatAttachmentSchema)
  .max(MAX_ATTACHMENTS_PER_MESSAGE)

export type ValidatedChatAttachment = z.infer<typeof ChatAttachmentSchema>
