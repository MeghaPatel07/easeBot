# QA Sprint 1 — Consolidated Findings

**Run:** 2026-04-18 · static analysis + Playwright UI pass · no Firebase writes · no rule changes
**Scope:** Every test ID in `QA_ARTIFACT_EXECUTION_PLAN.md` Sections A–I
**Agents:** 5 static-analysis QA analysts + Playwright UI capture (30 screenshots × 3 viewports)

## Tally

| Section | PASS | FAIL | WARN/UNCLEAR |
|---|---|---|---|
| A · Attach UI & tray | 6 | 1 | 0 |
| B · Backend parse & inject | 7 | 0 | 0 |
| C · AI reads attached artifacts | 5 | 0 | 0 |
| D · AI manipulation (tool calls) | 9 | 1 | 0 |
| E · Tier gating | 5 | 1 | 1 |
| F · Auth gating | 3 | 0 | 1 |
| G · Edge cases | 9 | 2 | 3 |
| H · Frontend render | 1 | 1 | 2 |
| I · Regressions | 4 | 0 | 0 |
| **Total** | **49** | **6** | **7** |

## Bugs, ranked

### BLOCKERS (No-Go per plan §Go/No-Go)

**BUG-01 · Image attachment URL XSS — CRITICAL** *(G8 + confirmed by A+B analyst)*
- `Wedding-Ease-Viva-Chat/src/components/chat/MessageAttachmentChips.tsx:113-119` renders `att.url` directly into `<img src>` with no scheme check.
- `easebot-backend/src/types/chatAttachments.ts:31-37` accepts `payload: unknown` — no URL validation.
- Attack: `payload: { url: "javascript:alert(1)" }` persists in Firestore and executes on every page load after.
- **Fix:** add `z.string().url().regex(/^https?:\/\//)` on image payload in `ChatAttachmentSchema`; defensively validate scheme in `MessageAttachmentChips` before rendering.

**BUG-02 · Free-tier checklist cap has no backend enforcement — CRITICAL** *(E3)*
- `easebot-backend/src/services/plannerTools.ts:135-142` receives `_isPremium` (underscore-prefixed → explicitly ignored).
- `executeToolCall` → `createChecklist(uid, title, items)` with zero tier or count check.
- UI cap at `PlannerView.tsx:73` (5 checklists) is bypassable by asking the AI.
- **Fix:** in `executeToolCall` `create_checklist` case, read `isPremium`; if false, `countChecklists(uid)` and reject when `>= 5`.

### HIGH

**BUG-03 · Timeline attachment payload shape mismatch — HIGH** *(A+B finding)*
- Frontend sends `{ itemId, title, date, description }` (`AttachmentPicker.tsx:216-231`).
- Backend formatter expects `{ events: [...] }` (`attachmentFormatter.ts:68`).
- Result: timeline attachments fall back to preview string; LLM never sees structured data.
- **Fix:** wrap single event in `events: [...]` array on the frontend, OR teach formatter to accept both shapes.

**BUG-04 · 5-attachment cap enforced server-side only — HIGH UX** *(A6)*
- No client-side guard in `AttachmentPicker.tsx` attach handlers or `ChatAttachmentsContext.tsx`.
- User can stage 6+, sees them in tray, clicks Send → 400 from backend.
- **Fix:** gate each `add*` handler with `if (attachments.length >= 5) { toast.error('Max 5 attachments'); return; }`.

**BUG-05 · SSE disconnect leaves orphan tool writes — HIGH** *(G11)*
- `chatController.ts:910` aborts streaming loop on client disconnect, but `executeToolCall` runs to completion inline (L1176+).
- Firestore writes land even though user never saw the result → artifacts appear on reload unexpectedly.
- **Fix:** check `streamAbort.signal.aborted` before `executeToolCall`, or defer tool writes until SSE completes.

### MEDIUM

**BUG-06 · Fuzzy checklist-item match: first-wins silent collision — MEDIUM** *(D3 + G3, confirmed by both C+D and G analysts)*
- `checklistService.ts:112-126` — `resolveItem` tries id → normalized text → `startsWith` → `contains`. The `startsWith` branch returns the first array element that matches.
- Scenario: items `["Book artist","Book venue"]` + AI tool call with `item_id:"Book"` → "Book artist" silently edited.
- **Fix:** when the `startsWith` or `contains` branch yields >1 candidate, throw an error the LLM can relay back ("ambiguous — please specify").

