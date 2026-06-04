# PRD — Cross-User Access Control / IDOR: any URL opens for any account

| Field | Value |
|---|---|
| **Proposed ticket** | `WE-20260603-001` (not yet filed — see §10) |
| **Author** | Claude (analysis), reported by Shilpa/Krish |
| **Date** | 2026-06-03 |
| **Severity** | **P0 — Critical** (OWASP A01:2021 Broken Access Control; CWE-639 / CWE-284 / CWE-862) |
| **Status** | Draft — analysis complete, awaiting decision on rollout |
| **Repos** | `Wedding-Ease-Viva-Chat` (frontend), `easebot-backend` (backend), `Admins/wedding-ease-admin` (deployed Firestore rules) |
| **Live project** | `wedding-ease-dc99a` |
| **Related** | `docs/notes-sharing-firestore-rules-proposal.md` (notes-only companion); tickets `WE-20260527-204`, `-211`, `-214`, `-057`, `-031`, `-032` (adjacent, not this bug); memory `project_notes_sharing_fix` |

---

## 1. TL;DR

A user copies the URL of one of their chats / notes / checklist / budget / gallery items and pastes it into a **different browser or a different logged-in account**. The content opens in full, with read **and write** access. Content created by one user is reachable by anyone — not just other logged-in users, but anyone at all.

**The root cause is not the URL and not a frontend routing mistake.** The live database (`wedding-ease-dc99a`) is deployed with the catch-all rule:

```
match /{document=**} { allow read, write: if true; }
```

This grants **every person on the internet** — authenticated or not — full read **and write** access to **every document**: all users' profiles, chats, messages, notes, checklists, budgets, images, support tickets — everything. The copy-paste-URL symptom is just the most visible face of a database that has **no access control at all**.

The well-written `Wedding-Ease-Viva-Chat/firestore.rules` (with proper `request.auth.uid == userId` checks) is a **paper tiger** — it is **not the ruleset deployed to the live project**. A reviewer reading only that file would wrongly conclude the app is secure.

---

## 2. Impact / blast radius

| Dimension | Detail |
|---|---|
| **Who can exploit** | **Anyone** — no account required. `if true` does not even check `request.auth != null`. The Firebase web API key needed to connect is shipped in the public JS bundle (by design — it is not a secret; the rules are supposed to be the trust boundary). |
| **What is exposed** | Every collection in `dc99a`: `users/{uid}` (name, email, phone, wedding date, budget, partner, tone settings, premium status), `chats` + `messages` (entire private conversation history), `notes` (+ folders, comments), `userImages`, `timelineEvents`, `support_tickets`, and all `users/{uid}/*` subcollections (checklists, reminders, shoppingLists, savedItems, notifications, projects, likedProducts, budget). |
| **Read** | Full. An attacker can dump the entire database with a short script — no URL needed; the URL is just the convenient symptom the user noticed. |
| **Write** | **Full.** `if true` covers writes. Anyone can **modify or delete** any other user's notes, chats, profile, budget — or inject content. This is data-integrity and vandalism risk, not just confidentiality. |
| **PII / compliance** | Names, emails, phone numbers, wedding plans, spending — bulk-exfiltratable. This is a reportable data-exposure class of issue. |
| **Why it "works" today** | The current editable-shared-notes feature *relies* on these permissive rules (see `project_notes_sharing_fix` memory). That is exactly why fixing this requires care, not a one-line flip — see §7. |

---

## 3. Reproduction

**As reported (the visible symptom):**
1. Sign in as User A. Create a chat, a note, a checklist.
2. Copy a URL, e.g. `/chat/<threadId>` or `/shared/note/<shareId>` or `/<A-uid>/notes/<noteId>`.
3. Open it in a different Chrome profile (logged in as User B, or not logged in at all).
4. **Actual:** content loads with full access. **Expected:** 403 / access-denied / request-access gate unless A shared it with that person.

**The deeper proof (no URL needed):**
1. Open the app, grab `VITE_FIREBASE_*` from the bundle (public).
2. From any unauthenticated context, run a client query against `notes` / `chats` / `users`.
3. **Actual:** every document returns and is writable. This confirms the trust boundary is missing at the database, not the UI.

---

## 4. Root-cause hierarchy (ranked)

