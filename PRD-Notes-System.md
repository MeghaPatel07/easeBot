# PRD: Notes System with Rich Editing & Sharing

**Product:** TheWeddingBot - Wedding Planning AI Assistant
**Feature:** Notion-style Notes with Rich Editor & Collaborative Sharing
**Author:** Engineering Team
**Date:** 2026-04-11
**Status:** Draft
**Priority:** P1

---

## 1. Problem Statement

TheWeddingBot users currently save scattered information across multiple features — saved items (plain text), checklists (structured tasks), liked messages, and budget notes. There is no unified, rich-content note-taking system where users can:

- Create structured documents with headings, lists, images, embeds, and tables
- Organize notes into folders/workspaces
- Share notes with partners, vendors, or family with granular access control (view/edit)
- Collaborate in real-time on wedding planning documents

Users resort to external tools (Notion, Google Docs) to create planning documents, losing the contextual advantage of TheWeddingBot's AI and integrated wedding data.

---

## 2. Goals & Success Metrics

### Goals
1. Provide a Notion-style block-based rich editor natively inside TheWeddingBot
2. Enable granular sharing (view-only, edit) via email invitation or public link
3. Allow embedding of TheWeddingBot assets (gallery images, checklists, budget tables) directly into notes
4. Enable AI-assisted note creation from chat conversations

### Success Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Notes created per active user per week | >= 3 | Firestore analytics |
| Shared notes per user per month | >= 2 | Share event tracking |
| Avg. time spent in notes editor per session | >= 5 min | Session analytics |
| Reduction in external tool usage | 30% decrease | User survey |
| Note-from-chat conversion rate | >= 15% of conversations | `save_as_page` action tracking |

---

## 3. User Personas

| Persona | Description | Primary Use Case |
|---------|-------------|------------------|
| **Couple (Primary)** | Engaged couple planning their wedding | Create planning docs, mood boards, vendor comparison notes |
| **Partner** | Invited partner/fiance(e) | Collaborate on shared notes, add comments |
| **Family Member** | Parents, siblings helping with planning | View-only access to plans, itineraries |
| **Vendor** | Florist, photographer, caterer | View shared briefs, requirements docs |

---

## 4. Feature Scope

### 4.1 Rich Text Editor (Block-based)

The editor follows a **block-based architecture** (like Notion) where each line/element is an independent block that can be reordered, styled, and manipulated individually.

#### Supported Block Types

| Block Type | Description | Priority |
|------------|-------------|----------|
| **Text** | Rich paragraph with inline formatting (bold, italic, underline, strikethrough, code, highlight, link) | P0 |
| **Heading** | H1, H2, H3 levels | P0 |
| **Bulleted List** | Unordered list with nesting | P0 |
| **Numbered List** | Ordered list with nesting | P0 |
| **To-do List** | Checkbox items (syncs with Planner checklists optionally) | P0 |
| **Quote** | Blockquote styling | P0 |
| **Divider** | Horizontal rule separator | P0 |
| **Code Block** | Monospaced code with optional language label | P1 |
| **Image** | Upload from device, paste from clipboard, or pick from TheWeddingBot Gallery | P0 |
| **Table** | Rows & columns with cell editing, add/remove rows/columns | P1 |
| **Callout** | Highlighted info/warning/tip box with icon | P1 |
| **Toggle** | Collapsible content section | P1 |
| **Embed** | Embed external links (Pinterest boards, venue websites) with preview | P2 |
| **File Attachment** | Upload PDFs, docs (stored in Firebase Storage) | P2 |
| **TheWeddingBot Checklist Embed** | Live embed of an existing TheWeddingBot checklist | P1 |
| **TheWeddingBot Budget Embed** | Live embed of budget category/table | P2 |
| **AI Block** | AI-generated content block (user prompts AI inline) | P2 |

#### Slash Command Menu

Typing `/` opens a floating command palette to insert any block type:

```
/text         → Plain text paragraph
/h1           → Heading 1
/h2           → Heading 2
/h3           → Heading 3
/bullet       → Bulleted list
/numbered     → Numbered list
/todo         → To-do checkbox
/quote        → Blockquote
/divider      → Horizontal divider
/code         → Code block
/image        → Image (upload/gallery/URL)
/table        → Table
/callout      → Callout box
/toggle       → Toggle/collapsible
/embed        → External embed
/file         → File attachment
/checklist    → TheWeddingBot checklist embed
/budget       → TheWeddingBot budget embed
/ai           → Ask AI to generate content
```

#### Inline Formatting Toolbar

