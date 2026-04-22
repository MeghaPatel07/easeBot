# Notion vs EaseBot Notes — Deep Comparison

Source review: `NoteEditor.tsx`, `NotesView.tsx`, `NotesSidebar.tsx`, `useNotes.ts`, `useNoteEditor.ts`, `notesService.ts`, toolbar components, and `docs/PRD-Notes-System.md`. Below is the comparison across UI/UX, development, and functionality, with Notion as the reference model.

---

## 1. Architectural Model (the root of every other difference)

| Dimension | Notion | EaseBot |
|---|---|---|
| Content model | **Block tree** — each block is an independent record with its own ID, parent, children, permissions, history | **Single blob** — the entire doc is stored as a stringified Tiptap JSON in `note.content` (`notesService.ts:57`, `:91-99`) |
| Storage | Proprietary block store (Postgres shards + caches) | Firestore doc (`notes/{id}`), Firebase Storage for images |
| Editor engine | Custom ProseMirror-like block editor, Yjs-style CRDT for collab | Tiptap (ProseMirror wrapper) client-side, no CRDT |
| Collab substrate | WebSocket + operational transform / CRDT | Firestore `onSnapshot` document replacement with a "don't stomp if local diverged" guard (`NoteEditor.tsx:208-224`) |

**Implication:** in Notion, two users editing different paragraphs touch different rows. In EaseBot, two users editing the same note both rewrite the same `content` string — the last `updateDoc` wins, and the "local diverged" guard in `NoteEditor.tsx:219` silently drops the incoming remote doc instead of merging it. That's single-writer-safe but broken for true concurrent editing.

---

## 2. UI/UX Flow

### Creating a note
- **Notion:** left sidebar "+ New page" → blank page opens instantly → title placeholder focused → `/` for any block. Subpages nest arbitrarily.
- **EaseBot:** `NotesView.tsx:333-342` — "All notes" popover + "+ New note" pill at the **top center**. `createNote()` → `setDoc` → `setActiveNoteId` → URL synced (`NotesView.tsx:76-80`) → `useNoteEditor` subscribes. Template picker available via empty-state screen. **Only one hierarchy level** (folders, via `noteFolders` collection); no subpages.

### Editing experience

| Surface | Notion | EaseBot |
|---|---|---|
| Slash menu | Hundreds of commands, fuzzy search, ranks by recency, context-aware | `SlashCommandMenu.tsx` — ~10 static commands (Text, H1–3, bullet, numbered, todo, quote, divider, code, image, callout). No fuzzy ranking shown, no "turn into" |
| Inline toolbar | Bubble on selection with bold/italic/underline/strike/code/math/comment/color/link/ai + "Ask AI" | `FloatingToolbar.tsx` — similar set minus AI and Comment; has text color, highlight, font size (custom extension `NoteEditor.tsx:24-57`) |
| Block handle | Hover any block → 6-dot drag handle + "+" to insert above; right-click for block menu (duplicate, turn into, move to, copy link, color) | **Absent.** No per-block drag/duplicate/turn-into. The `BlockWidgetBar` at the bottom (`NoteEditor.tsx:486-492`) is a *global* insert bar, not a per-block one |
| Drag/reorder blocks | First-class | Not exposed |
| Copy link to block | Every block has a permalink | Not implemented; comments carry a `blockId` but blocks don't have stable IDs in the JSON |
| AI-in-editor | Notion AI inline prompt, "ask AI" button, summarize/translate/continue | **Missing** (PRD §4.1 "AI Block" — P2, unbuilt) |
| @mentions | People, pages, dates, databases | None |
| Nested pages | Unlimited; pages inside pages | None — folders are the only grouping, single level |
| Cover + icon | Yes (with unsplash picker + emoji picker) | Yes — cover via upload only (`NotesView.tsx:214-227`), icon via `NoteHeader` emoji |

