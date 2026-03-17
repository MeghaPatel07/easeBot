# WeddingEase — UX & Product Improvement PRD

**Version:** 1.0
**Date:** 2026-03-17
**Scope:** Frontend (Wedding-Ease-Viva-Chat) + Backend (easebot-backend)
**Priority tiers:** P0 = blocking / P1 = high / P2 = medium / P3 = nice-to-have

---

## 1. Layout & Responsiveness

### 1.1 Viewport overflow — "Contact Support" button hidden (P1)
**Problem:** When the browser is not fully maximised, the "Contact Support" button in the bottom-left of the sidebar clips below the visible viewport. Only the "Sign In" button remains visible.
**Root cause:** Sidebar uses fixed height without accounting for smaller viewports. Bottom elements are positioned without a scroll-safe container.
**Acceptance criteria:**
- All sidebar content is reachable at any viewport height ≥ 500 px.
- Bottom-pinned buttons (Contact Support, Sign In) remain visible; if vertical space is insufficient they scroll into view within the sidebar scroll container.
- No content is permanently hidden at any standard browser zoom level (80–150 %).

**Implementation notes:**
- Sidebar inner container: `flex flex-col h-full overflow-y-auto`
- Pinned footer area: `mt-auto flex-shrink-0` at the bottom of the flex column.
- Replace fixed pixel heights with `min-h-0` flex children so the scrollable section shrinks correctly.

---

### 1.2 Input bar vertical misalignment (P1)
**Problem:** The text input (`<textarea>`) sits slightly higher than the mic, mode, and send buttons beside it.
**Root cause:** `items-end` on the flex row but the textarea has extra top padding or a differing box model.
**Acceptance criteria:**
- All elements in the input bar row are visually centred on the same baseline.
- Alignment holds when the textarea auto-expands to multiple lines.

**Implementation notes:**
- Ensure the flex row uses `items-end` and the textarea's `min-height` and `py` values match the button heights (all `h-11`).
- Remove any conflicting `top-*` or `mt-*` on the textarea wrapper.

---

## 2. Authentication Flow

### 2.1 Google OAuth 403 error (P0)
**Problem:** Clicking "Continue with Google" on both Sign-In and Sign-Up returns a 403 — "Access blocked: weddingdc99a.firebaseapp.com has not completed the Google verification process."
**Root cause:** The Firebase OAuth consent screen is in **Testing** mode and/or the authorised domain list does not include the production domain. The displayed app name (`weddingdc99a.firebaseapp.com`) is the raw Firebase project ID, not the product name.
**Acceptance criteria:**
- Google OAuth completes successfully for any tester email without a 403.
- Consent screen displays **"WeddingEase"** (or the final product name) as the app name, with the correct logo and privacy-policy URL.
- All authorised redirect/origin domains are added in Firebase Console → Authentication → Settings.

**Implementation notes:**
- Firebase Console → Authentication → Sign-in method → Google → edit consent screen.
- Add tester emails in Google Cloud Console → OAuth consent screen → Test users (if staying in Testing mode).
- To move to Production mode: complete the Google verification form (required for apps requesting sensitive scopes).
- Update `VITE_APP_NAME` env variable; render it on the consent screen via Firebase project settings.

---

### 2.2 "Sign In with no account" should redirect to Sign Up (P1)
**Problem:** If a user enters credentials for a non-existent account in the Sign In modal, they receive an error. Standard platform UX redirects them to Sign Up automatically.
**Acceptance criteria:**
- If Firebase returns `auth/user-not-found` or `auth/invalid-credential`, the Sign In modal automatically switches to the Sign Up view and pre-fills the email field.
- The transition is animated and accompanied by a brief message: *"No account found for that email — let's create one."*
- The reverse (Sign Up with existing email) switches to Sign In with the message: *"An account already exists for this email — sign in instead."*

**Implementation notes:**
- In `SignInModal.tsx` catch block: on `auth/user-not-found` or `auth/invalid-credential`, call `onSwitchToSignUp()` and pass the email via a prop or shared state.
- Mirror logic in `SignUpModal.tsx` for `auth/email-already-in-use`.

