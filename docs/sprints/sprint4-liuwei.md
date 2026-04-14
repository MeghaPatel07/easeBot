# Sprint 4 — SEC-005 Fix (Liu Wei)

**Owner:** Liu Wei, Senior Backend Engineer
**Ticket:** SEC-005 — Notifications toggles cosmetic; reminderScheduler ignores user prefs
**Severity:** HIGH (compliance + trust)
**Status:** Fixed (read-only consumer of `preferences.notifications`)

## Summary

The PATCH `/api/account/preferences` endpoint persists
`preferences.notifications.{emailReminders, whatsappReminders, productUpdates, tips}`
to the user doc, but the reminder delivery layer never read it. Users who
disabled WhatsApp (or email) reminders kept receiving them. This fix wires
preference checks into the dispatch path as a read-only consumer.

## Approach

- Added a tiny helper `shouldSendNotification(user, channel)` at the top of
  `reminderScheduler.ts` (per the constraint to keep diffs minimal — no new
  file).
- Extended the existing `loadUserContact` helper to also read
  `data.preferences?.notifications` from the user doc and surface it on
  `UserContact.notificationPrefs`.
- Gated each existing send site in `dispatchOne` with the helper. When the
  user has opted out:
  1. log `[reminder] skipped <channel> for uid=<uid> (user opted out)`
  2. call `markReminderSent(path)` so the scheduler does not retry the same
     pending doc on every tick (the user expressed intent — this is an
     intentional drop, not a delivery failure).

## Default behavior (legacy users)

Opt-out model. A user is only skipped if `preferences.notifications.<channel>`
is **explicitly `false`**. Specifically:

- `preferences` field absent on the user doc → `notificationPrefs = null` → all channels send (legacy behavior preserved).
- `preferences.notifications` absent → `notificationPrefs = {}` → all channels send.
- `preferences.notifications.emailReminders === undefined` → send.
- `preferences.notifications.emailReminders === true` → send.
- `preferences.notifications.emailReminders === false` → **skip + log**.

Identical semantics for `whatsappReminders`.

## Send sites gated

| File | Line | Channel | Pref key |
|---|---|---|---|
| `easebot-backend/src/services/reminderScheduler.ts` | 127 | email reminder | `emailReminders` |
| `easebot-backend/src/services/reminderScheduler.ts` | 151 | whatsapp reminder | `whatsappReminders` |

These are the **only** two reminder dispatch points in the backend
(`grep sendEmailNotification|sendWhatsAppReminder src/`). `notesService.ts`
also calls `sendEmailNotification` but it is for note-collaboration invites,
not reminders/notifications, and is out of scope for SEC-005.

## productUpdates / tips

There are currently **no separate send paths** in the backend for
`productUpdates` or `tips` — all reminder dispatch flows through the single
`dispatchOne` function which only handles category `email` and `whatsapp`
reminders. Per the constraint ("if all reminders go through one function,
only the category-specific flag applies"), `productUpdates` and `tips` are
not gated here. The Settings UI continues to persist them to Firestore so
they are ready to wire when product-updates / tips delivery paths land.

## Files changed

- `easebot-backend/src/services/reminderScheduler.ts`
  - +helper `shouldSendNotification` (and `NotificationPrefs` /
    `NotificationChannel` types)
  - +read of `data.preferences?.notifications` inside `loadUserContact`
  - +gate on email branch (line 127)
  - +gate on whatsapp branch (line 151)

## Files NOT touched (per hard constraints)

- `src/controllers/accountController.ts` (Ravi)
- `src/middleware/auth.ts` (Ravi)
- `firestore.rules`, `storage.rules`, `firebase.json`, `functions/`
- `package.json` (no new deps)
- `Wedding-Ease-Viva-Chat/src/types/index.ts` (read-only reference)

## Verification

- `npx tsc --noEmit` in `easebot-backend/` → **0 errors**
- No project test file exists for reminders (only third-party
  `node_modules/zod/.../*.test.ts` which is irrelevant).
- No deploys performed.