### RC-1 — **PRIMARY · Catastrophic** · Live Firestore rules are `allow read, write: if true`
- The frontend connects to `wedding-ease-dc99a` (`Wedding-Ease-Viva-Chat/.firebaserc` → `default: wedding-ease-dc99a`; config from `VITE_FIREBASE_PROJECT_ID` in `src/lib/firebase.ts:10`).
- The **deployed** rules on that project are the catch-all in `Admins/wedding-ease-admin/firestore.rules`:
  ```
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
  ```
- **The scoped `Wedding-Ease-Viva-Chat/firestore.rules` is not effective on the live project.** Two repos target the same `dc99a` project; the admin repo's catch-all is what is live (confirmed by the memory and by the bug reproducing). The Viva-Chat rules file with `request.auth.uid == userId` checks is aspirational/unused.
- This single fact is sufficient to cause the entire bug. **Until this is fixed, no amount of frontend or backend hardening secures the data** — a scripted client bypasses all app code.

### RC-2 — **Enabler** · Resource-id / owner-id addressable routes, read directly by the client SDK
With permissive rules, any id in a URL is directly fetchable from the client:
- `/chat/:threadId` → `loadLatestMessages(threadId)` reads `chats/{threadId}/messages` directly (`src/services/chatService.ts`, called from `src/hooks/useChat.ts:loadChat`). No owner check.
- `/shared/note/:shareId` → `getNoteByShareIdAny(shareId)` resolves **any** note **even when public access is disabled**, then `subscribeToNote(id)` reads the doc directly (`src/pages/SharedNote.tsx:84-102`).
- `/:userId/notes/:noteId` → `NotesView` sets `setActiveNoteId(urlNoteId)` (`src/components/notes/NotesView.tsx:78`) → `useNoteEditor(activeNoteId, …)` opens **that exact note id** regardless of owner (line 92). This is a direct IDOR path for notes.

> **Important nuance (corrects a common misread):** the per-user *list* views are **not** the leak. `Index.tsx` passes `user.uid` — the **authenticated** user's own uid — to `NotesView`, `BudgetDashboard`, `PlannerView`, `GalleryView`, `TimelineView`, etc. (`src/pages/Index.tsx:1196,1235,1338–1357`), and `activeUserId = user?.uid ?? urlUserId` (line 244) prefers the real user. So User B visiting `/<A-uid>/notes` sees **their own** notes, not A's. The leak is via **id-addressed reads** (RC-2) sitting on top of **open rules** (RC-1) — not via the `:userId` path segment.

### RC-3 — **Defense-in-depth gap** · No frontend route guards
- No `<ProtectedRoute>` / ownership comparison anywhere in `src/App.tsx`.
- Logged-out access to `/:userId/*` falls back to `activeUserId = urlUserId` (`Index.tsx:244`); per-user views are gated behind `&& user`, but chat and shared routes are not, and direct Firestore reads happen regardless of the UI gate.

### RC-4 — **Defense-in-depth gap** · Backend trusts ids without ownership checks
- `getChatHistory(threadId)` (`easebot-backend/src/controllers/chatController.ts:~380`) reads any thread's messages with the **Admin SDK**, which bypasses rules — no check that the caller owns the thread. An attacker can POST a victim's `threadId` to `/chat` and have the victim's private history fed into the model.
- Notes endpoints **do** check ownership via `checkNoteAccess()` (`easebot-backend/src/controllers/notesController.ts:42`) — good — but the frontend bypasses the backend by reading Firestore directly, so that check doesn't protect reads today.

---

## 5. Affected surfaces

