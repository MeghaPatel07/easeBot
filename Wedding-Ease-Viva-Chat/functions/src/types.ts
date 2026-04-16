// Disabled: 'therapist' | 'consultant' removed per EXECUTION_PLAN §0 guardrail #7
export type Mode = 'planner' | 'stylist' | 'knowledge' | 'assistant'

export interface ChatPayload {
  message: string
  threadId: string | null
  audioBase64?: string
  language?: string
  mode?: Mode
  history?: HistoryMessage[]  // passed by guest clients (no Firestore thread)
  skipImageGeneration?: boolean  // sent by frontend when guest image limit reached
}

export interface ToolAction {
  tool: 'create_checklist' | 'edit_checklist_item' | 'mark_as_done' | 'get_checklist_stats' | 'save_as_page' | 'web_search'
  checklistId?: string
  itemId?: string
  searchQuery?: string
}

export interface ChatResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  toolActions: ToolAction[]
  mode: Mode
  detectedLanguage: string
  /** True when the image has a watermark overlay (free-tier users). */
  imageWatermarked?: boolean
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}
