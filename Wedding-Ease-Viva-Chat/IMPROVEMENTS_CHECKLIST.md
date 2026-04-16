# TheWeddingBot — Improvement Checklist

> Benchmarked against ChatGPT & Google Gemini (March 2026)
> Priority: P0 = Quick Win | P1 = High Impact | P2 = Medium Impact | P3 = Differentiator

---

## TIER 0 — Quick Wins (1-2 days each)  

### [not required] 1. Dark Mode Toggle
**Priority:** P0 | **Effort:** Low
**Description:** Add a light/dark/system theme toggle in the header or settings. The CSS variable skeleton for dark mode already exists in `index.css` with `@media (prefers-color-scheme: dark)` — just wire up a button that toggles the `dark` class on `<html>` and persist the preference in localStorage. Update surface, background, text, and border variables for dark theme. Both ChatGPT and Gemini offer this as standard.
**Files:** `src/index.css`, `src/pages/Index.tsx`, `tailwind.config.ts`

---

### [done] 2. Pin Conversations
**Priority:** P0 | **Effort:** Low
**Description:** Allow users to pin important threads to the top of the sidebar. Add a `pinned: boolean` field to the ChatThread Firestore document. In the sidebar thread list, sort pinned threads first (above the date groups). Add a pin/unpin option to the existing thread dropdown menu (where Rename and Delete already live). Both ChatGPT and Gemini support pinning.
**Files:** `src/types/index.ts`, `src/services/chatService.ts`, `src/pages/Index.tsx`

---

### [notrequired] 3. Thumbs Down + Written Feedback
**Priority:** P0 | **Effort:** Low
**Description:** Currently only "Like" (thumbs up) exists on AI responses. Add a thumbs down button next to it. On thumbs down, show a small popover with optional text feedback ("What went wrong?") and save it to a `feedback` subcollection in Firestore (`chats/{threadId}/messages/{msgId}/feedback`). This data is critical for improving prompt quality over time. Both ChatGPT and Gemini collect written feedback on bad responses.
**Files:** `src/pages/Index.tsx`, `src/services/chatService.ts`, `src/hooks/useChat.ts`

---

### [done] 4. Keyboard Shortcuts + Help Overlay
**Priority:** P0 | **Effort:** Low
**Description:** Add global keyboard shortcuts: `Ctrl+Shift+N` = new chat, `Ctrl+Shift+S` = toggle sidebar, `Escape` = stop generation / close modal, `Ctrl+/` = show shortcut help overlay. Create a small modal listing all shortcuts, triggered by `Ctrl+/` or a `?` button in the header. ChatGPT has rich keyboard support — users expect it.
**Files:** `src/pages/Index.tsx` (add `useEffect` with `keydown` listener)

---

### [done] 5. "Continue Generating" Button
**Priority:** P0 | **Effort:** Low
**Description:** When a long AI response gets truncated (hits max token limit), detect the truncation (response ends mid-sentence or backend signals `finish_reason: 'length'`) and show a "Continue generating..." button below the message. Clicking it sends a follow-up message like "Please continue from where you stopped" with the same mode and thread context. ChatGPT does this automatically. Wedding plans and checklists are often long — truncation is a real problem.
**Files:** `src/hooks/useChat.ts`, `src/pages/Index.tsx`, `functions/src/controllers/chatController.ts`

---

### [done] 6. Typing Indicator with Mode Name
**Priority:** P0 | **Effort:** Low
**Description:** Change the typing indicator from "TheWeddingBot is thinking" to "TheWeddingBot (Planner) is thinking..." or "TheWeddingBot (Stylist) is crafting..." showing which mode is actively responding. Use the `selectedMode` state to dynamically set the label and apply the mode's color. Tiny change, but adds personality and clarity about what the AI is doing.
**Files:** `src/pages/Index.tsx` (typing indicator JSX block)

---