---

## 3. Left Sidebar & Navigation

### 3.1 All sidebar sub-items are non-functional (P0)
**Problem:** Liked Messages, Upcoming Reminders, Saved Items, Moodboard, Checklist, Shopping Lists, Budgets buttons do nothing when clicked.
**Acceptance criteria:**
- Each item opens its respective view in the **main content area** (not stacked inside the sidebar).
- Views that have no data show a meaningful empty state with a prompt to create content.
- Views that are not yet built show a "Coming soon" placeholder — they must not silently fail.

**Implementation notes:**

| Sidebar item | Target behaviour |
|---|---|
| Liked Messages | Already implemented — `setSidebarView('liked')` works |
| Upcoming & Reminders | Already implemented — `setSidebarView('reminders')` works |
| My Planner | Already implemented — `setSidebarView('planner')` works |
| Saved Items | Main area panel: list of bookmarked AI messages |
| Moodboard | Main area panel: grid of saved image URLs |
| Checklist | Alias for My Planner (or Coming Soon) |
| Shopping Lists | Coming Soon panel |
| Budgets | Coming Soon panel |

---

### 3.2 Sub-item views open inside sidebar dropdown instead of main content area (P1)
**Problem:** Clicking "Upcoming Reminders" while the Assets dropdown is open renders the view stacked below the dropdown *inside* the sidebar — cramped and unusable.
**Root cause:** The sidebar renders the sub-views inline within the same flex column as the collapsible.
**Acceptance criteria:**
- Clicking any sidebar sub-item closes the Assets dropdown and transitions the **main content area** to the selected view.
- The sidebar retains its normal list state; the selected item is highlighted.
- Navigating back (via Back button or New Chat) returns to the standard chat view.

**Implementation notes:**
- Extend `sidebarView` state to cover all sub-items.
- Move all sub-view rendering from inside `sidebarJSX` into the main content render logic (alongside the existing `planner` and `reminders` branches).
- Auto-close `isAssetsOpen` when a sub-item is selected.

---

## 4. Chat Response Quality & Streaming

### 4.1 Token-by-token streaming (P0)
**Status:** Implemented in the current sprint (SSE `/api/chat/stream` + `streamChatMessage` hook).
**Acceptance criteria:**
- First token appears within 800 ms of the user pressing Send (P99 on localhost).
- Text renders progressively, character by character, without layout jumps.
- Stop generation button halts streaming immediately and marks the message as complete with whatever text was received.
- Streaming works on all modes: Auto, Planner, Stylist, Therapist, Knowledge, Consultant.

---

### 4.2 Responses cut off mid-sentence (P1)
**Problem:** Some AI responses end abruptly before completing the thought.
**Root cause:** `max_tokens: 800` in `azureAI.ts` is too low for long responses.
**Acceptance criteria:**
- Standard responses never truncate mid-sentence.
- Long responses (timelines, checklists, detailed advice) complete fully.

**Implementation notes:**
- Increase `max_tokens` from `800` → `2000` in both `callAzureAI` and all streaming variants.
- Add `finish_reason` check in the streaming loop; if `finish_reason === 'length'`, append a continuation prompt automatically (or warn the user).

---

## 5. Persona & Agent System

### 5.1 Persona colour palette clashes with overall theme (P1)
**Problem:** Persona badges and mode buttons introduce bright purples, ambers, and greens that conflict with the app's core green/black/white scheme.
**Acceptance criteria:**
- All persona colours are derived from a single design token system.
- Core brand palette: `#a2b29d` (sage green), `#c4866e` (terracotta), off-white, near-black.
- Each persona has a tonal variant of the core palette, not a completely different hue.
- No mode button introduces a colour not present in the design token file.

**Design token proposal:**

| Persona | Background | Text | Border |
|---|---|---|---|
| Auto | `#f5f5f3` | `#3d3d3a` | `#ddddd8` |
| Planner | `#e8ede6` | `#3a5c35` | `#b8cdb4` |
| Stylist | `#f5ede9` | `#8c4a30` | `#d9b0a0` |
| Therapist | `#edeaf5` | `#4a3a7a` | `#b8add9` |
| Knowledge | `#f5f0e6` | `#7a5c1e` | `#d9c899` |
| Consultant | `#e6f0ee` | `#1e5c4a` | `#99ccc0` |