A floating toolbar appears on text selection with:
- **Bold** (Cmd/Ctrl+B)
- **Italic** (Cmd/Ctrl+I)
- **Underline** (Cmd/Ctrl+U)
- **Strikethrough** (Cmd/Ctrl+Shift+S)
- **Inline Code**
- **Highlight** (background color picker: yellow, green, blue, pink, purple)
- **Link** (Cmd/Ctrl+K) — URL input with preview
- **Text Color** (limited palette matching brand colors)
- **Comment** — inline thread comment on selected text

#### Block-level Actions

Each block shows a drag handle on hover with:
- **Drag & Drop** — reorder blocks via drag handle
- **Block Menu** (click `⋮` or right-click):
  - Duplicate block
  - Delete block
  - Turn into → convert block type (e.g., text → heading, bullet → to-do)
  - Copy link to block
  - Move to → move block to another note
  - Color background (for the block)

#### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | New block below |
| `Shift+Enter` | New line within block |
| `Tab` | Indent (nest list item) |
| `Shift+Tab` | Outdent |
| `Backspace` (empty block) | Delete block, merge with above |
| `/` | Open slash command menu |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+D` | Duplicate block |
| `Cmd/Ctrl+Shift+↑/↓` | Move block up/down |
| `---` + Enter | Insert divider |
| `[]` + Space | Insert to-do |
| `#` + Space | H1 |
| `##` + Space | H2 |
| `###` + Space | H3 |
| `>` + Space | Blockquote |
| `-` / `*` + Space | Bullet list |
| `1.` + Space | Numbered list |

---

### 4.2 Image Handling

#### Image Upload Methods
1. **Device Upload** — File picker (JPEG, PNG, WebP, GIF; max 10MB)
2. **Clipboard Paste** — Cmd/Ctrl+V pastes clipboard images directly
3. **Drag & Drop** — Drag image files onto the editor
4. **TheWeddingBot Gallery** — Browse and insert AI-generated images from existing gallery
5. **URL Embed** — Paste an image URL to embed

#### Image Block Features
- **Resize** — Drag corners to resize; snap to 25%, 50%, 75%, 100% width
- **Alignment** — Left, center, right, full-width
- **Caption** — Optional text caption below image
- **Alt Text** — Accessibility description field
- **Replace** — Swap image without losing position/caption
- **Download** — Download original resolution

#### Storage
- Images uploaded to Firebase Storage at path: `notes/{noteId}/images/{imageId}.{ext}`
- Thumbnails auto-generated at 400px width for list views
- Original preserved for full-resolution viewing
- Storage quota: 500MB per free user, 5GB per premium user

---

### 4.3 Notes Organization

#### Note Properties
Each note has configurable properties:

| Property | Type | Description |
|----------|------|-------------|
| Title | string | Note title (displayed in sidebar) |
| Icon | emoji/icon | Optional icon/emoji before title |
| Cover Image | image | Optional banner image at top of note |
| Tags | string[] | User-defined tags for filtering |
| Category | enum | Wedding category (Venue, Catering, Decor, Attire, Guest List, Ceremony, Reception, Honeymoon, Budget, Vendor, General) |
| Color | enum | Sidebar accent color |
| Favorited | boolean | Pin to top of notes list |
| Created At | timestamp | Auto-set |
| Updated At | timestamp | Auto-updated |
| Created By | userId | Author |
| Last Edited By | userId | Last modifier |

#### Folder Structure
- Notes organized in a **flat list with folders** (one level of nesting)
- Default folders: "All Notes", "Favorites", "Shared with Me", "Trash"
- User-created folders with custom names and icons
- Drag notes between folders
- Notes can exist in only one folder at a time

#### Sidebar Navigation
```
Notes
├── 🔍 Search notes...
├── ✨ All Notes
├── ⭐ Favorites
├── 👥 Shared with Me
├── 🗑️ Trash (auto-empty after 30 days)
├── ─────────────
├── 📁 Venue Research          (user folder)
│   ├── 📝 Top 5 Venues Comparison
│   ├── 📝 Site Visit Notes
│   └── 📝 Vendor Contract Checklist
├── 📁 Guest Management        (user folder)
│   ├── 📝 Guest List Master
│   └── 📝 Seating Chart Draft
└── + New Folder
```

#### Search & Filter
- **Full-text search** across note titles and block content
- **Filter by**: tag, category, date range, shared status, folder
- **Sort by**: last modified, created date, title (A-Z), manual order
- **Recent notes** quick-access list (last 5 opened)

---

### 4.4 Sharing & Access Control

#### Permission Levels

| Level | Capabilities |
|-------|-------------|
| **Owner** | Full control: edit, share, delete, transfer ownership, manage permissions |
| **Editor** | Edit content, add/delete blocks, upload images, add comments. Cannot delete note, change permissions, or share further (unless allowed by owner) |
| **Commenter** | View content + add inline comments and replies. Cannot edit blocks |
| **Viewer** | Read-only access. Can view content but cannot edit or comment |

