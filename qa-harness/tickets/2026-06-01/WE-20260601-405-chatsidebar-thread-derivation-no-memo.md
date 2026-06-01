# WE-20260601-405: ChatSidebar recomputes filter/group/sort + allUsedTags on every render & keystroke (no useMemo)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-405` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-performance` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `perf` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatSidebar.tsx:141-173` |
| **URL / Page** | `/:userId/chat` (sidebar) |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-performance`|

## Description

The thread-list derivation in `ChatSidebar` runs unconditionally in the component body (no `useMemo`):

```
const filteredThreads = threads
  .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))   // toLowerCase() on every thread + on the query
  .filter(t => !t.archived)
  .filter(t => !selectedTagFilter || (t.tags ?? []).includes(selectedTagFilter));
const archivedThreads = threads.filter(... title.toLowerCase().includes(searchQuery.toLowerCase()) ...);
const pinnedThreads = filteredThreads.filter(t => t.pinned);
const unpinnedThreads = filteredThreads.filter(t => !t.pinned);
const allUsedTags = Array.from(new Set(threads.flatMap(t => t.tags ?? [])));
const groupedThreads = unpinnedThreads.reduce(...formatDateGroup(... .toDate())...);   // Date construction per thread
const sortedGroupKeys = Object.keys(groupedThreads).sort(...);
```

`ChatSidebar` is itself unmemoized and re-renders on every parent (Index) state change — and Index re-renders on every streamed chat chunk (see WE-20260601-400). So this whole chain (4 array passes + `.toLowerCase()` per thread twice + a `reduce` that constructs a `new Date()` / `formatDateGroup` per thread + a sort) runs on EVERY streamed token AND on every search keystroke (search input is uncontrolled-debounced for analytics only — the filtering itself is synchronous per keystroke). For a user with 100+ threads, that is hundreds of string + date operations per render, multiplied by streaming tick frequency.

`formatDateGroup` also calls `new Date()` and builds an `Intl.DateTimeFormat` per thread per render in the fallback branch (line 89) — Intl formatter construction is comparatively expensive.

## Steps to reproduce (by reading)

1. Have 100+ threads.
2. Type in sidebar search OR stream a chat reply → ChatSidebar re-renders → full filter/group/sort recomputed each time.

## Expected

Wrap derivations in `useMemo` keyed on `[threads, searchQuery, selectedTagFilter]`; hoist a shared `Intl.DateTimeFormat` instance to module scope; consider `React.memo` on `ChatSidebar` so it doesn't re-render on unrelated Index state (streaming).

## Actual

All thread derivations recompute on every render including every streamed chunk and every keystroke.

## Notes

STATIC — needs live re-verify (Profiler) when MCP restored. Specialist: fix-performance. Pairs conceptually with WE-20260601-400 (both rooted in Index re-rendering the world per chunk).

---

_Filed by `qa-performance` on `2026-06-01`._