### [done] 7. Response Tone Modifiers
**Priority:** P0 | **Effort:** Low
**Description:** After each AI response, show small action chips: "Shorter" | "Longer" | "Simpler" | "More formal". Clicking one sends a follow-up prompt like "Rewrite your last response but make it shorter and more concise" in the same thread. Gemini's standout feature — users love adjusting verbosity without rephrasing their question. Especially useful for wedding content that needs to be shared with different audiences (casual for friends, formal for invitations).
**Files:** `src/pages/Index.tsx` (add buttons below message action bar)

---

## TIER 1 — High Impact Features

### [notneeded] 8. Suggested Follow-up Chips
**Priority:** P1 | **Effort:** Medium
**Description:** After each AI response, display 2-3 clickable suggestion pills ("Compare venue packages", "Set a seating chart", "Ask about centerpieces"). The backend should return suggested follow-ups alongside the main response — add a `suggestions: string[]` field to the SSE stream's final event. On the frontend, render them as rounded pill buttons below the AI message. Clicking one auto-sends it as the next user message. Both ChatGPT and Gemini do this. For a domain-specific bot like TheWeddingBot, suggestions can be highly contextual and guide users through the planning journey.
**Files:** `functions/src/controllers/chatController.ts` (add to system prompt: "End every response with 2-3 suggested follow-up questions"), `functions/src/routes/chat.ts`, `src/hooks/useChat.ts`, `src/pages/Index.tsx`

---

### [done] 9. Voice Output (TTS)
**Priority:** P1 | **Effort:** Medium
**Description:** Read AI responses aloud using Azure Text-to-Speech. The `audioUrl` field already exists on messages but is always `null`. Enable the TTS pipeline: after generating the text response, call Azure Speech SDK to synthesize speech, upload the audio to Firebase Storage, and return the URL. On the frontend, show a small speaker/play button on each AI message. Use a warm, friendly voice (e.g., `en-US-JennyNeural`). Both ChatGPT (Advanced Voice) and Gemini (Live) speak responses — users on mobile or multitasking expect this.
**Files:** `functions/src/services/tts.ts` (create), `functions/src/controllers/chatController.ts`, `src/pages/Index.tsx` (play button UI)

---

### [done] 10. Full-Text Conversation Search
**Priority:** P1 | **Effort:** Medium
**Description:** Currently search only matches thread titles. Implement full-text search across message content. Two approaches: (a) Client-side — when user types in search, load message previews for all threads and filter locally (fine for <100 threads). (b) Server-side — use Firestore composite queries or a lightweight search index (Algolia/Typesense). Show results as "Thread Title > matching message snippet" with click-to-navigate. Both ChatGPT and Gemini offer full-text search across all history.
**Files:** `src/services/chatService.ts`, `src/pages/Index.tsx` (search results UI)

---

### [notneeded] 11. Conversation Export (PDF/TXT)
**Priority:** P1 | **Effort:** Medium
**Description:** Add an "Export" option in the thread dropdown menu. Support two formats: (a) Plain text (.txt) — concatenate all messages with timestamps. (b) PDF — use a client-side library like `jsPDF` or `html2pdf.js` to render the conversation with styling, mode badges, and the TheWeddingBot branding header. Wedding planning conversations contain critical decisions (vendor choices, timelines, budget breakdowns) that users need to save, print, or share with family members who aren't on the app.
**Files:** `src/pages/Index.tsx`, `src/utils/exportConversation.ts` (create)

---

### [done] 12. Share Conversation Link
**Priority:** P1 | **Effort:** Medium
**Description:** Generate a shareable URL for any conversation thread. Create a `sharedChats` Firestore collection with a unique short ID, the thread snapshot (messages + metadata), and an expiry date. The shared link opens a read-only view of the conversation (no auth required). Add a "Share" button in the thread dropdown. Couples constantly need to share AI-generated plans, timelines, and vendor comparisons with their partner, parents, or wedding party. Both ChatGPT and Gemini offer share links.
**Files:** `src/services/chatService.ts`, `src/pages/SharedChat.tsx` (create), `functions/src/routes/share.ts` (create), router config