**BUG-07 · Note body injected as raw Tiptap JSON — MEDIUM** *(A+B finding)*
- Frontend sends `payload.content` which is a stringified Tiptap document.
- Backend `noteBody()` in `attachmentFormatter.ts:28-35` uses `asString()` — no Tiptap→plaintext pass.
- LLM receives JSON structure in the `[Attached context]` block, not readable text; wastes tokens and may hurt comprehension.
- **Fix:** port `plainTextFromTiptap()` from `AttachmentPicker.tsx:60-74` into a backend util, call it in `noteBody()`.

**BUG-08 · Duplicate submit creates duplicate artifacts — MEDIUM** *(G1)*
- `useChat.ts:224-290` — `sendMessage` sets `isTyping` *after* the user message enters state; no in-flight lock at the top.
- Double-click before state propagates → two requests → two checklists (also no server-side idempotency key).
- **Fix:** early-return `if (isTyping) return` at top of `sendMessage`. Optional: add a client-generated `requestId` and cache it server-side for N seconds.

**BUG-09 · Prompt injection via attached note body — MEDIUM** *(G14)*
- `middleware/promptGuard.ts` wraps the top-level `message`, not attachment payloads.
- A note body containing "IGNORE PREVIOUS INSTRUCTIONS..." is injected verbatim via `attachmentFormatter.ts:28-36`.
- Lower severity today because no destructive tool is exposed to the AI — but fragile to future tool additions.
- **Fix:** apply the same guard wording to each attachment body before format, OR sanitize at `parseAttachments` time.

**BUG-10 · Inline attachment chip preview goes stale after AI edit — MEDIUM UX** *(H2)*
- `MessageAttachmentChips` renders a frozen snapshot stored on the message (`useChat.ts:261-278`).
- When AI calls `edit_checklist_item` / `mark_as_done`, the chip's `"2/3 done"` preview doesn't update.
- **Fix:** on tool-action receipt in `useChat.ts:466-492`, look up the matching message attachment and overwrite its preview.

### LOW

**BUG-11 · ComparisonTable missing React `key` prop — LOW** *(Playwright console on /pricing + /checkout, all viewports)*
- `src/pages/Pricing.tsx:161:28` — `ComparisonTable` renders a list without `key`. React dev warning, not a runtime fail.
- **Fix:** add stable `key` on each mapped row.

**BUG-12 · Gallery tab not auto-refreshed after `generate_image` — LOW UX** *(H4)*
- `useChat.ts:453-459` stores last image locally but no Firestore subscription / refetch on gallery view.
- **Fix:** call `refetchGalleryImages()` on image-tool action, or switch gallery to onSnapshot.

**BUG-13 · Guest-path defense-in-depth on tool exec — LOW** *(F1, mitigated)*
- Current code skips tool execution for guest via `if (!isLoggedIn) continue` at `chatController.ts:819`, and Firestore rules would reject a null-uid write anyway.
- Risk is only future-refactor regression.
- **Fix:** first line of `executeToolCall` returns `{ result: 'Auth required', ... }` if `!uid`.

## Warnings / documented gaps (not bugs)

- **E6** — no declared limits on notes / timeline / reminders. Confirm with product; left as-is per plan.
- **E7** — no per-checklist item cap; Firestore 1 MiB doc limit is the only bound.
- **H3** — reminders refetch wired for `create_reminder` only; no `edit_reminder` / `delete_reminder` tools exist to worry about.
- **Reminder timezone** hardcoded to IST in `plannerTools.ts:71` — product decision, not a bug.

## Verified / strong passes

- **I1 image policy guard** — dual-layer (prompt + `generate_image` not even in tool list for most modes); regression-resistant.
- **I3 therapist/consultant disabled** — imports commented, modes not in `MODE_PATTERNS`; 100% dead code path.
- **I4 attachment snapshot persistence** — `useChat.ts:342` writes `attachments` field to Firestore; reload renders correctly via `knownIds` live subscription (`useKnownArtifactIds.ts`).
- **B1–B7** — all backend parse/inject checks pass. Zod + per-item safeParse graceful degradation works.
- **Visual/responsive** — landing, login, help, terms, privacy, payment/success, payment/failure, notfound render cleanly on mobile 375, tablet 768, desktop 1440 with no console errors on those routes. Attach-menu guest-disabled state renders correctly at all viewports (confirms A1 visually).

## Go / No-Go

**NO-GO** — 2 CRITICAL blockers (BUG-01 XSS, BUG-02 tier bypass). Both triggered the plan's No-Go gates.

Recommended Sprint 2 order: BUG-01 → BUG-02 → BUG-03 → BUG-05 → BUG-06 → BUG-09 → BUG-13 → rest.

## Artifacts

- 33 Playwright screenshots: `qa-screenshots/sprint1/{mobile,tablet,desktop}_{slug}[_attach-menu].png`
- Console report: `qa-screenshots/sprint1/console-report.json`
