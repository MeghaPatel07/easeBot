# WE-20260601-309: inputSanitizer only scrubs `message`/`prompt` — vibeTitle, vibeDescriptors, style, threadId pass through with control chars

| Field | Value |
|---|---|
| **ID** | `WE-20260601-309` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `edge` |
| **Repo** | `easebot-backend` |
| **Path** | `src/middleware/inputSanitizer.ts:7` |
| **URL / Page** | `POST /api/chat`, `POST /api/chat/stream`, `POST /api/generate-image` |
| **Breakpoint** | `n/a` |
| **Status** | `triaged`|
| **Assigned** | `fix-backend-api`|

## Description
`SANITIZE_FIELDS = new Set(['message', 'prompt'])` — only those two string fields get
control-char stripping + trim. Several other free-text fields that reach the LLM
prompt and/or logs are NOT sanitized:

- `vibeTitle` (used verbatim in `buildVibeSystemSuffix`, chatController, and in
  `buildVibeId`/`slugify`).
- `vibeDescriptors[]` (joined into the system prompt verbatim).
- `style` (image schema, `ImageGenerateSchema`).
- `threadId` (used to build Firestore collection paths).

Control characters (e.g. `\x00`, `\x1B`, bidi overrides) in these fields therefore
reach the LLM context and any structured logs unescaped — the exact log-injection /
prompt-pollution surface WE-20260528-203 closed for `message`/`history[].content` but
which does not extend to these fields because they're not in `SANITIZE_FIELDS` and
the recursive walker only sanitizes keys it explicitly lists.

## Steps to reproduce (by reading)
1. POST `/api/chat/stream` with `vibeTitle` = "Boho\x1B[31mRED" / `vibeDescriptors` =
   ["a\x00b"].
2. `sanitizeObject` walks the body but only rewrites `message`/`prompt`; these pass
   through untouched into `buildVibeSystemSuffix` and logs.

## Expected
Either broaden `SANITIZE_FIELDS` to include `vibeTitle`, `vibeDescriptors` (array of
strings), `style`, and `threadId`, OR strip control chars on ALL string leaves except
the explicitly-excluded base64 fields. Prefer the latter for resilience.

## Actual
Only `message`/`prompt` are scrubbed; sibling free-text fields bypass sanitization.

## Notes
STATIC. Defense-in-depth extension of WE-20260528-203, not a re-file — that ticket
explicitly scoped `history[].content`; these fields were out of its scope.

---
_Filed by `edge-case-qa` on `2026-06-01`._
