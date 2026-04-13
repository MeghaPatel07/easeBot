# PRD — Reminders & Multi-Channel Notifications

| Field | Value |
|---|---|
| **Owner** | Krish |
| **Status** | Draft v1 — awaiting approval |
| **Created** | 2026-04-13 |
| **Target launch** | Beta-blocking — must ship before public launch |
| **Replaces** | Google Calendar integration (entirely removed) |

---

## 1. Background & problem

Today, when a user asks Easebot to "remind me to confirm the venue on May 10" or saves an appointment, the chatbot writes a Google Calendar event on the user's primary calendar via the `auth/calendar` OAuth scope. This has three problems:

1. **Forces sensitive-scope OAuth verification** with Google, which adds 4–8 weeks of review and demo-video work before public launch.
2. **Excludes phone-only users.** Users who sign up via WhatsApp OTP have no Google account, so reminders are completely unavailable to them.
3. **Notification UX is owned by Google**, not by us. We cannot brand reminders, control timing precisely, surface them in our app, or attribute conversion back to WeddingEase.

We will replace Google Calendar with a first-party reminders system and send notifications over the channel matching the user's signup method: **email** for email/Google users, **WhatsApp** for phone users.

---

## 2. Goals

1. Remove all Google Calendar code paths from the codebase (frontend + backend).
2. Drop the `auth/calendar` Google OAuth scope so sign-in only requires basic profile/email — unblocks fast OAuth verification.
3. Persist reminders as first-party data in Firestore under each user.
4. Send a notification at the user's chosen lead time before the reminder fires (default: 24 hours).
5. Pick the notification channel automatically from the user's signup method:
   - **email/Google login → email**
   - **phone (WhatsApp OTP) login → WhatsApp**
6. Always also write an in-app notification to `users/{uid}/notifications` so it appears in the existing NotificationPanel, regardless of channel.
7. Keep all existing reminder UI (RemindersView, TimelineView "+ New Event", chatbot Planner-mode prompts) functionally intact — only the backing implementation changes.

## 3. Non-goals

- Two-way calendar sync (we are not building or maintaining any Google/Apple/Outlook integration).
- Push notifications (web push, FCM) — out of scope for v1; can be added later.
- SMS as a channel — WhatsApp is the phone-user default.
- User-configurable channel preference UI — v1 routes by signup method only.
- Reminders that recur (daily, weekly). v1 is one-shot reminders only.
- Editing a reminder's time after creation — v1 supports create + delete only. Edit is a fast-follow.

---

## 4. User stories

1. **Email user, default lead time.** Priya signs up with email. She tells Easebot "remind me to finalize the menu on May 1." On April 30, exactly 24 hours before May 1 00:00 in her local timezone, she receives an email titled "Reminder: finalize the menu" and a notification appears in the app.
2. **Phone user, custom lead time.** Rohan signed up via WhatsApp OTP. He says "remind me 6 hours before my venue visit on May 5 at 4pm." On May 5 at 10:00am his local time, his WhatsApp gets a message: "⏰ Reminder: venue visit — today at 4:00pm." In-app notification also appears.
3. **Google user.** Anita signed in with Google. Treated identically to an email user — receives email notifications.
4. **Manual UI creation.** A user clicks "+ New Reminder" on the Reminders tab, fills in title/date/time/lead time, hits Create. Same downstream flow.
5. **Past lead time.** Sara creates a reminder at 9am for an event today at 11am, with a 24-hour lead time. The lead time is in the past. The system fires the notification immediately on next scheduler tick (within ≤5 min) and logs it as "fired late."
6. **User sees reminders list.** Reminders tab shows all upcoming reminders in chronological order, with title, date/time, lead time, channel that will be used, and a delete button. Past reminders are visually faded.
7. **User deletes a reminder.** Click delete → reminder is removed from Firestore → the scheduled notification will not fire.

---

## 5. Functional requirements

### 5.1 Reminder data model