### Navigation
- **Notion:** tree sidebar with expand/collapse, favorites, workspaces, search across everything (Quick Find), shared section.
- **EaseBot:** `NotesSidebar.tsx` — filter pills (All / Favorites / Shared), debounced text search over `title|tags|category` only (not body — `useNotes.ts:106-114`), flat folder list, unfiled bucket. On desktop it's a **popover** (`NotesView.tsx:291-332`), not a persistent rail — so switching notes is a two-click affair vs Notion's single-click tree.

### Saving feedback
- **Notion:** silent, optimistic, presence avatars prove liveness.
- **EaseBot:** `NoteHeader` surfaces `isSaving / lastSavedAt / hasUnsavedChanges` + manual Cmd+S + `beforeunload` warning (`useNoteEditor.ts:202-210`). More explicit, which is honest but visually noisier.

---

## 3. Development Flow

### EaseBot layering (bottom-up)
1. **Persistence (`notesService.ts`)** — Firestore CRUD + three `onSnapshot` listeners (own notes, shared, folders) + storage helpers. Queries use single-`where` filters + client-side sort to dodge composite-index requirements (`notesService.ts:164-186`).
2. **Collection hook (`useNotes.ts`)** — subscribes, debounces search 300ms (`:34-39`), memoizes filtered/trashed slices, wraps CRUD with analytics `track(...)` calls.
3. **Document hook (`useNoteEditor.ts`)** — subscribes to the **active** note doc + buffers local edits in `pendingUpdatesRef` + 2s debounce (`:105-130`) + flush-on-switch/unmount/beforeunload. Explicit save clears the debounce timer.
4. **Editor (`NoteEditor.tsx`)** — Tiptap with StarterKit + custom `FontSize`, `CalloutExtension`, `ResizableImage`, legacy `ToggleExtension`. Paste handler uploads images to Storage instead of base64-embedding (`:169-199`).
5. **View (`NotesView.tsx`)** — composition layer: sidebar popover, header, editor card, cover, comments drawer, share dialog, template dialog; routes `:userId/notes/:noteId`.

### Notion's layering (conceptual)
1. Block store with per-block transactions
2. OT/CRDT sync service with presence + cursor broadcast
3. Block renderer that only re-renders dirty blocks
4. Plugin/extension API for custom block types, databases, integrations

### Where the shapes diverge

| Concern | EaseBot | Notion |
|---|---|---|
| Write granularity | Entire document on every 2s tick (`useNoteEditor.ts:119`). A 50KB note costs 50KB per flush | Block-level patches (one block, kilobytes) |
| Write cost scaling | O(doc size) per edit — Firestore write cost grows with note length | O(edit size) |
| Conflict resolution | Last-writer-wins + the "don't apply remote if local diverged" shortcut (`NoteEditor.tsx:208-224`) drops one user's work under collab | CRDT merge — both users' edits preserved |
| Version history | **None** — no `versions` subcollection | Full history with restore |
| Offline | Firestore offline persistence gives read cache, but pending-buffer is in-memory → lost on crash | Full offline-first queue |
| Block IDs | Generated by Tiptap but not durable across reparses — so `NoteComment.blockId` (`NotesView.tsx:528`) is fragile anchoring | Stable UUIDs |
| Tests / migrations | `ToggleExtension` is kept purely to parse legacy Firestore docs (`NoteEditor.tsx:76-87`) — a tell that schema evolution is "keep extensions forever" | Server-side migrations |

---

## 4. Functionality Flow (what actually happens when a user types)

### EaseBot keystroke lifecycle
```
User types → Tiptap onUpdate fires with new JSON
  → onUpdate prop → updateContent(content) in useNoteEditor
  → pendingUpdatesRef.current.content = content
  → setHasUnsavedChanges(true)
  → scheduleSave() sets 2s debounce timer
    ⋮ 2s idle ⋮
  → updateNote(noteId, {content, lastEditedBy})
  → Firestore updateDoc (whole content string)
  → onSnapshot fires for all subscribers (self + collaborators)
  → subscribeToNote callback → setNote(n)
  → NoteEditor's useEffect on content change:
      if editor JSON === lastSynced → replace with incoming
      else → silently drop incoming (divergence guard)
```

