# WE-20260528-303 — perf delta (build-based)

## Method

Bundle-size delta from production `npm run build`. For a pure code-split fix
(static imports -> React.lazy), the JS bytes shipped on first paint of /chat
is the canonical metric: each KB removed maps roughly 1:1 to faster TBT and
better LCP on throttled 4x CPU / mid-tier mobile.

## Headline numbers (Index chunk on /chat first paint)

| Metric | Before | After | Delta |
|---|---|---|---|
| Index chunk (raw) | 583.64 KB | 442.49 KB | **-141.15 KB (-24.2%)** |
| Index chunk (gzip) | 142.08 KB | 108.89 KB | **-33.19 KB (-23.4%)** |
| New lazy chunks created | 0 | **11** | code on-demand only |

## Per-view extracted chunks (loaded only when sidebarView matches)

| Chunk | Raw | gzip |
|---|---|---|
| NotificationPanel | 6.66 KB | 2.55 KB |
| ProgressDashboard | 6.95 KB | 2.09 KB |
| InvitePartner | 7.46 KB | 2.51 KB |
| SavedItemsView | 10.32 KB | 3.18 KB |
| PlannerView | 10.47 KB | 3.86 KB |
| ChecklistDetail | 12.48 KB | 4.12 KB |
| RemindersView | 12.74 KB | 3.81 KB |
| BudgetDashboard | 14.25 KB | 3.45 KB |
| ShoppingListView | 16.15 KB | 3.82 KB |
| TimelineView | 21.53 KB | 6.02 KB |
| ImagesHub | 31.81 KB | 10.80 KB |
| **Sum** | **150.82 KB** | **46.21 KB** |

The "delta-removed" (-141 KB raw) is close to but not equal to the sum
of extracted chunks (150 KB raw) because some shared utilities are
de-duplicated when Vite splits — the rollup graph rebalances common deps.

## Estimated LCP / TBT impact

On `/chat` cold cache, mid-tier mobile (4x CPU slowdown, Slow 3G):
- JS parse+exec cost: ~140 KB raw of JS removed from the critical path.
  At a conservative ~2 ms parse-and-compile per KB on a low-end Android,
  this is ~280 ms TBT saved.
- Network transfer: ~33 KB gz saved. On Slow 3G (50 KB/s), that's ~660 ms
  less on the critical path.

Combined: expect **~0.5-1.0 s LCP improvement** on cold /chat loads on the
referenced mid-tier mobile profile in the ticket.

## Validation

- Production build: EXIT=0, no new chunks failed to emit.
- Route HTTP probes against dev server (/, /chat, /planner, /budget, /timeline)
  all return 200.
- Initial HTML on /chat references only entry + vendor chunks; lazy view
  chunks NOT in initial preload set — confirms split is effective.
- Preexisting TS errors: 27 baseline, 27 after — no new TS errors.

## Scope notes

- NotesView left eager intentionally — PR #49 (WE-20260528-304) owns that
  conversion. Merging #49 first will drop another ~158 KB gz (vendor-tiptap)
  off /chat.
- GalleryView import removed — was imported but never referenced anywhere
  in Index.tsx (the `gallery` sidebarView route renders `<ImagesHub>`
  instead). Dead import, gone.
- ChatSidebar/ChatHeader/ChatMessages/ChatInput stay eager — they are
  rendered on /chat itself, lazying them would just add a Suspense flicker.
- FeedbackDialog, SettingsShell, SignUpModal, SignInModal stay eager — they
  are modal chrome that may open immediately on first interaction.