#### Sharing Methods

##### 1. Email Invitation
- Owner opens Share dialog → enters email address(es)
- Selects permission level (Editor / Commenter / Viewer)
- Optional: Add a personal message
- System sends invitation email via Firebase email trigger
- **Registered users**: Note appears in "Shared with Me" immediately
- **Unregistered users**: Email contains signup link; note becomes accessible after account creation
- Owner can revoke access at any time

##### 2. Public Link Sharing
- Owner generates a shareable link
- Link permission options:
  - **Anyone with the link can view**
  - **Anyone with the link can comment**
  - **Anyone with the link can edit**
  - **Disabled** (only invited people)
- Public links work without authentication (guest access)
- Owner can regenerate link (invalidates old link) or disable sharing
- Optional: Link expiration date (1 day, 7 days, 30 days, never)
- Optional: Password protection on link

##### 3. Partner Auto-Share
- If user has an invited partner (via existing `InvitePartner` feature), all notes are automatically shared with partner as **Editor** by default
- This default can be toggled per-note or globally in settings

#### Share Dialog UI

```
┌─────────────────────────────────────────────┐
│  Share "Venue Research Notes"               │
│                                             │
│  👤 Add people                              │
│  ┌─────────────────────────────────────┐    │
│  │ Enter email addresses...            │    │
│  └─────────────────────────────────────┘    │
│  Permission: [Editor ▾]                     │
│  Message:    [Optional message...]          │
│  [Send Invite]                              │
│                                             │
│  ─── People with access ────────────────    │
│  👤 Krish (you)              Owner          │
│  👤 megha@email.com          Editor  [▾] ✕  │
│  👤 mom@email.com            Viewer  [▾] ✕  │
│                                             │
│  ─── Link sharing ──────────────────────    │
│  🔗 Anyone with the link: [Can view ▾]     │
│  [🔗 Copy link]                             │
│  ☐ Link expires: [Never ▾]                 │
│  ☐ Password protect                        │
│                                             │
│                              [Done]         │
└─────────────────────────────────────────────┘
```

#### Access Control Enforcement
- **Frontend**: UI elements hidden/disabled based on permission level
- **Backend**: Firestore security rules enforce read/write permissions
- **Middleware**: Note access validated on every API call

---

### 4.5 Real-time Collaboration (P1 - Phase 2)

> Note: Real-time co-editing is a Phase 2 feature. Phase 1 focuses on async sharing with last-write-wins conflict resolution.

#### Phase 1 (MVP): Async Collaboration
- Shared notes update on next open/refresh
- If two users edit simultaneously, last save wins
- "Last edited by {name} at {time}" indicator
- Change notifications sent to collaborators

#### Phase 2: Real-time Co-editing
- Firestore real-time listeners on note document
- Presence indicators (avatars of active viewers)
- Cursor positions of other editors
- Operational Transform (OT) or CRDT-based conflict resolution
- Block-level locking (while one user edits a block, others see a subtle lock indicator)

---

### 4.6 Comments & Threads

#### Inline Comments
- Select text → click "Comment" in toolbar
- Creates a comment thread anchored to the selected text
- Highlighted text appears with a yellow/gold background
- Click highlighted text to open comment thread sidebar

#### Comment Thread Features
- Reply to comments (threaded)
- Resolve/unresolve threads
- @mention collaborators (sends notification)
- Emoji reactions on comments
- Edit/delete own comments
- Timestamps on all comments

#### Comment Sidebar
```
┌──────────────────────┐
│ Comments (3)         │
│                      │
│ 📌 "venue capacity"  │
│ Krish: Can we check  │
│ if 300 is enough?    │
│ └─ Megha: Yes, venue │
│    confirmed 350 max │
│ [Resolved ✓]         │
│                      │
│ 📌 "floral budget"   │
│ Mom: This seems high │
│ └─ Reply...          │
│                      │
└──────────────────────┘
```

---

### 4.7 AI Integration

#### Save Chat as Note
- Existing `save_as_page` tool action converts AI chat responses into a formatted note
- User clicks "Save as Note" on any assistant message
- AI structures the response with proper headings, lists, and formatting
- Opens in Notes editor for further editing

#### AI Writing Assistant (In-Editor)
- `/ai` slash command or "Ask AI" button
- User types a prompt; AI generates content inline
- Capabilities:
  - Generate wedding-specific content (vows, speeches, itineraries)
  - Summarize existing note content
  - Expand bullet points into paragraphs
  - Translate note content
  - Format/restructure content
