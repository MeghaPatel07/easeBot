export type Mode = 'planner' | 'stylist' | 'therapist' | 'knowledge' | 'consultant' | 'assistant'

export interface ChatPayload {
  message: string
  threadId: string
  audioBase64?: string
  language?: string
  mode?: Mode
  history?: HistoryMessage[]
}

export interface CalendarEvent {
  title: string
  date: string
  time?: string
  description?: string
  reminderMinutes?: number
}

export interface ChatResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  calendarEvent: CalendarEvent | null
  mode: Mode
  detectedLanguage: string
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}