---

### [done] 13. Streaming Markdown Rendering
**Priority:** P1 | **Effort:** Medium
**Description:** Currently, markdown is only rendered after the full response arrives. Implement progressive markdown rendering as SSE tokens stream in. Use a streaming-compatible markdown parser (e.g., `marked` with incremental parsing, or buffer tokens and re-render `ReactMarkdown` on each chunk). This makes long responses feel much faster — users see formatted headings, lists, and bold text appearing in real-time instead of a wall of raw text that suddenly formats at the end. Both ChatGPT and Gemini render markdown progressively.
**Files:** `src/hooks/useChat.ts` (accumulate streamed text), `src/pages/Index.tsx` (render partial markdown)

---

### [done] 14. Message Pagination / Virtualization
**Priority:** P1 | **Effort:** Medium
**Description:** All messages in a thread are loaded and rendered at once. For threads with 50+ messages, this causes noticeable lag. Implement virtual scrolling using `react-window` or `@tanstack/react-virtual` — only render messages visible in the viewport plus a small overscan buffer. Alternatively, paginate messages (load latest 30, "Load more" button at top). Both ChatGPT and Gemini handle very long conversations smoothly.
**Files:** `src/pages/Index.tsx` (message list), `src/hooks/useChat.ts` (paginated query)

---

### [notneeded] 15. Onboarding Flow / Setup Wizard
**Priority:** P1 | **Effort:** Medium
**Description:** First-time users see a 3-4 step onboarding wizard: (1) Wedding date, (2) Estimated budget range, (3) Style preference (classic/modern/rustic/bohemian/glamorous), (4) Guest count estimate. Store answers in the user profile (`weddingDate`, `budget`, `style`, `guestCount` fields already partially exist). Feed these into every AI prompt as context so TheWeddingBot gives personalized responses from the very first message. ChatGPT has Custom Instructions, Gemini has Gems — TheWeddingBot's onboarding serves the same purpose but is domain-optimized.
**Files:** `src/components/OnboardingWizard.tsx` (create), `src/contexts/AuthContext.tsx`, `src/pages/Index.tsx`, `functions/src/prompts/*.ts`

---

## TIER 2 — Medium Impact Features

### [phase2] 16. Image Upload + Understanding
**Priority:** P2 | **Effort:** High
**Description:** Allow users to upload images (inspo photos, venue shots, dress screenshots, Pinterest boards) alongside their message. Send the image to a multimodal LLM (GPT-4o or Gemini Pro Vision) for analysis. Use cases: "What style is this dress?", "How should I decorate this venue?", "Match flowers to this color palette". Add a paperclip/attachment button to the InputBar. Store uploaded images in Firebase Storage. Both ChatGPT and Gemini support image understanding as a core feature.
**Files:** `src/pages/Index.tsx` (upload button + preview), `src/hooks/useChat.ts`, `functions/src/controllers/chatController.ts`, `functions/src/routes/chat.ts`

---

### [phase2] 17. File Upload (PDF/DOCX Analysis)
**Priority:** P2 | **Effort:** High
**Description:** Let users upload documents — vendor contracts, venue brochures, catering menus, invitation drafts — for AI analysis. Extract text from PDFs (using `pdf-parse`) and DOCX (using `mammoth`) on the backend, then include the extracted text in the LLM context. Use cases: "Review this vendor contract for red flags", "Summarize this venue package", "Compare these two catering quotes". Limit file size to 10MB. ChatGPT supports up to 512MB file uploads — this is a power-user expectation.
**Files:** `functions/src/services/fileParser.ts` (create), `functions/src/routes/chat.ts`, `src/pages/Index.tsx` (file picker UI)

---

