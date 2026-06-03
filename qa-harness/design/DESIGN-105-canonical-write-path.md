# DESIGN-105 — Canonical Write Path for User Profile + Checklists

**Ticket:** WE-20260528-105
**Status:** DESIGN PROPOSAL — awaiting chairman sign-off. NO code changed.
**Author:** backend bug-fix specialist (Claude)
**Date:** 2026-06-01
**Scope:** Firestore write paths for (a) the user **profile** document `users/{uid}` and (b) **checklists** `users/{uid}/checklists/{id}`.

---

## 0. TL;DR

There are **two independent, uncoordinated write surfaces** for both entities:

- **Profile** is written by the frontend *directly via the client SDK* (`AuthContext`, `authService`, `settingsService`, `useActiveVibe`, …) **and** by the backend *via the Admin SDK* (`accountController`). These two surfaces use different field-name conventions (flat top-level vs. dotted `preferences.*`), different timestamp fields, and neither invalidates the other's caches. The result is the observed inconsistency: a value saved through Settings (`/api/account/*`) does not appear in the UI until a full reload, and a value saved through the older client-SDK path (`savePersonalization`) is silently overwritten / ignored by the backend `/me` response shaping.
- **Checklists** are written by **three** services that all hit the *same* document path `users/{uid}/checklists/{id}` but with **two different schemas**: the frontend `checklistService` writes items with a `dueDate` field; the backend `checklistService` (used by the AI planner tools) writes items **without** `dueDate`. A read-modify-write from the AI side silently strips `dueDate` from every item; a concurrent client write clobbers the AI's edit. Both are last-write-wins on the whole `items[]` array — there is no field-level merge.

This doc proposes **one canonical write path per entity** (a single service boundary), a concrete migration plan, ordering, backward-compat shims, and risks. **No data migration / Firestore writes are proposed here** — the canonical path is a *code* boundary; existing documents are read-compatible.

---

## 1. Current write paths — inventory

### 1.1 Profile document `users/{uid}` — WRITERS

| # | Writer | File | Mechanism | Fields written |
|---|--------|------|-----------|----------------|
| P1 | Backend profile PATCH | `easebot-backend/src/controllers/accountController.ts` → `handleUpdateProfile` | Admin SDK `userRef(uid).set(update, { merge: true })` | `name, nickname, phone, phoneCountryCode, phoneNational, weddingDate, budget, partnerName, role, about, responseStyle, email`, plus `profileUpdatedAt`, lazy `authMethod` |
| P2 | Backend preferences PATCH | `accountController.ts` → `handleUpdatePreferences` | Admin SDK `userRef(uid).set({preferences:{}},{merge}); .update({'preferences.theme':…})` (dotted paths) | `preferences.theme, preferences.density, preferences.language, preferences.notifications.*, preferences.dataTrainingOptOut` |
| P3 | Backend plan switch | `accountController.ts` → `handleSwitchPlan` | Admin SDK `userRef(uid).set({plan,…},{merge})` | `plan, planRenewsAt, usage{…}, planUpdatedAt` |
| P4 | Backend soft-delete | `accountController.ts` → `handleSoftDelete` | Admin SDK `.set({deletedAt, deletionPending},{merge})` | `deletedAt, deletionPending` |
| P5 | FE personalization | `Wedding-Ease-Viva-Chat/src/services/settingsService.ts` → `savePersonalization` | **Client SDK** `updateDoc(doc(db,'users',uid), …)` | `nickname, voiceId, toneSettings` |
| P6 | FE auth bootstrap | `Wedding-Ease-Viva-Chat/src/contexts/AuthContext.tsx` (~L102) | Client SDK `updateDoc(doc(db,'users',uid), …)` | `isVerified, isValidated, verifiedAt` |
| P7 | FE sign-up | `Wedding-Ease-Viva-Chat/src/services/authService.ts` → `buildNewUserDoc` + `setDoc` | Client SDK `setDoc(doc(db,'users',uid), {…})` | full new-user doc: `name, email, phone, weddingDate, budget, partnerName, preferredLanguage, role, isPremium, usage, …` |
| P8 | FE active vibe | `Wedding-Ease-Viva-Chat/src/hooks/useActiveVibe.ts` (~L74) | Client SDK `updateDoc(doc(db,'users',uid), {activeVibe…})` | `activeVibe` |
| P9 | FE chat / misc | `useChat.ts`, `InvitePartner.tsx`, `SignUpModal.tsx` | Client SDK writes to `users/{uid}` (partner invite, chat-derived fields) | various |