---

### 5.2 Active persona/agent name not shown in response (P1)
**Problem:** Chat responses do not indicate which persona answered. Users cannot tell if they are talking to the Stylist, Therapist, etc.
**Acceptance criteria:**
- Every AI message shows a small pill/badge with the persona name and icon above or beside the message bubble.
- In Auto mode, the detected mode is shown (e.g. "Auto → Planner").
- Persona label uses the colour of that persona from the design token system.

**Implementation notes:**
- `Message` already carries a `mode` field — render it as a badge above the message text.
- Reuse `modeConfig(mode)` to get the label, icon, and pill class.

---

### 5.3 Each persona needs real tools & capabilities (P2)
**Problem:** All personas currently perform only text retrieval. The product vision is for each persona to have distinct skills.
**Acceptance criteria (per persona):**

| Persona | Minimum viable tools |
|---|---|
| Planner | ✅ Already has: create_checklist, save_reminder, mark_as_done |
| Stylist | Web search (vendor lookup), image generation, product card rendering |
| Therapist | Mood journaling (save to Firestore), resource links, guided breathing prompts |
| Knowledge | Web search, citation rendering, FAQ surfacing |
| Consultant | Budget calculator tool, vendor comparison table, cost breakdown save-to-planner |
| Auto | Delegates to correct persona |

**Implementation notes:**
- Add `STYLIST_TOOLS`, `CONSULTANT_TOOLS` in `easebot-backend/src/services/`.
- Wire tools into `buildSystemPrompt` + `handleChatStream` tool-call loop (same pattern as `PLANNER_TOOLS`).
- Each tool call should return a `toolAction` the frontend can render as a rich card.

---

## 6. Standard Chat UX

### 6.1 Copy button — no visual confirmation (P1)
**Problem:** Clicking the copy icon gives no feedback; users don't know if it worked.
**Acceptance criteria:**
- Icon changes to a checkmark for 1.5 s, then reverts.
- Optionally: a small "Copied" tooltip appears near the button.

**Implementation notes:**
- Track `copiedId` state per message. On click: set `copiedId = msg.id`, call `navigator.clipboard.writeText(...)`, clear after 1500 ms.
- Render `<Check>` icon when `copiedId === msg.id`, otherwise `<Copy>`.

---

### 6.2 Remove "Edit and Regenerate" text label (P1)
**Problem:** The edit button shows both a pencil icon and the label "Edit and Regenerate" — verbose and inconsistent with industry patterns.
**Acceptance criteria:**
- Only the pencil icon is shown. Label removed.
- Tooltip `title="Edit & resend"` on hover for accessibility.

---

### 6.3 Full chat UX audit — baseline parity with ChatGPT/Claude (P1)
The following standard patterns must be implemented:

| Feature | Status | Action |
|---|---|---|
| Token streaming | ✅ Done | — |
| Stop generation | ✅ Done | — |
| Copy with confirmation | ❌ | See §6.1 |
| Edit & resend | ✅ Done (icon only, label fix needed) | See §6.2 |
| Message timestamps | ❌ | Show on hover below each message |
| Keyboard shortcut: `Enter` to send | ✅ Done | — |
| Keyboard shortcut: `Shift+Enter` for newline | ✅ Done | — |
| Auto-scroll to latest message | ✅ Done | — |
| Scroll-to-bottom FAB when scrolled up | ❌ | Show ↓ button when not at bottom |
| Rate limit UX | ❌ | Show banner + upgrade CTA when 429 received |
| Empty state prompt suggestions | ✅ Done | — |
| Regenerate last response | ✅ Done | — |
| Liked messages persistence | ✅ Done | — |

---

