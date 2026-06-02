# WE-20260601-311: searchAllMessages throws on a message doc with missing/null `content` — one bad doc kills the whole search

| Field | Value |
|---|---|
| **ID** | `WE-20260601-311` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/services/chatService.ts:257, 261-262` |
| **URL / Page** | `/chat` (sidebar search) |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-state-data`|

## Description
`searchAllMessages` iterates every message doc and calls
`data.content.toLowerCase()` (line 257) and `data.content.length` / `.slice()`
(lines 261-262) with NO null/undefined guard. If ANY message document across the
user's threads has a missing or null `content` field — possible for legacy docs,
image-only / voice-only turns persisted without a content string, or a partially-
written doc from an interrupted send — `.toLowerCase()` throws
`TypeError: Cannot read properties of undefined`. Because the per-batch loop has no
try/catch, that single bad doc aborts the entire cross-thread search; the promise
rejects and the user's search returns nothing (or errors) even though dozens of
valid threads matched.

## Steps to reproduce (by reading)
1. A thread contains a message doc with no `content` field (e.g. an old image-only
   turn, or an interrupted write).
2. User searches from the sidebar → `searchAllMessages` hits that doc.
3. `data.content.toLowerCase()` (line 257) throws → whole search rejects.

## Expected
Guard: `const content = typeof data.content === 'string' ? data.content : ''`
(or `data.content ?? ''`) before `.toLowerCase()` / `.length` / `.slice()`, and/or
wrap the inner loop so one malformed doc is skipped rather than failing the batch.

## Actual
Unguarded `.toLowerCase()` on `content`; a single content-less doc throws and kills
the whole search.

## Notes
STATIC — needs live re-verify. Same `data.content` access appears in the liked-msgs
mapper (`useChat.ts:236`) and `loadChat` (mapped to `text: data.content`), but those
tolerate undefined downstream; the search path is the one that hard-crashes.

---
_Filed by `edge-case-qa` on `2026-06-01`._