### [phase2] 18. Web Search Grounding
**Priority:** P2 | **Effort:** High
**Description:** Enable the AI to search the web for real-time information — current vendor prices, venue availability, trending wedding styles, local florists. Use Google Custom Search API or Bing Search API. When the AI detects a query needing current data (prices, "near me", reviews, availability), it calls the search tool, retrieves results, and synthesizes an answer with inline citations/source links. Both ChatGPT Search and Gemini's Google Search grounding provide this. For wedding planning, stale training data is a real problem — vendor prices and availability change constantly.
**Files:** `functions/src/services/webSearch.ts` (create), `functions/src/controllers/chatController.ts` (add as LLM tool), prompt updates

---

### [done] 19. Message Branching (Edit History)
**Priority:** P2 | **Effort:** High
**Description:** When a user edits a previous message, instead of discarding the old branch, keep both. Store branches as a tree structure (each message has a `parentId` and `branchIndex`). Show left/right arrow buttons on edited messages to navigate between branches ("Branch 1 of 3"). This lets users explore different options: "Show me a rustic theme" → edit → "Show me a modern theme" → compare both branches. ChatGPT's branching is one of its most powerful features for iterative planning.
**Files:** `src/types/index.ts`, `src/hooks/useChat.ts`, `src/services/chatService.ts`, `src/pages/Index.tsx`

---

### [done] 20. Checklist Due Dates + Overdue Alerts
**Priority:** P2 | **Effort:** Medium
**Description:** Add a `dueDate: Date | null` field to checklist items. Show a date picker inline when editing items. Sort items by deadline. Highlight overdue items in red. Show a badge count of overdue items in the sidebar "Planner" nav item. The AI's `create_checklist` tool should accept optional due dates and the Planner prompt should encourage setting them ("Book venue by June 15"). This extends TheWeddingBot's unique Planner feature far beyond what ChatGPT or Gemini can do with generic task lists.
**Files:** `src/types/index.ts`, `src/components/ChecklistDetail.tsx`, `src/services/checklistService.ts`, `functions/src/services/plannerTools.ts`

---

### [done] 21. Archive Conversations
**Priority:** P2 | **Effort:** Low
**Description:** Add an "Archive" option to the thread dropdown menu. Archived threads are hidden from the main sidebar but accessible via an "Archived" section at the bottom (collapsed by default). Add an `archived: boolean` field to ChatThread. Filter archived threads out of the main list. Users accumulate many threads over months of planning — archiving keeps the sidebar clean without losing history. ChatGPT offers this.
**Files:** `src/types/index.ts`, `src/services/chatService.ts`, `src/pages/Index.tsx`

---

### [done] 22. Conversation Folders / Tags
**Priority:** P2 | **Effort:** Medium
**Description:** Allow users to organize threads into folders or apply color-coded tags (e.g., "Venue", "Catering", "Budget", "Style"). Add a `folder: string | null` or `tags: string[]` field to ChatThread. In the sidebar, show folder headers above thread groups. Add a folder/tag picker in the thread dropdown. ChatGPT has Projects (folder + instructions + memory) — even a simple folder system would significantly improve organization for users with 20+ threads about different wedding topics.
**Files:** `src/types/index.ts`, `src/services/chatService.ts`, `src/pages/Index.tsx`

---

### [notneeded] 23. "Double-Check" / Verify Response
**Priority:** P2 | **Effort:** Medium
**Description:** Add a "Verify" button below AI responses that cross-references key claims against a web search. When clicked, extract factual claims from the response (dates, prices, vendor names, traditions), run them through a search API, and display a small verification card showing which claims are confirmed, uncertain, or potentially outdated. Gemini's "Double-check with Google" feature builds user trust — for wedding planning where wrong information costs real money, this is especially valuable.
**Files:** `functions/src/services/verifyResponse.ts` (create), `functions/src/routes/verify.ts` (create), `src/pages/Index.tsx`

---

## TIER 3 — Domain Differentiators (Unique to TheWeddingBot)

