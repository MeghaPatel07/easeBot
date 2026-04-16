// ─────────────────────────────────────────────────────────────────────────────
// Tier configuration — single source of truth for all plan limits.
// Sourced from PRICING_PRD.md §4. Shared across all backend services.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanTier = 'guest' | 'free' | 'pro' | 'promax'

export interface TierLimits {
  /** Monthly token pool size */
  monthlyTokenPool: number
  /** Daily token cap */
  dailyTokenCap: number
  /** Whether token top-up packs are available */
  topUpAvailable: boolean
  /** Max active (pending) reminders */
  maxActiveReminders: number | null // null = unlimited
  /** Allowed reminder channels */
  reminderChannels: ('email' | 'whatsapp' | 'sms')[]
  /** Chat history retention in days (null = unlimited) */
  chatRetentionDays: number | null
  /** Whether chat search is available */
  chatSearchable: boolean
  /** Whether chat is exportable */
  chatExportable: boolean
  /** Max wedding projects */
  maxProjects: number
  /** Notes access level */
  notesAccess: 'view' | 'full'
  /** Allowed export formats */
  exportFormats: ('pdf' | 'csv' | 'json')[]
  /** Whether shareable read-only links are available */
  shareableLinks: boolean
  /** Whether generated images have watermarks */
  imageWatermark: boolean
  /** Whether user gets priority routing (faster latency) */
  priorityRouting: boolean
  /** Whether user gets priority voice queue */
  priorityVoiceQueue: boolean
  /** Max checklists (existing enforcement) */
  maxChecklists: number | null // null = unlimited
}

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  guest: {
    monthlyTokenPool: 0,        // guests use per-session counters, not monthly pool
    dailyTokenCap: 0,
    topUpAvailable: false,
    maxActiveReminders: 0,
    reminderChannels: [],
    chatRetentionDays: 0,       // session-only
    chatSearchable: false,
    chatExportable: false,
    maxProjects: 0,
    notesAccess: 'view',
    exportFormats: [],
    shareableLinks: false,
    imageWatermark: true,
    priorityRouting: false,
    priorityVoiceQueue: false,
    maxChecklists: 0,
  },
  free: {
    monthlyTokenPool: 300_000,
    dailyTokenCap: 50_000,
    topUpAvailable: false,
    maxActiveReminders: 3,
    reminderChannels: ['email'],
    chatRetentionDays: 30,
    chatSearchable: false,
    chatExportable: false,
    maxProjects: 1,
    notesAccess: 'view',
    exportFormats: ['pdf'],     // checklist PDF only
    shareableLinks: false,
    imageWatermark: true,
    priorityRouting: false,
    priorityVoiceQueue: false,
    maxChecklists: 5,
  },
  pro: {
    monthlyTokenPool: 3_000_000,
    dailyTokenCap: 300_000,
    topUpAvailable: true,
    maxActiveReminders: null,   // unlimited
    reminderChannels: ['email', 'whatsapp'],
    chatRetentionDays: null,    // unlimited
    chatSearchable: true,
    chatExportable: false,
    maxProjects: 2,
    notesAccess: 'full',
    exportFormats: ['pdf', 'csv'],
    shareableLinks: false,
    imageWatermark: false,
    priorityRouting: false,
    priorityVoiceQueue: false,
    maxChecklists: null,        // unlimited
  },
  promax: {
    monthlyTokenPool: 8_000_000,
    dailyTokenCap: 800_000,
    topUpAvailable: true,
    maxActiveReminders: null,   // unlimited
    reminderChannels: ['email', 'whatsapp', 'sms'],
    chatRetentionDays: null,    // unlimited
    chatSearchable: true,
    chatExportable: true,
    maxProjects: 5,
    notesAccess: 'full',
    exportFormats: ['pdf', 'csv', 'json'],
    shareableLinks: true,
    imageWatermark: false,
    priorityRouting: true,
    priorityVoiceQueue: true,
    maxChecklists: null,        // unlimited
  },
}

/** Resolve tier from a user profile document (Firestore). */
export function resolveTier(profile: { plan?: string; tierMirror?: string; isPremium?: boolean } | null): PlanTier {
  if (!profile) return 'guest'
  const raw = profile.tierMirror ?? profile.plan
  if (raw === 'pro' || raw === 'promax' || raw === 'free') return raw
  if (profile.isPremium) return 'pro'
  return 'free'
}

/** Get limits for a given tier. */
export function getLimits(tier: PlanTier): TierLimits {
  return TIER_LIMITS[tier]
}

/** Format a limit value for user-facing messages. */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return n.toString()
}
