# WE-20260601-401: fetchLiked does N+1 Firestore reads on every login (one getDocs per thread)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-401` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-performance` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `perf` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/hooks/useChat.ts:216-255` |
| **URL / Page** | `/:userId/chat` (runs on auth) |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-state-data`|

## Description

On every login the `useChat` effect at lines 216-255 fetches all liked messages with a classic N+1 fan-out:

```
const threadsSnap = await getDocs(query(collection(db,'chats'), where('userId','==',uid)))  // 1 read of all threads
const results = await Promise.all(
  threadsSnap.docs.map(async (threadDoc) => {
    const snap = await getDocs(query(collection(db,'chats',threadDoc.id,'messages'), where('liked','==',true)))  // 1 query PER THREAD
    ...
  })
)
```

For a user with N threads this issues N+1 Firestore subcollection queries on EVERY mount (the effect deps are `[user?.uid]`, so it re-runs on every auth state change / page load). A power user with 50-100 threads = 51-101 reads just to populate the "Liked" quick-link — most of which return empty. This is billed Firestore reads, added latency to chat readiness, and a burst of concurrent connections at the worst moment (cold start, competing with thread subscription + reminders + liked-products subscriptions firing in the same render).

It also fetches ALL liked messages eagerly even though the Liked view may never be opened in the session.

## Steps to reproduce (by reading)

1. Log in with an account that has many threads.
2. `useChat` mounts → effect at 216 fires → 1 read for thread list + 1 read per thread.

## Expected

Either (a) a `collectionGroup('messages')` query with `where('liked','==',true)` + `where('userId','==',uid)` (single read, requires a denormalized `userId` on message docs + composite index), or (b) lazy-load liked messages only when the Liked quick-link is first opened, or (c) maintain a per-user `likedMessages` index doc updated on toggle.

## Actual

N+1 reads on every login regardless of whether the Liked view is used.

## Notes

STATIC — needs live re-verify (Firestore read count in console / billing) when backend restored. Specialist: fix-state-data. Not covered by any in-flight perf PR (those are bundle / scheduler / translation-retry).

---

_Filed by `qa-performance` on `2026-06-01`._