**Callers of the Settings UI write paths:**
- `PersonalizationTab.tsx`, `AccountTab.tsx` → `useAccount().updateProfile` → `patchAccountProfile` → **P1** (backend).
- `PersonalizationTab.tsx` → `useAccount().updatePreferences` → `patchAccountPreferences` → **P2** (backend).
- `SettingsModal.tsx` (legacy modal) and `AiBehaviorTab.tsx` → `savePersonalization` → **P5** (client SDK, bypasses backend entirely).

### 1.2 Checklists `users/{uid}/checklists/{id}` — WRITERS

| # | Writer | File | Mechanism | Item schema |
|---|--------|------|-----------|-------------|
| C1 | FE checklist service | `Wedding-Ease-Viva-Chat/src/services/checklistService.ts` | Client SDK `setDoc/updateDoc/deleteDoc` + `onSnapshot` listener | `{id, text, completed, vendorRef, dueDate}` |
| C2 | Backend checklist service (AI planner) | `easebot-backend/src/services/checklistService.ts` | **Client SDK** (`firebase/firestore` + `lib/firebase`, NOT Admin) `setDoc/updateDoc/deleteDoc` | `{id, text, completed, vendorRef}` — **no `dueDate`** |
| C3 | Backend checklist HTTP route | `easebot-backend/src/controllers/checklistController.ts` (`/api/checklists`) → calls **C2** | via C2 | same as C2 |

- C2 is invoked by `easebot-backend/src/services/plannerTools.ts` (`create_checklist`, `edit_checklist_item`, `mark_as_done`) during the AI tool pass.
- C3 routes (`routes/checklists.ts`) are a thin HTTP wrapper over C2; the frontend does **not** currently call them for writes (FE uses C1 directly), so C3 is effectively a second, parallel door into C2.
- FE consumers of C1: `ChecklistDetail.tsx`, `PlannerView.tsx`, `TimelineView.tsx`, `Index.tsx`, `AttachmentPicker.tsx`, `useKnownArtifactIds.ts`.

---

## 2. What races / what is inconsistent

### 2.1 Profile — the observed inconsistency
1. **Field-shape divergence.** P1 writes `nickname` at the top level. P5 *also* writes `nickname` at the top level — but P5 also writes `toneSettings` and `voiceId`, which **P1 does not know about and `/me` does not specially shape**. Meanwhile the canonical Settings tabs (`PersonalizationTab`, `AccountTab`) go through P1/P2 only. So:
   - Saving the nickname in the new Settings tab → P1 (backend) → `profileUpdatedAt` bumped, but the in-memory `AuthContext.profile` is **not** refreshed (AuthContext only re-reads on auth-state change / sign-in, see `AuthContext.tsx` L92/L118; there is no `onSnapshot` on the profile doc). `useAccount` invalidates *its own* TanStack query, but `AuthContext.profile` — which most of the app reads — stays stale until reload.
   - Saving tone/voice in `AiBehaviorTab` / legacy `SettingsModal` → P5 (client SDK) → writes directly, bypassing the backend's validation + `profileUpdatedAt`, and the backend `/me` cache (none, but the deletion-gate 30s cache and the TanStack 30s `staleTime`) means the new Settings UI can show a stale value for up to 30s.
2. **Two timestamp fields, no single "updated" signal.** P1 writes `profileUpdatedAt`; P2 writes nothing comparable for prefs; P3 writes `planUpdatedAt`; P5 writes nothing. There is no monotonic version/`updatedAt` to drive cache invalidation or conflict detection.
3. **Cache coherency.** `useAccount` (TanStack, key `['account','me']`, `staleTime: 30_000`) and `AuthContext.profile` (React state, refreshed only on auth events) are two independent caches of the same document, kept in sync by **nothing**. A write through P1 invalidates the first but not the second; a write through P5 invalidates neither.
4. **Validation asymmetry.** P1 enforces an allow-list, length caps, role enum, phone/email identity locks. P5 enforces nothing — a client write of `nickname` bypasses every backend guard. This is both a data-integrity and a security concern (the only thing standing between a malicious client and the profile doc is `firestore.rules`, which we are not allowed to edit and which must therefore be the real boundary — but the *intended* contract clearly lives in P1).

