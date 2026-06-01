# WE-20260528-302 — Bundle delta

## Build warnings

| Build state | Warning |
|---|---|
| **Before** | `Circular chunk: vendor-react -> vendor -> vendor-react` (Rollup) |
| **After**  | none |

## Per-chunk comparison (raw / gzipped)

| Chunk (role) | Before | After | Delta (raw) |
|---|---|---|---|
| `react-vendor` (was `vendor-react`) | 147KB / 48KB gz | 166KB / 54KB gz | +19KB (now includes router + transitives) |
| `tiptap-vendor` (was `vendor-tiptap`) | 458KB / 138KB gz | 458KB / 138KB gz | 0 |
| `firebase-vendor` (was `vendor-firebase`) | 542KB / 126KB gz | 542KB / 126KB gz | 0 |
| `radix-vendor` (was `vendor-radix`) | 122KB / 35KB gz | 122KB / 35KB gz | 0 |
| `posthog-vendor` (was `vendor-posthog`) | 182KB / 61KB gz | 182KB / 61KB gz | 0 |
| `tanstack-vendor` (NEW chunk) | (in catch-all) | 39KB / 12KB gz | extracted from catch-all |
| `vendor` (catch-all) | 397KB / 136KB gz | 339KB / 117KB gz | −58KB (−15%) |
| Total of above | 1,848KB / 544KB gz | 1,848KB / 543KB gz | ≈ 0 net |

Net byte transfer is the same (chunks just got re-organized), but the new shape:
- eliminates the circular-chunk warning (broken graph)
- gives `@tanstack/react-query` its own chunk so a future deferred-load PR can flip it without touching everything else
- pulls the bare `react` package + its transitives (`loose-envify`, `js-tokens`, `object-assign`, `use-sync-external-store`, `@remix-run/router`) into `react-vendor` where they belong, reducing the catch-all by 58KB

## Initial-route preload set (`/` cold load)

The entry HTML emits `<link rel="modulepreload">` for the static graph the
entry imports. Both before and after this PR the entry still preloads the
heavy vendor chunks because PR #49 lazy-loads the **page**, not the
top-level providers (Auth/QueryClient/Tooltip/Theme). Reducing the
preload set is out of scope here (the ticket explicitly says "Don't add
new dynamic imports in this PR — focus is JUST chunk splitting").

## What chunk splitting buys us today

1. **Cache stability**: vendors update infrequently (Firebase / Radix / TipTap on package bumps). Code changes invalidate only the page + entry chunks, not the 1.5MB vendor surface.
2. **Parallel fetch**: HTTP/2 can multiplex 10 small chunks faster than 1 mega-chunk.
3. **Lazy-load runway**: With clean chunk boundaries, follow-up tickets can `lazy()` heavy routes (NoteEditor → tiptap; settings → firebase functions) and the bundler will already know where to put them.

## What chunk splitting does NOT fix (follow-up tickets)

- Top-level providers in `App.tsx` still trigger eager Firebase + TanStack + Radix load. A follow-up could move `QueryClient` creation behind a lazy boundary.
- `vendor-pdf` (575KB raw / 173KB gz) is module-preloaded because somewhere in the static graph someone imports jspdf at module scope. Should become a dynamic import in NoteEditor (filed separately).
- `Index-*.js` page chunk is 583KB raw / 142KB gz — page-level sub-component splitting (sidebar tabs, settings panes) is a follow-up.
- `posthog-vendor` should be deferred to post-hydration (separate ticket 305).
