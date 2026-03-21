import { Timestamp } from 'firebase/firestore'

export type Mode =
  | 'planner'
  | 'stylist'
  | 'therapist'
  | 'knowledge'
  | 'consultant'
  | 'assistant'

export type MessageRole = 'user' | 'assistant'

export interface TokenUsage {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  requestCount: number
  lastUpdatedAt: Timestamp | null
}

// Matches authflow.md §12 + WeddingEase fields
export interface UserProfile {
  uid: string
  name: string
  email: string
  phone: string | null
  isVerified: boolean
  isValidated: boolean
  verifiedAt: Timestamp | null
  favourites: string[]
  weddingDate: Timestamp | null
  budget: number | null
  partnerName: string | null
  preferredLanguage: string
  isPremium: boolean
  role: string | null
  usage: TokenUsage | null
  createdAt: Timestamp
  lastLoginAt: Timestamp | null
  forgotPasswordOtp: number | null
  googleCalendarToken: string | null
}

// ── Checklist types ───────────────────────────────────────────────────────────
export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  vendorRef: string | null  // product URL if linked to a vendor
  dueDate: string | null    // ISO date string (YYYY-MM-DD)
}

export interface Checklist {
  id: string
  userId: string
  title: string
  items: ChecklistItem[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ChatThread {
  id: string
  userId: string
  title: string
  pinned: boolean
  archived: boolean
  tags: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
  activeMode: Mode
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  originalContent: string | null
  mode: Mode
  language: string
  audioUrl: string | null
  timestamp: Timestamp
  liked: boolean
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
  vendor: string
  tags: string[]
  imageUrl: string
  affiliateLink: string
}

export interface ChatFunctionPayload {
  message: string
  threadId: string | null
  audioBase64?: string
  language?: string
  mode?: Mode
  history?: { role: 'user' | 'assistant'; content: string }[]
}

export interface CalendarEvent {
  title: string
  date: string
  time?: string
  description?: string
  reminderMinutes?: number
}

export interface CalendarEventDoc {
  id: string
  title: string
  date: string
  time: string | null
  description: string | null
  htmlLink: string
  createdAt: Date
}

export interface ToolAction {
  tool: 'create_checklist' | 'edit_checklist_item' | 'mark_as_done' | 'get_checklist_stats' | 'save_as_page' | 'save_reminder' | 'web_search'
  checklistId?: string
  itemId?: string
  searchQuery?: string
}

export interface ChatFunctionResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  calendarEvent: CalendarEvent | null
  toolActions: ToolAction[]
  mode: Mode
  detectedLanguage: string
}

// Typed error thrown by authService
export interface AuthFlowError extends Error {
  code: string
  uid?: string
  email?: string
  name?: string
  phone?: string | null
}
