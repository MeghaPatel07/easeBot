# WE-20260601-302: Pasting a >10,000-char message yields a generic error — no client cap, no counter, no "too long" copy

| Field | Value |
|---|---|
| **ID** | `WE-20260601-302` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatInput.tsx:393-413`, `src/pages/Index.tsx`, `easebot-backend/src/schemas/chat.ts:4` |
| **URL / Page** | `/chat` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|

## Description
The backend caps `message` at `z.string().min(1).max(10000)` (`schemas/chat.ts:4`),
returning a Zod `400 { error: 'Request validation failed', code: 'VALIDATION_ERROR' }`
on overflow. The chat `<textarea>` (`ChatInput.tsx:393`) has NO `maxLength` and there
is no pre-send length guard anywhere in `Index.tsx`, and no character counter.

Result: a user who pastes a wall of text (a long email, a vendor contract, a pasted
article) can compose and send a >10k-char message. The stream returns 400; the
frontend's `streamChatMessage` 400 branch throws `Error('Request validation failed')`,
which `useChat` collapses to the generic "Something went wrong. Please try again."
The user has no idea the message was too long or that trimming it would fix it — and
the already-persisted user turn (written at `useChat.ts:481` before the stream) is
left dangling.

## Steps to reproduce (by reading)
1. Paste 10,001+ chars into the composer — no `maxLength`, no counter, send enabled.
2. Send → backend Zod `.max(10000)` rejects with 400 VALIDATION_ERROR.
3. `streamChatMessage:179` throws `Error('Request validation failed')`.
4. `useChat:829` → generic "Something went wrong."

## Expected
Either (a) a soft `maxLength`/counter on the textarea that warns near 10k and blocks
send past the cap with a clear "Message is too long (max 10,000 characters)" hint, or
(b) explicit handling of the 400 VALIDATION_ERROR to show that specific guidance.
Prefer (a) so the user is warned BEFORE losing the round-trip + dangling turn.

## Actual
No cap, no counter; overflow produces a confusing generic error and a dangling
persisted user message.

## Notes
STATIC — needs live re-verify. 100k-char paste behaves identically (rejected at
backend) but also risks a large base64/body before rejection. Empty/whitespace-only
sends ARE guarded (`useChat.ts:374` `!text.trim()`), so that boundary is fine.

---
_Filed by `edge-case-qa` on `2026-06-01`._
