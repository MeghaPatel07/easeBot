# QA Sprint 2 — Fix + Re-verify Report

**Run:** 2026-04-18 · 2 DEV agents (backend + frontend) in parallel + orchestrator follow-up fix
**Constraint compliance:** No Firebase rule / permission / data-write changes. Only application source edits.

## Bug status after Sprint 2

| # | Severity | Area | Status | Verification |
|---|---|---|---|---|
| BUG-01 | CRITICAL | Image URL XSS | ✅ fixed | Zod `superRefine` + frontend `isSafeHttpUrl` guard |
| BUG-02 | CRITICAL | Free-tier checklist cap bypass | ✅ fixed | `isPremium` wired, `countChecklists` check ≥5 |
| BUG-03 | HIGH | Timeline payload shape mismatch | ✅ fixed | Frontend now sends `{ events: [...] }` |
| BUG-04 | HIGH UX | Client-side 5-attachment cap | ✅ fixed | Toast + early return in all 4 attach handlers |
| BUG-05 | HIGH | SSE disconnect → orphan tool writes | ✅ fixed | Abort signal checked before each tool call + pre-LLM pass |
| BUG-06 | MEDIUM | Fuzzy match first-wins collision | ✅ fixed | `resolveItem` + `resolveChecklist` throw on ambiguity |
| BUG-07 | MEDIUM | Raw Tiptap JSON in LLM prompt | ✅ fixed | `tiptapToPlainText` helper applied in `noteBody()` |
| BUG-08 | MEDIUM | Duplicate submit | ✅ fixed | `if (isTyping) return` at top of `sendMessage` |
| BUG-09 | MEDIUM | Prompt injection via attachment body | ✅ fixed | `maybeWrapUntrusted` applied to note body + checklist items |
| BUG-10 | MEDIUM UX | Stale inline chip after AI edit | ✅ fixed | Preview rewritten on `edit_checklist_item` + `mark_as_done` tool actions |
| BUG-11 | LOW | ComparisonTable React key warning | ✅ fixed | Multi-`tbody` pattern replaces Fragment (follow-up after initial agent fix regressed into `data-lov-id` Fragment prop warning) |
| BUG-12 | LOW UX | Gallery auto-refresh | ✅ fixed | `CustomEvent('easebot:gallery-refresh')` + listener in `GalleryView.tsx` |
| BUG-13 | LOW (defense) | Null-uid guard in `executeToolCall` | ✅ fixed | Early return at function entry |

**Totals:** 13 / 13 applied. 0 remaining.

## Re-verification

- **Backend tsc:** `npx tsc --noEmit` clean in `easebot-backend/`.
- **Frontend tsc:** `npx tsc --noEmit` clean in `Wedding-Ease-Viva-Chat/`.
- **Playwright UI pass (10 captures on 5 pages × 2 viewports):** 0 console errors, 0 warnings on landing, login, pricing, checkout, help. Screenshots at `qa-screenshots/sprint2/`.

## Files changed

### Backend
- `easebot-backend/src/types/chatAttachments.ts` — image URL scheme enforcement (Zod superRefine).
- `easebot-backend/src/types.ts` — optional `blocked` field on `ToolAction`.
- `easebot-backend/src/services/plannerTools.ts` — null-uid guard, `isPremium` check, tier-capped `create_checklist`.
- `easebot-backend/src/services/checklistService.ts` — `countChecklists` export, ambiguity-throws in `resolveChecklist` + `resolveItem`.
- `easebot-backend/src/utils/attachmentFormatter.ts` — `tiptapToPlainText`, `maybeWrapUntrusted`, applied to note body and checklist item text.
- `easebot-backend/src/controllers/chatController.ts` — abort-signal guard before each tool call and before second LLM streaming pass.

### Frontend
- `Wedding-Ease-Viva-Chat/src/components/chat/MessageAttachmentChips.tsx` — `isSafeHttpUrl` guard before `<img src>`.
- `Wedding-Ease-Viva-Chat/src/components/chat/AttachmentPicker.tsx` — 5-attachment cap toast + timeline `{ events: [...] }` payload.
- `Wedding-Ease-Viva-Chat/src/hooks/useChat.ts` — in-flight send lock, tool-action-triggered chip preview rewrite, gallery-refresh CustomEvent dispatch.
- `Wedding-Ease-Viva-Chat/src/components/GalleryView.tsx` — `easebot:gallery-refresh` listener.
- `Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx` — ComparisonTable refactored to multiple `<tbody>` groups (valid HTML, accepts dev-tagger `data-lov-id` attribute, each group has stable key).

## Go / No-Go

**GO (code-change scope).** Both No-Go gates from Sprint 1 (BUG-01 XSS, BUG-02 tier bypass) are closed with defense-in-depth. All HIGH and MEDIUM issues are fixed; `tsc` clean both sides; no console errors on the Playwright pass.

## What is still NOT covered by this sprint

Because the constraint prohibits Firebase writes and actual runtime QA:
- No end-to-end chat-session runs against a real backend. The tier cap, XSS guard, SSE abort, and ambiguity throws are verified statically and via types — they have not been exercised with live user turns.
- No load/concurrency test (G1 duplicate submit was static-verified via the in-flight lock, not stress-tested).
- No auth-state transitions (token expiry, role change mid-session).

Recommended Sprint 3 (when the user is ready to allow runtime testing): spin up backend on :4000/:5000, run the Section C–D and E–F test prompts with a test tenant, and confirm the fixes behave as expected in live Firestore writes (still within a dedicated test project to honor the production-Firebase guardrail).
