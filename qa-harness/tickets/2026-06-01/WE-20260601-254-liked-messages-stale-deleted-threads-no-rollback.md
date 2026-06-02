# WE-20260601-254: Liked-messages list keeps entries from removed threads + optimistic like has no rollback on persist failure

| Field | Value |
|---|---|
| **ID** | `WE-20260601-254` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-state-sync` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `state-sync` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/hooks/useChat.ts:869-901` (toggleLike — no rollback) ; `:1023-1033` (deleteThread comment admits the leak) |
| **URL / Page** | Chat → Liked messages quick-link view + sidebar liked count |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-state-data`|
| **PR** | |
| **Progress** | |

## Description

DEDUP NOTE: WE-20260527-155 already covers "liked view loaded once on login; likes/unlikes don't update the list." Since then, `toggleLike` (useChat.ts:881-889) DOES push optimistically into `allLikedMessages`, so the basic 155 case is partly addressed. This ticket files the TWO residual state-sync defects 155 did NOT cover:

1. **Removed-thread leak.** `deleteThread` (useChat.ts:1023-1033) explicitly does NOT prune liked messages belonging to the removed thread — the inline comment says exactly this: "for full cross-thread liked removal we'd need threadId on each liked msg — skip for now." So after deleting a thread (or after Settings → Data & Privacy → Clear chat history wipes all threads server-side), the Liked view and the sidebar liked count keep counting liked messages whose thread no longer exists. Clicking such an entry navigates to a dead thread. 155's fix direction (optimistic push on toggle) does not address pruning on thread removal.

2. **No optimistic rollback on like persist failure.** `toggleLike` flips both `messages[].liked` and `allLikedMessages` optimistically (lines 876-889), then persists via `toggleLikeMessage(...)`. If the write throws, the catch only `console.error`s (line 898) — it does NOT revert the optimistic flip or toast. The UI shows the message as liked/unliked while the backend disagrees; a reload silently reverts it. This violates the same "no lying UI" rule already enforced in `useAccount` (M-6/M-7).

## Steps to reproduce (by reading)

Leak: 1) Like a message in thread X. 2) Delete thread X (own button) or Clear chat history. 3) Open the Liked view / check the sidebar liked count — the message from X is still counted and listed; clicking it goes to a dead thread.

No-rollback: 1) Like a message while offline / when the persist write fails. 2) The heart stays filled (optimistic) but the backend never recorded it. 3) Reload — the like is gone, with no error shown at the time of failure.

## Expected

Liked list/count drop entries whose thread was removed within ~1s; a failed like/unlike persist rolls back the optimistic UI and surfaces a non-blocking error.

## Actual

Liked list/count retain messages from removed threads (and navigate to dead threads); a failed persist leaves a lying optimistic state until reload.

## Evidence

- STATIC — needs live re-verify when MCP + backend restored.
- Code: `useChat.ts:869-901, 1023-1033`; `ChatSidebar.tsx:354` (liked count consumer, per 155).

## Notes

Specialist: `fix-state-data`. Fixes: (a) on `deleteThread`/clear-history, prune `allLikedMessages` by removed threadId(s) (each liked msg already carries a `threadId`); (b) in `toggleLike` catch, revert both `messages[].liked` and the `allLikedMessages` mutation and toast an error. Net-new relative to WE-20260527-155.

---

_Filed by `qa-state-sync` on `2026-06-01`._