- Uses existing Azure OpenAI backend with wedding-specific system prompt

#### Smart Templates
AI-powered templates for common wedding documents:

| Template | Description |
|----------|-------------|
| Venue Comparison | Table comparing venues on key criteria |
| Guest List | Structured guest list with RSVP tracking |
| Wedding Day Timeline | Hour-by-hour schedule |
| Vendor Contact Sheet | Contact info + contract status |
| Budget Breakdown | Category-based budget tracker |
| Seating Chart | Table-based seating assignments |
| Ceremony Script | Ceremony order with readings, vows |
| Reception Runsheet | Reception schedule + vendor cues |
| Honeymoon Itinerary | Day-by-day travel plan |
| Thank You Note Tracker | List of gifts + thank you status |

---

## 5. Data Model

### Firestore Collections

#### `notes/{noteId}`
```typescript
interface Note {
  id: string;
  title: string;
  icon: string | null;            // emoji or icon identifier
  coverImage: string | null;      // Firebase Storage URL
  
  // Content
  blocks: Block[];                // Ordered array of content blocks
  
  // Organization
  folderId: string | null;        // null = root level
  tags: string[];
  category: NoteCategory;
  color: string | null;
  favorited: boolean;
  
  // Ownership & Access
  ownerId: string;                // Firebase Auth UID
  ownerEmail: string;
  collaborators: Collaborator[];  // Invited users
  publicAccess: PublicAccess;     // Link sharing settings
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastEditedBy: string;           // UID
  wordCount: number;
  isDeleted: boolean;             // Soft delete (trash)
  deletedAt: Timestamp | null;
  
  // Source tracking
  sourceThreadId: string | null;  // If created from chat
  sourceType: 'manual' | 'from_chat' | 'template';
  templateId: string | null;
}

type NoteCategory = 
  | 'venue' | 'catering' | 'decor' | 'attire' 
  | 'guest_list' | 'ceremony' | 'reception' 
  | 'honeymoon' | 'budget' | 'vendor' | 'general';

interface Block {
  id: string;                     // UUID
  type: BlockType;
  content: string;                // Rich text content (stored as HTML or markdown)
  properties: BlockProperties;    // Type-specific properties
  children: Block[];              // Nested blocks (for lists, toggles)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;              // UID
}

type BlockType = 
  | 'text' | 'heading_1' | 'heading_2' | 'heading_3'
  | 'bulleted_list' | 'numbered_list' | 'todo'
  | 'quote' | 'divider' | 'code' | 'image'
  | 'table' | 'callout' | 'toggle'
  | 'embed' | 'file' | 'checklist_embed' | 'budget_embed'
  | 'ai_block';

interface BlockProperties {
  // Heading
  level?: 1 | 2 | 3;
  
  // Todo
  checked?: boolean;
  
  // Image
  imageUrl?: string;
  imageWidth?: number;            // percentage: 25, 50, 75, 100
  imageAlignment?: 'left' | 'center' | 'right' | 'full';
  caption?: string;
  altText?: string;
  
  // Code
  language?: string;
  
  // Table
  rows?: string[][];              // 2D array of cell contents
  headerRow?: boolean;
  
  // Callout
  calloutType?: 'info' | 'warning' | 'tip' | 'important';
  calloutIcon?: string;
  
  // Toggle
  isOpen?: boolean;
  summary?: string;
  
  // Embed
  embedUrl?: string;
  embedType?: 'link' | 'pinterest' | 'youtube' | 'maps';
  
  // File
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  
  // TheWeddingBot embeds
  checklistId?: string;
  budgetCategoryId?: string;
  
  // AI Block
  aiPrompt?: string;
  aiGenerated?: boolean;
  
  // Common
  backgroundColor?: string;
  textColor?: string;
}
```

#### `notes/{noteId}/comments/{commentId}`
```typescript
interface Comment {
  id: string;
  noteId: string;
  blockId: string;                // Which block the comment is on
  anchorText: string;             // Selected text the comment is anchored to
  
  authorId: string;
  authorName: string;
  authorEmail: string;
  
  content: string;
  parentCommentId: string | null; // For threaded replies
  
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Timestamp | null;
  
  reactions: Record<string, string[]>; // emoji → [userIds]
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isEdited: boolean;
  isDeleted: boolean;
}
```

#### `noteFolders/{folderId}`
```typescript
interface NoteFolder {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  order: number;                  // Sort order in sidebar
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `noteInvitations/{invitationId}`
```typescript
interface NoteInvitation {
  id: string;
  noteId: string;
  noteTitle: string;
  
  invitedBy: string;              // UID
  invitedByName: string;
  invitedByEmail: string;
  
  inviteeEmail: string;           // Target email
  inviteeUserId: string | null;   // Resolved after signup
  
