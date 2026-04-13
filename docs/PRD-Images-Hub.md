# PRD — Images Hub (ChatGPT /images-style gallery + composer)

| Field | Value |
|---|---|
| **Owner** | Krish |
| **Status** | Draft v1 — awaiting approval |
| **Created** | 2026-04-13 |
| **Inspired by** | ChatGPT's `/images` page |
| **Replaces** | Current `GalleryView` (extends, does not delete) |

---

## 1. Background & problem

Today image generation in Easebot is **buried inside chat**: a user has to be in a chat thread, phrase their request in natural language, and trust the LLM to call the `generate_image` tool. There is no dedicated entry point that says "I just want to make an image."

The existing `GalleryView` (sidebar → "Gallery") is a passive grid — it lists past images in a lightbox grid but offers no way to start a new generation from the same surface. To make a new image, the user has to leave the gallery, open a new chat, and phrase a prompt.

ChatGPT's `/images` page solves this with a single hub that combines:
1. A prompt composer at the top ("Describe a new image")
2. Curated **style presets** ("Try a style on an image")
3. Curated **prompt suggestions** ("Discover something new")
4. A **My Images** grid of the user's past generations

Submitting from the composer creates a **new chat thread** seeded with the prompt and immediately starts generating the image inside that thread, so the user sees the same in-progress streaming UX they'd get from chatting normally.

We will build the same hub for Easebot, reusing the existing `userImages` collection, the existing `generate_image` tool, and the existing SSE streaming pipeline. No backend protocol changes.

---

## 2. Goals

1. Give image generation a first-class entry point in the sidebar that matches the discoverability of ChatGPT's `/images`.
2. Keep all existing infrastructure intact: `userImages` collection, `generate_image` tool, SSE streaming, style memory.
3. Reuse the same chat-thread-based generation flow — every image still belongs to a chat thread for traceability and conversational follow-up ("now make it more pastel").
4. Surface **wedding-relevant style presets** (lehenga, mandap, mehendi, bridal portrait, etc.) so first-time users immediately see what the product can do.
5. Surface **curated prompt suggestions** that drop the user into a generation with one click.
6. Give power users explicit control over **aspect ratio** and **reference image** in the composer, instead of relying on the LLM to infer.
7. Mobile-responsive — the hub must be usable on phone, where most users will be.

## 3. Non-goals

- Editing the existing `GalleryView` lightbox / preview behavior — those work fine and are reused.
- Multi-variant generation (N images per prompt). Tool schema is `variants: 1` today; out of scope.
- A separate "image mode" with its own system prompt. We continue using existing modes; the composer just seeds a chat thread and lets the existing pipeline run.
- Public/shared image galleries, social features, or community feed.
- Image upscaling beyond what's already available to premium users in chat.
- A standalone `/images` URL outside the user-scoped routing scheme. We use `/{userId}/images`, matching the existing `/{userId}/gallery` pattern.

---

## 4. User stories

1. **First-time user — discoverability.** Priya opens Easebot for the first time. The sidebar shows an "Images" entry. She clicks it and lands on a hub page with style cards and prompt suggestions. She clicks "Bridal lehenga" — a new chat opens with the prompt pre-filled and an image starts streaming in. Two minutes later she has her first image.
2. **Returning user — quick generation.** Rohan wants a mandap mockup. He clicks Images in the sidebar, types "intimate beach mandap with marigolds at golden hour" into the composer, picks landscape aspect ratio, hits enter. He's redirected to a new chat thread where the image generates inline. He then refines in the chat: "make the marigolds white instead." The follow-up uses the existing chat flow.
3. **Power user — style consistency.** Anita already has 12 wedding images in her gallery. She opens Images, scrolls down to "My Images", and sees her grid. She clicks one to open the lightbox (existing behavior). From the lightbox she can re-generate or edit — taking her into a new chat with that image as a reference.
4. **Mobile user.** Sara on her phone. The composer collapses to a single text input + send button; styles and suggestions stack vertically; My Images is a 2-column grid. Tapping a suggestion or style works the same as desktop.
5. **Reference image.** A user wants to "try this style on my own outfit." They click "Try a style" on a style card → file picker for their reference image → composer pre-fills with that style's prompt suffix → generation runs as an edit (`action: 'edit'`).

---

## 5. Functional requirements

### 5.1 Route & navigation