### 6.4 Rate-limit experience (P2)
**Problem:** No defined UX for when Azure OpenAI returns 429 (rate limit) or when the user has exhausted a free-tier allowance.
**Acceptance criteria:**
- On 429 from the backend, the chat displays: *"Viva is taking a short break — try again in a moment."* with a countdown timer if `Retry-After` header is present.
- Free-tier users who have sent N messages see a soft prompt: *"You've used X of Y free messages. Sign up for unlimited access."*
- Premium users never see the soft prompt.

---

## 7. Voice Input & Speech-to-Text

### 7.1 Mic icon change is confusing (P1)
**Problem:** Clicking "Record voice message" immediately shows a mute icon (`MicOff`), which implies the mic is disabled, not recording.
**Acceptance criteria:**
- While recording: show an animated pulsing microphone icon (not `MicOff`).
- The stop action uses a square stop icon `■` or `StopCircle`, not `MicOff`.
- A visible "Recording..." label and a duration counter (0:00 → 0:XX) appear below the button.

---

### 7.2 Replace live word-by-word transcription with single-pass Whisper (P1)
**Problem:** The current Azure Speech SDK streams partial results word-by-word, which is noisier and less accurate than a single full-audio transcription pass.
**Acceptance criteria:**
- Record audio silently (no interim text shown).
- Input area shows a waveform animation while recording.
- On stop: upload the complete audio clip to `/api/transcribe` (Whisper).
- A progress indicator shows during transcription processing.
- Final transcribed text appears in the input box in one pass — no incremental updates.
- Transcription accuracy is visibly better than the interim streaming approach.

**Implementation notes:**
- Use `MediaRecorder` API to capture audio as a blob.
- On stop, encode blob to base64 and call the existing `/api/transcribe` endpoint.
- Remove the Azure Speech SDK `recognizing` event handler (interim results).
- Keep only the `recognized` final handler, or replace entirely with the blob approach.
- Voice language detection still applies: the backend returns `detectedLanguage`.

**New `useVoice` flow:**
```
click mic → start MediaRecorder → show waveform animation
click stop → stop MediaRecorder → collect audio blob
→ POST /api/transcribe (base64) → show spinner
→ receive { text, detectedLanguage } → fill input box
```

---

### 7.3 Multi-language voice support (P2)
**Problem:** Voice input language is not always correctly detected or handled.
**Acceptance criteria:**
- Whisper auto-detects language from audio — no manual language selection required for voice.
- `detectedLanguage` from transcription is passed to `sendMessage` so the AI responds in the same language.
- Works for at least: English, Hindi, Gujarati, Spanish, French, Arabic.

---

## 8. Design System (cross-cutting)

### 8.1 Establish a design token file (P1)
Create `/Wedding-Ease-Viva-Chat/src/styles/tokens.ts` exporting:
- Color palette (brand, persona variants, semantic: success/warning/error/info)
- Typography scale (font sizes, weights, line heights)
- Spacing scale
- Border radius scale
- Shadow levels
- Animation durations

All Tailwind class strings for persona colours, button styles, and card styles should reference these tokens rather than being hardcoded per component.

### 8.2 Component audit (P2)
Audit and standardise the following components against the design system:
- `InputBar` — alignment, border, focus ring
- Message bubble — padding, border radius, max-width
- Sidebar item — hover/active states
- Modal — backdrop, animation, close button placement
- Persona badge/pill — consistent across all modes
- Button variants — primary, secondary, ghost, destructive

---

## 9. Prioritised Delivery Order

| Sprint | Items |
|---|---|
| S1 (Now) | §4.1 Streaming ✅, §2.1 OAuth 403, §3.1 Non-functional sidebar buttons, §4.2 Token limit |
| S2 | §1.1 Viewport overflow, §1.2 Input alignment, §2.2 Sign-in redirect, §3.2 Sub-views in main area |
| S3 | §5.2 Persona badge in chat, §5.1 Colour tokens, §6.1 Copy confirmation, §6.2 Label removal, §7.1 Mic icon |
| S4 | §7.2 Single-pass Whisper, §6.3 Full UX audit, §8.1 Design token file |
| S5 | §5.3 Persona tools, §6.4 Rate-limit UX, §7.3 Multi-language voice, §8.2 Component audit |
