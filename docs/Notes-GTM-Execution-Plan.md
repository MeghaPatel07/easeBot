# EaseBot Notes — GTM Execution Plan (Autonomous Multi-Agent)

**Mode:** Blueprint for a single-pass, multi-agent autonomous execution run.
**Source roadmap:** `docs/Notes-GTM-Roadmap.md` (current state — excludes deleted items #2, #12 and commented-out P2).
**Source comparison:** `docs/Notion-vs-EaseBot-Notes-Comparison.md`.
**Date:** 2026-04-21.

---

## 0. Global Constraints (HARD — every agent inherits)

🔒 **Firebase Protection Rule**
- ❌ Do NOT edit `firestore.rules`, `storage.rules`, `firebase.json` security sections.
- ❌ Do NOT change auth providers, custom claims, IAM, or service-account scopes.
- ❌ Do NOT run `firebase deploy` (any target) or publish new rules.
- ❌ Do NOT modify `.env`/`.env.example` secrets or rotate API keys.
- ✅ Reads/writes through the existing `notesService.ts` / `notesCommentsService.ts` / `notesSharingService.ts` surface only.

🔒 **Repo / Git Rule**
- No force-push, no `--no-verify`, no branch deletions. Every sprint lands as a feature branch with PR.

🔒 **Tier Fidelity Rule**
- Tier gating must stay consistent with `config/tierConfig.ts` (`resolveTier`, `getLimits`). Any new capability must declare its tier requirement in the acceptance criteria.

🔒 **Scope Fence**
- Only files under `Wedding-Ease-Viva-Chat/src/**/notes/**`, `src/hooks/useNote*`, `src/services/notes*`, `src/types/notes.ts`, `easebot-backend/src/**/notes*` (new), and `src/pages/SharedNote.tsx` are in-scope. Cross-feature refactors require orchestrator approval before a developer agent touches them.

---

## 1. Agent Roster & Communication Contract

| Agent | Owns | Outputs |
|---|---|---|
| **Orchestrator** (you) | Plan parsing, task assignment, dependency resolution, sprint gating, merge decisions | Daily status, unblock decisions, "Zero Bug ✅" verdict |
| **Product Strategy** | Feature briefs, tier matrix, acceptance criteria per task, user-journey coverage | `briefs/{task}.md` |
| **UI/UX** | Responsive layouts, empty/error/long-content states, a11y | Component specs, Figma-level mocks (text), CSS tokens used |
| **Frontend Dev** | React/Tiptap/hooks/services work | Code + Storybook/demo harness |
| **Backend Dev** | Express endpoints (e.g. PDF export, version history fan-out) | Code + curl examples |
| **QA (Destructive)** | Test matrix execution, bug filing, regression sweep | `qa/sprint-{n}-report.md` |

**Communication format** — every inter-agent message is a single markdown block:
```
FROM: <agent>  TO: <agent>  TASK: <ID>  TYPE: handoff|question|block|ack
CONTEXT:  <one paragraph>
DECISION/REQUEST: <one sentence>
DEPENDENCIES: <list or "none">
```
No free-form chatter. Questions resolved ≤1 round-trip, else escalate to Orchestrator.

---

## 2. Roadmap → Epic Decomposition

### Epic A — Collab & Data Safety (P0)
Goal: a note can be co-edited without silent data loss and survives a disconnect.

| ID | Task | Source item | Tier | Effort |
|---|---|---|---|---|
| A1 | Replace divergence-drop with Y.js collab OR conflict banner | P0 #1 | Pro+ (collab), banner visible to all | M |
| A2 | Stable block IDs extension (`data-id` UUID on every block node) | P0 #3 | All | S |
| A3 | `localStorage` autosave mirror with reload-restore | P0 #4 | All | S |
| A4 | Proper paywall modal for tier-gated editor | P0 #5 | Free tier gate | S |

### Epic B — Block-First Editor Experience (P1)
Goal: the editor reads as Notion-class instead of "textarea with formatting."

| ID | Task | Source | Tier | Effort |
|---|---|---|---|---|
| B1 | Per-block drag handle + block menu | P1 #6 | Pro+ edit, all view | M |
| B2 | "Turn into" block conversion UI (lives in B1's menu) | P1 #7 | Pro+ | S |
| B3 | Undo/redo across sessions (piggybacks on C2 history) | P1 #15 | All | S (after C2) |

### Epic C — Discovery & History (P1)
Goal: users can find old notes and recover old states.

| ID | Task | Source | Tier | Effort |
|---|---|---|---|---|
| C1 | Full-text body search (`searchableText` derived field on write) | P1 #8 | All | S |
| C2 | Version history subcollection + restore UI | P1 #9 | Pro+ restore, Free view-only | M |
| C3 | Persistent sidebar on desktop (drop popover at `≥md`) | P1 #10 | All | S |

### Epic D — Collaboration Surface (P1)
| ID | Task | Source | Tier | Effort |
|---|---|---|---|---|
| D1 | Presence indicators (avatars on live collaborators) | P1 #11 | Pro+ | S–M |

### Epic E — Mobile & Export (P1)
| ID | Task | Source | Tier | Effort |
|---|---|---|---|---|
| E1 | Mobile polish — bottom-sheet block inserter, touch-friendly toolbars | P1 #13 | All | M |
| E2 | Export to PDF + Markdown | P1 #14 | Pro+ export | S–M |

### Epic F — Deferred (P3) — not in this run
- Nested subpages
- Block-level storage split
- Real-time cursors (separate from D1 presence dots)
- Offline-first queue
- Notion-style databases
- @mentions

---

## 3. Dependency Graph

```
A2 (block IDs) ──┬──► A1 (Y.js needs stable positions)
                 ├──► C2 (history anchors to block IDs)
                 ├──► D1 (presence cursor anchors on blocks)
                 └──► B1 (block menu uses block IDs for "copy link")

A1 ──► D1 (presence only useful once collab isn't destructive)

B1 ──► B2 (menu hosts "turn into")

C2 ──► B3 (session-scoped undo replays from history)

A4 independent · A3 independent · C1 independent · C3 independent · E1 independent · E2 independent
```

**Critical path:** A2 → A1 → D1. Everything else parallelizes.

---

## 4. Sprint Plan

### Sprint 0 — Harness (0.5 day)
- Feature flag scaffold (`useFeatureFlag` already exists — reuse).
- Add `notes-v2` flag, default OFF in prod, ON in dev.
- QA test matrix template file: `qa/templates/notes-matrix.md`.
- Playwright + Vitest smoke coverage for current notes flow (baseline regression net).

### Sprint Alpha — P0 Safety (≈2 weeks)
Parallel tracks:
- **Track 1** (Frontend Dev): A2 → A1
- **Track 2** (Frontend Dev): A3
- **Track 3** (UI/UX → Frontend Dev): A4

Exit: Alpha phase loop (see §6) returns Zero Bug.

### Sprint Beta — P1 Editor + History (≈3 weeks)
Parallel tracks:
- **Track 1** (Frontend Dev): B1 → B2 → B3
- **Track 2** (Frontend Dev): C2 (depends on A2)
- **Track 3** (Frontend Dev): C1, C3 in parallel
- **Track 4** (Frontend Dev): D1 (depends on A1)

Exit: Beta phase loop returns Zero Bug, Track 1–4 merged behind `notes-v2` flag.

### Sprint GA — P1 Mobile + Export (≈4 weeks)
Parallel tracks:
- **Track 1** (UI/UX + Frontend Dev): E1
- **Track 2** (Backend Dev + Frontend Dev): E2

Exit: GA phase loop returns Zero Bug, `notes-v2` flag flipped ON in prod.

---

## 5. Task Card Template (filled for A1 as exemplar; others follow same shape)

### A1 — Replace divergence-drop with collab-safe write path
- **Epic:** A
- **Owners:** Frontend Dev (primary), Product Strategy (acceptance)
- **Dependencies:** A2 merged
- **Files touched (expected):**
  - `Wedding-Ease-Viva-Chat/src/components/notes/NoteEditor.tsx` (remove divergence drop at `:208-224`, wire Y.js collab extension)
  - `Wedding-Ease-Viva-Chat/src/hooks/useNoteEditor.ts` (swap whole-content writes for Y.js update writes OR keep debounce + add remote-change banner)
  - `package.json` (+`@tiptap/extension-collaboration`, `yjs`, `y-indexeddb` if IndexedDB persistence)
- **Approach A (preferred):** Y.js doc per note, persisted to Firestore as base64-encoded binary update log in `notes/{id}/ydoc` subcollection (append-only). Existing `content` string kept as render fallback.
- **Approach B (fallback if A is too large):** Detect remote update, if local has unflushed changes show a sticky banner: "This note was updated by X. Reload to get latest. Your changes are saved locally." — no silent drop.
- **Firebase guard:** writes only to `notes/{id}` and `notes/{id}/ydoc/*` — no rule changes. Confirm existing `ownerId == auth.uid || userId in collaborators` rule still covers new subcollection *by reading* current rules; if it doesn't, use Approach B.
- **Acceptance criteria:**
  1. Two browsers logged in as owner + collaborator (editor) can type in the same note; both see each other's text within 2s; no typed character is silently lost.
  2. Offline → online: local edits replay, no duplicates.
  3. Read-only viewers (commenter/viewer) cannot emit writes.
  4. Free tier: editor is disabled (unchanged) → write path never invoked.
- **QA cases (must pass):** M-01, M-02, M-03, M-09, M-10, M-14 (see §7).

### Task cards to be produced by Product Strategy agent on sprint kickoff:
A2, A3, A4, B1, B2, B3, C1, C2, C3, D1, E1, E2 — same template.

---

## 6. Build → QA → Fix → Re-QA Phase Loop

Each sprint runs this loop. Orchestrator will not exit until it returns a clean pass.

```
┌────────────────────────────────────────────────────────────┐
│ 1. BUILD                                                   │
│    Dev agents implement tasks behind `notes-v2` flag.      │
│    Each task merged to sprint branch only when:            │
│     - typescript passes                                    │
│     - unit tests pass                                      │
│     - Firebase guard checklist signed                      │
├────────────────────────────────────────────────────────────┤
│ 2. QA ASSASSINATION                                        │
│    QA runs full matrix (§7). Files bugs per §8 format.     │
├────────────────────────────────────────────────────────────┤
│ 3. BUG SPRINT                                              │
│    Orchestrator converts each bug to a task. Dev fixes ALL │
│    (not just criticals) before Re-QA.                      │
├────────────────────────────────────────────────────────────┤
│ 4. RE-QA                                                   │
│    QA re-runs ENTIRE matrix (not just fixed paths).        │
│    If any red → back to step 3.                            │
│    If all green → exit sprint.                             │
└────────────────────────────────────────────────────────────┘
```

**Max loop iterations before escalation:** 3. If bug count doesn't trend ↓ across iterations, Orchestrator halts and surfaces to user.

---

## 7. QA Matrix (destructive, human-like)

### 7.1 Dimensions
- **User type:** Guest (unauth) · Free · Pro · Pro Max · Owner · Editor-collaborator · Commenter-collaborator · Viewer-collaborator · Public-link-viewer
- **Device:** Mobile (375px) · Tablet (768px) · Desktop (1440px)
- **Content size:** Empty · Short (<100 words) · Medium (1k words) · Long (10k words) · Huge (50k words, 200+ blocks)
- **Network:** Online · Slow 3G · Offline → Online reconnect · Flapping

### 7.2 Core Matrix (abbreviated — M-IDs)

| ID | Use case | Matters for |
|---|---|---|
| M-01 | Create → type → wait 2s → reload → content persists | All |
| M-02 | Create → type → kill tab mid-debounce → reload → no data loss (A3) | All |
| M-03 | Two users type concurrently → both edits present (A1) | Owner + Editor |
| M-04 | View-only collaborator sees read-only editor, no toolbar, no menus | Viewer, Commenter |
| M-05 | Free user opens own note → editor disabled → paywall modal CTA → click → pricing page (A4) | Free |
| M-06 | Guest opens `/shared/{shareId}` public link → can view, cannot edit, cannot see owner PII | Guest |
| M-07 | Expired / revoked share link → 404 or "link disabled" message, no leak | Guest |
| M-08 | Commenter tries to edit content → blocked silently AND visibly | Commenter |
| M-09 | Drag block handle on mobile (touch) reorders blocks without scroll conflict (B1, E1) | Mobile |
| M-10 | "Turn into H2" on a bulleted list item converts in place (B2) | Pro+ |
| M-11 | Slash menu with `/im` filters to Image; Enter inserts (regression) | All |
| M-12 | Paste 20 images rapidly → all uploaded to Storage (no base64 leak); per-image ≤10MB enforced | Pro+ |
| M-13 | Search bar finds text in note body, not just title (C1); highlighted match | All |
| M-14 | Version history — revert to 3 versions back → content restores; current becomes a new version | Pro+ |
| M-15 | Huge note (50k words, 200+ blocks): scroll is smooth ≥30fps; no layout shift | All |
| M-16 | Long paragraph (5k chars single paragraph): wraps, no overflow, mobile readable | All |
| M-17 | Export PDF matches on-screen rendering (covers, headings, images, todos) | Pro+ |
| M-18 | Export Markdown round-trip: export → re-import (future) preserves structure | Pro+ |
| M-19 | Presence: collaborator avatar appears within 3s of them opening the note; disappears within 10s of them closing (D1) | Pro+ |
| M-20 | Persistent desktop sidebar: switching notes is 1 click, URL updates, no double-nav flash (C3) | Desktop |
| M-21 | Mobile: bottom-sheet block inserter opens above keyboard, doesn't obscure caret (E1) | Mobile |
| M-22 | Comment anchor survives turning the anchored block from paragraph→H2 (depends on A2) | Pro+ |
| M-23 | Pro Max public link with password: wrong password denies; correct password grants view only | Pro Max + Guest |
| M-24 | Rapid note-switch (10 notes in 5s): no stale content flash, no lost unsaved edits (existing flush-on-switch) | All |
| M-25 | Regression: existing chat→note "save as note" chip still resolves and opens note | All |

### 7.3 Destructive / security use cases
- DS-01: Edit own URL to another user's `noteId` → Firestore rule blocks read (confirm no client leak of error contents)
- DS-02: Crafted Tiptap JSON with huge nested `content` → editor doesn't OOM the tab
- DS-03: XSS attempt via pasted HTML / link href `javascript:` — sanitized
- DS-04: Share link brute force `shareId` — rate limit / long entropy verified
- DS-05: Downgrade Pro → Free mid-session → editor flips to read-only within next render, no orphan writes

---

## 8. Bug Report Format (strict)

```
### [SEVERITY] <title>
- **ID:** BUG-<sprint>-<seq>
- **Task:** <A1|A2|…>
- **Affected user type(s):** <list>
- **Device:** <mobile|tablet|desktop>
- **Steps to reproduce:**
  1. …
  2. …
- **Expected:** …
- **Actual:** …
- **Evidence:** screenshot path / console log snippet / request trace
- **Root-cause hypothesis (QA's guess, dev confirms):** …
```

**Severity rubric:**
- **Critical:** data loss, auth bypass, crash, tier bypass, Firebase rule drift
- **High:** feature broken for a whole user tier/device class
- **Medium:** incorrect behavior with workaround
- **Low:** cosmetic / copy

Exit gate: **zero Critical, zero High, ≤3 Medium (with accepted workaround), Low tracked but non-blocking.**

---

## 9. Sprint Exit Criteria (Definition of Done)

A sprint is "done" only when ALL are green:

- [ ] Every task in the sprint has merged code, behind `notes-v2` flag in prod
- [ ] 100% of in-scope QA matrix rows pass for that sprint's tasks
- [ ] Regression matrix (M-01, M-24, M-25 + any prior-sprint rows) re-passes
- [ ] Zero Critical / High bugs open
- [ ] Firebase guard checklist signed per task (no rule/permission/deploy diffs — verified by `git diff` against baseline)
- [ ] Typescript `tsc --noEmit` clean
- [ ] `npm run build` succeeds for both frontend and backend
- [ ] UI/UX sign-off: long-content scroll smooth, responsive at 375/768/1440, a11y keyboard reachable
- [ ] Feature-flag rollback path documented (one-line env var flip)

---

## 10. Orchestrator Daily Cycle

1. Pull open bugs + task statuses.
2. Check dependency graph — promote unblocked tasks.
3. Dispatch handoff messages in §1 format.
4. If any agent blocked > 1 day with no progress → escalate to user with a specific question.
5. End-of-day: post sprint burndown + top 3 risks.

---

## 11. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Y.js + Firestore integration (A1) is heavier than 1 sprint allows | M | H | Fall back to banner approach (A1 Approach B) as P0 ship; full Y.js becomes Sprint Beta stretch |
| Block IDs (A2) break existing comment anchors | L | H | One-time migration: on first open, rewrite comments' `blockId` from `anchorText` match; keep fallback text search |
| Version history (C2) blows Firestore read/write budget on huge notes | M | M | Gate history snapshots to ≥500 char diff AND ≥5 min since last snapshot |
| Search (C1) `searchableText` field inflates doc size past 1MB limit for huge notes | L | H | Cap at 500KB plain text; overflow goes to `notes/{id}/searchChunks` |
| Drag-handle (B1) fights mobile scroll | M | M | E1 scope covers — explicit touch-hold gesture vs swipe |
| Export PDF (E2) fidelity poor | M | M | Ship Markdown first (trivial), PDF via server-side Puppeteer route in backend, not client |
| Scope creep — P2 items leak in | M | M | Orchestrator rejects any task touching files outside §0 scope fence without explicit re-plan |

---

## 12. Post-GA Validation Report Template

At the end of Sprint GA, Orchestrator produces:

```
# Notes v2 — Zero Bug Validation Report

- Sprints completed: Alpha, Beta, GA
- Tasks shipped: <list>
- Tasks deferred: <list with reason>
- QA matrix: <X>/<Y> green (target: Y/Y)
- Open bugs: Critical=0 High=0 Medium=<n> Low=<n>
- Firebase diff vs baseline: NONE ✅
- Regressions found & fixed: <count>
- Performance budget: <FCP, editor-to-interactive, huge-note scroll fps>
- Tier fidelity audit: Free, Pro, Pro Max, Guest — all pass
- Feature-flag rollback verified: YES ✅

VERDICT: Zero Bug Achieved ✅  →  Flip `notes-v2` ON
```

---

## 13. What This Document Is NOT

- Not authorization to auto-edit files. Each sprint's first task requires user "go" before the Build phase begins.
- Not a license to touch Firebase config, auth, rules, or deploy.
- Not a substitute for human review on migrations (A2 block-ID backfill, C2 history snapshot cadence).

When ready to start Sprint Alpha, respond: **"Start Sprint Alpha"** and the orchestrator will dispatch the first handoff (Product Strategy → A1/A2/A3/A4 briefs).
