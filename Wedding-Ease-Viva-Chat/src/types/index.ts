import { Timestamp } from 'firebase/firestore'

// Disabled: 'therapist' | 'consultant' removed per EXECUTION_PLAN §0 guardrail #7
export type Mode =
  | 'planner'
  | 'stylist'
  // | 'therapist'
  | 'knowledge'
  // | 'consultant'
  | 'assistant'

export type MessageRole = 'user' | 'assistant'

// Kind discriminator for artifacts pinned to a specific chat send.
// Kept in lockstep with ChatAttachmentKind in ChatAttachmentsContext — a
// separate alias lives here so types/ stays dependency-free.
export type MessageAttachmentKind =
  | 'note'
  | 'checklist'
  | 'timeline'
  | 'image'
  | 'file'
  | 'reminder'

// Display-only snapshot of an attachment stored ON a persisted user message.
// The full `payload` (which the backend injects into the LLM) is intentionally
// NOT stored here — it's sent once at request time and the underlying artifact
// remains the source of truth. When the user scrolls back through history we
// resolve `id` against live collections to show a clickable chip or, if the
// artifact was deleted, a greyed "Deleted artifact" chip.
export interface MessageAttachment {
  kind: MessageAttachmentKind
  id: string
  title: string
  preview?: string
  /**
   * Gallery-image-only: persisted thumbnail URL so the chip can render even
   * if the attached image is later moved off-screen. Images already live in
   * Firebase Storage so it's safe to keep the URL.
   */
  url?: string
}

export interface TokenUsage {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  requestCount: number
  lastUpdatedAt: Timestamp | null
  // Sprint 1 (Settings & Profile redesign) — optional message-quota window.
  // Optional for back-compat; populated by backfill / applyProfileDefaults.
  messagesUsed?: number
  messagesAllowed?: number
  periodStart?: Timestamp
  periodEnd?: Timestamp
}

// User-facing preferences (theme, density, language, notifications, privacy).
// Added in Sprint 1 of the Settings & User Profile redesign (PRD §7).
export interface UserPreferences {
  theme?: 'system' | 'light' | 'dark'
  density?: 'comfortable' | 'compact'
  language?: string
  notifications?: {
    emailReminders?: boolean
    whatsappReminders?: boolean
    productUpdates?: boolean
    tips?: boolean
  }
  dataTrainingOptOut?: boolean
}

export interface ToneSettings {
  warm: number          // 0–100
  analytical: number    // 0–100
  friendly: number      // 0–100
  professional: number  // 0–100
  enthusiastic: number  // 0–100
  concise: number       // 0–100 (message length)
  quirky: number        // 0–100
  candid: number        // 0–100
  emojis: number        // 0–100 (emoji usage)
  headers: number       // 0–100 (use headers/lists)
}

export interface UserPersonalization {
  nickname?: string
  voiceId?: string       // browser SpeechSynthesis voice name
  toneSettings?: ToneSettings
}

export interface StyleMemory {
  descriptors: string[]
  colorPalette: string[]
  aestheticRegister: string
  culturalContext: string
  lastGeneratedImageUrl: string | null
}

// Matches authflow.md §12 + WeddingEase fields
export interface UserProfile {
  uid: string
  name: string
  email: string
  phone: string | null
  phoneCountryCode: string | null
  phoneNational: string | null
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
  usage?: TokenUsage | null
  createdAt: Timestamp
  lastLoginAt: Timestamp | null
  forgotPasswordOtp: string | null
  forgotPasswordOtpExpiry?: Timestamp | null
  nickname?: string
  voiceId?: string
  toneSettings?: ToneSettings
  activeVibe?: ActiveVibe | null
  // ── Sprint 1: Settings & Profile redesign (PRD §7) ─────────────────────────
  // All new fields are optional to preserve back-compat with existing
  // Firestore documents and code paths. Defaults are applied at read time
  // by `applyProfileDefaults` in services/migrations/userProfileMigration.ts.
  plan?: 'free' | 'pro' | 'promax'
  tierMirror?: 'free' | 'pro' | 'promax'
  planRenewsAt?: Timestamp
  trialEndsAt?: Timestamp
  linkedProviders?: Array<'password' | 'google.com'>
  preferences?: UserPreferences
  // ── Sprint 4 (Kenji): Custom instructions (industry-gap #2 vs ChatGPT/Claude)
  // Free-text "what should Easebot know about you" + "how should it respond".
  // Persisted via PATCH /api/account/profile once backend whitelists.
  about?: string
  responseStyle?: string
  // Identity origin — set on signup, used to lock the primary identifier
  // (email for email-created accounts, phone for phone-created accounts).
  authMethod?: 'email' | 'phone'
}

// ── Vibe Mode ─────────────────────────────────────────────────────────────────
export interface ActiveVibe {
  id: string
  title: string
  subtitle?: string
  descriptors: string[]
  presetId: string | null
  setAt: Date  // converted from Firestore Timestamp on read
}

export type VibeCategory = 'theme' | 'attire' | 'venue' | 'decor' | 'stationery'

