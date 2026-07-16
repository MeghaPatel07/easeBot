// Disabled: 'therapist' | 'consultant' removed per EXECUTION_PLAN §0 guardrail #7
export type Mode = 'planner' | 'stylist' | 'knowledge' | 'assistant'

// Re-export so consumers of `types` have the attachment shape alongside
// ChatPayload without importing a second module.
export type { ChatAttachment, ChatAttachmentKind } from './types/chatAttachments'
import type { ChatAttachment as _ChatAttachment } from './types/chatAttachments'

export interface ToneSettings {
  warm?: number
  analytical?: number
  friendly?: number
  professional?: number
  enthusiastic?: number
  concise?: number
  quirky?: number
  candid?: number
  emojis?: number
  headers?: number
}

export interface UserPersonalization {
  nickname?: string
  voiceId?: string
  toneSettings?: ToneSettings
}

export interface ChatPayload {
  message: string
  threadId: string
  audioBase64?: string
  language?: string
  mode?: Mode
  history?: HistoryMessage[]
  userPersonalization?: UserPersonalization
  imageBase64?: string
  imageMimeType?: string
  lastGeneratedImageUrl?: string  // For iterative editing (R6)
  styleMemory?: StyleMemory
  // Vibe Mode — Images Hub payload
  forceImageGeneration?: boolean
  preferredAspectRatio?: '1024x1024' | '1024x1536' | '1536x1024' | '1024x1792'
  vibeTitle?: string
  vibeDescriptors?: string[]
  // Structured context the user explicitly attached to this message (e.g.
  // "Attach to chat" on a saved note). Validated per-item in the controller.
  attachments?: _ChatAttachment[]
  // Client-generated id used to explicitly cancel this request via
  // POST /chat/cancel when the user clicks Stop. See cancellationRegistry.
  requestId?: string
}

export interface ToolAction {
  tool: 'create_checklist' | 'edit_checklist_item' | 'add_checklist_item' | 'mark_as_done' | 'get_checklist_stats' | 'save_as_page' | 'create_reminder' | 'generate_image' | 'create_note' | 'append_to_note' | 'edit_note' | 'create_timeline_event'
  /** false when the tool call failed — checklistId/noteId/etc. are only ever
   *  populated on a confirmed success, never echoed from unresolved args. */
  ok?: boolean
  checklistId?: string
  itemId?: string
  checklistTitle?: string
  checklistItems?: string[]
  imagePrompt?: string
  imageAction?: 'generate' | 'edit'
  imageAspectRatio?: string
  imageVariants?: number
  noteId?: string
  noteTitle?: string
  timelineEventId?: string
  timelineEventTitle?: string
  reminderId?: string
  reminderTitle?: string
  blocked?: 'free_limit' | 'no_auth'
}

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | '1024x1792'

export interface ImageQuotaStatus {
  allowed: boolean
  remaining: number
  dailyUsed: number
  dailyLimit: number
  resetAt: string
}

export interface StyleMemory {
  descriptors: string[]
  colorPalette: string[]
  aestheticRegister: string
  culturalContext: string
  lastGeneratedImageUrl: string | null
}

export interface ToolErrorInfo {
  tool: string
  errorCode: string
  message: string
  userFacing?: string
}

export interface ChatProductCard {
  uid: string
  name: string
  description: string
  imageUrl: string
  productUrl: string
  price?: number
  currency?: string
}

export interface ChatResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  imageUrls?: string[]
  toolActions: ToolAction[]
  mode: Mode
  detectedLanguage: string
  /** The language the AI actually responded in (used by TTS for correct voice selection). */
  responseLanguage: string
  imageQuota?: ImageQuotaStatus
  styleMemory?: StyleMemory
  toolErrors?: ToolErrorInfo[]
  /** Recommended products sidecar — rendered below the message bubble. */
  products?: ChatProductCard[]
  /** Whether more products are available on a follow-up "show more" turn. */
  productsHasMore?: boolean
  /** The resolved search query behind `products` — used by the frontend's
   *  "See more options" link to deep-link into the WeddingEase catalogue
   *  search with the same context instead of a generic/empty search. */
  productsQuery?: string
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}
