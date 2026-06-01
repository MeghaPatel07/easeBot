# WE-20260601-305: No `dir="auto"` anywhere — Arabic/Hebrew (RTL) chat input + bubbles render left-to-right, mixed RTL/LTR corrupts layout

| Field | Value |
|---|---|
| **ID** | `WE-20260601-305` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatInput.tsx:393` (textarea), `src/components/chat/ChatMessages.tsx:442` (bubble), `src/pages/SharedChat.tsx:82,91` |
| **URL / Page** | `/chat`, `/share/:id` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|

## Description
A repo-wide grep for `dir="auto"` / `dir={` returns ZERO matches in
`Wedding-Ease-Viva-Chat/src`. The composer textarea, the assistant markdown bubble,
and the user bubble (and the SharedChat public mirrors) all render with the default
LTR direction. Yet the app explicitly supports RTL languages — `inbound.ts:94`
detects Arabic (`U+0600–U+06FF`) for translation and `detectLanguageFromScript`
returns `'ar'`. So a user can type/receive Arabic (and Urdu/Hebrew) content that the
pipeline fully supports, but it displays with wrong text direction:

- RTL text renders flush-left with trailing punctuation/parentheses on the wrong side.
- Mixed RTL+LTR (e.g. an Arabic sentence containing a Latin brand name or a URL)
  triggers bidi reordering glitches and can visually scramble the line.
- The `whitespace-pre-wrap` user bubble in SharedChat (`SharedChat.tsx:82`) has the
  same problem in the public share view.

## Steps to reproduce (by reading)
1. Type or receive Arabic/Hebrew text in chat.
2. No element sets `dir="auto"`, so the browser applies the document LTR base.
3. Punctuation/parentheses anchor on the wrong side; mixed-script lines reorder oddly.

## Expected
Set `dir="auto"` on the composer `<textarea>` and on each rendered message bubble
(both assistant markdown container and user bubble), in the live `/chat` view and the
`/share/:id` mirror, so the browser picks direction per the first strong character.

## Actual
Everything renders LTR; RTL languages (a supported translation target) display
incorrectly and mixed RTL/LTR lines are visually corrupted.

## Notes
STATIC — needs live re-verify (visual). Distinct from WE-20260528-1056 (which added
`lang` for screen-reader pronunciation, not text direction). Low code cost, real
correctness impact for a supported language family.

---
_Filed by `edge-case-qa` on `2026-06-01`._
