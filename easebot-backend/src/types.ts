export type Mode = 'planner' | 'stylist' | 'therapist' | 'knowledge' | 'consultant' | 'assistant'

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
}

export interface CalendarEvent {
  title: string
  date: string
  time?: string
  description?: string
  reminderMinutes?: number
}

export interface ToolAction {
  tool: 'create_checklist' | 'edit_checklist_item' | 'mark_as_done' | 'get_checklist_stats' | 'save_as_page' | 'save_reminder'
  checklistId?: string
  itemId?: string
}

export interface ChatResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  calendarEvent: CalendarEvent | null
  toolActions: ToolAction[]
  mode: Mode
  detectedLanguage: string
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}