- New route: `/:userId/images` (matches existing `/:userId/{view}` pattern in `App.tsx`).
- Sidebar `ChatSidebar.tsx`: rename the existing `gallery` nav item to `images` and update the icon (lucide `ImagePlus` instead of `Image`). The badge continues to show the count of `userImages` for the user.
- Backwards compatibility: `/:userId/gallery` redirects to `/:userId/images` (or both render the same component during the transition).
- The view key in `Index.tsx` view switch becomes `'images'`. The old `'gallery'` key continues to work for one release as an alias.

### 5.2 Page layout (desktop)

```
┌─────────────────────────────────────────────────────────────┐
│  [composer]                                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🎨  Describe a new image                       [↑]    │  │
│  │  Aspect: [Square ▾]   Reference: [+ Image]            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Try a style on an image                              ›     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                        │
│  │    │ │    │ │    │ │    │ │    │     (horizontal scroll)│
│  └────┘ └────┘ └────┘ └────┘ └────┘                        │
│   Lehenga  Mandap  Mehendi  Bridal  Decor                  │
│                                                             │
│  Discover something new                              ›     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ thumb    │ │ thumb    │ │ thumb    │ │ thumb    │       │
│  │ prompt   │ │ prompt   │ │ prompt   │ │ prompt   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  My Images                                                  │
│  [reuses existing GalleryView grid + lightbox]              │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Composer (top section)

**Component:** `src/components/images/ImageComposer.tsx` (new)

Fields:
- **Prompt textarea** (auto-resize, max 4 rows then scroll). Placeholder: "Describe a new image — e.g. 'intimate beach mandap at golden hour'".
- **Aspect ratio dropdown** with labels mapping to existing backend sizes:
  - Square — `1024x1024`
  - Portrait — `1024x1536`
  - Landscape — `1536x1024`
  - Tall — `1024x1792`
  - Default: Square. Last-used persisted in `localStorage`.
- **Reference image button** — opens file picker (jpeg/png/webp, max 8 MB). On select: shows a small thumbnail preview with an "X" to remove. Sets `action: 'edit'` for the underlying tool call when present.
- **Submit button** — paper-airplane icon. Disabled when prompt is empty. Keyboard: Cmd/Ctrl+Enter submits.

Submit handler calls `submitImageGeneration({ prompt, aspectRatio, referenceImage }) → see §5.6`.

### 5.4 Style presets row

**Component:** `src/components/images/StylePresetsRow.tsx` (new)

- Horizontal scroll row of ~6–10 cards. Each card: thumbnail image (180×220 portrait), title overlay, subtle gradient.
- Data source: `src/data/imageStylePresets.ts` (new) — a static array curated by the team. Schema:
  ```ts
  interface ImageStylePreset {
    id: string                      // 'bridal-lehenga'
    title: string                   // 'Bridal Lehenga'
    thumbnailUrl: string            // CDN URL to a curated example image
    promptTemplate: string          // pre-filled prompt
    aspectRatio: '1024x1024' | '1024x1536' | '1536x1024' | '1024x1792'
    requiresReferenceImage: boolean // true → "try on your photo" flow
  }
  ```
- Click behavior:
  - If `requiresReferenceImage`: open file picker → on select, pre-fill the composer with `promptTemplate` + the uploaded image → user can tweak → submit.
  - Otherwise: pre-fill composer prompt + aspect, focus the input, scroll to top.
- v1 catalog (curated): Bridal Lehenga, Groom Sherwani, Mandap Decor, Mehendi Setup, Reception Stage, Cake Design, Floral Bouquet, Wedding Invitation, Haldi Backdrop, Bridal Portrait. Thumbnails come from existing assets or curated Firebase Storage uploads.

### 5.5 Discover suggestions section

**Component:** `src/components/images/DiscoverSuggestions.tsx` (new)

- Grid of 4 cards (2×2 on desktop, 1 col on mobile). Each card: thumbnail (left, 56×56) + title + one-line subtitle.
- Data source: `src/data/imageDiscoverSuggestions.ts` (static, ~8 entries, randomly sample 4 on each mount for variety).
- Schema:
  ```ts
  interface DiscoverSuggestion {
    id: string
    title: string                // 'Reimagine your venue'
    subtitle: string             // 'Drop your photo, get a wedding setup'
    thumbnailUrl: string
    promptTemplate: string
    aspectRatio: '1024x1024' | '1024x1536' | '1536x1024' | '1024x1792'
    requiresReferenceImage: boolean
  }
  ```
- Click behavior: same as style presets.

### 5.6 Submission flow ("Submit from hub → land in new chat")

This is the key behavior. When the user submits from the composer:

```
1. Validate prompt non-empty.
2. If reference image present: convert to base64 (data URL) — same path
   the existing chat input uses for attached images.
