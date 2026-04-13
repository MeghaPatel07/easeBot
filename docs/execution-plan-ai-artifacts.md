# Execution Plan — AI Behaviour & Artifacts (improvement.md §4)

## Goal
Make the chatbot create real artifacts (notes, timelines) in their respective tabs, stop image generation from firing on general requests, and give users a way to copy checklists into notes manually.

## Scope Decisions (locked)
- **Notes**: AI-writable via new `create_note` tool.
- **Timeline**: AI-writable via new `create_timeline_event` tool.
- **Gallery**: Out of scope — no AI-write tool.
- **Checklist**: Unchanged backend. Stays in Checklist tab. Add "Copy" button so user can paste content into Notes manually.
- **Image generation**: Tool available in every mode, but prompt + narrower intent regex prevent firing on general requests.
- **Per-mode tools**: Each mode gets a curated artifact tool set; image tool is available in all modes.

---

## Phase 1 — New backend artifact tools

**Files**
- `easebot-backend/src/services/plannerTools.ts`
- `easebot-backend/src/services/notesService.ts` (already exists, verify signature)
- `easebot-backend/src/services/timelineService.ts` (create if missing, pattern after notesService)
- `easebot-backend/src/controllers/chatController.ts` (tool execution switch, ~line 659-667)

**Tasks**
1. Verify `notesService.createNote(uid, email, {title, body, tags})` signature.
2. If `timelineService` does not exist, create it with `createTimelineEvent(uid, email, {title, date, description, category})` following the notesService pattern. Add Firestore collection write.
3. In `plannerTools.ts`, add two new tool definitions:
   - `create_note` — params: `title`, `body`, `tags?`
   - `create_timeline_event` — params: `title`, `date`, `description?`, `category?`
4. In `chatController.ts`, add handler branches in the tool-execution switch that call the two services and return confirmation messages.
5. Keep `create_checklist`, `create_reminder`, and existing tools as-is.

**Done when**: Backend compiles. A manual curl/chat test with "save a note titled X with body Y" triggers `create_note` and a Firestore document appears in the notes collection. Same for timeline.

---

## Phase 2 — Copy button on checklists (frontend)

**Files**
- `Wedding-Ease-Viva-Chat/src/pages/Index.tsx` (around line 838 — locates `ChecklistDetail` usage)
- `Wedding-Ease-Viva-Chat/src/components/` — find `ChecklistDetail` component

**Tasks**
1. Locate the `ChecklistDetail` component.
2. Add a "Copy" button in its header/toolbar.
3. On click, serialize the checklist as markdown:
   ```
   # {title}
   - [ ] unchecked item
   - [x] checked item
   ```
4. Call `navigator.clipboard.writeText(markdown)`.
5. Show a toast ("Copied to clipboard — paste into Notes").
6. No backend change. User navigates to Notes tab and pastes manually.

**Done when**: Clicking Copy in an open checklist puts correctly formatted markdown on the clipboard and shows a toast.

---

## Phase 3 — Tighten image generation guardrails

**Files**
- `easebot-backend/src/controllers/chatController.ts` (lines 47-68 for regex; 460-469 for tool array)
- `easebot-backend/src/prompts/planner.ts` (and any mode prompts in `promptArchitect.ts`)

**Tasks**
1. Replace `IMAGE_INTENT_RE` with a strict image-only pattern:
   ```ts
   const IMAGE_INTENT_RE = /\b(draw|render|generate\s+(?:an?\s+)?(?:image|picture|photo)|visualize|illustrate|mood\s?board|picture\s+of|image\s+of)\b/i;
   ```
   Remove generic verbs (`create`, `make`, `design`, `show`) as solo triggers.
2. `IMAGE_TOOL` stays in the tool list for **all modes** (logged-in users). No mode gating.
3. Update each mode's system prompt (in `planner.ts` / `promptArchitect.ts`) to include:
   > Never call `generate_image` unless the user explicitly asks for an image (keywords: draw, render, visualize, picture of, image of, mood board). For requests like "create a checklist" or "make a plan", use the appropriate artifact tool (`create_checklist`, `create_note`, `create_timeline_event`, `create_reminder`) instead.
4. Keep the existing `shouldForceImageGeneration` gate (vision data + regex) as a safety net.

