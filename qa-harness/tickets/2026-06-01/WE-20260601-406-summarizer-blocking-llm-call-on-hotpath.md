# WE-20260601-406: Conversation summarizer adds a full blocking LLM round-trip to the chat hot path on every turn once history > 10

| Field | Value |
|---|---|
| **ID** | `WE-20260601-406` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-performance` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `perf` |
| **Repo** | `easebot-backend` |
| **Path** | `src/controllers/chatController.ts:717-733 (non-stream) + 1247-1263 (stream); src/services/conversationSummarizer.ts:39` |
| **URL / Page** | `POST /api/chat` and `POST /api/chat/stream` |
| **Breakpoint** | `n/a (backend)` |
| **Status** | `triaged`|
| **Assigned** | `fix-backend-api`|

## Description

When a thread has more than 10 history messages, the controller performs a SECOND, fully-awaited LLM completion (`summarizeConversation` → `client.chat.completions.create`, conversationSummarizer.ts:39) BEFORE issuing the main streaming LLM call:

```
if (history.length > 10) {
  const olderMessages = history.slice(0, history.length - 5)
  const summary = await summarizeConversation(olderMessages, getClient(), targetLanguage)   // blocking LLM call
  effectiveHistory = [{ role:'assistant', content:`[summary]: ${summary}` }, ...recentMessages]
}
```

Because it is `await`ed in series before `streamCallAzureAI(...)`, every chat turn on any thread past ~10 messages pays the FULL summarizer completion latency (typically 300ms-1.5s) on the critical path, directly delaying time-to-first-token for the user's actual answer. It also runs the summarizer EVERY turn (no caching of the previous summary), re-summarizing the same older messages repeatedly as the conversation grows — re-paying both latency and tokens each turn.

Perf angle is distinct from the prior correctness tickets WE-20260528-1208 (error-swallow / no observability) and WE-20260528-1412 (loses image URLs in summary) — neither addresses the per-turn blocking latency or the lack of summary caching.

## Steps to reproduce (by reading)

1. Continue a thread past 10 messages.
2. Each subsequent turn: getChatHistory(limit 10... but if >10 provided history) → summarizeConversation awaited → THEN the main LLM stream. TTFT includes the whole summary completion.

## Expected

- Cache the rolling summary per thread (persist `summary` + `summarizedThroughMessageId` on the thread doc) so only NEW messages beyond the last summary are folded in, not the entire older window every turn.
- Or run summarization off the hot path (background job updating the cached summary) and read the cached value synchronously at turn time.
- At minimum, drop older messages to recent-N as the fallback (already suggested in -1208) rather than block on an LLM round-trip per turn.

## Actual

A blocking LLM completion runs serially before the answer LLM on every >10-message turn; older window re-summarized from scratch each turn.

## Notes

STATIC — needs live re-verify (Server-Timing TTFT delta with/without summarizer) when backend restored. Specialist: fix-backend-api. P3 because it overlaps the existing summarizer tickets' fix surface (recent-N truncation would also remove the call).

---

_Filed by `qa-performance` on `2026-06-01`._