  permission: 'editor' | 'commenter' | 'viewer';
  message: string | null;         // Personal message
  
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  
  createdAt: Timestamp;
  respondedAt: Timestamp | null;
  expiresAt: Timestamp | null;
}
```

#### Shared Types
```typescript
interface Collaborator {
  userId: string;
  email: string;
  name: string;
  permission: 'editor' | 'commenter' | 'viewer';
  addedAt: Timestamp;
  addedBy: string;
}

interface PublicAccess {
  enabled: boolean;
  permission: 'view' | 'comment' | 'edit';
  shareId: string;                // Short unique ID for URL
  password: string | null;        // Hashed if set
  expiresAt: Timestamp | null;
  createdAt: Timestamp;
}
```

### Firestore Indexes Required
```
notes: ownerId ASC, updatedAt DESC           → user's notes sorted by recent
notes: ownerId ASC, folderId ASC, updatedAt DESC → notes in folder
notes: ownerId ASC, favorited ASC, updatedAt DESC → favorites
notes: ownerId ASC, isDeleted ASC, deletedAt DESC → trash
notes: collaborators.userId ASC, updatedAt DESC → shared with me
notes: publicAccess.shareId ASC              → public link lookup
noteInvitations: inviteeEmail ASC, status ASC → pending invitations
noteFolders: ownerId ASC, order ASC          → user folders
```

### Firestore Security Rules
```javascript
match /notes/{noteId} {
  // Owner can do everything
  allow read, write: if request.auth != null 
    && resource.data.ownerId == request.auth.uid;
  
  // Collaborators can read
  allow read: if request.auth != null
    && request.auth.uid in resource.data.collaborators.map(c => c.userId);
  
  // Editor collaborators can write (except ownership/sharing fields)
  allow update: if request.auth != null
    && resource.data.collaborators.exists(c => 
      c.userId == request.auth.uid && c.permission == 'editor')
    && !request.resource.data.diff(resource.data).affectedKeys()
      .hasAny(['ownerId', 'collaborators', 'publicAccess']);
  
  // Public access (view)
  allow read: if resource.data.publicAccess.enabled == true
    && resource.data.publicAccess.permission in ['view', 'comment', 'edit'];
}
```

---

## 6. Technical Architecture

### Frontend Components

```
src/
├── components/
│   ├── notes/
│   │   ├── NotesView.tsx              # Main notes page (sidebar + editor)
│   │   ├── NotesSidebar.tsx           # Folders, note list, search
│   │   ├── NoteEditor.tsx             # Block editor wrapper
│   │   ├── NoteHeader.tsx             # Title, icon, cover image, properties
│   │   ├── NoteShareDialog.tsx        # Sharing modal
│   │   ├── NoteTemplateDialog.tsx     # Template picker
│   │   ├── NoteCommentsSidebar.tsx    # Comments panel
│   │   ├── blocks/
│   │   │   ├── TextBlock.tsx
│   │   │   ├── HeadingBlock.tsx
│   │   │   ├── ListBlock.tsx
│   │   │   ├── TodoBlock.tsx
│   │   │   ├── ImageBlock.tsx
│   │   │   ├── TableBlock.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── CalloutBlock.tsx
│   │   │   ├── ToggleBlock.tsx
│   │   │   ├── DividerBlock.tsx
│   │   │   ├── EmbedBlock.tsx
│   │   │   ├── FileBlock.tsx
│   │   │   ├── ChecklistEmbedBlock.tsx
│   │   │   ├── BudgetEmbedBlock.tsx
│   │   │   └── AIBlock.tsx
│   │   ├── toolbar/
│   │   │   ├── FloatingToolbar.tsx     # Inline formatting toolbar
│   │   │   ├── SlashCommandMenu.tsx    # Block type insertion menu
│   │   │   └── BlockMenu.tsx           # Per-block action menu
│   │   └── shared/
│   │       ├── SharedNoteView.tsx       # Public shared note page
│   │       └── NoteAccessDenied.tsx     # Unauthorized access page
│   └── ...
├── services/
│   ├── notesService.ts                 # CRUD, real-time listeners
│   ├── notesSharingService.ts          # Sharing, permissions, invitations
│   └── notesStorageService.ts          # Image/file upload
├── hooks/
│   ├── useNotes.ts                     # Notes list state & operations
│   ├── useNoteEditor.ts               # Editor state, undo/redo, autosave
│   └── useNoteSharing.ts              # Sharing state & operations
└── types/
    └── notes.ts                        # Note-specific types