3. Call useChat.startNewChat() to clear the active thread state.
4. Navigate to /chat (or the chat root route) BEFORE calling sendMessage
   so the user sees the chat surface instantly with the streaming UX they
   already know.
5. Immediately call useChat.sendMessage({
     text: prompt,
     attachedImageUrl: referenceImageBase64 ?? null,
     // hint to bias mode/tool selection:
     forceImageGeneration: true,
     preferredAspectRatio: aspectRatio,
   })
6. The existing chat pipeline:
   - Detects mode (likely 'stylist' or whichever the prompt suggests)
   - LLM is given the existing IMAGE_TOOL
   - Tool is called with the prompt, action 'generate' or 'edit',
     aspect_ratio = preferredAspectRatio
   - SSE 't: img' events stream into the message bubble (existing UX)
   - On done, the image lands in `userImages` (existing behavior)
7. The new chat thread is auto-titled from the prompt (existing behavior).
```

**Why route to a new chat instead of generating inline on the hub?**
- Reuses 100% of the existing streaming pipeline, message rendering, ImageActions toolbar, and Firestore writes — zero new backend code.
- Lets the user iterate conversationally on the result ("make it pastel") with no extra UX.
- Mirrors ChatGPT's own behavior — submitting from `/images` lands you in a new chat.

**Bias hints (`forceImageGeneration`, `preferredAspectRatio`):**
- These are NEW optional fields on the chat payload. Backend reads them and:
  - `forceImageGeneration: true` → backend appends `IMAGE_TOOL` to the tools list with high priority and adds a one-line nudge to the system prompt: "The user submitted this from the Images hub — they explicitly want an image. Call generate_image."
  - `preferredAspectRatio` → injected into the prompt-architect step as a hard constraint passed to the tool call.
- Both are optional and ignored by the chat input from the regular chat surface, so no behavior change for normal chat.

### 5.7 My Images section

- Reuses the existing `GalleryView` grid + lightbox component **as-is** (no edits to GalleryView's internals).
- Wrapped in a section header: `<h2>My Images</h2>` with a count chip ("128 images") and a small filter dropdown (All / Generated / Edited / Uploaded — using the existing `type` field on `UserImage`).
- Empty state: "No images yet. Try a style above or describe one to get started."

### 5.8 Mobile responsiveness

- Composer: prompt textarea full width, aspect + reference collapse into a small icon row below the textarea. Submit button stays in the top-right of the composer card.
- Style presets row: horizontal scroll, 2.2 cards visible at a time. Snap scrolling.
- Discover suggestions: stacks to single column.
- My Images grid: 2 columns on phone, 3 on tablet, existing 8 on desktop (already responsive — keep current behavior).
- All touch targets ≥44px.

### 5.9 Loading / empty / error states

| State | UX |
|---|---|
| Hub initial load | Composer renders immediately. Style/discover sections render immediately (static data). My Images shows existing skeleton until `getUserImages` resolves. |
| User has 0 images | Composer + presets + discover render normally. My Images shows the empty state copy. |
| Composer submit fails before navigation | Toast: "Couldn't start generation — try again." Stay on hub. |
| Reference image > 8 MB or unsupported type | Toast: "Image must be JPEG/PNG/WebP under 8 MB." |
| User over image quota | Existing quota-exceeded toast (reused from chat input). Composer submit blocked. |

---

## 6. Technical architecture

### 6.1 New files

```
Wedding-Ease-Viva-Chat/src/
├── pages/
│   └── ImagesHub.tsx                       (new — top-level page, renders the 4 sections)
├── components/images/
│   ├── ImageComposer.tsx                   (new)
│   ├── StylePresetsRow.tsx                 (new)
│   ├── StylePresetCard.tsx                 (new)
│   ├── DiscoverSuggestions.tsx             (new)
│   └── DiscoverSuggestionCard.tsx          (new)
├── data/
│   ├── imageStylePresets.ts                (new — static curated data)
│   └── imageDiscoverSuggestions.ts         (new — static curated data)
└── hooks/
    └── useImageHubSubmit.ts                (new — encapsulates the submit-from-hub flow described in §5.6)
