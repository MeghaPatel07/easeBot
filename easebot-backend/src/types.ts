// Disabled: 'therapist' | 'consultant' removed per EXECUTION_PLAN §0 guardrail #7
export type Mode = 'planner' | 'stylist' | 'knowledge' | 'assistant'

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
}

export interface ToolAction {
  tool: 'create_checklist' | 'edit_checklist_item' | 'mark_as_done' | 'get_checklist_stats' | 'save_as_page' | 'create_reminder' | 'generate_image' | 'create_note' | 'create_timeline_event'
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
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}