### [phase2] 24. Vendor Search + Recommendations
**Priority:** P3 | **Effort:** High
**Description:** Connect to Google Places API, Yelp API, or WeddingWire/The Knot APIs to search for real local vendors. When the user asks "Find florists near me under $2000" or "Best photographers in Mumbai", the AI calls a vendor search tool, retrieves real results (name, rating, price range, photos, reviews), and presents them as rich cards with links. Save favorites to a `vendors` subcollection. Neither ChatGPT nor Gemini has domain-specific vendor search — this is TheWeddingBot's biggest potential moat.
**Files:** `functions/src/services/vendorSearch.ts` (create), `functions/src/services/plannerTools.ts` (add tool), `src/pages/Index.tsx`

---

### [done] 25. Budget Tracker Dashboard
**Priority:** P3 | **Effort:** High
**Description:** A persistent budget management view. Users set their total budget, then allocate and track spending per category (Venue, Catering, Photography, Flowers, Attire, Music, etc.). Show a pie chart of allocation, a progress bar of spent vs remaining, and a line-item list with vendor names and amounts. The AI Consultant mode can read and update the budget via LLM tools. Store in Firestore as `users/{uid}/budget`. Neither competitor offers persistent financial tracking — this turns TheWeddingBot from a chatbot into a planning tool.
**Files:** `src/components/BudgetDashboard.tsx` (create), `src/services/budgetService.ts` (create), `functions/src/services/plannerTools.ts` (add budget tools)

---

### [done] 26. Collaborative Planning (Invite Partner)
**Priority:** P3 | **Effort:** High
**Description:** Allow users to invite their partner (or wedding planner) to a shared workspace. The invited user gets access to the same threads, checklists, budget, and calendar events. Implement via a `sharedWith: string[]` field on the user's planning data, with Firestore rules allowing read/write for shared UIDs. Add an "Invite Partner" button in settings that sends an email invite with a link. ChatGPT has group chats (up to 20 people) — wedding planning is inherently a two-person activity.
**Files:** `src/components/InvitePartner.tsx` (create), `functions/src/routes/invite.ts` (create), Firestore rules update

---

### [Phase2] 27. Moodboard Builder
**Priority:** P3 | **Effort:** Medium
**Description:** A visual collection board where users save AI-generated images, uploaded inspo photos, color palettes, and text notes. Organize into sections (Decor, Flowers, Attire, Venue). Drag-and-drop layout. Currently a placeholder sidebar item — implement with a masonry grid layout. Store image URLs + metadata in `users/{uid}/moodboard` collection. Allow export as a PDF lookbook. Neither ChatGPT nor Gemini offers persistent visual collections — this is a natural fit for the Stylist mode.
**Files:** `src/components/MoodboardView.tsx` (create), `src/services/moodboardService.ts` (create), `src/pages/Index.tsx`

---

### [done] 28. Timeline Visualization
**Priority:** P3 | **Effort:** High
**Description:** Render the wedding planning timeline as an interactive visual (vertical timeline or horizontal Gantt chart) instead of plain text. When the Planner mode creates a timeline, parse the milestones into structured data and display them on a visual timeline component with dates, status indicators, and clickable items that link to relevant checklists. Use a library like `react-chrono` or a custom SVG timeline. Neither ChatGPT nor Gemini visualizes timelines — this makes TheWeddingBot's Planner mode dramatically more useful.
**Files:** `src/components/TimelineView.tsx` (create), `functions/src/services/plannerTools.ts` (add timeline tool)

---

### [done] 29. Notification / Reminder System
**Priority:** P3 | **Effort:** High
**Description:** Send push notifications reminders for upcoming deadlines in notification page and alert. When the AI creates a checklist item with a due date, or a calendar event, offer to set a reminder (e.g., "Remind me 3 days before"). Use Firebase Cloud Messaging (FCM) for push notifications and Firebase Cloud Functions scheduled triggers for email reminders. Show a notification bell badge in the header with unread reminder count. The Reminders sidebar section currently exists but is empty — this brings it to life. have the functionality to mark as read , slide as ermove the notification
**Files:** `functions/src/services/notifications.ts` (create), `functions/src/scheduled/reminders.ts` (create), `src/pages/Index.tsx`, Firebase messaging setup

---