| Surface | Route | Owner field | Leaks via | Notes |
|---|---|---|---|---|
| Chat | `/chat/:threadId` | `chats/{id}.userId` | RC-1 + RC-2 | Viva-Chat rules *would* protect this, but they aren't deployed. |
| Notes | `/:uid/notes/:noteId`, `/shared/note/:shareId` | `notes/{id}.ownerId` + `collaborators[]` | RC-1 + RC-2 | `getNoteByShareIdAny` resolves regardless of `publicAccess.enabled`. |
| Note folders | (within notes view) | `noteFolders/{id}` | RC-1 | No rule. |
| Checklist / Planner | `/:uid/planner[/:checklistId]` | `users/{uid}/checklists/{id}` | RC-1 | Uses `user.uid` in UI; exposed only via open rules / scripted read. |
| Budget | `/:uid/budget` | `users/{uid}/budget/main` | RC-1 | Same. |
| Gallery / Images | `/:uid/gallery`, `/:uid/images` | `userImages.userId` | RC-1 | Top-level `userImages`, no rule. |
| Timeline | `/:uid/timeline` | `timelineEvents.userId` | RC-1 | Top-level `timelineEvents`, no rule. |
| Shopping / Saved / Reminders / Notifications | `/:uid/*` | `users/{uid}/*` subcollections | RC-1 | No subcollection rules. |
| Profile (PII) | (settings) | `users/{uid}` | RC-1 | Name, email, phone, wedding date. |
| Support tickets | — | `support_tickets` | RC-1 | No rule. |
| **Shared chat (by design)** | `/share/:shareId` | `sharedChats/{shareId}` | — | Intentionally public, read-only snapshot. Keep public-read, lock writes. |

---

## 6. Solution — layered defense (the trust boundary must be the database)

The fix must restore the database as the trust boundary (RC-1), then add defense-in-depth in app code (RC-2/3/4). **App-layer fixes alone are insufficient** — a scripted client ignores them.

### 6.1 PRIMARY — Deploy real Firestore rules to `wedding-ease-dc99a` (closes RC-1)
Replace the catch-all `allow read, write: if true` with scoped, owner-checked rules covering **every** collection. Unlisted paths default-deny, so the ruleset must be **complete** or it breaks features (see §7).