```

### Editor Library

**Recommended: [Tiptap](https://tiptap.dev/)** (headless, extensible, built on ProseMirror)

Rationale:
- Block-based architecture matches our requirements
- React integration is first-class
- Slash commands, floating menus, drag & drop are built-in extensions
- Collaborative editing support via Yjs (Phase 2)
- Highly customizable — we can style blocks with our shadcn/Tailwind design system
- MIT licensed, well-maintained
- Used by GitLab, Substack, and others at scale

Key Tiptap Extensions to use:
```
@tiptap/starter-kit          → basic text, headings, lists, code, blockquote
@tiptap/extension-image      → image blocks
@tiptap/extension-table      → table support
@tiptap/extension-task-list  → to-do checkboxes
@tiptap/extension-highlight  → text highlighting
@tiptap/extension-link       → hyperlinks
@tiptap/extension-placeholder → empty state placeholder text
@tiptap/extension-character-count → word/char count
@tiptap/extension-color      → text color
@tiptap/extension-underline  → underline formatting
@tiptap/extension-text-align → text alignment
tiptap-extension-slash-command → slash menu (custom)
@tiptap/extension-collaboration → Phase 2 real-time
```

### Backend Additions

```
easebot-backend/src/
├── controllers/
│   └── notesController.ts        # Note CRUD + sharing endpoints
├── routes/
│   └── notes.ts                  # Route definitions
├── services/
│   ├── notesService.ts           # Business logic
│   └── notesSharingService.ts    # Invitation emails, permission validation
└── schemas/
    └── notes.ts                  # Zod validation schemas
```

### API Endpoints

```
# Note CRUD
POST   /api/notes                       → Create note
GET    /api/notes                       → List user's notes (with filters)
GET    /api/notes/:noteId               → Get note by ID
PATCH  /api/notes/:noteId               → Update note (content, properties)
DELETE /api/notes/:noteId               → Soft delete (move to trash)
POST   /api/notes/:noteId/restore       → Restore from trash
DELETE /api/notes/:noteId/permanent     → Permanent delete

# Note content
PATCH  /api/notes/:noteId/blocks        → Batch update blocks (autosave)
POST   /api/notes/:noteId/images        → Upload image to note
DELETE /api/notes/:noteId/images/:imgId → Delete image

# Folders
POST   /api/notes/folders               → Create folder
GET    /api/notes/folders               → List folders
PATCH  /api/notes/folders/:folderId     → Update folder
DELETE /api/notes/folders/:folderId     → Delete folder
PATCH  /api/notes/:noteId/move          → Move note to folder

# Sharing
POST   /api/notes/:noteId/share         → Invite collaborator(s)
PATCH  /api/notes/:noteId/share/:userId → Update collaborator permission
DELETE /api/notes/:noteId/share/:userId → Remove collaborator
POST   /api/notes/:noteId/public-link   → Enable/configure public link
DELETE /api/notes/:noteId/public-link   → Disable public link
GET    /api/notes/shared/:shareId       → Access note via public link
GET    /api/notes/invitations           → List pending invitations
POST   /api/notes/invitations/:id/accept → Accept invitation
POST   /api/notes/invitations/:id/decline → Decline invitation

# Comments
POST   /api/notes/:noteId/comments              → Add comment
GET    /api/notes/:noteId/comments              → List comments
PATCH  /api/notes/:noteId/comments/:commentId   → Edit comment
DELETE /api/notes/:noteId/comments/:commentId   → Delete comment
POST   /api/notes/:noteId/comments/:commentId/resolve → Resolve thread
POST   /api/notes/:noteId/comments/:commentId/react   → Add reaction

# AI
POST   /api/notes/:noteId/ai/generate   → Generate content for AI block
POST   /api/notes/from-chat              → Create note from chat message

# Templates
GET    /api/notes/templates              → List available templates
POST   /api/notes/from-template/:templateId → Create note from template

# Search
GET    /api/notes/search?q=...           → Full-text search across notes
```

### Routing (Frontend)

Add to existing React Router config in `App.tsx`:

```
/:userId/notes                    → Notes list view
/:userId/notes/:noteId            → Note editor view
/shared/note/:shareId             → Public shared note (no auth required)
```

---

## 7. User Flows

### 7.1 Create a New Note
```
User clicks "+ New Note" in sidebar
  → Empty note created with default title "Untitled"
  → Editor opens with cursor in title field
  → User types title, presses Enter
  → Cursor moves to first content block
  → User types or uses / command to insert blocks
  → Content autosaves every 3 seconds (debounced)
  → Note appears in sidebar list
```

### 7.2 Create Note from Chat
```
User is in chat conversation
  → AI provides a detailed response (e.g., venue comparison)
  → User clicks "Save as Note" button on the message
  → System calls POST /api/notes/from-chat
  → AI formats the response into proper blocks (headings, lists, tables)
  → Note created and opened in editor
  → User can further edit and organize