```

### 6.2 Modified files

| File | Change |
|---|---|
| `src/App.tsx` | Add route `/:userId/images` rendering `ImagesHub`. Keep `/:userId/gallery` as a redirect. |
| `src/components/ChatSidebar.tsx` | Rename `gallery` nav item to `images`, swap icon, point to `/:userId/images`. Keep gallery alias for one release. |
| `src/pages/Index.tsx` | When `view === 'images'` (or `'gallery'`), render `<ImagesHub />` instead of `<GalleryView />`. ImagesHub internally renders GalleryView for the My Images section. |
| `src/hooks/useChat.ts` | `sendMessage` accepts new optional fields `forceImageGeneration?: boolean` and `preferredAspectRatio?: string`. Both forwarded to backend in the chat payload. No other behavior change. |
| `src/services/functionsService.ts` | `streamChatMessage` payload type extended to carry the two new optional fields. |

### 6.3 Backend changes (small, additive)

| File | Change |
|---|---|
| `easebot-backend/src/schemas/chat.ts` (or wherever the chat request zod schema lives) | Add `forceImageGeneration: z.boolean().optional()` and `preferredAspectRatio: z.enum(['1024x1024','1024x1536','1536x1024','1024x1792']).optional()` to the chat request schema. |
| `easebot-backend/src/controllers/chatController.ts` | If `forceImageGeneration === true`: append a one-line directive to the system prompt: `"The user submitted this from the Images hub — they explicitly want an image. Call generate_image."` and ensure `IMAGE_TOOL` is in the tools list (it already is for most modes — this just guarantees it). If `preferredAspectRatio` is set, pass it through to `expandWithPromptArchitect` so the architect output preserves it, and validate that the LLM tool call honors it (if not, override the tool args before dispatch). |
| `easebot-backend/src/services/imageGeneration.ts` | No interface change. Honor the override path described above. |

**No new endpoints, no new collections, no new env vars.** This is critical — the entire feature reuses the existing pipeline.

### 6.4 Static asset hosting for style presets

- 10 curated thumbnail images at ~180×220, optimized webp, ~30 KB each (≤300 KB total).
- Host in `Wedding-Ease-Viva-Chat/public/style-presets/` so they're bundled with the frontend deploy. No Firebase Storage round trip.
- Filenames referenced by `imageStylePresets.ts` as `/style-presets/lehenga.webp`, etc.
- Discover suggestion thumbnails: same approach in `public/discover/`.

### 6.5 Aspect ratio persistence

- `localStorage` key `imagesHub.lastAspectRatio` stores the last chosen aspect.
- Loaded on hub mount, defaulted to `'1024x1024'` if absent.

### 6.6 Analytics / observability (defer if not already in place)

- Fire existing analytics events on:
  - Hub viewed
  - Composer submitted (with aspect ratio + has-reference flag)
  - Style preset clicked (with preset id)
  - Discover suggestion clicked (with suggestion id)
- If the project doesn't have an analytics pipeline today, skip — don't add one for this feature.

---

## 7. Edge cases

| Case | Behavior |
|---|---|
| User submits empty prompt | Submit disabled; nothing happens. |
| User submits prompt, but offline | Existing chat-input offline behavior — toast error, stay on hub. |
| User on guest mode (not signed in) | Hub still renders, but My Images section is empty and submit prompts the user to sign in (reuse the existing guest gating used by chat input). |
| User over daily image quota | Composer submit triggers existing quota-exceeded toast. Submit blocked at the chat layer, not at the hub layer. |
| Reference image too large | Client-side reject before upload, with toast. |
| LLM ignores `preferredAspectRatio` and chooses a different size | Backend overrides the tool args before dispatching to the image API. The user always gets the size they picked. |
| User clicks a `requiresReferenceImage` preset but cancels the file picker | No-op. Composer state unchanged. |
| Backend slow (>30s before first SSE event) | Existing skeleton + "still working" UX in the chat thread handles this. Hub itself navigates away as soon as the user submits, so the hub doesn't need a loading state for generation. |
| Style preset thumbnail fails to load | Show a soft-color placeholder block with the title — never a broken image icon. |
| User has 1000+ images | Existing GalleryView pagination (limit 100, newest-first) handles this. Add a "Load more" button as a fast-follow if needed. |
| User clicks a discover suggestion that requires reference but they're on phone | Native file picker handles camera vs library on iOS/Android. |

---

## 8. Acceptance criteria

1. ☐ Sidebar nav item "Images" routes to `/{userId}/images` and renders the new hub.
2. ☐ Composer accepts a prompt, aspect ratio, and optional reference image.
3. ☐ Submitting from the composer creates a new chat thread, navigates to it, and starts streaming an image generation immediately — the user never sees an empty chat surface.
4. ☐ The generated image lands in `userImages` collection (verified by checking the My Images section after returning to the hub).
5. ☐ Aspect ratio chosen in the composer is honored by the final generated image (verified by checking image dimensions against the dropdown selection).
6. ☐ Style preset cards render from `imageStylePresets.ts` with thumbnails from `/public/style-presets/`.
7. ☐ Clicking a style preset pre-fills the composer (or opens the file picker if `requiresReferenceImage`) — does not auto-submit.
8. ☐ Discover suggestion cards render and behave identically to style presets on click.
9. ☐ My Images section reuses the existing `GalleryView` grid and lightbox unchanged.
10. ☐ Mobile layout: composer + style scroll row + suggestion stack + 2-column My Images grid all usable on a 375px-wide viewport.
11. ☐ `forceImageGeneration: true` causes the backend to call `generate_image` — verified by sending a non-image-y prompt like "hello" with the flag set and confirming the LLM still calls the tool.
12. ☐ `/:userId/gallery` redirects (or aliases) to `/:userId/images` so existing bookmarks don't 404.
13. ☐ No regressions in existing chat-driven image generation — the regular chat input still works exactly as before.
14. ☐ TypeScript builds clean (`tsc --noEmit` and `npm run build`).

---

## 9. Open questions

1. **Style preset asset sourcing** — do we reuse 10 of the strongest existing user-generated images from a curated account, or commission a small batch of "hero" images? (Default: curate from existing high-quality outputs.)
2. **Should the hub also offer a "Recent prompts" section** showing the user's last 5 image prompts as one-tap re-generators? (Default: no for v1, fast-follow.)
3. **Discover refresh rate** — random 4-of-8 on each mount, or daily-rotated, or personalized over time? (Default: random sample on mount.)
4. **Does `requiresReferenceImage` block submission until a file is provided**, or does it gracefully fall back to text-only generation? (Default: graceful fallback — never block.)
5. **Image hub for guest users** — show the hub with a "Sign in to generate" CTA, or hide the entry point entirely? (Default: show the hub, gate at submit.)
6. **Should we delete the `/{userId}/gallery` route after one release**, or keep it as a permanent alias? (Default: keep as alias.)

---

## 10. Out of scope (v1)

- Inline streaming on the hub itself (we redirect to chat instead).
- Multi-variant generation per request.
- Image editing UI inside the hub (use chat thread for edits).
- Sharing or public galleries.
- Style preset authoring UI (admin-curated only).
- Scheduled / batch image generation.
- Image-to-3D, video, or animation.
- Search inside My Images by prompt text.
- Tag/category filters beyond the existing `type` filter.

---

## 11. Rollout plan

1. **Phase 1 — Static scaffolding (0.5 day)**
   - New `ImagesHub.tsx` page rendering empty composer, hardcoded preset row, hardcoded discover row, and existing GalleryView at the bottom.
   - Sidebar nav rename + route addition.
   - Verify routing and layout on desktop + mobile.

2. **Phase 2 — Composer wiring (1 day)**
   - `useImageHubSubmit` hook implementing the navigate-then-send pattern.
   - Backend: add the two optional payload fields and the system-prompt nudge.
   - End-to-end smoke: hub → submit → land in chat → image streams.

3. **Phase 3 — Curated content (0.5 day)**
   - Author `imageStylePresets.ts` and `imageDiscoverSuggestions.ts` with 10 + 8 entries.
   - Drop curated webp thumbnails into `public/style-presets/` and `public/discover/`.

4. **Phase 4 — Polish (0.5 day)**
   - Mobile QA, empty/loading/error states, aspect ratio persistence, lightbox interaction with My Images.

5. **Phase 5 — Beta release**
   - Ship behind the existing logged-in nav. Watch the existing `userImages` write rate to confirm hub-driven generations are landing correctly.

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| LLM ignores `preferredAspectRatio` and emits a different size in the tool call | User gets a different shape than they picked | Backend overrides tool args before dispatching to the image API |
| LLM refuses to generate when `forceImageGeneration` is set (e.g. content policy) | Hub submits feel broken | Existing force-tool-call fallback in chatController already handles refusals — extend it to honor `forceImageGeneration` |
| Curated preset thumbnails feel stale after a few weeks | Hub feels static | Treat presets as a content surface — refresh quarterly. Cheap because they're static files. |
| Mobile composer feels cramped | Users abandon submit | Bottom sheet pattern as a fast-follow if metrics show drop-off |
| Existing GalleryView regressions when wrapped in the new hub layout | Past users notice broken grid | Don't touch GalleryView's internals — wrap, don't refactor |
| `forceImageGeneration` flag leaks into normal chat sends | Every chat message becomes an image | Hook is the only caller; type the field as required-undefined-default to make accidental usage obvious |
