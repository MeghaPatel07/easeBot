import { Timestamp } from 'firebase/firestore'

export type Mode =
  | 'planner'
  | 'stylist'
  | 'therapist'
  | 'knowledge'
  | 'consultant'
  | 'assistant'

export type MessageRole = 'user' | 'assistant'

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
  createdAt: Timestamp
  lastLoginAt: Timestamp | null
  forgotPasswordOtp: number | null
}

export interface ChatThread {
  id: string
  userId: string
  title: string
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

export interface ChatFunctionResponse {
  text: string
  audioUrl: string | null
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
