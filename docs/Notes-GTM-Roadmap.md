# Go-to-Market Feature List for EaseBot Notes

Derived from `Notion-vs-EaseBot-Notes-Comparison.md`. Organized by release phase. Each item includes **why it blocks GTM** and **rough effort**.

---

## P0 — Ship-Blockers (must fix before any public launch)

These are data-loss, broken-UX, or trust-breaking bugs. None of these are "features" — they're table stakes.

1. **Fix silent collab divergence drop** (`NoteEditor.tsx:219`)
   - Why: Two users editing the same note = one user's work silently deleted. Dealbreaker for any "collaborate with partner/vendors" positioning in the PRD.
   - Effort: M (integrate `@tiptap/extension-collaboration` + Yjs, or add a conflict banner as interim).

3. **Stable block IDs via Tiptap extension**
   - Why: Comment anchoring (`NoteComment.blockId`) is currently fragile — comments orphan on any structural edit. Breaks the sharing/review use case that's in the PRD.
   - Effort: S (50–80 lines Tiptap extension stamping `data-id` UUIDs).
4. **Autosave safety net on network failure**
   - Why: `pendingUpdatesRef` is in-memory only; a crash or disconnect mid-typing loses unflushed edits. `useNoteEditor.ts:153-187` retries to the buffer but doesn't persist locally.
   - Effort: S (mirror buffer to `localStorage` keyed by `noteId`; restore on reload).
5. **Tier-gate messaging clarity**
   - Why: Free-tier users currently see a disabled editor with a small banner (`NotesView.tsx:466-472`). They'll churn rather than upgrade. Needs a proper paywall modal with "what you get" + price.
   - Effort: S.

---

## P1 — Competitive Parity (needed to not look like a toy next to Notion/Docs)

6. **Per-block drag handle + block menu**
   - Why: #1 UX gap identified in the comparison. Users expect to drag to reorder and right-click to duplicate/delete/turn-into. Without this it reads as "a textarea with formatting."
   - Effort: M (use `@tiptap/extension-drag-handle-react` or community `GlobalDragHandle`).
7. **"Turn into" block conversion**
   - Why: Converting a paragraph to an H2 or a bullet to a to-do is a core Notion gesture. Currently you have to delete and re-type.
   - Effort: S (Tiptap commands already support it — just needs menu UI).
8. **Full-text body search**
   - Why: `useNotes.ts:106-114` only searches `title|tags|category`. Users won't find their own notes once they have >10.
   - Effort: S (derive `searchableText` on write: strip Tiptap JSON → plain text, store on the note doc; search client-side).
9. **Version history / "Page history"**
   - Why: Users won't trust a collaborative doc without undo-past-session. Also protects against the collab bug while it's being fixed.
   - Effort: M (snapshot to `notes/{id}/versions` on debounce-flush if delta > threshold; simple restore UI).
10. **Persistent sidebar on desktop (not a popover)**
    - Why: Current popover pattern (`NotesView.tsx:291-332`) makes note-switching a two-click task. Notion/Obsidian/Docs all use a persistent rail. This alone changes perceived "heft" of the product.
    - Effort: S (conditional render based on breakpoint).
11. **Presence indicators (who's viewing/editing)**
    - Why: Sharing is advertised in PRD §2 but with no presence, collaborators don't know if their co-editor is live. Even passive avatars help.
    - Effort: S if built on Firestore presence doc; M if real cursors.

13. **Mobile editing polish**
    - Why: Bubble toolbars don't work well on touch. Slash menu triggers the native keyboard in awkward ways. Need a bottom-sheet block inserter tailored for mobile.
    - Effort: M.
14. **Export (PDF / Markdown)**
    - Why: Users won't commit planning docs to a tool they can't export from. `exportService.ts` exists — confirm it covers notes.
    - Effort: S–M.
15. **Undo/redo across sessions**
    - Why: Tiptap's in-memory history resets on reload. Combined with version history from #9, gives safety.
    - Effort: Comes partly with #9.

---
<!-- 
## P2 — EaseBot's Unfair Advantage (differentiation, not parity)

These are the features where EaseBot beats Notion *because* it's wedding-specific and already has the AI pipeline.

16. **AI block / "Ask AI" in editor** (PRD §4.1, P2, unbuilt)
    - Why: The chat LLM is already in-house. `/ai draft vendor brief`, `/ai summarize selection`, `/ai turn bullets into email` is a moat Notion charges $10/mo for.
    - Effort: M (reuse `chatController.ts` pipeline; inline a streaming AI node view).
17. **Wedding-native block types**
    - `/checklist` — embed a live Planner checklist (PRD P1, unbuilt)
    - `/budget` — embed budget table (PRD P2)
    - `/timeline` — embed timeline slice
    - `/vendor-card` — structured vendor record
    - Why: This is why users would pick EaseBot over Notion for wedding planning. Nothing generic can match it.
    - Effort: M per embed type; start with checklist.
18. **"Save this chat as a note"** (PRD §2 metric — 15% conversion target)
    - Why: Converts chat sessions into durable artifacts; pulls users from throwaway to durable product surface. Directly tied to retention.
    - Effort: S (backend tool call → createNote with thread summary; frontend chip already exists per `NotesView.tsx:67-73`).
19. **AI-generated templates per milestone**
    - Why: Current templates are static (`noteTemplates.ts`). Imagine: "3 months to wedding" template auto-populated with your vendor names, dates, guest count.
    - Effort: M.
20. **Share to vendors with branded public link**
    - Why: Shareable links are already Pro Max (`NotesView.tsx:180-186`). Add a branded wedding-ease.ai landing page, password protection, expiry. Gives vendors a reason to remember the product.
    - Effort: S on top of existing `publicAccess`.

--- -->

## P3 — Scale & Future (defer past launch)

21. **Nested / subpages** — requires parent_id refactor. Only if analytics show folder limit is biting.
22. **Block-level storage** — split `content` into `notes/{id}/blocks/{order}` when notes exceed ~20KB to cap Firestore write cost.
23. **Real-time cursors with name labels** — true multi-cursor OT, not just presence dots.
24. **Offline-first queue** — beyond Firestore's read cache; genuine edit queue that survives reload.
25. **Databases** (Notion-style property tables) — wedding guest lists, RSVPs as structured data. Big lift; defer.
26. **@mentions of people/notes/dates** — cross-linking primitive.

---

## Recommended GTM Sequence

- **Alpha (private, 2 weeks of work):** P0 items 1–5.
- **Beta (invite-only, +3 weeks):** P1 items 6–10, P2 item 18 (save-chat-as-note is the retention hook).
- **GA launch (+4 weeks):** P1 items 11–15, P2 items 16–17 (AI block + checklist embed are the launch story).
- **Post-launch:** P2 items 19–20, then P3 as metrics justify.

**Minimum viable GTM = P0 + items 6, 8, 9, 14, 16, 17, 18.** Everything else is upside.