### 2.2 Checklists — the race
1. **Schema clobber on `dueDate`.** C1 (FE) writes items with `dueDate`. C2 (AI/backend) does a **read-modify-write on the whole `items[]` array** but reconstructs/spreads items using the backend `ChecklistItem` type that has no `dueDate`. On `create_checklist` the AI writes items with no `dueDate` at all. On `edit_checklist_item` / `mark_as_done` it spreads the existing item (`{...item, text}`) so *existing* `dueDate` survives **only because of the spread** — but the backend's TS type lies about the shape, and any future "rebuild the item" change will silently drop it. `createChecklist` from C2 definitively produces items with no `dueDate`.
2. **Whole-array last-write-wins.** Both C1 and C2 read the doc, mutate `items[]` in memory, and write the entire array back. There is no field-level or item-level merge. If the user toggles an item in the UI (C1) at the same moment the AI marks another item done (C2), whichever write lands second **overwrites the other's change** — the first edit is lost. The FE `onSnapshot` listener will then re-render to the losing state with no error.
3. **Two front doors into the same store.** C3 (HTTP `/api/checklists`) and C1 (direct client SDK) both write the same path. Today the FE only uses C1, so C3 is dead weight that nonetheless duplicates the resolve/normalize logic and can drift.
4. **Backend uses the *client* SDK for writes.** C2 imports `firebase/firestore` + `lib/firebase` (a client app initialised from `FIREBASE_*` env vars), not `firebaseAdmin`. This means backend checklist writes are subject to `firestore.rules` (and run *unauthenticated* as the client app unless rules allow it) rather than the Admin SDK's privileged path used everywhere else on the backend. This is an inconsistency in its own right and a latent failure mode if rules tighten.

---

## 3. Proposal — ONE canonical write path per entity

**Principle:** every mutation of an entity flows through exactly one service boundary; all other call sites become callers of that boundary. Reads (and real-time listeners) may stay where they are. We do **not** migrate stored documents.

### 3.1 Profile — canonical path = backend `accountController` (Admin SDK)

**Canonical writer:** `easebot-backend/src/controllers/accountController.ts` via `PATCH /api/account/profile` (P1) and `PATCH /api/account/preferences` (P2), wrapped on the FE by `accountService` → `useAccount`.

**Rationale:** P1/P2 already own validation, allow-listing, identity locks, rate-limiting, and timestamps. The client SDK paths (P5, and the personalization parts of P7) have *no* validation and *two* caches problem. Consolidating onto the backend gives a single validated door and a single place to emit an `updatedAt` signal.

**Changes required (code only — no data migration):**

1. **Extend the backend profile allow-list** (`ALLOWED_PROFILE_FIELDS` in `accountController.ts`) to accept `nickname` (already there), and add `toneSettings` and `voiceId` with validation:
   - `toneSettings`: object with the 10 known numeric keys (`warm, analytical, friendly, professional, enthusiastic, concise, quirky, candid, emojis, headers`), each `0..100`; reject unknown keys.
   - `voiceId`: optional string, max ~64 chars, from an allow-list of known Azure voice ids (or a permissive `^[A-Za-z0-9\-]+$`).
2. **Add a single `profileUpdatedAt` (already written) as the canonical version signal** and return it in `/me` and in the PATCH response so the FE can reconcile caches deterministically.
3. **Repoint `savePersonalization`** (`settingsService.ts`, P5) to call `patchAccountProfile` (P1) instead of the client SDK `updateDoc`. Keep its signature (`savePersonalization(uid, {nickname?, voiceId?, toneSettings?})`) so the two call sites (`SettingsModal.tsx`, `AiBehaviorTab.tsx`) don't change. The `uid` arg becomes vestigial (the backend derives uid from the token) — keep it for signature compatibility, ignore it.
   - Keep the **guest** localStorage voice helpers (`getLocalVoiceId`/`setLocalVoiceId`) exactly as-is — they are for unauthenticated users and are not a Firestore write path.
4. **Make `AuthContext.profile` reconcile after a profile write.** Either (a) have `useAccount`'s mutation `onSuccess` also push the new profile into `AuthContext` via a context setter, or (b) attach a single `onSnapshot` to `users/{uid}` in `AuthContext` so any write (from any door) propagates to the one in-memory profile cache. **Recommendation: (b)** — it is the smallest change that fixes the "stale until reload" symptom for *all* writers, including the legitimately-client-side ones (P6 verification, P8 activeVibe, P7 sign-up) that should *not* move to the backend.
5. **Leave P6/P7/P8/P9 as client-SDK writes** — they are auth/bootstrap/realtime-presence concerns, not "profile editing", and routing them through the backend would add latency to the sign-in path and couple auth to the API. They are *not* part of the canonical *edit* path; the `onSnapshot` from step 4 keeps the cache coherent regardless.

