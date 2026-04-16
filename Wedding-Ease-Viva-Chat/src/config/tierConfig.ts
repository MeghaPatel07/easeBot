// ─────────────────────────────────────────────────────────────────────────────
// Tier configuration — frontend mirror of functions/src/config/tierConfig.ts
// Single source of truth for all plan limits displayed in the UI.
// Sourced from PRICING_PRD.md §4.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanTier = 'guest' | 'free' | 'pro' | 'promax'

export interface TierLimits {
  monthlyTokenPool: number
  dailyTokenCap: number
  topUpAvailable: boolean
  maxActiveReminders: number | null
  reminderChannels: ('email' | 'whatsapp' | 'sms')[]
  chatRetentionDays: number | null
  chatSearchable: boolean
  chatExportable: boolean
  maxProjects: number
  notesAccess: 'view' | 'full'
  exportFormats: ('pdf' | 'csv' | 'json')[]
  shareableLinks: boolean
  imageWatermark: boolean
  priorityRouting: boolean
  priorityVoiceQueue: boolean
  maxChecklists: number | null
}

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  guest: {
    monthlyTokenPool: 0,
    dailyTokenCap: 0,
    topUpAvailable: false,
    maxActiveReminders: 0,
    reminderChannels: [],
    chatRetentionDays: 0,
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
    exportFormats: ['pdf'],
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
    maxActiveReminders: null,
    reminderChannels: ['email', 'whatsapp'],
    chatRetentionDays: null,
    chatSearchable: true,
    chatExportable: false,
    maxProjects: 2,
    notesAccess: 'full',
    exportFormats: ['pdf', 'csv'],
    shareableLinks: false,
    imageWatermark: false,
    priorityRouting: false,
    priorityVoiceQueue: false,
    maxChecklists: null,
  },
  promax: {
    monthlyTokenPool: 8_000_000,
    dailyTokenCap: 800_000,
    topUpAvailable: true,
    maxActiveReminders: null,
    reminderChannels: ['email', 'whatsapp', 'sms'],
    chatRetentionDays: null,
    chatSearchable: true,
    chatExportable: true,
    maxProjects: 5,
    notesAccess: 'full',
    exportFormats: ['pdf', 'csv', 'json'],
    shareableLinks: true,
    imageWatermark: false,
    priorityRouting: true,
    priorityVoiceQueue: true,
    maxChecklists: null,
  },
}

/** Resolve tier from user profile fields. */
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

/** Human-readable token count (e.g. 300000 → "300K", 3000000 → "3M"). */
export function formatTokenCount(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return n.toString()
}

/** Tier display name. */
export function tierLabel(tier: PlanTier): string {
  switch (tier) {
    case 'guest': return 'Guest'
    case 'free': return 'Free'
    case 'pro': return 'Pro'
    case 'promax': return 'Pro Max'
  }
}

/** Next upgrade tier (or null if already at top). */
export function upgradeTier(tier: PlanTier): PlanTier | null {
  switch (tier) {
    case 'guest': return 'free'
    case 'free': return 'pro'
    case 'pro': return 'promax'
    case 'promax': return null
  }
}