**Done when**: Asking "create a checklist for my sangeet" produces a checklist artifact, not an image. Asking "draw me a mood board for gold décor" still produces an image.

---

## Phase 4 — Per-mode tool binding

**Files**
- `easebot-backend/src/controllers/chatController.ts` (two `tools.push(...PLANNER_TOOLS)` sites around lines 460 and 659)
- `easebot-backend/src/prompts/planner.ts` / `promptArchitect.ts` (mode-specific prompts)

**Tasks**
1. Add a helper in `chatController.ts`:
   ```ts
   function getToolsForMode(mode: Mode, isLoggedIn: boolean): Tool[] {
     if (!isLoggedIn) return [];
     const base = [IMAGE_TOOL]; // available in all modes
     switch (mode) {
       case 'planner':    return [...base, CREATE_CHECKLIST, CREATE_REMINDER, CREATE_TIMELINE_EVENT, CREATE_NOTE, EDIT_CHECKLIST_ITEM, MARK_AS_DONE, GET_CHECKLIST_STATS];
       case 'stylist':    return [...base, CREATE_NOTE];
       case 'therapist':  return [...base, CREATE_NOTE];
       case 'knowledge':  return [...base, CREATE_NOTE];
       case 'consultant': return [...base, CREATE_NOTE, CREATE_REMINDER];
       case 'assistant':  return [...base, CREATE_CHECKLIST, CREATE_REMINDER, CREATE_TIMELINE_EVENT, CREATE_NOTE, EDIT_CHECKLIST_ITEM, MARK_AS_DONE, GET_CHECKLIST_STATS];
     }
   }
   ```
2. Replace the two hardcoded `tools.push(...PLANNER_TOOLS)` call sites with `tools.push(...getToolsForMode(mode, isLoggedIn))`.
3. Update each mode's system prompt so it describes only the tools that mode actually has. Planner mode prompt lists all artifact tools; therapist prompt only mentions `create_note` + `generate_image`.

**Done when**: Therapist mode does not see `create_checklist` in its tool list, but still has `create_note` and `generate_image`. Planner mode has the full artifact set. Verified by logging the tools array per request during manual testing.

---

## Phase 5 — Manual verification

**Tasks**
1. Start backend (`npm run dev` in `easebot-backend/`) and frontend (`npm run dev` in `Wedding-Ease-Viva-Chat/`).
2. Log in as a test user.
3. Test matrix (run each in the browser):
   - Planner mode: "create a checklist for my mehendi" → checklist appears in Checklist tab.
   - Planner mode: "add a timeline event: venue visit on May 2" → event appears in Timeline tab.
   - Planner mode: "save a note titled 'vendor shortlist' with these three names..." → note appears in Notes tab.
   - Therapist mode: "jot down how I'm feeling today" → note created, no checklist tool offered.
   - Stylist mode: "draw a mood board for gold & ivory décor" → image generated.
   - Stylist mode: "create a checklist of outfit items" → should produce a note (stylist has no checklist tool) OR route politely; confirm behavior matches prompt.
   - Any mode: open an existing checklist → click Copy → paste into Notes tab → verify markdown is correct.
4. Check Firestore console: correct collections receive writes.
5. Regression check: existing checklist + reminder flows still work.

**Done when**: All cases in the matrix behave as expected. No console errors. No regressions on existing flows.

---

## Out of scope (explicitly)
- Gallery AI-write tool.
- Auto-copying checklists into Notes on the backend.
- Renaming or merging the Checklist and Notes tabs.
- Changing how checklists are rendered.
- Mode-gating the image tool.

## Risk notes
- `timelineService` may not exist; creating it touches Firestore rules/indexes — confirm rules allow writes to the new collection before shipping.
- Narrowing `IMAGE_INTENT_RE` could miss edge-case phrasing. Keep the old regex commented for one release cycle in case rollback is needed.
- Mode-specific tool lists mean prompts must stay in sync with tool definitions — if a tool is added later, all affected mode prompts must be updated.

---

## Suggested execution order
1. Phase 1 (backend tools) — foundation, no user-visible change yet.
2. Phase 3 (image guardrail) — prevents regressions as new tools come online.
3. Phase 4 (per-mode binding) — wires everything together.
4. Phase 2 (copy button) — independent, can be done anytime in parallel.
5. Phase 5 (verification) — last.
