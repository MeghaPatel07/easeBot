# Notes sharing — server-side changes & Firestore rules proposal

> Companion to the frontend fix on branch `feat/notes-shared-editable`.
> **Everything in this file requires a Firebase/backend deploy, which only Krish runs** (Firebase writes are hook-blocked for the assistant, and `firestore.rules` is edit-blocked per hard rule #5). The frontend fix works on the *current* rules; these changes are the security/correctness hardening that should follow.

---

## 0. TL;DR of the bug & fix

- A note shared with someone by **email as `editor`** stores that grant in `note.collaborators[]` (`editor|commenter|viewer`).
- The invite email links to `/shared/note/<publicShareId>` — a **public link** whose `publicAccess.permission` the mailer **hardcodes to `view`**.
- The old `SharedNote.tsx` derived edit/view **only** from `publicAccess.permission`, so every editor invitee landed **read-only and off-theme**.
- **Frontend fix (shipped on the branch):** `SharedNote.tsx` is now an auth-aware dispatcher. It resolves the *signed-in viewer's* real right from `collaborators[]` (matched by **email**) and routes authorised owner/collaborators into the real notes section (`/:uid/notes/:noteId`) — full themed editor, autosave, comments. Unregistered invitees sign up in-place and are auto-recognised because the grant is keyed by email.

The items below make the **server** agree with that model and close a critical security hole.

---

## 1. 🔴 CRITICAL: the `notes` collection has NO real access control

The notes live in the **`wedding-ease-dc99a`** project. Its deployed rules are the catch-all:

```
// Admins/wedding-ease-admin/firestore.rules  (DEPLOYED to wedding-ease-dc99a)
match /{document=**} { allow read, write: if true; }
```

This means **any client — even unauthenticated — can read or write ANY document** in the project (every note, and everything else). The frontend fix happens to work *because* of this (collaborator writes are allowed), but it must not be the long-term posture.

### Proposed scoped rules for `notes` (+ `noteFolders`, `notes/{id}/comments`)

Add a `notes` block ahead of (or instead of) the catch-all. Validate carefully against the read/query paths in §1.3 before deploying.

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function emailLower() {
      return isSignedIn() && request.auth.token.email != null
        ? request.auth.token.email.lower() : '';
    }

    // ── notes/{noteId} ───────────────────────────────────────────────────
    match /notes/{noteId} {
      function noteData()    { return resource.data; }
      function isOwner()     { return isSignedIn() && noteData().ownerId == request.auth.uid; }
      function isCollab()    { return isSignedIn()
                                 && emailLower() in noteData().collaboratorEmails; }
      function collabPerm()  {
        // collaboratorEmails is the cheap membership check; the per-person
        // permission lives in collaborators[]. Rules can't easily index the
        // array by email, so we gate WRITE on owner + an editor-only mirror
        // (see note below) and keep READ at membership granularity.
        return noteData();
      }
      function isPublic()    { return noteData().publicAccess.enabled == true; }

      // READ: owner, any named collaborator, or anyone if a public link is on.
      allow read: if isOwner() || isCollab() || isPublic();

      // CREATE: only the authenticated owner, and only as themselves.
      allow create: if isSignedIn()
        && request.resource.data.ownerId == request.auth.uid;

      // UPDATE: owner always; collaborators only if they are an EDITOR.
      // Because matching collaborators[].permission by email inside rules is
      // awkward, maintain a parallel `editorEmails` array on the note (write
      // it wherever collaborators[] is written) and gate on that:
      allow update: if isOwner()
        || (isCollab() && emailLower() in noteData().editorEmails);

      // DELETE: owner only.
      allow delete: if isOwner();

      // ── notes/{noteId}/comments/{commentId} ───────────────────────────
      match /comments/{commentId} {
        function parent() {
          return get(/databases/$(database)/documents/notes/$(noteId)).data;
        }
        allow read: if parent().ownerId == request.auth.uid
          || emailLower() in parent().collaboratorEmails
          || parent().publicAccess.enabled == true;
        // Commenters + editors may write comments; viewers may not.
        allow create, update, delete: if isSignedIn()
          && (parent().ownerId == request.auth.uid
              || emailLower() in parent().commenterOrEditorEmails);
      }
    }

    // ── noteFolders/{folderId} ───────────────────────────────────────────
    match /noteFolders/{folderId} {
      allow read, write: if isSignedIn()
        && resource.data.ownerId == request.auth.uid;
      allow create: if isSignedIn()
        && request.resource.data.ownerId == request.auth.uid;
    }

    // keep your existing users/chats/products/etc. blocks …
    // and REMOVE the `match /{document=**} { allow read, write: if true; }`
    // once every collection in dc99a has an explicit block.
  }
}
```

### 1.1 Required data-model mirror (so rules can be enforced cheaply)

Rules can test array membership (`x in resource.data.someArray`) but can't loop `collaborators[]` to read a per-element `permission`. So maintain **denormalised email arrays** alongside `collaborators[]`, written everywhere collaborators change (backend `addCollaborator`/`removeCollaborator`/`updateCollaboratorPermission`, and the FE equivalents):

- `collaboratorEmails: string[]` — already exists ✅ (membership / READ)
- `editorEmails: string[]` — NEW: lowercased emails whose permission is `editor` (gates UPDATE)
- `commenterOrEditorEmails: string[]` — NEW: lowercased emails whose permission is `editor` or `commenter` (gates comment writes)

Keep them all lowercased and in sync. (Alternatively, store a single `roleByEmail` map `{ "a@b.com": "editor" }` and gate with `noteData().roleByEmail[emailLower()] == 'editor'` — cleaner, one field, and avoids three arrays. Recommended if you're touching the write paths anyway.)

### 1.2 ⚠️ Pre-auth resolution by `publicShareId` under scoped rules

The dispatcher currently resolves the note **client-side** via `getNoteByShareIdAny(shareId)` — a query `where('publicShareId','==',shareId)` with **no** `publicAccess.enabled` filter. Under scoped rules, Firestore authorizes a *query* by its **constraints**, not per returned doc: it rejects the query unless the constraints alone prove every match is readable. A bare `where publicShareId == X` proves nothing about owner/collaborator/public, so the query is denied **even for an authenticated collaborator** (Firestore can't know from the constraint that they're on `collaboratorEmails`), and of course for anonymous visitors on a disabled-public note. In short: once scoped rules land, this discovery query fails for *everyone* and must move server-side.

**Recommendation:** when scoped rules go live, move pre-auth resolution to the existing backend endpoint `GET /api/notes/shared/:shareId` (`handleGetSharedNote`, Admin SDK, bypasses rules) which can safely return a minimal payload (note id, title, icon, `publicAccess`, `collaboratorEmails`) for the dispatcher to branch on. Authenticated collaborators can keep reading the live doc directly (the read rule allows them). This keeps anonymous probing impossible while preserving the UX.

### 1.3 Read/query paths to verify before deploying

| Path | Query | Must be allowed for |
|---|---|---|
| `subscribeToNotes` | `where ownerId == uid` | owner ✅ (matches `isOwner`) |
| `subscribeToSharedNotes` | `where collaboratorEmails array-contains emailLower` | collaborator ✅ (matches `isCollab`) |
| `subscribeToNote(id)` (editor in notes section) | doc get | owner/collaborator ✅ |
| `getNoteByShareIdAny` (pre-auth) | `where publicShareId == X` | see §1.2 — route via backend |
| `subscribeToFolders` | `where ownerId == uid` | owner ✅ |

---

## 2. Cloud Function `notesShareNotify` (already edited on this branch)

File: `Admins/wedding-ease-admin/functions/theweddingbot/v1/notes/shareNotify.js`

- **Clarified** that the auto-created `publicAccess: { permission: 'view' }` is only the *anonymous fallback*, NOT the invitee's grant (that was the original bug's server half).
- **Added** an `admin.auth().getUserByEmail(email)` step that backfills `collaborators[].userId` from the email placeholder to the real uid for invitees who already have an account (persisted in one write). Not-yet-registered invitees are simply skipped (recognised by email later).

**If you adopt the `roleByEmail`/`editorEmails` mirror (§1.1), also write those arrays here and in the backend collaborator mutations.**

Deploy: `firebase deploy --only functions:notesShareNotify` (Krish).

---

## 3. Backend `checkNoteAccess` (already edited on this branch)

File: `easebot-backend/src/services/notesService.ts` + `controllers/notesController.ts`

- `checkNoteAccess(noteId, userId, userEmail?)` now matches collaborators by **uid OR email** (case-insensitive), so registered invitees resolve correctly. All 17 controller call sites now pass `req.user?.email`.

### 3.1 Recommended follow-up (not done — behavior change)

`handleUpdateNote` blocks writes when `access.permission === 'view'`. But collaborator permissions are `viewer|commenter|editor`, not `view|comment|edit` — so a **`viewer`/`commenter` collaborator is NOT blocked** from updating content via the backend. Harden to an allow-list:

```ts
const canWrite = access.permission === 'owner' || access.permission === 'editor' || access.permission === 'edit';
if (!access.hasAccess || !canWrite) { res.status(403).json({ error: 'Forbidden' }); return; }
```

(Left as a flagged recommendation since it changes existing behavior; confirm before shipping.)

Deploy: redeploy `easebot-backend` (Krish).

---

## 4. Suggested deploy order

1. Add `editorEmails`/`roleByEmail` (and keep `collaboratorEmails`) to every collaborator write path (backend + FE + Cloud Function) and **backfill existing notes** with a one-off script.
2. Deploy the backend (`checkNoteAccess` email match + §3.1 hardening) and the Cloud Function.
3. Switch the FE dispatcher's pre-auth resolution to the backend `GET /shared/:shareId` (§1.2).
4. **Last:** deploy the scoped `notes` Firestore rules and remove the `if true` catch-all. Test every path in §1.3 in the Firebase Rules Playground first.

Until step 4, the frontend fix is fully functional on the current rules.