```

### 7.3 Share a Note via Email
```
User opens a note → clicks "Share" button
  → Share dialog opens
  → User enters email: "partner@email.com"
  → Selects permission: "Editor"
  → Adds optional message: "Please review the venue list"
  → Clicks "Send Invite"
  → System creates noteInvitation document
  → Email sent to partner@email.com
  → If partner is registered: note appears in "Shared with Me"
  → If partner is unregistered: email includes signup link
  → Partner opens note → can edit content
  → Owner sees partner's edits on next refresh
```

### 7.4 Share via Public Link
```
User opens Share dialog → scrolls to "Link sharing"
  → Toggles "Anyone with the link" → selects "Can view"
  → Clicks "Copy link"
  → Link format: https://app.easebot.com/shared/note/{shareId}
  → User shares link via WhatsApp/email/etc.
  → Recipient opens link → sees read-only note view
  → No authentication required
```

### 7.5 Insert Image
```
User types /image → Image insertion dialog opens
  → Three tabs: Upload | Gallery | URL
  
  Upload tab:
    → User selects file from device
    → Image uploaded to Firebase Storage
    → Loading placeholder shown during upload
    → Image block inserted with full-width display
  
  Gallery tab:
    → Grid of user's AI-generated images from TheWeddingBot Gallery
    → User clicks to select → image block inserted
  
  URL tab:
    → User pastes image URL → preview shown
    → User confirms → image block inserted
    
  → User can resize via corner handles
  → User can add caption below image
```

### 7.6 Collaborate with Comments
```
Editor/Commenter selects text in shared note
  → Floating toolbar shows "Comment" button
  → Clicks Comment → comment input appears
  → Types: "Can we get pricing for this venue?"
  → Submits → highlighted text marked in gold
  → Note owner receives notification
  → Owner opens note → sees highlighted text
  → Clicks highlight → comment sidebar opens
  → Owner replies: "Already emailed them, waiting for response"
  → Owner resolves thread when done
```

---

## 8. UI/UX Design Specifications

### Design System Integration
- Follow existing TheWeddingBot design system (warm gold primary `#C6944A`, Noto Serif headings, Inter body)
- Editor background: clean white/cream with subtle paper texture option
- Block hover states: subtle left border highlight in primary color
- Consistent spacing: 16px between blocks, 8px padding within blocks

### Mobile Responsiveness
- Notes sidebar collapses to bottom sheet on mobile
- Editor takes full width on mobile
- Floating toolbar becomes fixed bottom bar on mobile
- Slash command menu becomes full-screen modal on mobile
- Image resize via pinch gesture on mobile
- Swipe actions on note list items (archive, delete, share)

### Accessibility
- All blocks keyboard navigable (arrow keys between blocks)
- Screen reader announcements for block type changes
- ARIA labels on all toolbar buttons
- Focus management on block creation/deletion
- High contrast mode support
- Minimum touch target 44x44px on mobile

### Empty States
- No notes: Illustration + "Create your first note" CTA + template suggestions
- Empty folder: "This folder is empty. Drag notes here or create a new one."
- No search results: "No notes matching '{query}'. Try different keywords."
- Shared with Me (empty): "No notes have been shared with you yet."

---

## 9. Phased Delivery Plan

### Phase 1 — MVP (4-5 weeks)
**Core Editor + Basic Sharing**

| Week | Deliverables |
|------|-------------|
| Week 1 | Tiptap editor setup, basic blocks (text, headings, lists, quote, divider, todo), note CRUD, Firestore schema, autosave |
| Week 2 | Image upload/paste/gallery integration, slash command menu, inline formatting toolbar, block drag-and-drop |
| Week 3 | Notes sidebar, folders, search, favorites, categories, tags |
| Week 4 | Email sharing (invite flow), permission levels (view/edit), public link sharing, shared note view |
| Week 5 | Save-from-chat integration, templates (3-5 basic), polish, bug fixes, mobile responsive |

### Phase 2 — Enhanced (3-4 weeks)
**Advanced Blocks + Collaboration**

| Week | Deliverables |
|------|-------------|
| Week 6 | Table block, code block, callout block, toggle block |
| Week 7 | Comments system (inline threads, resolve, reactions), commenter permission level |
| Week 8 | TheWeddingBot checklist embed, budget embed, file attachments |
| Week 9 | AI writing assistant (/ai block), remaining templates, notification integration |

### Phase 3 — Real-time (2-3 weeks)
**Live Collaboration**

