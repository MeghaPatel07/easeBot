# WE-20260601-308: ChatRequest `toneSettings` / `history[].content` schemas unbounded — record keys + history length not capped

| Field | Value |
|---|---|
| **ID** | `WE-20260601-308` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `edge` |
| **Repo** | `easebot-backend` |
| **Path** | `src/schemas/chat.ts:9, 11-14` |
| **URL / Page** | `POST /api/chat`, `POST /api/chat/stream` |
| **Breakpoint** | `n/a` |
| **Status** | `triaged`|
| **Assigned** | `fix-backend-api`|

## Description
`ChatRequestSchema` caps `message` at `max(10000)` but leaves several adjacent fields
wide open to oversized / malformed input:

- `toneSettings: z.record(z.number().min(0).max(100)).optional()` — validates VALUES
  but not KEYS or COUNT. A caller can send thousands of arbitrary keys, each a long
  string, all of which flow into `buildPersonalizationSuffix` / the system prompt.
  No `.refine`/key enum, no max property count.
- `history: z.array(z.object({ role, content: z.string() }))` — `content` has NO
  `.max()` and the array has NO `.max()` length. A guest (who supplies `history`
  client-side, see `useChat.ts:497`) can post an arbitrarily large history payload;
  `getChatHistory` only `.slice(-10)`s AFTER full parse, so the whole oversized body
  is still accepted, validated, and held in memory first.

This is the same class as WE-20260528-203 (which addressed control-char SANITIZATION
of `history[].content`) and WE-20260527-202 (imageData length) but those did not add
LENGTH/COUNT bounds to `toneSettings` keys or `history`. Unbounded text into the
prompt is also a token-cost / prompt-stuffing vector.

## Steps to reproduce (by reading)
1. POST `/api/chat/stream` with `toneSettings` = { "<5KB key>": 50, ... x 5000 } —
   passes schema (only values are checked).
2. POST with `history` = 500 entries of 50KB `content` each — passes schema
   (no `.max` on content or array length).

## Expected
- `toneSettings`: constrain to a known key set (or `z.record(...).refine(obj =>
  Object.keys(obj).length <= N && keys match an allowlist)`).
- `history`: `content: z.string().max(10000)` and the array `.max(50)` (or the
  effective history-limit) so oversized payloads are rejected before processing.

## Actual
`toneSettings` keys/count and `history` content/length are unbounded.

## Notes
STATIC. Defense-in-depth + cost control; pairs with the existing sanitizer hardening
ticket rather than duplicating it.

---
_Filed by `edge-case-qa` on `2026-06-01`._