**Net call-site changes (FE):** `settingsService.savePersonalization` body (1 file); `AuthContext` add an `onSnapshot` + setter (1 file). **Net backend changes:** allow-list + validators in `accountController.ts` (1 file). No changes to `PersonalizationTab`, `AccountTab`, `SettingsModal`, `AiBehaviorTab` public behaviour.

### 3.2 Checklists — canonical path = ONE shared service, Admin SDK on the backend, HTTP from the FE

**Canonical writer:** the **backend** `checklistService` (C2), upgraded to (a) use the **Admin SDK** and (b) carry the full item schema incl. `dueDate`; exposed to the FE exclusively through the HTTP routes (C3). The FE `checklistService` (C1) keeps its **read** path (`subscribeToChecklists`, `computeStats`) but its **write** functions become thin `fetch` wrappers over `/api/checklists`.

**Rationale:** The backend already needs to write checklists (AI planner tools). It must do so with the Admin SDK like every other backend write, and with the same schema the FE uses. Routing FE writes through the same HTTP service eliminates the second front door and the whole-array race becomes serialisable on the server (single writer, can use a Firestore transaction).

**Changes required (code only — no data migration):**

1. **Backend `checklistService.ts`: switch `firebase/firestore` + `lib/firebase` → `firebaseAdmin` (`adminDb`).** Replace `setDoc/updateDoc/getDoc/getDocs/deleteDoc/serverTimestamp` with the Admin equivalents (`adminDb.collection(...).doc(...).set/update/get`, `FieldValue.serverTimestamp()`). Behaviour-preserving.
2. **Unify the item schema.** Add `dueDate: string | null` to the backend `ChecklistItem` type and to `createChecklist`/`editChecklistItem` so the AI path stops lying about / dropping `dueDate`. Default `dueDate: null` on AI-created items.
3. **Make item mutations field-level + transactional.** Wrap the read-modify-write of `items[]` in `adminDb.runTransaction(...)` so concurrent toggle (UI) vs. mark-done (AI) no longer clobber each other. This directly fixes §2.2(2).
4. **Expand C3 routes to cover all FE write operations** currently done by C1: create, update-item-text, toggle-done, add-item, delete-item, update-due-date, reorder, delete-checklist, duplicate. Each is a thin controller over the (now transactional) service.
5. **Repoint FE `checklistService` write functions** (`createChecklist, duplicateChecklist, updateChecklistItem, toggleItemDone, addChecklistItem, deleteChecklistItem, updateItemDueDate, reorderChecklistItems, deleteChecklist`) to `fetch` the corresponding `/api/checklists` endpoint (reuse the auth-token + error pattern from `accountService.request`). **Keep `subscribeToChecklists` and `computeStats` as-is** — real-time reads stay on the client SDK listener, so the UI still updates live the moment the server write lands. Public function signatures are unchanged, so `ChecklistDetail`, `PlannerView`, `TimelineView`, etc. are untouched.

**Net call-site changes (FE):** only `services/checklistService.ts` write bodies (1 file). **Net backend changes:** `services/checklistService.ts` (SDK + schema + transactions), `controllers/checklistController.ts` + `routes/checklists.ts` (add the missing endpoints). `plannerTools.ts` is untouched (it already calls the service functions by the same names).

---

## 4. Migration plan (ordering, backward-compat)

Each step is independently shippable as its own PR to `Bug-Resolve-claude` and is backward-compatible with un-migrated readers/writers, so we never have a flag-day. **No Firestore document migration is performed** — both schemas are read-compatible (extra/missing `dueDate` is tolerated by both sides today).

**Profile track:**
1. **PR-P1 (backend, additive):** extend `ALLOWED_PROFILE_FIELDS` + validators for `toneSettings`/`voiceId`; return `profileUpdatedAt` in `/me` + PATCH responses. Backward-compatible: old clients ignore the extra field; new fields are optional.
2. **PR-P2 (FE cache coherency):** add `onSnapshot` on `users/{uid}` in `AuthContext` (+ setter). Independent of PR-P1; fixes "stale until reload" for *all* writers immediately.
3. **PR-P3 (FE cutover):** repoint `savePersonalization` to `patchAccountProfile`. Requires PR-P1 deployed first (else the backend 400s on `toneSettings`). Order: **P1 → P3.** P2 can land anytime.

**Checklist track:**
1. **PR-C1 (backend, behaviour-preserving):** swap C2 to Admin SDK; add `dueDate` to the item type/creates; wrap mutations in transactions. No external behaviour change; FE still on C1.
2. **PR-C2 (backend, additive):** add the missing `/api/checklists` endpoints (add-item, delete-item, update-due-date, reorder, duplicate, update-item-text alias). Purely additive routes; nothing calls them yet.
3. **PR-C3 (FE cutover):** repoint FE `checklistService` writes to the new HTTP endpoints; keep `subscribeToChecklists` listener. Requires PR-C1 + PR-C2 deployed first. Order: **C1 → C2 → C3.**