New Firestore collection: `users/{uid}/reminders/{reminderId}`

```ts
interface Reminder {
  id: string                      // crypto.randomUUID()
  userId: string                  // owner
  title: string                   // required, max 200 chars
  description: string | null      // optional, max 2000 chars
  eventAt: Timestamp              // when the reminder is FOR (the event itself)
  eventDateStr: string            // "YYYY-MM-DD" — convenience for grouping/UI
  eventTimeStr: string | null     // "HH:mm" 24h, null = all-day
  leadTimeMinutes: number         // minutes before eventAt to send the notification (default 1440)
  notifyAt: Timestamp             // computed = eventAt - leadTimeMinutes (server-side)
  timezone: string                // IANA, e.g. "Asia/Kolkata" — captured from browser at create time
  channel: 'email' | 'whatsapp'   // resolved at create time from user's signup method
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  attemptCount: number            // 0 on create, increments on each send attempt
  lastError: string | null        // populated on failure
  sentAt: Timestamp | null        // set when delivered
  source: 'chat' | 'manual'       // chat = AI tool, manual = RemindersView UI
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Indexing:**
- Composite index: `(status ASC, notifyAt ASC)` — used by the scheduler to query pending reminders due to fire.
- Single-field: `eventAt DESC` — for the user's UI list.

**Firestore rules (user must add manually — orchestrator does not deploy):**
```
match /users/{uid}/reminders/{reminderId} {
  allow read, delete: if request.auth != null && request.auth.uid == uid;
  allow create: if request.auth != null && request.auth.uid == uid
                && request.resource.data.userId == uid
                && request.resource.data.status == 'pending'
                && request.resource.data.attemptCount == 0;
  allow update: if false;  // only the cloud function (admin SDK) updates
}
```

### 5.2 Reminder creation flows

**Flow A — Manual via RemindersView UI**
1. User clicks "+ New Reminder."
2. Dialog collects: title, date, optional time, optional description, **lead time selector** (preset chips: 1 hour, 6 hours, 24 hours, 2 days, 1 week + custom).
3. On submit, frontend calls new service `createReminder(userId, input)`.
4. Service computes `eventAt`, `notifyAt`, `channel`, captures `Intl.DateTimeFormat().resolvedOptions().timeZone`, writes the doc, returns it.
5. Toast: "Reminder set — we'll {email|WhatsApp} you {lead time} before."

**Flow B — Manual via TimelineView "+ New Event"**
- Identical to Flow A; the existing TimelineView "New Event" sub-form just calls `createReminder` instead of `addCalendarEvent`.

**Flow C — Chatbot (Planner mode)**
1. The AI tool currently named `createCalendarEvent` is renamed to `createReminder` in the backend tool definitions (see `easebot-backend/src/services/plannerTools.ts` and the tool schemas).
2. New tool signature:
   ```ts
   createReminder({
     title: string,
     date: "YYYY-MM-DD",
     time?: "HH:mm",
     description?: string,
     leadTimeMinutes?: number,  // default 1440 (24h)
   })
   ```
3. The AI is responsible for parsing natural-language lead times ("6 hours before", "a day in advance") into `leadTimeMinutes`. Prompt-side change in `prompts/planner.md` (or wherever Planner mode's system prompt lives) — add explicit instructions and few-shot examples for lead time extraction.
4. The tool handler writes the Firestore doc with `source: 'chat'` and returns the reminder id + a confirmation string the AI can echo back to the user.

### 5.3 Notification channel routing

Routing is determined at **reminder creation time** and frozen in the doc (so a user changing channels later doesn't break in-flight reminders).

```
Resolution function (runs at createReminder time):
  user = firebase.auth().currentUser
  primaryProvider = user.providerData[0]?.providerId

  if primaryProvider in {'password', 'google.com'}:
    channel = 'email'
    target  = user.email
  else if primaryProvider == 'phone' OR user.phoneNumber is set and email is empty:
    channel = 'whatsapp'
    target  = user.phoneNumber  (formatted via WhatsAppService.formatPhoneNumber)
  else:
    fallback: prefer email if present, else whatsapp

  if neither email nor phone is available:
    block creation, throw "We need an email or phone number on file to send reminders"
