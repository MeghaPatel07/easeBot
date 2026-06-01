# WE-20260601-202: Guest conversation is discarded on sign-up — no guest→logged-in migration to a Firestore thread

| Field | Value |
|---|---|
| **ID** | `WE-20260601-202` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `qa-e2e-playwright` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `e2e-flow` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Index.tsx:800-812` (guest-reset effect) ; `src/hooks/useChat.ts:464-494` (only persists when `user` already set) |
| **URL / Page** | Guest chat → Sign up (SignUpModal / cap-hit CTA) → `/` |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-state-data`|
| **PR** | |
| **Progress** | |

## Description
Flow A→B bridge (guest converts to a logged-in account mid-conversation).

A guest's conversation lives only in (a) the in-memory `messages` array from `useChat`, and
(b) `sessionStorage['easebot-guest-chat']` (Index.tsx:849-856). It is never written to Firestore
because `useChat.sendMessage` only persists when `user` is already truthy (useChat.ts:464 `if (user)`).

When the guest signs up, `AuthContext` sets `user`, which fires the reset effect in Index.tsx:800-812:
```
useEffect(() => {
  if (user) {
    setGuestMessageCount(0); ...
    sessionStorage.removeItem('easebot-guest-chat');
    sessionStorage.removeItem('easebot-guest-images');
    localStorage.removeItem('easebot-guest-msg-count');
    localStorage.removeItem('easebot-guest-img-count');
  }
}, [user]);
```
This WIPES the guest's persisted conversation and counters but does NOT migrate the messages into a
new `users/{uid}/threads/...` document. There is no migration code anywhere (grep for `migrat`,
`guest-chat`, `importGuest` finds only set/get/remove of the sessionStorage key).

Net effect: the exact users the cap-hit CTA pushes to sign up (Flow A step 7 / Flow F) lose 100% of
the conversation they just had the moment they convert. The new account starts empty.

## Steps to reproduce (by reading)
1. As guest, send several messages → they accumulate in `useChat` `messages` + sessionStorage.
2. Sign up via SignUpModal (or the cap-hit "Sign up" CTA).
3. `AuthContext` sets `user` → Index.tsx:800-812 effect clears the guest chat from storage.
4. No code reads the old guest messages to call `createThread` / `addMessage` for the new uid.
5. Logged-in `useChat` subscription loads the user's (empty) thread list; prior chat is gone.

## Expected
On guest→logged-in conversion, migrate the in-memory guest `messages` into a new Firestore thread for
the new uid (or at minimum keep them visible in-session and persist on next send) BEFORE clearing the
guest storage. The user should be able to "keep chatting" and see their prior turns.

## Actual
Guest conversation is silently destroyed at the moment of conversion; new account is blank.

## Evidence
- STATIC — needs live re-verify when MCP+backend restored.
- Reset effect: `src/pages/Index.tsx:800-812`.
- Persistence gate: `src/hooks/useChat.ts:464`.
- No migration: `grep -rn "migrat|guest-chat|importGuest" src/` returns only storage set/get/remove.

## Notes
fix-state-data (migration logic) with fix-frontend coordination. Not in marathon-master-2026-05-29.csv.
Distinct from WE-20260601-203 (refresh-loss) — this one is conversion-loss.

---
_Filed by `qa-e2e-playwright` on `2026-06-01T00:00:00Z`._