export interface VibePreset {
  id: string
  title: string
  subtitle: string
  category: VibeCategory
  descriptors: string[]
  description: string  // full descriptive paragraph appended to user prompt
  accentColor: string  // hex like '#c9a26a'
  gradientFrom: string // hex
  gradientTo: string   // hex
}

export type GalleryFilter = 'all' | 'generated' | 'edited' | 'uploaded' | 'current-vibe'

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

export interface ChatProductCard {
  uid: string
  name: string
  description: string
  imageUrl: string
  productUrl: string
  price?: number
  currency?: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  originalContent: string | null
  mode: Mode
  language: string
  audioUrl: string | null
  imageUrl: string | null
  imageUrls: string[]
  attachedImageUrl: string | null  // user-uploaded image stored in Firebase Storage
  timestamp: Timestamp
  liked: boolean
  imageDeleted?: boolean
  checklistData?: { id: string; title: string; items: string[] } | null
  // Artifacts the user attached from the AttachmentPicker for this specific
  // send. Stored as a display snapshot — click-through resolves against live
  // collections at render time; missing IDs render as "Deleted artifact".
  attachments?: MessageAttachment[]
  // Recommended products sidecar — rendered as a card strip below the bubble.
  products?: ChatProductCard[]
  productsHasMore?: boolean
  // The resolved search query behind `products` — used by "See more options"
  // to deep-link into the WeddingEase catalogue with the same context.
  productsQuery?: string
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
  userPersonalization?: UserPersonalization
  imageBase64?: string
  imageMimeType?: string
  lastGeneratedImageUrl?: string
  styleMemory?: StyleMemory
  forceImageGeneration?: boolean
  skipImageGeneration?: boolean
  preferredAspectRatio?: string
  vibeTitle?: string
  vibeDescriptors?: string[]
  /**
   * Request-scoped artifact attachments (notes, checklists, timelines, images,
   * files) that the user wants the AI to reason about for this turn. Sourced
   * from ChatAttachmentsContext; cleared by the UI after a successful send.
   * Backend zod-validates and processes regardless of auth. The shape mirrors
   * ChatAttachment from src/contexts/ChatAttachmentsContext.tsx — we redeclare
   * the minimal fields inline here so this pure types module doesn't depend
   * on the React-context module.
   */
  attachments?: Array<{
    kind: 'note' | 'checklist' | 'timeline' | 'image' | 'file'
    id: string
    title: string
    preview?: string
    payload: unknown
  }>
  /**
   * Client-generated id for this turn. Sent so the frontend can explicitly
   * cancel the in-flight request via POST /api/chat/cancel when the user
   * clicks Stop — needed because production proxies often swallow the
   * client-side TCP abort, leaving the backend unable to detect disconnects
   * via `req.on('close')`.
   */
  requestId?: string
}

export interface CalendarEvent {
  title: string
  date: string
  time?: string
  description?: string
  reminderMinutes?: number
}

export interface ReminderDoc {
  id: string
  userId: string
  title: string
  description: string | null
  eventAt: Date
  eventDateStr: string
  eventTimeStr: string | null
  leadTimeMinutes: number
  notifyAt: Date
  timezone: string
  channel: 'email' | 'whatsapp'
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  attemptCount: number
  lastError: string | null
  sentAt: Date | null
  source: 'chat' | 'manual'
  createdAt: Date
  updatedAt: Date
}

export interface TimelineEvent {
  id: string
  ownerId: string
  ownerEmail?: string | null
  title: string
  date: string // ISO date (YYYY-MM-DD) or full ISO timestamp
  description?: string | null
  category?: string | null
  source?: 'chat' | 'manual'
  isDeleted?: boolean
  createdAt?: Date | null
  updatedAt?: Date | null
}

export interface ToolAction {
  tool: 'create_checklist' | 'edit_checklist_item' | 'add_checklist_item' | 'mark_as_done' | 'get_checklist_stats' | 'save_as_page' | 'save_reminder' | 'create_reminder' | 'web_search' | 'generate_image' | 'create_note' | 'append_to_note' | 'edit_note' | 'create_timeline_event'
  /** false when the tool call failed — checklistId/noteId/etc. are only ever
   *  populated on a confirmed success, never echoed from unresolved args. */
  ok?: boolean
  checklistId?: string
  itemId?: string
  searchQuery?: string
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

export interface ChatFunctionResponse {
  text: string
  audioUrl: string | null
  imageUrl: string | null
  imageUrls?: string[]
  calendarEvent: CalendarEvent | null
  toolActions: ToolAction[]
  mode: Mode
  detectedLanguage: string
  imageQuota?: { allowed: boolean; remaining: number; dailyUsed: number; dailyLimit: number; resetAt: string }
  styleMemory?: StyleMemory
  /** True when the image has a watermark overlay (free-tier users). */
  imageWatermarked?: boolean
}

// Typed error thrown by authService. `name` is inherited from Error (required)
// and is hijacked at runtime to carry the user's display name for the
// unverified-account recovery flow — see authService.makeAuthError.
export interface AuthFlowError extends Error {
  code: string
  uid?: string
  email?: string
  phone?: string | null
  pendingCred?: unknown   // firebase AuthCredential, kept loose to avoid importing firebase types into shared types
}
