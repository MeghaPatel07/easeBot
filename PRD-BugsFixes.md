# PRD: Bugs & Feature Fixes — TheWeddingBot

**Version:** 1.0  
**Date:** 2025-04-17  
**Status:** Draft  
**Priority Legend:** P0 = Critical, P1 = High, P2 = Medium, P3 = Low

---

## Table of Contents

1. [Notes](#1-notes)
2. [Checklist](#2-checklist)
3. [Reminder](#3-reminder)
4. [General](#4-general)
5. [Chat](#5-chat)

---

## 1. Notes

### 1.1 Font Size & Font Color Options
**Priority:** P2  
**Bug:** Users cannot change font size in the notes editor. Font color is partially implemented (7 preset colors via Tiptap `Color` + `TextStyle` extensions) but has no font-size control.

**Current State:**
- Tiptap extensions `Color` and `TextStyle` are registered in `NoteEditor.tsx`
- `EditorBubbleMenu.tsx` has a color picker with 7 presets + custom hex input
- No font-size UI or Tiptap `FontSize` extension exists

**Implementation:**
1. Install/register a Tiptap `FontSize` extension (or use `TextStyle` with `fontSize` attribute)
2. Add a font-size dropdown to `EditorBubbleMenu.tsx` with presets: 12px, 14px, 16px, 18px, 20px, 24px, 28px, 32px
3. Wire the dropdown to `editor.chain().focus().setFontSize('18px').run()`
4. Ensure font-size persists in the JSON content and renders correctly in read-only/shared views

**Files:**
- `src/components/notes/NoteEditor.tsx` — register FontSize extension
- `src/components/notes/EditorBubbleMenu.tsx` — add font-size dropdown UI
- `package.json` — add `@tiptap/extension-font-size` if using official extension (or build custom via TextStyle)

**Acceptance Criteria:**
- [ ] User can select text and change font size from bubble menu
- [ ] Font size persists on save and reload
- [ ] Font size renders correctly in shared/public note views
- [ ] Existing font color picker remains functional

---

### 1.2 Mobile Image Resize Not Working
**Priority:** P1  
**Bug:** In mobile view, dragging image corners/sides to resize does not work. The custom `ResizableImageView` uses mouse events (`mousedown`, `mousemove`, `mouseup`) which don't fire on touch devices.

**Current State:**
- `ResizableImageView.tsx` implements resize handles with `onMouseDown` → `mousemove`/`mouseup` listeners on `document`
- No touch event equivalents (`touchstart`, `touchmove`, `touchend`) are registered

**Implementation:**
1. In `ResizableImageView.tsx`, add parallel touch event listeners alongside mouse events:
   - `onTouchStart` on resize handles → attach `touchmove` + `touchend` on `document`
   - Extract position from `e.touches[0].clientX/clientY` instead of `e.clientX/clientY`
2. Add `touch-action: none` CSS on resize handles to prevent browser scroll interference
3. Use a shared `onPointerDown`/`onPointerMove`/`onPointerUp` approach (Pointer Events API) as a cleaner alternative that handles both mouse and touch

**Files:**
- `src/components/notes/ResizableImageView.tsx` — add touch/pointer event handlers

**Acceptance Criteria:**
- [ ] User can drag image corners to resize on mobile (iOS Safari, Chrome Android)
- [ ] Resize handles are large enough for touch targets (min 44x44px tap area)
- [ ] Page does not scroll while resizing an image
- [ ] Desktop mouse resize continues to work

---

### 1.3 Shared Items Space ("Shared with Me")
**Priority:** P1  
**Bug:** Users who receive shared notes have no dedicated space to find them. The "Shared with Me" tab was commented out in the sidebar.

**Current State:**
- `subscribeToSharedNotes()` in `notesService.ts` queries Firestore with `array-contains` on `collaboratorEmails`
- The "Shared with Me" filter tab was recently uncommented in `NotesSidebar.tsx`
- Sharing info (owner email, collaborator list) was added to shared note items

**Remaining Work:**
1. Ensure email normalization: all emails stored in `collaboratorEmails` array must be lowercased and trimmed (backend `addCollaborator` already does this)
2. Add empty state for "Shared with Me" when no notes are shared
3. Show a badge/count on the "Shared with Me" tab when new shared notes arrive
4. On the shared note view, display: owner name/email, all collaborators, user's permission level

**Files:**
- `src/components/notes/NotesSidebar.tsx` — empty state, badge count
- `src/components/notes/NotesView.tsx` — sharing info banner (partially done)
- `src/services/notesService.ts` — ensure email normalization in subscribe query

**Acceptance Criteria:**
- [ ] "Shared with Me" tab is visible and functional
- [ ] Shared notes appear with owner email and collaborator names
- [ ] Empty state shows when no notes are shared with the user
- [ ] User sees their permission level (view/edit) on shared notes

---

### 1.4 Permission-Based Actions on Shared Notes
**Priority:** P1  
**Bug:** Users with "view" permission on a shared note can still see edit controls. Actions should be gated by the user's permission level.

**Current State:**
- `collaborators` array stores `{ userId, email, name, permission }` per collaborator
- `checkNoteAccess()` in backend returns `{ hasAccess, permission }`
- Frontend `NotesView.tsx` and `NoteEditor.tsx` do not check permission before showing edit UI

**Implementation:**
1. In `NotesView.tsx`, determine user's permission: if `note.ownerId === currentUser.uid` → "owner", else find matching collaborator entry
2. Pass `permission` to `NoteEditor.tsx` — if "view", set Tiptap `editable: false`
3. Hide edit-only controls (delete, move to folder, bubble menu) for "view" permission
4. Show a "View only" badge for view-permission users
5. Backend: validate permission on `updateNote`, `deleteNote` API calls

**Files:**
- `src/components/notes/NotesView.tsx` — compute and pass permission
- `src/components/notes/NoteEditor.tsx` — conditionally disable editing
- `src/components/notes/NoteHeader.tsx` — hide/disable actions by permission
- `easebot-backend/src/routes/notes.ts` — add permission validation middleware

**Acceptance Criteria:**
- [ ] "View" collaborators see read-only note with no edit controls
- [ ] "Edit" collaborators can edit content but cannot delete or change sharing settings
- [ ] Owner retains all controls
- [ ] Backend rejects unauthorized write/delete operations with 403

---

### 1.5 Unauthorized Access Alert
**Priority:** P2  
**Bug:** If a user opens a shared note link but their email is not in the collaborator list, they see a generic "not found" page. They should see a request-access prompt instead.

**Current State:**
- `SharedNote.tsx` fetches note by `shareId` via `getNoteByShareId()`
- If public access is disabled and user is not a collaborator, it shows "Note not found"

**Implementation:**
1. When access is denied, show a "Request Access" page instead of "Not Found":
   - Display the note title (if public metadata is available) or "Private Note"
   - Show message: "Your email (user@example.com) does not have access to this note"
   - Add a "Request Access" button that sends an email to the note owner
2. Backend: add `POST /api/notes/:noteId/request-access` endpoint that:
   - Validates the note exists
   - Sends email to note owner with requester's email
   - Stores request in a `noteAccessRequests` subcollection
3. Note owner sees pending requests in the share dialog

**Files:**
- `src/pages/SharedNote.tsx` — request-access UI
- `easebot-backend/src/routes/notes.ts` — new endpoint
- `easebot-backend/src/services/notesService.ts` — access request storage
- `easebot-backend/src/services/emailService.ts` — access request email template

**Acceptance Criteria:**
- [ ] Unauthorized user sees "Request Access" page with their email shown
- [ ] Clicking "Request Access" sends email to note owner
- [ ] Owner can see and act on access requests from the share dialog
- [ ] If public link is enabled, any user can view without requesting access

---

### 1.6 Replica of Google Docs
**Priority:** P3  
**Bug/Feature:** Users want a more docs-like editing experience — page-style layout, pagination, print formatting.

**Current State:**
- Tiptap editor with extensions: Bold, Italic, Underline, Strike, Heading, BulletList, OrderedList, TaskList, Blockquote, CodeBlock, Link, Color, TextStyle, Table, ResizableImage, Placeholder
- Free-form infinite canvas (no page boundaries)

**Implementation:**
1. Add a page-view wrapper around the Tiptap editor:
   - CSS container: `max-width: 816px` (8.5" at 96dpi), `min-height: 1056px` (11"), centered with shadow
   - White background with padding (1" margins = 96px)
2. Add print styles: `@media print` rules for clean page breaks
3. Optional: add ruler/margin controls, page break insertion

**Files:**
- `src/components/notes/NoteEditor.tsx` — page-style wrapper CSS
- `src/styles/` or inline — print media query styles

**Acceptance Criteria:**
- [ ] Editor renders with a page-like appearance (white page, shadow, max-width)
- [ ] Content prints cleanly with proper margins
- [ ] Mobile view remains full-width (responsive)

---

## 2. Checklist

### 2.1 Per-Checklist Context Menu (Copy & Delete)
**Priority:** P2  
**Bug:** No way to copy or delete an individual checklist from the listing. Users need a three-dot menu or right-click menu on each checklist card.

**Current State:**
- Checklist items are listed in `ChecklistView.tsx` / `ChecklistCard.tsx`
- Delete exists at the item level inside a checklist, but not at the checklist-level listing
- No copy (duplicate) functionality exists

**Implementation:**
1. Add a `MoreVertical` (three-dot) icon button on each checklist card in the listing view
2. On click, show a dropdown with two options:
   - **Copy**: duplicate the checklist document (new ID, same items/title, append " (Copy)" to name)
   - **Delete**: soft-delete or permanent-delete with confirmation dialog
3. Wire to backend/service:
   - Copy: `createChecklist()` with cloned data
   - Delete: `deleteChecklist()` — already exists

**Files:**
- `src/components/checklist/ChecklistCard.tsx` (or equivalent listing component) — add three-dot menu
- `src/services/checklistService.ts` — add `duplicateChecklist()` function

**Acceptance Criteria:**
- [ ] Three-dot icon appears on each checklist in the listing
- [ ] "Copy" creates a duplicate checklist with " (Copy)" suffix
- [ ] "Delete" shows confirmation dialog, then removes checklist
- [ ] Menu closes on outside click or selection

---

### 2.2 Fix "Free Plan" Text for Pro Users
**Priority:** P1  
**Bug:** Pro users see "Free plan limited to 5 checklists. Upgrade to add more." The tier check uses a boolean `isPremium` flag that may not correctly reflect the user's subscription tier.

**Current State:**
- Tier gating logic likely uses `isPremium` boolean instead of checking actual tier from `userProfile.tier` or subscription status
- The message text hardcodes "Free plan"

**Implementation:**
1. Replace `isPremium` boolean check with proper tier lookup from user profile/subscription
2. Use tier config to determine checklist limits per tier:
   - Free: 5 checklists
   - Pro: unlimited (or higher limit)
   - Premium: unlimited
3. Fix the message to reference the actual plan name: `"{planName} plan limited to {limit} checklists"`
4. Don't show the upgrade message at all for Pro/Premium users

**Files:**
- `src/components/checklist/` — find component showing the limit message
- `src/hooks/` or `src/contexts/` — tier/subscription context
- `src/config/tiers.ts` (if exists) — checklist limits per tier

**Acceptance Criteria:**
- [ ] Pro users never see "Free plan" text
- [ ] Free users see accurate limit message with their plan name
- [ ] Checklist creation is actually blocked at the limit for free users
- [ ] Pro/Premium users can create unlimited checklists

---

### 2.3 Drag-and-Drop Item Reorder
**Priority:** P3  
**Bug:** Users want to reorder checklist items via drag and drop.

**Current State:**
- Drag-and-drop is already implemented for checklist items using `@dnd-kit` library
- `SortableContext` and `useSortable` hooks are in use
- `DndContext` with sensors and collision detection is configured

**Implementation:**
- **Verify existing implementation works on mobile** (touch sensors)
- If not working on mobile, ensure `TouchSensor` is included in `useSensors()` config
- No new development needed if working correctly on both desktop and mobile

**Files:**
- `src/components/checklist/` — verify DndContext and SortableContext usage

**Acceptance Criteria:**
- [ ] Items can be reordered via drag on desktop
- [ ] Items can be reordered via long-press drag on mobile
- [ ] New order persists to Firestore

---

## 3. Reminder

### 3.1 Edit Reminder
**Priority:** P2  
**Bug:** Users cannot edit an existing reminder's details (date, time, message) after creation.

**Current State:**
- Edit functionality exists for pending reminders (status-based check)
- The UI may not expose the edit button or the edit flow may be incomplete

**Implementation:**
1. Verify the edit button is visible for reminders with `status === 'pending'`
2. On edit click, open the reminder creation form pre-filled with existing values
3. On save, call `updateReminder(reminderId, updates)` — update the document and reschedule the notification
4. If the reminder time is changed, cancel the old scheduled job and create a new one

**Files:**
- `src/components/reminder/` — edit UI flow
- `src/services/reminderService.ts` — `updateReminder()`
- `easebot-backend/src/services/reminderService.ts` — reschedule logic

**Acceptance Criteria:**
- [ ] "Edit" option is visible on pending reminders
- [ ] Edit form pre-fills with existing reminder data
- [ ] Changing date/time reschedules the reminder notification
- [ ] Completed/sent reminders cannot be edited

---

### 3.2 Cancel Scheduled Reminder on Delete
**Priority:** P1  
**Bug:** When a user deletes a reminder, the scheduled email/notification still fires on the original date.

**Current State:**
- Deleting a reminder removes the Firestore document
- The scheduled job (cron/cloud function) may still trigger if it reads from a separate queue or was already dispatched

**Implementation:**
1. When deleting a reminder, also cancel any scheduled notification:
   - If using Cloud Functions scheduled triggers: the trigger should check if the document still exists before sending
   - If using a job queue: remove the job from the queue on delete
2. Safest approach: in the notification sender, always re-read the reminder document and skip if `deleted` or missing
3. Add a `status: 'cancelled'` state that the sender checks

**Files:**
- `easebot-backend/src/services/reminderService.ts` — delete handler, add cancellation
- Cloud Functions or scheduler config — add existence check before sending

**Acceptance Criteria:**
- [ ] Deleted reminder does not send a notification on its scheduled date
- [ ] Cancelled reminders show as "Cancelled" in any history view
- [ ] No orphaned scheduled jobs remain after deletion

---

## 4. General

### 4.1 Firebase Storage Cleanup on Delete
**Priority:** P1  
**Bug:** When notes or chat messages containing images are deleted, the images remain in Firebase Storage, wasting storage quota.

**Current State:**
- `deleteNote()` in frontend `notesService.ts` calls `deleteStorageFolder('notes/{noteId}/images')` — this handles note images
- `permanentDeleteNote()` also cleans up storage
- Chat image deletion does NOT clean up Storage — images in `chat-images/` or `image-generations/` persist

**Implementation:**
1. **Chat images**: when a chat message with an image is deleted, extract image URLs from the message and delete from Storage
2. **Bulk cleanup**: add a Cloud Function or backend cron that periodically scans for orphaned images (images in Storage not referenced by any Firestore document)
3. **Image gallery**: when removing an image from the gallery, also delete from Storage

**Files:**
- `easebot-backend/src/services/chatService.ts` or equivalent — add image cleanup on message delete
- `easebot-backend/src/services/imageService.ts` — add `deleteGeneratedImage()` function
- `Wedding-Ease-Viva-Chat/src/services/notesService.ts` — already handles note images (verify)

**Acceptance Criteria:**
- [ ] Deleting a note removes its images from Firebase Storage
- [ ] Deleting a chat message with images removes those images from Storage
- [ ] Deleting a generated image from gallery removes it from Storage
- [ ] Storage usage does not grow unbounded from deleted content

---

### 4.2 Mobile Email Sending Not Working
**Priority:** P1  
**Bug:** Email sending (note sharing invites, collaborator invites) fails on mobile views.

**Current State:**
- Email is sent via backend `emailService.ts` using SendGrid/SMTP
- The issue is likely in the frontend: mobile share dialog may not call the send-invite API, or the API call fails silently on mobile

**Implementation:**
1. Debug the mobile share flow:
   - Check if the "Send Invite" button triggers the API call on mobile
   - Check for responsive layout issues hiding or disabling the send button
   - Check network tab for failed API calls
2. Common mobile issues:
   - Touch event not firing (use `onClick` not `onMouseDown`)
   - Dialog/modal z-index conflicts on mobile
   - API URL misconfigured for mobile (unlikely if same origin)
3. Test on both iOS Safari and Chrome Android

**Files:**
- `src/components/notes/ShareDialog.tsx` or equivalent — mobile button visibility/click handler
- `src/components/notes/NotesSidebar.tsx` — mobile share flow entry point

**Acceptance Criteria:**
- [ ] Sharing invites send successfully from mobile browsers
- [ ] User sees success/error toast after sending
- [ ] Works on iOS Safari and Chrome Android

---

### 4.3 Remove Deactivate/Delete Account Option
**Priority:** P2  
**Bug:** The deactivate/delete account options should be removed from the UI.

**Current State:**
- Backend has delete account API endpoint
- UI likely has these options in account settings/profile page

**Implementation:**
1. Remove the "Deactivate Account" and "Delete Account" buttons/sections from the settings UI
2. Keep the backend endpoints but do not expose them in the UI (may be needed for admin)
3. Remove any related confirmation dialogs

**Files:**
- `src/components/settings/` or `src/pages/Settings.tsx` — remove deactivate/delete UI
- `src/components/profile/` — check for account deletion options

**Acceptance Criteria:**
- [ ] No "Deactivate" or "Delete Account" option visible in the UI
- [ ] Backend endpoints remain but are not called from frontend

---

### 4.4 Rebrand to TheWeddingBot
**Priority:** P1  
**Bug:** App still shows "Easebot", "WeddingEase", or "Viva" in various places. Brand name is "TheWeddingBot".

**Current State:**
- "easebot" appears in localStorage keys
- Minimal brand text references in the UI (mostly in page titles, meta tags, login page)
- `index.html` has the app title

**Implementation:**
1. Search all frontend files for: `Easebot`, `easebot`, `WeddingEase`, `Wedding Ease`, `Viva`, `Wedding-Ease-Viva`
2. Replace user-visible text with "TheWeddingBot"
3. Update:
   - `index.html` `<title>` tag
   - Any login/landing page branding
   - Meta tags (og:title, description)
   - PWA manifest `name` and `short_name`
4. Do NOT rename localStorage keys (would break existing users) — only change display text

**Files:**
- `index.html` — title, meta tags
- `src/pages/Login.tsx` or equivalent — branding text
- `public/manifest.json` — PWA name
- Global search for brand strings across `src/`

**Acceptance Criteria:**
- [ ] No user-visible text shows "Easebot", "WeddingEase", or "Viva"
- [ ] Page title reads "TheWeddingBot"
- [ ] PWA install shows "TheWeddingBot"
- [ ] localStorage keys remain unchanged (backward compatibility)

---

### 4.5 Change Favicon
**Priority:** P2  
**Bug:** Favicon needs to be updated to TheWeddingBot brand icon.

**Current State:**
- Favicon is in `public/images/logo.png` or referenced in `index.html`

**Implementation:**
1. Replace `public/images/logo.png` with new TheWeddingBot favicon
2. Also update `public/apple-touch-icon.png` and any PWA icons in `public/manifest.json`
3. Ensure multiple sizes: 16x16, 32x32, 180x180 (apple-touch), 192x192 and 512x512 (PWA)

**Files:**
- `public/images/logo.png` — replace
- `public/` — apple-touch-icon, PWA icons
- `public/manifest.json` — icon references
- `index.html` — favicon link tag

**Acceptance Criteria:**
- [ ] New favicon displays in browser tab
- [ ] Apple touch icon is updated
- [ ] PWA icons are updated
- [ ] No broken icon references

**Note:** Requires the new favicon asset from the design team.

---

### 4.6 Replace #D8D8D8 with White
**Priority:** P3  
**Bug:** The color `#D8D8D8` (light gray) should be replaced with white throughout the app.

**Current State:**
- `#D8D8D8` was not found in a codebase search. It may be:
  - Rendered by a UI library or Tailwind utility class (e.g., `text-gray-300`, `border-gray-300`)
  - Applied via inline styles in a specific component
  - Coming from a CSS variable or theme config

**Implementation:**
1. Identify where the gray color appears — get specific screenshots from user
2. Search for near-match hex values: `#d8d8d8`, `#D8D8D8`, `rgb(216,216,216)`, Tailwind gray classes
3. Replace with `#FFFFFF` or `text-white` / `bg-white` as appropriate
4. Verify contrast ratios remain accessible (white text on dark backgrounds is fine; white on light backgrounds needs adjustment)

**Files:**
- TBD — requires identification of specific components showing this color

**Acceptance Criteria:**
- [ ] No `#D8D8D8` gray appears in the UI
- [ ] Replacement white color maintains readable contrast
- [ ] User confirms the specific locations are fixed

---

## 5. Chat

### 5.1 Mobile Font Size +2px
**Priority:** P2  
**Bug:** Chat text is too small on mobile. Increase by 2px.

**Current State:**
- AI messages use `text-[15px] sm:text-[13px]` — 15px on mobile, 13px on desktop
- User messages likely use similar sizing

**Implementation:**
1. Change AI message text from `text-[15px]` to `text-[17px]` on mobile breakpoint
2. Change user message text similarly (+2px on mobile)
3. Verify line-height and spacing remain proportional

**Files:**
- `src/components/chat/ChatMessages.tsx` — message text size classes
- `src/components/chat/` — any sub-components rendering message text

**Acceptance Criteria:**
- [ ] Mobile chat text is 2px larger than current
- [ ] Desktop text size remains unchanged
- [ ] Layout does not break with larger text
- [ ] Both AI and user messages are updated

---

### 5.2 Lock Input During Voice Recording
**Priority:** P2  
**Bug:** Users can type in the chat input while voice recording is active, causing confusion.

**Current State:**
- Voice recording already disables/locks the textarea during recording
- The lock may not cover the full flow: recording → transcription → text population

**Implementation:**
1. Verify the textarea is disabled during:
   - Active recording (microphone on)
   - Transcription processing (after recording stops, before text appears)
2. If not fully locked, add a `isProcessingAudio` state that stays true until transcription completes
3. Show a visual indicator (pulsing mic icon, "Transcribing..." placeholder)

**Files:**
- `src/components/chat/ChatInput.tsx` — input disable state
- `src/hooks/useVoiceRecording.ts` or equivalent — recording + transcription state

**Acceptance Criteria:**
- [ ] Textarea is not editable during recording
- [ ] Textarea is not editable during transcription
- [ ] Clear visual indicator shows recording/transcription is in progress
- [ ] Input unlocks immediately when transcription completes

---

### 5.3 Stop Image Generation — Frontend Message
**Priority:** P1  
**Bug:** When user stops a generative response during image generation, the response should show "The response was interrupted" and store that in Firebase.

**Current State:**
- `stopGeneration()` aborts the client-side stream
- The interrupted message is not saved to Firestore — the partial response or nothing is stored

**Implementation:**
1. In the stop handler, when generation is aborted:
   - Set the AI message content to the current partial text + `"\n\n*The response was interrupted*"`
   - If no text was generated yet, set content to `"The response was interrupted"`
2. Save this message to Firestore with a flag: `interrupted: true`
3. Display interrupted messages with a visual indicator (e.g., italic text, warning icon)

**Files:**
- `src/hooks/useChat.ts` — stop handler, message save logic
- `src/components/chat/ChatMessages.tsx` — render interrupted indicator
- Firestore message schema — add `interrupted` boolean field

**Acceptance Criteria:**
- [ ] Stopped responses show "The response was interrupted"
- [ ] Interrupted message is saved to Firebase
- [ ] On reload, interrupted messages display correctly
- [ ] Partial text before interruption is preserved

---

### 5.4 Stop Image Generation — Backend Pipeline Cancellation
**Priority:** P1  
**Bug:** When user stops image generation, the backend Azure pipeline continues generating the image. The image still appears in the image gallery despite the user stopping it.

**Current State:**
- Frontend `stopGeneration()` aborts the fetch/stream
- Backend does not know the client disconnected — it continues the Azure image generation call
- Generated image is saved to Firebase Storage and gallery regardless

**Implementation:**
1. **Detect client disconnect on backend:**
   - Listen for `req.on('close', ...)` in the streaming endpoint
   - Set an `aborted` flag when the client disconnects
2. **Cancel Azure image generation:**
   - If using Azure OpenAI DALL-E: the API call cannot be cancelled mid-flight, but we can skip saving the result
   - After the Azure call returns, check `aborted` flag — if true, do NOT save image to Storage or Firestore
3. **Cleanup on abort:**
   - If image was already uploaded to Storage before abort detected, delete it
   - Do not add the image to the gallery collection
4. **Signal via SSE:** send an `interrupted` event type so frontend knows backend acknowledged the stop

**Files:**
- `easebot-backend/src/controllers/chatController.ts` — add `req.on('close')` handler
- `easebot-backend/src/services/imageService.ts` — add abort check before saving
- `easebot-backend/src/services/azureImageService.ts` (or equivalent) — abort-aware generation

**Acceptance Criteria:**
- [ ] Stopping generation prevents image from appearing in gallery
- [ ] Backend detects client disconnect and skips image save
- [ ] Any partially uploaded images are cleaned up
- [ ] Non-interrupted image generation continues to work normally
- [ ] No orphaned images in Firebase Storage from interrupted generations

---

## Implementation Priority Order

| Phase | Items | Rationale |
|-------|-------|-----------|
| **Phase 1** (P0-P1) | 1.2, 1.3, 1.4, 2.2, 3.2, 4.1, 4.2, 4.4, 5.3, 5.4 | Broken features, data integrity, brand compliance |
| **Phase 2** (P2) | 1.1, 1.5, 2.1, 3.1, 4.3, 4.5, 5.1, 5.2 | UX improvements, missing features |
| **Phase 3** (P3) | 1.6, 2.3, 4.6 | Polish, nice-to-haves, already partially done |

---

## Dependencies & Prerequisites

- **4.5 (Favicon):** Requires new favicon assets from design team
- **4.6 (#D8D8D8):** Requires user to identify specific UI locations showing this color
- **1.6 (Docs replica):** Scope needs user sign-off — could be minimal (page layout) or extensive (pagination, headers/footers)
- **5.4 (Backend cancellation):** Requires understanding of current Azure image generation pipeline and whether it supports cancellation
