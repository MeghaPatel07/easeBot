# WE-20260527-064: Desktop — WeddingEaseFloater "E" icon sits on top of chat input's mic / send button

| Field | Value |
|---|---|
| **ID** | `WE-20260527-064` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/WeddingEaseFloater.tsx` (positioning) |
| **URL / Page** | `/` desktop |
| **Breakpoint** | `desktop` (1280x800) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

On the desktop landing page, the floater "E" circle (bottom-right) visually overlaps the chat input's rightmost icon (mic / `+`) — they live at nearly the same `bottom: 24px; right: 24px` slot. Users may click the floater when trying to press mic, or vice versa.

## Steps to reproduce

1. Open `http://localhost:8081/` at 1280x800.
2. Locate the chat input row near the bottom.
3. Observe the round "E" floater overlapping the bottom-right of the input bezel.

## Expected

Floater is hidden on chat pages OR positioned away from the input row. App.tsx already gates `<GlobalFloater>` to non-chat routes — so this overlap is from a local floater render inside `Index.tsx`. Confirm placement and add a 16-24px gap from any chat-input bottom-right icon.

## Actual

Two affordances at the same screen coordinates — confusing pointer targets.

## Evidence

- `qa-harness/evidence/WE-20260527-064/screenshots/desktop-index-mic-floater-overlap.png`

## Notes

The CLAUDE.md comment for App.tsx says "On all chat/index views, the floater is handled locally next to the input box" — so the overlap is intentional placement *next to* but actually it’s on top of. Move 60-80px right of the input or hide once a textarea is focused.

---