| Week | Deliverables |
|------|-------------|
| Week 10 | Real-time sync via Firestore listeners, presence indicators |
| Week 11 | Cursor tracking, block-level locking, conflict resolution |
| Week 12 | External embeds (Pinterest, YouTube, Maps), link password protection, analytics |

---

## 10. Edge Cases & Error Handling

| Scenario | Handling |
|----------|---------|
| Two editors save simultaneously (Phase 1) | Last write wins; "Note was updated by {name}" toast on stale save |
| User loses connection while editing | Autosave queues changes locally; syncs on reconnect |
| Image upload fails | Retry with exponential backoff (3 attempts); show error with manual retry button |
| Note exceeds size limit | Warn at 80% capacity (1MB/note); block further additions at limit |
| Shared user's account deleted | Collaborator entry preserved; displayed as "Removed User" |
| Public link password forgotten | Owner can reset or regenerate link |
| Note in trash edited via shared link | Block edits; show "This note has been deleted by the owner" |
| Circular folder nesting | Not possible — single level of folder nesting only |
| 100+ blocks in a note | Virtualized rendering (only render visible blocks + buffer) |
| Concurrent comment + edit | Comments anchored by block ID; text anchor may shift — reattach heuristically |

---

## 11. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| XSS via rich text content | Sanitize all HTML output with DOMPurify; Tiptap uses ProseMirror's safe schema |
| Unauthorized note access | Firestore rules enforce ownership + collaborator checks; backend middleware validates on every request |
| Image storage abuse | Per-user storage quota; file type validation (magic bytes, not just extension); max 10MB per image |
| Public link enumeration | Share IDs are UUID v4 (128-bit); rate limit on shared note endpoint |
| Invitation spam | Rate limit: max 20 invitations per user per day; require email verification |
| Data exfiltration via sharing | Audit log of all share/unshare actions; owner notified of new collaborators |
| Content in Firebase Storage | Signed URLs with 1-hour expiry for images; no direct bucket access |

---

## 12. Dependencies & Prerequisites

| Dependency | Status | Action Required |
|------------|--------|-----------------|
| Firebase Auth | Existing | No changes |
| Firestore | Existing | Add collections + indexes + rules |
| Firebase Storage | Existing | Add `notes/` path + quota rules |
| Tiptap Editor | New | Install npm packages |
| DOMPurify | New | Install for HTML sanitization |
| Email service (SendGrid/Firebase Extensions) | New | Set up for invitation emails |
| react-beautiful-dnd or dnd-kit | Existing (shadcn) | Extend for block drag-and-drop |

---

## 13. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| 1 | Should notes content be stored as JSON (Tiptap native) or HTML? JSON is easier for manipulation; HTML is easier for rendering shared views. | Engineering | **Recommendation: JSON** — Tiptap's native format; render to HTML only for public shared views |
| 2 | Do we need version history / undo beyond the session? (like Notion's page history) | Product | Deferred to Phase 3 |
| 3 | Should the existing Saved Items feature be migrated into Notes? | Product | Recommended: keep both, but allow "Convert to Note" action on saved items |
| 4 | Max number of notes per free user? | Product | Suggestion: 20 notes (free), unlimited (premium) |
| 5 | Should vendors be able to comment on notes shared with them without creating an account? | Product | Deferred — Phase 1 requires account for commenting |
| 6 | Offline support for note editing? | Engineering | Deferred — Firestore has built-in offline persistence; needs testing |

---

## 14. Appendix

### A. Competitive Analysis

| Feature | Notion | Google Docs | TheWeddingBot Notes (Proposed) |
|---------|--------|-------------|--------------------------|
| Block editor | Yes | No (line-based) | Yes |
| Slash commands | Yes | Limited | Yes |
| Sharing | Email + Link | Email + Link | Email + Link + Partner auto-share |
| Permission levels | Full page / Edit / View / Comment | Owner / Editor / Commenter / Viewer | Owner / Editor / Commenter / Viewer |
| Real-time collab | Yes | Yes | Phase 2 |
| AI writing | Yes (paid) | Gemini | Included (wedding-specific) |
| Domain-specific | No | No | Yes (wedding templates, AI modes, asset embeds) |
| Mobile | App | App | Responsive web (PWA later) |
| Price | Free tier limited | Free | Included in TheWeddingBot |

### B. Figma Wireframe Checklist
- [ ] Notes sidebar with folders
- [ ] Empty note state
- [ ] Editor with various block types
- [ ] Slash command menu
- [ ] Floating formatting toolbar
- [ ] Image block with resize handles
- [ ] Share dialog
- [ ] Public shared note view
- [ ] Comment sidebar
- [ ] Mobile layouts for all above
- [ ] Note card in sidebar (hover, active, shared indicator)
- [ ] Template picker dialog

---

*End of PRD*
