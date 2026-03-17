export type Mode = 'planner' | 'stylist' | 'therapist' | 'knowledge' | 'consultant' | 'assistant'

export interface ChatPayload {
  message: string
  threadId: string | null
  audioBase64?: string
  language?: string
  mode?: Mode
  history?: HistoryMessage[]  // passed by guest clients (no Firestore thread)
}

export interface ToolAction {
  tool: 'create_checklist' | 'edit_checklist_item' | 'mark_as_done' | 'get_checklist_stats' | 'save_as_page'
  checklistId?: string
  itemId?: string
}

export interface ChatResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  toolActions: ToolAction[]
  mode: Mode
  detectedLanguage: string
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}