```

The resolved `target` is NOT stored on the reminder doc (PII minimization — fetched fresh at send time from the user profile). Only the `channel` is stored.

### 5.4 Scheduling & dispatch

**New Firebase scheduled function:** `dispatchPendingReminders`

- Runtime: Firebase Functions v2 `onSchedule('every 5 minutes')`
- Region: closest to user base (default `asia-south1` for India).
- Logic per tick:
  1. `now = serverTimestamp()`
  2. Query: `collectionGroup('reminders').where('status', '==', 'pending').where('notifyAt', '<=', now).limit(100)`
  3. For each reminder:
     - Read the user profile to get email + phone + name.
     - Build the notification payload (see §5.5).
     - Dispatch via the channel:
       - `email`: call new `sendEmailNotification` cloud function (see §6.2)
       - `whatsapp`: call existing `sendWhatsAppMessage` cloud function with the formatted phone number and message body.
     - Also write an `AppNotification` doc to `users/{uid}/notifications` with type `'reminder'`, title, body, `relatedId = reminderId`, `relatedType = 'reminder'`.
     - On success: update reminder `{ status: 'sent', sentAt: now, attemptCount: +1 }`.
     - On failure: update `{ status: attemptCount >= 3 ? 'failed' : 'pending', attemptCount: +1, lastError: err.message }`.
       - Failed sends after 3 attempts also write a `type: 'info'` AppNotification telling the user "We couldn't deliver your reminder for {title} — please check your contact info."
- 100-doc batch limit per tick; if more pending exist, the next tick handles them. Scale up if needed.
- Idempotency: the `status: 'pending'` guard plus the `attemptCount` ensures a reminder is never sent twice even if the function retries.

**Why Firebase scheduled functions, not backend cron:** the existing Express backend at `easebot-backend/` is not guaranteed always-on; Firebase scheduled functions are the right primitive for "must fire at exactly this minute" jobs in this stack. It also keeps the secret-bearing send logic (email API key, WhatsApp credentials) inside the privileged Firebase Functions environment, not exposed to the always-on backend.

### 5.5 Notification content

**Email template:**
- Subject: `⏰ Reminder: {title}`
- From: `WeddingEase <reminders@theweddingbot.ai>` (need to verify the domain in the email provider — see §6.2)
- Body (HTML + plain text fallback):
  ```
  Hi {name or 'there'},

  This is a reminder from WeddingEase.

  📌 {title}
  📅 {humanFormattedDate}    (e.g. "Friday, May 10, 2026 at 4:00 PM IST")
  {description if present}

  Open your planner: https://theweddingbot.ai/chat

  Need to reschedule? Just ask Easebot.

  — The WeddingEase team
  ```
- Plain-text version is required (some clients reject HTML-only).

**WhatsApp template:**
- WhatsApp Business API requires a **pre-approved HSM template** for outbound messages outside the 24-hour customer-care window. The reminder use case will almost always fall outside that window. **Action: register a template named `weddingease_reminder_v1` with this body:**
  ```
  ⏰ Reminder from WeddingEase

  {{1}}
  📅 {{2}}

  {{3}}

  Open your planner: theweddingbot.ai
  ```
  Variables: `{{1}} = title`, `{{2}} = humanFormattedDate`, `{{3}} = description or ""`. Submit for WhatsApp template approval BEFORE shipping (typical approval: 24–48 hours).
- Use the existing `sendWhatsAppMessage` callable. The template name and parameters need to be passed through; this likely requires extending the callable's API. **Open question:** does the current `sendWhatsAppMessage` support sending HSM templates, or only freeform messages? See §10.

**In-app notification:**
- Always created in `users/{uid}/notifications`.
- Title: `Reminder: {title}`
- Body: `{humanFormattedDate} — sent to your {email|WhatsApp}.`
- Type: `'reminder'`
- The body's "sent to your X" suffix is the explicit "show this in the notification too" requirement from the user.

### 5.6 RemindersView UI changes

- The Reminders tab continues to show all reminders sorted by `eventAt`.
- Each card shows: title, date/time (formatted in user's tz), lead-time chip ("24h before"), channel chip ("📧 email" or "💬 WhatsApp"), status badge ("Pending" / "Sent ✓" / "Failed"), delete button.
- Past reminders that have already fired are shown in a collapsed "Past reminders" section below.
- New empty state: "No reminders yet. Ask Easebot or click + New Reminder."
- Remove the Google-Calendar–specific "Connect Google Calendar" hint that exists today.

### 5.7 Edit / delete

- **Delete:** removes the Firestore doc. The scheduler will simply skip it on next tick. If a delete races with an in-flight send (very rare given 5-minute scheduler granularity), the send goes through but no second send is possible — acceptable.
- **Edit:** out of scope for v1. To "edit," delete and recreate.

### 5.8 Removal of Google Calendar code

Files/functions to delete or refactor:

| Path | Action |
|---|---|
| `Wedding-Ease-Viva-Chat/src/services/authService.ts:243` | Remove `provider.addScope('https://www.googleapis.com/auth/calendar')` |
| `Wedding-Ease-Viva-Chat/src/services/authService.ts:278` | Remove `googleCalendarToken` field from the new-user doc write |
| `Wedding-Ease-Viva-Chat/src/services/functionsService.ts` `addCalendarEvent` | Delete |
| `Wedding-Ease-Viva-Chat/src/contexts/AuthContext.tsx` `googleCalendarToken` | Delete the state, getter, and any dependent effects |
| `Wedding-Ease-Viva-Chat/src/hooks/useChat.ts` `fetchCalendarEvents`, `refetchCalendarEvents`, `calendarEvents` | Replace with `fetchReminders`, `refetchReminders`, `reminders` |
| `Wedding-Ease-Viva-Chat/src/components/RemindersView.tsx` | Rewrite create dialog to call `createReminder`. Drop `googleAccessToken` prop. Add lead-time selector. |
| `Wedding-Ease-Viva-Chat/src/components/TimelineView.tsx` | Same — "New Event" sub-form calls `createReminder`. Drop `googleAccessToken` prop. |
| `Wedding-Ease-Viva-Chat/src/pages/Index.tsx` | Drop all `googleCalendarToken` and `calendarEvents` plumbing; add `reminders` plumbing. |
| `easebot-backend/src/routes/calendar.ts` | Delete |
| `easebot-backend/src/services/calendarService.ts` | Delete |
| `easebot-backend/src/services/plannerTools.ts` (calendar tool) | Replace `createCalendarEvent` tool with `createReminder` tool (Firestore write via admin SDK). |
| Backend system prompts referencing Google Calendar | Update copy to reference "reminders" instead. |
| `Wedding-Ease-Viva-Chat/src/pages/PrivacyPolicy.tsx:129` | Remove the Google Calendar paragraph; replace with the new reminders/notifications language. |

---

## 6. Technical architecture

### 6.1 Sequence diagram (text)

```
Reminder creation (chat path):
  user → chat → backend pipeline → Planner mode LLM
    LLM picks tool: createReminder({title, date, time, leadTimeMinutes})
    backend tool handler → Firestore admin SDK → users/{uid}/reminders/{id}
      doc { status: 'pending', notifyAt: eventAt - leadTimeMinutes, ... }
    backend → user: "Got it, I'll remind you 6 hours before."

