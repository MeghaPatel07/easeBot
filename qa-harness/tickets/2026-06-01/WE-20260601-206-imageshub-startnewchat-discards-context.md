# WE-20260601-206: Mode-switch journey — generating from ImagesHub calls startNewChat() and discards the active conversation (Flow D step 4-6)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-206` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `qa-e2e-playwright` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `e2e-flow` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/hooks/useImageHubSubmit.ts:87-109` ; `src/hooks/useChat.ts:1014-1020` (startNewChat) ; wired at `src/pages/Index.tsx:1351` |
| **URL / Page** | Chat thread → Images hub → Generate → back to chat |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-state-data`|
| **PR** | |
| **Progress** | |

## Description
Flow D ("Mode-switching journey") step 6 requires: "Switch back to chat → conversation context
preserved." When the user is inside an existing chat thread and generates an image via the Images hub,
`useImageHubSubmit.submit` calls `startNewChat()` immediately before sending:

```
setIsSubmitting(true)
try {
  startNewChat()                  // useChat.ts:1014 → setMessages([]) + activeThreadId=null + clears styleMemory
  await sendMessage(messageText, { forceImageGeneration: true, ... })
```
(useImageHubSubmit.ts:89-92)

`startNewChat()` (useChat.ts:1014-1020) clears the in-view `messages` array, resets `activeThreadId`
to `null`, and drops `lastGeneratedImageUrl` / `styleMemory`. So the moment the user generates an image
from the hub, the conversation they were in is replaced by a brand-new empty thread. Switching back to
"chat" does NOT restore the prior context — it shows the new image-only thread. The prior thread still
exists in Firestore (the user can re-open it from the sidebar), but the in-flow expectation of "context
preserved on mode switch" is violated, and any unsaved/guest context is destroyed (see WE-20260601-202
for the guest case).

For a guest specifically this is worse: `startNewChat()` blows away the in-memory guest conversation
that was never persisted to Firestore, so it is gone permanently.

## Steps to reproduce (by reading)
1. Open/continue a chat thread (messages visible, `activeThreadId` set).
2. Switch to Images hub and submit a generation.
3. `useImageHubSubmit.ts:89` runs `startNewChat()` → `useChat.ts:1015-1019` wipes messages + thread id.
4. Image generates into a fresh thread; switching back to chat shows the new thread, not the prior one.

## Expected
Generating an image should not silently discard the active conversation. Either generate within the
current thread (preserving context as Flow D requires) or make the "new thread on generate" behaviour
explicit/opt-in and never destroy unsaved (guest) context.

## Actual
`startNewChat()` unconditionally clears the active conversation before every hub generation.

## Evidence
- STATIC — needs live re-verify when MCP+backend restored.
- `src/hooks/useImageHubSubmit.ts:87-109`. `src/hooks/useChat.ts:1014-1020`. Wiring: `src/pages/Index.tsx:1351`.

## Notes
fix-frontend / fix-state-data. May be partly intentional for the hub's "fresh canvas" UX — flag for
product decision, but the silent destruction of unsaved context is the defect. Not in
marathon-master-2026-05-29.csv.

---
_Filed by `qa-e2e-playwright` on `2026-06-01T00:00:00Z`._
