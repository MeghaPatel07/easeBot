/**
 * userProfileMigration
 * --------------------
 * Sprint 1 — Settings & User Profile redesign (PRD §7).
 *
 * Pure, read-time defaults shim for `UserProfile`. This module performs
 * NO Firestore reads or writes. It is intended to be invoked from a hook
 * (e.g. `useAccount`) so the UI always sees a fully-formed profile even
 * before the one-time backend backfill has reached every document.
 *
 * Rules:
 *   - Never mutate the input object (returns a shallow merge).
 *   - Never override a value that the user/document already has.
 *   - Leave the usage *window* fields (`messagesUsed`, `messagesAllowed`,
 *     `periodStart`, `periodEnd`) undefined when not present — those are
 *     authoritative on the backend and must not be guessed client-side.
 */

import type { UserProfile, UserPreferences } from '../../types'

export function applyProfileDefaults(profile: UserProfile): UserProfile {
  const existingPrefs: UserPreferences = profile.preferences ?? {}
  const existingNotifications = existingPrefs.notifications ?? {}

  const preferences: UserPreferences = {
    theme: existingPrefs.theme ?? 'system',
    density: existingPrefs.density ?? 'comfortable',
    language:
      existingPrefs.language ??
      profile.preferredLanguage ??
      'en',
    notifications: {
      emailReminders: existingNotifications.emailReminders ?? true,
      whatsappReminders: existingNotifications.whatsappReminders ?? true,
      productUpdates: existingNotifications.productUpdates ?? true,
      tips: existingNotifications.tips ?? true,
    },
    dataTrainingOptOut: existingPrefs.dataTrainingOptOut ?? false,
  }

  return {
    ...profile,
    plan: profile.plan ?? 'free',
    linkedProviders: profile.linkedProviders ?? [],
    preferences,
    // NOTE: `usage` is intentionally untouched — the message-quota window
    // is owned by the backend. We do not synthesize counters here.
  }
}