Reminder dispatch (every 5 minutes):
  Cloud Scheduler → dispatchPendingReminders cloud function
    query users/*/reminders where status=='pending' AND notifyAt<=now
    for each:
      load user profile
      if channel=='email':
        call sendEmailNotification(to=user.email, subject, body)
      else:
        call sendWhatsAppMessage(to=formatPhone(user.phoneNumber), template='weddingease_reminder_v1', vars=[...])
      write users/{uid}/notifications/{nid}
      update reminder { status:'sent', sentAt:now }
```

### 6.2 Email infrastructure (does not exist yet)

**Recommendation: Resend** (https://resend.com)
- Reasons: cleanest dev experience, generous free tier (3,000 emails/month free, then $20 for 50k), good React-Email templating story, simple HTTP API.
- Alternative considered: SendGrid (larger but more friction), Mailgun (more complex setup), Firebase Trigger Email Extension (couples to Firestore writes which adds latency and is harder to debug).

**Required setup (manual, by user — no auto-deploy):**
1. Create Resend account; verify `theweddingbot.ai` domain (DKIM + SPF records added to DNS).
2. Generate API key; store in Firebase Functions secrets: `firebase functions:secrets:set RESEND_API_KEY`.
3. Decide sender address: `reminders@theweddingbot.ai`.

**New Firebase callable function: `sendEmailNotification`**
- Input: `{ to: string, subject: string, html: string, text: string }`
- Implementation: thin wrapper around Resend SDK (`resend.emails.send(...)`).
- Auth: callable requires the caller to be the `dispatchPendingReminders` function (use Firebase Functions context auth or a shared internal token; safest is to NOT expose this callable to clients at all — make it an internal-only helper called from `dispatchPendingReminders` directly via shared module imports).

### 6.3 WhatsApp infrastructure (partially exists)

The frontend already has `WhatsAppService` calling `sendWhatsAppMessage`. The cloud function backing it is not in this repo (likely deployed manually). For reminders we need to confirm:

1. Does the existing cloud function support **template messages** (HSM), or only freeform 24-hour-window messages? If only freeform, we need to extend it to accept a `templateName` and `templateParams` argument.
2. Get the WhatsApp Business Account ID and template approval workflow set up. Submit `weddingease_reminder_v1` template for approval.
3. Confirm the WhatsApp number used is verified and in good standing.

**Cost note:** WhatsApp Business charges per "conversation" — for India, business-initiated messages are roughly ₹0.30–₹0.60 each. Budget accordingly.

### 6.4 Time-zone handling

- All `eventAt` and `notifyAt` are stored as UTC `Timestamp`s.
- `timezone` field on the reminder records the user's IANA zone at creation time (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
- Email/WhatsApp notification copy formats the date in the reminder's stored timezone, NOT the server's. Use `date-fns-tz` or `Intl.DateTimeFormat` with the stored timezone.
- The chat AI is told the user's current timezone via a system-prompt injection (already done elsewhere — confirm in `easebot-backend/src/prompts/`).

### 6.5 Lead-time parsing in the AI tool

Update Planner-mode system prompt with explicit lead-time extraction rules:

```
When creating a reminder, parse the user's preferred notification lead time:
- "remind me X hours before" → leadTimeMinutes = X * 60
- "remind me a day before" / "1 day before" → 1440
- "remind me a week before" → 10080
- "remind me 30 minutes before" → 30
- If no lead time is specified, default to 1440 (24 hours)
```

Add 3–5 few-shot examples in the prompt.

### 6.6 Firestore indexes to create

Add to `firestore.indexes.json` (user must deploy this, not me):
```json
{
  "indexes": [
    {
      "collectionGroup": "reminders",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "notifyAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "reminders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "eventAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 7. Migration plan

1. **Existing Google Calendar events stay where they are** (on Google's servers). We do NOT attempt to import them into the new reminders collection — they belong to the user's Google account and we're stepping out of that surface.
2. **Existing in-app `calendarEvents` state from `useChat`** is removed. There is no Firestore data to migrate (the events were always read live from Google's API).
3. **Communicate to existing beta users** (if any have already created Google Calendar reminders): one-time email/in-app banner: "Your reminders now live inside WeddingEase. Past Google Calendar events are still on your Google Calendar; new reminders will be sent via email/WhatsApp."

---

## 8. Edge cases

| Case | Behavior |
|---|---|
| User creates reminder with `notifyAt` already in the past | Scheduler picks it up on next tick (≤5 min) and fires immediately. |
| User creates reminder for an event that has already happened | Allowed but pointless; UI warns but doesn't block. |
| User has neither email nor phone | Block creation with a toast: "We need an email or phone on file to send reminders." Should be impossible if signup enforces one of the two. |
| User signs up with phone, later adds email in profile | Channel resolution at create time uses the rule in §5.3: phone primary → WhatsApp. Future feature: per-reminder channel override. |
| User changes their phone number after creating a reminder | Send time fetches the current phone from the user profile, so the latest number is used. |
| WhatsApp template not yet approved at launch time | `dispatchPendingReminders` falls back to email if user has email; if not, marks reminder as `failed` after 3 attempts and writes an in-app warning notification. |
| Email send fails (invalid address, bounce) | Mark as `failed` after 3 attempts, in-app notification "We couldn't reach you at {email}." |
| Two reminders with the same `notifyAt` | Both fire in the same tick. Independent. |
| User deletes a reminder while a scheduler tick is in flight | Worst case: notification still goes out once. Acceptable. |
| Daylight saving time crossings | `eventAt` is a UTC instant, so DST does not affect when the notification fires. The display string in the notification uses the stored timezone, so the user sees the local wall-clock time they originally set. |
| Free tier abuse (user creates 10,000 reminders) | v1 hard cap: max 100 active (`status: pending`) reminders per user, enforced in the create function. Reject with toast if over. |

---

## 9. Acceptance criteria

1. ☐ `auth/calendar` scope no longer requested at sign-in. Verified by reading `authService.ts` and by checking the Google consent screen on a fresh browser.
2. ☐ All Google Calendar code removed (see §5.8 file list). `grep -r "googleapis.com/auth/calendar\|addCalendarEvent\|calendarService\|googleCalendarToken"` returns zero hits.
3. ☐ A user signed in with email can create a reminder via the chatbot ("remind me to do X on date Y"), and an email arrives at the lead time before Y.
4. ☐ A user signed in via WhatsApp OTP can do the same and receive a WhatsApp message at the lead time.
5. ☐ Custom lead times in natural language ("6 hours before", "1 day before", "30 minutes before") are parsed correctly by the AI and reflected in the reminder doc's `leadTimeMinutes`.
6. ☐ Manual creation via the RemindersView "+ New Reminder" dialog works with the new lead-time selector.
7. ☐ Manual creation via the TimelineView "New Event" sub-form works.
8. ☐ The in-app NotificationPanel shows an entry for every fired reminder, with the channel suffix in the body ("sent to your email" / "sent to your WhatsApp").
9. ☐ Deleting a reminder before its `notifyAt` prevents the notification from firing.
10. ☐ A reminder whose `notifyAt` is in the past at creation time fires within ≤5 minutes.
11. ☐ The scheduler retries failed sends up to 3 times, then marks `status: 'failed'` and writes a user-visible warning in-app.
12. ☐ Firestore rules allow only the owner to read/create/delete their reminders, and only the admin SDK to update.
13. ☐ Privacy policy and terms updated to remove Google Calendar language and describe the new email/WhatsApp notification flow with retention and opt-out info.
14. ☐ Mobile-responsive UI (lead-time selector chips wrap correctly, dialog uses the project's `w-[calc(100%-2rem)] max-w-md` pattern).

---

## 10. Open questions

1. **WhatsApp callable capability** — does the existing `sendWhatsAppMessage` cloud function support HSM template sends, or only freeform messages? If only freeform, who owns extending it? (Answer needed before implementation kicks off.)
2. **Email provider lock-in** — is Resend OK, or does the team have an existing email vendor already in use? (Default: Resend.)
3. **Sender domain** — is `reminders@theweddingbot.ai` the right address, or should it be `noreply@`, `hello@`, or `support@`? (Default: `reminders@`.)
4. **Region for Cloud Scheduler / Functions** — `asia-south1` (Mumbai) is the obvious pick for India-first; confirm.
5. **WhatsApp template language** — English only, or also Hindi? (Templates are approved per language; submitting both doubles approval time.)
6. **Opt-out mechanism** — the email needs an unsubscribe link per CAN-SPAM / Indian DPDPA. Where does the unsubscribe link land? A simple page that toggles a `notificationsEnabled` flag on the user profile?
7. **Reminders that fall within the WhatsApp 24-hour customer-care window** — when the user is actively chatting with us we can send freeform messages without a template. Worth optimizing for, or just always use the template? (Default: always use the template, simpler.)

---

## 11. Out of scope (v1)

- Recurring reminders
- Editing an existing reminder
- Multiple lead times per reminder ("1 day before AND 1 hour before")
- Per-reminder channel override
- Push notifications (web push / FCM)
- SMS channel
- Calendar export (.ics file generation)
- Reminders shared with a partner / collaborator
- Snooze button in the email/WhatsApp message

---

## 12. Rollout plan

1. **Phase 0 — Prep (1–2 days, no code):**
   - Pick email provider (Resend or alternative). Verify domain. Generate API key.
   - Submit WhatsApp `weddingease_reminder_v1` template for approval.
   - Confirm WhatsApp callable supports HSM templates (or scope the work to extend it).

2. **Phase 1 — Backend (2–3 days):**
   - New `createReminder` admin-side helper (callable + AI tool).
   - New `dispatchPendingReminders` scheduled function (every 5 min).
   - New `sendEmailNotification` internal helper.
   - Extend (or wrap) `sendWhatsAppMessage` for template sends.
   - Firestore indexes added to `firestore.indexes.json`.
   - User deploys Cloud Functions and indexes manually (per the project's no-auto-deploy rule).

3. **Phase 2 — Frontend rewrite (1 day):**
   - Delete Google Calendar paths.
   - New `reminderService.ts` (createReminder, deleteReminder, subscribeToReminders).
   - Rewrite RemindersView dialog with lead-time selector.
   - Rewire TimelineView "New Event" sub-form.
   - Drop `auth/calendar` scope from `authService.ts`.

4. **Phase 3 — Internal QA (1 day):**
   - Smoke each of the 14 acceptance criteria.
   - Bug bash with the WeddingEase team using their own real accounts.

5. **Phase 4 — Beta release:**
   - Friends & family first.
   - Monitor `dispatchPendingReminders` logs daily for the first week.
   - Watch for failed sends and template rejection issues.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| WhatsApp template approval rejected or delayed | Phone users get no reminders | Email fallback if user has email; until template approved, gate phone-user reminders behind a "coming soon" message |
| Resend deliverability into Indian inboxes (Gmail/Yahoo) is poor | Emails land in spam | Verify domain DKIM/SPF/DMARC properly; warm up sending volume gradually |
| `dispatchPendingReminders` runs but Cloud Function execution time exceeds 5 minutes for 100 pending docs | Some reminders fire late | Keep batch size tight (100) and chunk the sends with `Promise.all` in groups of 10 |
| User changes timezone (travels) after creating reminder | Notification fires at the originally-stored UTC instant, which may surprise them | Document this clearly; v1 trades sophistication for simplicity |
| WhatsApp Business cost balloons at scale | Unexpected spend | Add a per-day per-user reminder cap (e.g. 20/day) at the create-side |
| Failed sends accumulate silently | Users miss reminders without knowing | The 3-strike `failed` status + in-app warning notification surfaces this |