> ⚠️ **Constraints:** Editing `firestore.rules` and deploying are **hook-blocked for the assistant** (hard rules #1 & #5). The proposed rules below are a **specification for Krish to review, place in the correct repo's `firestore.rules`, and deploy.** The notes block depends on the backfill + server-side resolution in §6.2 — do not deploy notes rules before that, or sharing breaks.

Proposed ruleset (review against actual field names and the full collection inventory before deploy):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function owns(uid)  { return signedIn() && request.auth.uid == uid; }
    function emailLower() {
      return signedIn() && request.auth.token.email != null
        ? request.auth.token.email.lower() : '';
    }

    // users/{uid} + ALL subcollections (checklists, budget, reminders,
    // shoppingLists, savedItems, notifications, projects, likedProducts, …)
    match /users/{uid} {
      allow read, write: if owns(uid);
      match /{sub=**} { allow read, write: if owns(uid); }
    }

    // chats + messages (ownership by chats/{id}.userId)
    match /chats/{threadId} {
      allow read, update, delete: if signedIn() && resource.data.userId == request.auth.uid;
      allow create: if signedIn() && request.resource.data.userId == request.auth.uid;
      match /messages/{messageId} {
        allow read, write: if signedIn()
          && get(/databases/$(database)/documents/chats/$(threadId)).data.userId == request.auth.uid;
      }
    }

    // notes + folders + comments — depends on §6.2 (collaboratorEmails mirror,
    // server-side shareId resolution). See docs/notes-sharing-firestore-rules-proposal.md.
    match /notes/{noteId} {
      allow read:   if signedIn() && (
                       resource.data.ownerId == request.auth.uid
                       || emailLower() in resource.data.collaboratorEmails );
      allow update: if signedIn() && (
                       resource.data.ownerId == request.auth.uid
                       || emailLower() in resource.data.editorEmails );   // editor-only mirror
      allow create: if signedIn() && request.resource.data.ownerId == request.auth.uid;
      allow delete: if signedIn() && resource.data.ownerId == request.auth.uid;
      match /comments/{commentId} {
        allow read, write: if signedIn() && (
          get(/databases/$(database)/documents/notes/$(noteId)).data.ownerId == request.auth.uid
          || emailLower() in get(/databases/$(database)/documents/notes/$(noteId)).data.collaboratorEmails );
      }
    }
    match /noteFolders/{folderId} {
      allow read, write: if signedIn() && resource.data.ownerId == request.auth.uid;
      allow create:      if signedIn() && request.resource.data.ownerId == request.auth.uid;
    }

    // userImages (ownership by userImages.userId)
    match /userImages/{imageId} {
      allow read, update, delete: if signedIn() && resource.data.userId == request.auth.uid;
      allow create:               if signedIn() && request.resource.data.userId == request.auth.uid;
    }

    // timelineEvents (ownership by timelineEvents.userId)
    match /timelineEvents/{eventId} {
      allow read, update, delete: if signedIn() && resource.data.userId == request.auth.uid;
      allow create:               if signedIn() && request.resource.data.userId == request.auth.uid;
    }

    // sharedChats — public read-only snapshots (by design). Lock writes to backend.
    match /sharedChats/{shareId} {
      allow read:  if true;        // intentionally public
      allow write: if false;       // created via Admin SDK only
    }

    // support_tickets — caller can create their own; reads/writes by owner only.
    match /support_tickets/{id} {
      allow create: if signedIn() && request.resource.data.userId == request.auth.uid;
      allow read, update, delete: if signedIn() && resource.data.userId == request.auth.uid;
    }

    // products — public read, no client write.
    match /products/{productId} { allow read: if true; allow write: if false; }
  }
}
```

> **Field-name caveat:** confirm each `ownerId`/`userId` field against the writing code before deploy (e.g. `noteFolders` owner field, `timelineEvents` userId field). A wrong field name silently denies everything for that collection.

### 6.2 PRIMARY (prerequisite for notes) — Server-side share resolution + email→uid backfill
From `docs/notes-sharing-firestore-rules-proposal.md` (already drafted, Jun 2):
- Every collaborator-write path must mirror membership into `collaboratorEmails[]` (and an `editorEmails[]`/`roleByEmail` mirror for write-gating), so rules can do an `in` membership check cheaply. **Backfill existing notes** before deploy.
- Move the **pre-auth `publicShareId` → note resolution server-side** (a backend endpoint), because the current bare client query by `publicShareId` is denied under scoped rules for everyone. `/shared/note/:shareId` should call the backend to resolve, not query Firestore directly.
- Redeploy the `notesShareNotify` Cloud Function with the email→uid backfill (edited, uncommitted in the admin repo per the memory).

### 6.3 SECONDARY — Backend ownership checks (closes RC-4)
- In `getChatHistory(threadId)` (`chatController.ts`), fetch `chats/{threadId}` and verify `data.userId === req.user.uid` before returning history; 403 otherwise.
- Audit every backend handler that accepts a `threadId`/`noteId`/`uid` from path/query/body and confirm an ownership/collaborator check precedes the read or write. Notes already do this via `checkNoteAccess`; replicate the pattern for chat and any other id-addressed endpoint.

### 6.4 TERTIARY — Frontend hardening (closes RC-2/RC-3, improves UX)
- Add a route guard for `/:userId/*`: if `urlUserId && user && urlUserId !== user.uid`, redirect to the caller's own equivalent path (or show access-denied). This keeps deep links working for the owner while stopping cross-uid URLs from rendering another account's chrome.
- `/shared/note/:shareId` and `/chat/:threadId`: on a denied/forbidden fetch, render the existing **request-access / not-authorized** screen (ties into tickets `WE-20260527-031/-032`) instead of silently showing or erroring.
- Once rules are strict, the client must handle `permission-denied` gracefully everywhere (the listeners currently just `console.error`).

---

## 7. Rollout sequence (order is load-bearing)

Flipping rules to strict in one step **will break** (a) the editable-shared-notes feature, which currently depends on permissive rules, and (b) any collection not covered by the new ruleset (default-deny). Sequence:

1. **Inventory & field audit** — finalize the complete list of collections/subcollections and their owner-field names against the code. Missing a collection = that feature breaks on deploy.
2. **Backfill** — write `collaboratorEmails[]` / `editorEmails[]` mirrors on all existing `notes`; verify counts.
3. **Ship server-side share resolution** (§6.2) and backend ownership checks (§6.3) **first**, while rules are still permissive (no user-facing breakage).
4. **Stage rules** — deploy the scoped ruleset to a **staging/preview** project (or use the Firestore rules **simulator**) and run the §8 test matrix.
5. **Deploy scoped rules to `dc99a`** (Krish) — this is the moment the hole closes. Keep the `firestore.rules` proposal and `.firebaserc` clear about which repo owns the deploy so the admin catch-all is not re-applied on a later admin deploy.
6. **Resolve repo conflict** — two repos deploying rules to one project is the underlying trap. Decide a single source of truth for `dc99a` rules; ensure the admin repo never re-deploys `{document=**} allow … if true`.
7. **Frontend guards** (§6.4) — ship after rules so denials render friendly screens.
8. **Verify in prod** with the §8 matrix; monitor for `permission-denied` spikes (indicates a missed legitimate path).

---

## 8. Test plan — cross-user matrix

Requires **two real test accounts** (User A, User B) — the QA harness previously could not test this for lack of credentials (`WE-20260527-049`). For each surface in §5:

| # | Scenario | Expected after fix |
|---|---|---|
| 1 | A creates content; A opens its URL | ✅ Full access |
| 2 | B (logged in) opens A's URL | ⛔ 403 / access-denied / request-access — **no data** |
| 3 | Logged-out browser opens A's URL | ⛔ Sign-in prompt / public-only; no private data |
| 4 | Scripted unauth client queries `notes`/`chats`/`users` | ⛔ `permission-denied` on every doc |
| 5 | Scripted client attempts **write** to A's doc as B / anon | ⛔ `permission-denied` |
| 6 | A shares a note with B as **viewer** → B opens link | ✅ Read-only; ⛔ write denied |
| 7 | A shares a note with B as **editor** → B opens link | ✅ Read + write |
| 8 | A revokes B → B reopens | ⛔ access removed |
| 9 | `/share/:shareId` (chat snapshot) opened by anyone | ✅ Read-only (by design); ⛔ write denied |
| 10 | Owner's own deep links (chat, note, planner item) still load | ✅ No regression |
| 11 | All non-note subcollections (budget, reminders, shopping, etc.) still load **for the owner** | ✅ No default-deny regression |

Automate 2–5 as a standing security regression (they need no UI). Add to the QA harness once test creds exist.

---

## 9. Acceptance criteria

- [ ] Live `dc99a` rules contain **no** `allow read, write: if true` (and no rule lacking an auth + ownership/collaborator check), verified via the rules simulator and a scripted unauth read/write returning `permission-denied`.
- [ ] Every surface in §5 passes the §8 matrix (cross-user = denied; owner = works; legitimate sharing = works).
- [ ] No owner-facing regressions: all the user's own content (incl. every subcollection) still loads and saves.
- [ ] Backend `getChatHistory` (and any other id-addressed handler) verifies ownership before returning/processing data.
- [ ] `/shared/note/:shareId` resolves via the backend (works under strict rules); denied access shows request-access UI.
- [ ] Frontend renders friendly access-denied (not blank/console-error) on `permission-denied`.
- [ ] Single, documented source of truth for `dc99a` rules; admin repo cannot re-introduce the catch-all.

---

## 10. Dependencies, ownership, constraints

- **Krish-only actions (assistant is hook-blocked):** all Firebase deploys, any `firestore.rules` edit, Cloud Function redeploy (`notesShareNotify`), IAM. The assistant can prepare code (backend checks, frontend guards, backfill scripts) and the rules **specification**, but cannot edit `.rules` or deploy.
- **Prerequisite work already drafted:** `docs/notes-sharing-firestore-rules-proposal.md` (notes block + server-side resolution); backend `checkNoteAccess` exists; `notesShareNotify` email→uid backfill edited but uncommitted in the admin repo.
- **Branch / PR policy:** any code changes target `Bug-Resolve-claude`, never `main` (per project rules).
- **Tracking ticket** `WE-20260603-001` should be filed in `qa-harness/tickets/2026-06-03/` as **P0** and synced to the sheet (`/qa-bug-report`) — not yet done; awaiting go-ahead.

---

## 11. Why this was not already caught

- The QA harness lacked two test accounts, so the "log in as B, open A's URL" path was never exercised (`WE-20260527-049`).
- `Wedding-Ease-Viva-Chat/firestore.rules` *looks* correct, masking that the **deployed** rules (admin repo, `dc99a`) are the catch-all. Reviewing the wrong file gives false assurance.
- The permissive rules were a **deliberate temporary enabler** for the editable-shared-notes feature, flagged in memory as "a severe security hole" but never converted into a tracked P0 with a rollout plan. This PRD is that conversion.
