export type Mode = 'planner' | 'stylist' | 'therapist' | 'knowledge' | 'consultant' | 'assistant'

export interface ChatPayload {
  message: string
  threadId: string | null
  audioBase64?: string
  language?: string
  mode?: Mode
  history?: HistoryMessage[]  // passed by guest clients (no Firestore thread)
}

export interface ChatResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  mode: Mode
  detectedLanguage: string
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}
