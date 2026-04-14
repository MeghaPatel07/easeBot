# Sprint 1 — Priya (Data Architect) status note

**Scope:** PRD §7 (Data Model Changes) for the Settings & User Profile redesign.
**Branch:** main (no Firebase deploy, no rules/config touched.)

## What I changed

1. `Wedding-Ease-Viva-Chat/src/types/index.ts`
   - Extended `TokenUsage` with optional message-quota window fields.
   - Added new `UserPreferences` interface.
   - Extended `UserProfile` with the PRD §7 additions — **all optional**, so
     no existing reader/writer breaks.

2. `Wedding-Ease-Viva-Chat/src/services/migrations/userProfileMigration.ts` *(new)*
   - Pure function `applyProfileDefaults(profile: UserProfile): UserProfile`.
   - Read-time defaults shim. **No Firestore writes.** A hook
     (e.g. `useAccount`) should call this on every profile read so the UI
     never sees a half-formed document while the backend backfill is in
     flight.

## New fields available on `UserProfile`

| Field | Type | Default (from `applyProfileDefaults`) |
|---|---|---|
| `photoUrl?` | `string` | _undefined_ |
| `photoUpdatedAt?` | `Timestamp` | _undefined_ |
| `plan?` | `'free' \| 'pro' \| 'premium'` | `'free'` |
| `planRenewsAt?` | `Timestamp` | _undefined_ |
| `trialEndsAt?` | `Timestamp` | _undefined_ |
| `linkedProviders?` | `Array<'password' \| 'google.com'>` | `[]` |
| `preferences?` | `UserPreferences` | see below |

### `UserPreferences` defaults
- `theme` → `'system'`
- `density` → `'comfortable'`
- `language` → `profile.preferredLanguage ?? 'en'`
- `notifications.emailReminders` → `true`
- `notifications.whatsappReminders` → `true`
- `notifications.productUpdates` → `true`
- `notifications.tips` → `true`
- `dataTrainingOptOut` → `false`

### `TokenUsage` additions (all optional)
- `messagesUsed?`, `messagesAllowed?`, `periodStart?`, `periodEnd?`

## Gotchas for teammates

- **`plan` is optional on the type.** Always read it via
  `applyProfileDefaults(profile).plan` (or guard with `?? 'free'`). Do not
  assume the raw Firestore doc has it yet.
- **`isPremium` is intentionally still on `UserProfile`.** Do not delete it
  in this sprint — Section 2 (Payments) will reconcile it with `plan` when
  the migration backfill ships.
- **`preferredLanguage` is also still on `UserProfile`.** Treat
  `preferences.language` as the new source of truth, but mirror writes to
  `preferredLanguage` for back-compat until a follow-up sprint removes the
  legacy field.
- **`usage` quota window is NOT defaulted client-side.** The backend is the
  source of truth for `messagesUsed` / `messagesAllowed` / `periodStart` /
  `periodEnd`. `applyProfileDefaults` deliberately leaves them `undefined`
  if the document doesn't have them — never synthesize counters in the UI.
- **No Firestore writes from the migration module.** It is a pure function.
  If/when we want a one-time backfill, that lives in a Cloud Function (out
  of scope for Sprint 1 — coordinate with backend before shipping).
- **`linkedProviders` defaults to `[]`.** Auth code (Section 1) should
  populate this on sign-in; until then the Account tab will show
  "no linked providers" for legacy users — expected.

## Verification

- `npx tsc --noEmit` from `Wedding-Ease-Viva-Chat/` → **0 errors**.
- No files outside scope were touched. No Firebase deploy attempted; no
  `firestore.rules`, `storage.rules`, `firebase.json`, or `functions/`
  changes.