### [phase2] 30. Guest List Management
**Priority:** P3 | **Effort:** High
**Description:** A full guest list manager: add/edit/remove guests, track RSVP status (Invited / Accepted / Declined / Pending), meal preferences (veg/non-veg/vegan), plus-ones, table assignments, and contact info. Show stats (total invited, confirmed, dietary breakdown). The AI can add guests via LLM tools ("Add my cousin Priya, vegetarian, table 5"). Export as CSV for venue/caterer. Store in `users/{uid}/guests` collection. No generic chatbot offers this — it's a killer feature for a wedding-specific tool.
**Files:** `src/components/GuestListView.tsx` (create), `src/services/guestService.ts` (create), `functions/src/services/plannerTools.ts` (add guest tools)

---

### [done] 31.  Comparison Tables
**Priority:** P3 | **Effort:** Medium
**Description:** When the AI compares  (e.g., "Compare these 3 photographers"), render the comparison as an interactive side-by-side table with columns for price, rating, style, availability, and pros/cons etc elements . Add a "Save to Planner" button that persists the table as a structured document in the Planner. The existing "Convert to Table" feature is a starting point — extend it with richer formatting, sorting, and persistence. Unique to wedding planning and far more useful than a plain text comparison.
**Files:** `src/components/VendorComparisonTable.tsx` (create), `functions/src/services/plannerTools.ts` (add comparison tool)

---

### [done] 32. Progress Dashboard
**Priority:** P3 | **Effort:** Medium
**Description:** A visual dashboard showing overall wedding readiness. Pull data from checklists (% complete), budget (% spent), guest list (% RSVPed), and calendar (days until wedding). Show a "readiness score" (e.g., "72% Ready"), progress rings per category, and a "What to do next" section with AI-suggested next steps. Gamifies the planning process and reduces anxiety. Access via a dashboard icon in the header or a dedicated sidebar section. Neither competitor offers project-level progress tracking.
**Files:** `src/components/ProgressDashboard.tsx` (create), `src/services/dashboardService.ts` (create), `src/pages/Index.tsx`

---

### [done] 33. Shopping List Implementation
**Priority:** P3 | **Effort:** Medium
**Description:** Implement the currently placeholder "Shopping Lists" sidebar section. Users can create categorized shopping lists (Decor, Favors, Attire accessories, etc.) with items, estimated prices, links, and purchased status. The AI Stylist/Consultant modes can add items via LLM tools ("Add fairy lights, ~$30, from Amazon"). Show total estimated cost per list and overall. Link items to the budget tracker. Store in `users/{uid}/shoppingLists` collection.
**Files:** `src/components/ShoppingListView.tsx` (create), `src/services/shoppingService.ts` (create), `functions/src/services/plannerTools.ts`

---

### [done] 34. Saved Items / Bookmarks
**Priority:** P3 | **Effort:** Medium
**Description:** Implement the currently placeholder "Saved Items" sidebar section. Let users bookmark specific parts of AI responses — vendor recommendations, recipe ideas, decor tips, useful links — not just entire messages (which "Like" already does). Add a "Save" action on text selections within AI responses. Organize saved items by category with search. This is a more granular version of Liked Messages, focused on extracting and organizing actionable snippets.
**Files:** `src/components/SavedItemsView.tsx` (create), `src/services/savedItemsService.ts` (create), `src/pages/Index.tsx`

---

## Summary by Effort

| Effort | Count | Items |
|--------|-------|-------|
| **Low (1-2 days)** | 9 | #1, #2, #3, #4, #5, #6, #7, #16, #21 |
| **Medium (3-7 days)** | 13 | #8, #9, #10, #11, #12, #13, #14, #15, #20, #22, #23, #27, #31, #32, #33, #34 |
| **High (1-3 weeks)** | 12 | #16, #17, #18, #19, #24, #25, #26, #28, #29, #30 |

---

*Last updated: 2026-03-20*
*Benchmarked against: ChatGPT (OpenAI) + Google Gemini features as of March 2026*