**Recommended overall order:** P1 → C1 → C2 → P2 → P3 → C3 (backend-additive first, FE cutovers last; cutovers are the only steps that can break if their backend dependency isn't live).

---

## 5. Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `firestore.rules` currently allow the *client app* (backend C2) to write checklists; switching C2 to Admin SDK is strictly *more* privileged and safe, but switching FE writes to HTTP means rules must still permit the **listener read** (`subscribeToChecklists`). | Med | We are not editing rules. The FE keeps only the *read* listener on the client SDK, which already works today. No rule change needed. Verify in QA that the listener still fires after a server write. |
| Adding `onSnapshot` to `AuthContext` could cause extra re-renders / read costs. | Low | One listener per signed-in session on a single doc; negligible. Detach on sign-out (return the unsub from the effect). |
| Latency: FE checklist writes now round-trip the backend instead of writing Firestore directly. | Med | The `onSnapshot` listener already provides the live update; we can keep optimistic UI in the components (they already render from the subscription). Net UX delta is small; correctness (no clobber) is worth it. |
| `savePersonalization` cutover: if backend rejects `toneSettings` shape, tone saving breaks. | Med | Ship PR-P1 first; add a permissive-but-bounded validator; QA the exact `ToneSettings` payload before P3. |
| Pricing coupling: `handleSwitchPlan` (P3) writes `usage`/`plan`. Out of scope here, but the canonical-profile work must not touch tier values. | Low | Per guardrails, do NOT change `TIER_MESSAGE_QUOTA` or any tier value. Run `/pricing-tier-check` before any PR that touches `accountController.ts`. P3 stays untouched by this proposal. |
| The backend `lib/firebase.ts` client app may be relied on elsewhere; removing its only writer (C2) could leave it unused. | Low | Leave `lib/firebase.ts` in place; just stop using it for checklist writes. Grep for other importers before deleting. |
| Transaction contention on a hot checklist (rapid AI + user edits). | Low | Firestore transactions auto-retry; whole-checklist docs are small. Acceptable. |

---

## 6. Explicit non-goals / things this proposal does NOT do

- Does **not** migrate or rewrite any stored Firestore document (no Admin-SDK data mutation).
- Does **not** change Firestore collection or field names (FE + backend both depend on `users/{uid}`, `users/{uid}/checklists`, item shape).
- Does **not** touch `firestore.rules`, `firebase.json`, `.firebaserc`, or any deploy config.
- Does **not** change pricing tier values or `handleSwitchPlan`.
- Does **not** move auth/bootstrap/presence client writes (P6/P7/P8/P9) to the backend.

---

## 7. Files referenced (absolute paths)

Backend:
- `/Users/krish/Desktop/easebot/easebot-backend/src/controllers/accountController.ts`
- `/Users/krish/Desktop/easebot/easebot-backend/src/controllers/checklistController.ts`
- `/Users/krish/Desktop/easebot/easebot-backend/src/routes/account.ts`
- `/Users/krish/Desktop/easebot/easebot-backend/src/routes/checklists.ts`
- `/Users/krish/Desktop/easebot/easebot-backend/src/services/checklistService.ts`
- `/Users/krish/Desktop/easebot/easebot-backend/src/services/plannerTools.ts`
- `/Users/krish/Desktop/easebot/easebot-backend/src/lib/firebase.ts` (client SDK — used by backend checklist writes)
- `/Users/krish/Desktop/easebot/easebot-backend/src/lib/firebaseAdmin.ts` (Admin SDK — the rest of the backend)

Frontend:
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/services/accountService.ts`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/services/settingsService.ts`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/services/checklistService.ts`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/hooks/useAccount.ts`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/contexts/AuthContext.tsx`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/services/authService.ts`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/hooks/useActiveVibe.ts`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/services/migrations/userProfileMigration.ts`
- Settings tabs: `PersonalizationTab.tsx`, `AccountTab.tsx`, `AiBehaviorTab.tsx`, `SettingsModal.tsx`
- Checklist consumers: `ChecklistDetail.tsx`, `PlannerView.tsx`, `TimelineView.tsx`, `Index.tsx`, `AttachmentPicker.tsx`, `hooks/useKnownArtifactIds.ts`

---

**Awaiting chairman sign-off before any implementation PR.**
