// ─────────────────────────────────────────────────────────────────────────────
// Checklist tier-cap policy (pure, firebase-free)
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the free-tier "max checklists" gate, shared by
// every checklist-creation path (manual PlannerView/TimelineView UI AND the AI
// planner tool). Previously the cap was enforced only on the backend AI-tool
// path (plannerTools.ts), letting the manual UI write a 6th checklist straight
// to Firestore with no check (WE-20260601-103).
//
// Keyed on the *resolved tier* (free vs pro/promax) via tierConfig — NOT the raw
// `isPremium` boolean — so pro/promax users whose `isPremium` flag is unset are
// not wrongly limited. Cap numbers are the LOCKED PRICING_PRD values and live
// only in tierConfig (free = 5, pro/promax = unlimited). Do NOT hardcode 5 here.

// Relative import (not the '@/' alias) so this module — and its test — run
// under `node --test --experimental-strip-types` with zero new deps. tierConfig
// is pure (no firebase), so the chain stays node-loadable.
import { resolveTier, getLimits, tierLabel, upgradeTier, type PlanTier } from '../config/tierConfig.ts'

/** Minimal profile shape needed to resolve a tier. */
export type TierProfile = { plan?: string; tierMirror?: string; isPremium?: boolean } | null

export interface ChecklistLimitResult {
  /** Whether creating one more checklist is allowed. */
  allowed: boolean
  /** Resolved tier the decision was made against. */
  tier: PlanTier
  /** Cap for the tier (null = unlimited). */
  max: number | null
  /** Cap-hit / upgrade message, set only when `allowed` is false. */
  message?: string
}

/**
 * Decide whether a user on `profile`'s tier may create one more checklist given
 * they currently have `currentCount`. Returns a consistent upgrade message on a
 * cap hit so every UI path can surface the same copy.
 */
export function checkChecklistLimit(
  profile: TierProfile,
  currentCount: number,
): ChecklistLimitResult {
  const tier = resolveTier(profile)
  const max = getLimits(tier).maxChecklists

  // null = unlimited (pro / promax). 0 or positive = hard cap.
  if (max == null) {
    return { allowed: true, tier, max }
  }

  if (currentCount >= max) {
    const next = upgradeTier(tier)
    const nextLabel = next ? tierLabel(next) : 'a higher plan'
    return {
      allowed: false,
      tier,
      max,
      message: `${tierLabel(tier)} plan is limited to ${max} checklist${max === 1 ? '' : 's'}. Upgrade to ${nextLabel} to add more.`,
    }
  }

  return { allowed: true, tier, max }
}

/**
 * Error thrown by the service layer when a checklist-creation call is blocked by
 * the tier cap. Callers can catch this to show the upgrade message instead of a
 * generic failure toast.
 */
export class ChecklistLimitError extends Error {
  readonly code = 'CHECKLIST_LIMIT_REACHED'
  readonly tier: PlanTier
  readonly max: number | null
  constructor(result: ChecklistLimitResult) {
    super(result.message ?? 'Checklist limit reached.')
    this.name = 'ChecklistLimitError'
    this.tier = result.tier
    this.max = result.max
  }
}