### Notion keystroke lifecycle (reference)
```
User types → block edit op produced
  → optimistic apply locally
  → op sent over websocket
  → server merges op with concurrent ops (CRDT)
  → broadcast delta to all subscribers
  → each client applies delta to just that block
  → cursors and presence broadcast alongside
```

### Sharing & permissions
- **EaseBot (`notesSharingService.ts` + NotesView permission logic `:258-275`):** `collaborators[]` of `{userId, email, name, permission, addedBy}` + parallel `collaboratorEmails[]` for `array-contains` queries. Permission gate: `tierAllowsEdit = limits.notesAccess === 'full'` — **Free tier is view-only** even for owners (`NotesView.tsx:466-472`). Public links gated to Pro Max (`:180-186`).
- **Notion:** per-page, per-workspace, per-block permissions, guests, groups, teamspaces. No tier gate on editing your own docs.

### Comments
- **EaseBot:** subcollection `notes/{id}/comments` (`notesCommentsService.ts`), with `blockId`, `anchorText`, `parentCommentId`, `reactions`, `resolved`. Rendered in a right-side `NoteCommentsSidebar`. Anchoring is by `blockId + anchorText` — but since Tiptap JSON doesn't persist stable block IDs, any structural rewrite can orphan comments.
- **Notion:** comments anchor to a persistent block ID + text range that moves with the text via OT — orphan case is much rarer.

### Deletion
- **EaseBot:** soft delete via `isDeleted: true` (`notesService.ts:101-112`), storage cleanup fire-and-forget. Trash UI path exists in the sidebar but is currently commented out (`NotesSidebar.tsx:332`), so there's no way to reach trash in production — notes soft-delete into a view users can't see.
- **Notion:** 30-day trash with restore, clear UI affordance.

---

## 5. Gaps & Recommended Priorities

Ranked by user-visible impact per engineering-hour:

1. **Expose the trash view** — `NotesSidebar.tsx:332` is commented out; deleted notes are currently unreachable in the UI. One-line fix.
2. **Per-block drag handle + "turn into" + duplicate** — biggest single gap vs Notion. Tiptap has `@tiptap/extension-drag-handle-react` / `GlobalDragHandle` community extensions that plug in with ~50 lines. Gives the Notion "feel" without rearchitecting storage.
3. **Block IDs via a Tiptap extension** that stamps a `data-id` UUID on every block. Makes comment anchoring reliable and unlocks "copy link to block."
4. **Fix the collab divergence bug** — the silent drop in `NoteEditor.tsx:219` should either merge (Yjs — Tiptap has an official Y.js collab extension) or show a "note updated remotely, reload?" banner. As-is, real-time editing by two users will destroy work.
5. **Version history** — add `notes/{id}/versions` subcollection capturing a snapshot on debounce-flush if content delta > N chars. Cheap to implement, high-trust signal for users.
6. **Body search** — `useNotes.ts:106-114` only searches title/tags/category. Adding a derived `searchableText` field on write (strip JSON → plain text) unlocks find-in-all.
7. **AI block** — PRD §4.1 P2, and it's the one Notion-style feature EaseBot actually has strategic advantage to ship (the chat LLM pipeline is already in-house). "/ai summarize selection" would be a high-leverage differentiator.
8. **Nested/subpages** — would require moving from folder_id to parent_id + tree queries; bigger lift, defer unless analytics show folder limit is biting.
9. **Write-cost optimization** — if notes get long, the whole-blob write model will hurt. Split content into ordered block chunks (`notes/{id}/blocks/{order}`) when a note exceeds ~20KB. Not urgent yet.

---

## Summary

EaseBot's notes are best understood as **"Notion's surface on Google Docs' substrate"**: Tiptap gives a genuinely Notion-like inline editing feel (bubble toolbar, slash menu, callouts, task lists, cover images, emoji icons, sharing, comments), but the underlying single-blob Firestore model means the block-centric power features (drag-reorder, per-block links, reliable collab, version history, stable comment anchors) aren't there. The top three leverage points are unblocking the trash view (trivial), adding a block-id + drag-handle Tiptap extension (medium), and replacing the silent-divergence guard with Y.js collab (large but unblocks the PRD's stated collab goal).
