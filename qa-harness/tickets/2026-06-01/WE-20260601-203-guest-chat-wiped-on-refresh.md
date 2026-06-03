# WE-20260601-203: Guest chat is wiped on page refresh — beforeunload cleanup defeats the restore-on-mount path

| Field | Value |
|---|---|
| **ID** | `WE-20260601-203` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `qa-e2e-playwright` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `e2e-flow` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Index.tsx:814-834` (restore-on-mount) vs `src/pages/Index.tsx:858-869` (beforeunload wipe) |
| **URL / Page** | `/` as guest, then F5 / reload |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description
Index.tsx contains BOTH a restore-on-mount effect that rehydrates the guest conversation from
`sessionStorage['easebot-guest-chat']` (lines 814-834, calling `restoreMessages`), AND a
`beforeunload` handler that removes that same key (lines 858-869):

```
useEffect(() => {
  if (user) return;
  const cleanup = () => {
    sessionStorage.removeItem('easebot-guest-chat');
    sessionStorage.removeItem('easebot-guest-images');
  };
  window.addEventListener('beforeunload', cleanup);
  return () => window.removeEventListener('beforeunload', cleanup);
}, [user]);
```

`beforeunload` fires on a normal page refresh/reload (not just tab close). So the sequence on a guest
refresh is: beforeunload → wipe `easebot-guest-chat` → page reloads → restore-on-mount finds nothing →
empty chat. The restore-on-mount code therefore only ever helps within a single SPA session (no reload),
which it already gets from in-memory state — making the persisted-restore essentially dead for the
refresh case it was written to cover. A guest who accidentally hits refresh loses the whole conversation.

The two effects encode contradictory intentions (one preserves across reload, one destroys on unload).

## Steps to reproduce (by reading)
1. As guest, send messages → persisted to `sessionStorage['easebot-guest-chat']` (Index.tsx:849-856).
2. Press F5 / Cmd-R. `beforeunload` (Index.tsx:863) runs `removeItem('easebot-guest-chat')`.
3. Page reloads; restore-on-mount (Index.tsx:818) reads the now-deleted key → nothing to restore.
4. Guest sees an empty chat; counts (separate localStorage keys) survive, so they may already be capped.

## Expected
A guest refresh should restore the in-progress conversation (the restore code clearly intends this).
Either drop the `beforeunload` removeItem (rely on sessionStorage's own tab-scoped lifetime), or
distinguish reload from real navigation-away before wiping.

## Actual
Guest conversation is destroyed on every refresh; the restore effect is rendered ineffective.

## Evidence
- STATIC — needs live re-verify when MCP+backend restored.
- Restore: `src/pages/Index.tsx:814-834`. Wipe: `src/pages/Index.tsx:858-869`. Persist: `:849-856`.

## Notes
Pairs with WE-20260601-202 (conversion-loss). fix-frontend / fix-state-data.
Aggravating factor: if the guest is at/near the 10-msg cap, counts persist (localStorage) but the chat
is gone — so they may be locked out with nothing to show. Not in marathon-master-2026-05-29.csv.

---
_Filed by `qa-e2e-playwright` on `2026-06-01T00:00:00Z`._
