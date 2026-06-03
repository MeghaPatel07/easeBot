# WE-20260528-052: Mascot illustration overlaps "The Wedding Bot" text in empty-state on narrow viewports (≤375px and ≤600px)

| Field | Value |
|---|---|
| **ID** | `WE-20260528-052` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/EmptyState.tsx` (suspected) |
| **URL / Page** | `http://localhost:8081/` |
| **Breakpoint** | `mobile` (375, 320) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

In the chat empty-state, the bot mascot graphic sits **next to** the large "The / Wedding / Bot" wordmark on mobile, and at 320px (iPhone SE) the mascot is partially clipped on the left edge while the wordmark sits on top of it. The result reads as a confusing collision of two large visual elements instead of a single clean wordmark.

- At 375px: mascot + wordmark side-by-side, both touching
- At 320px (iPhone SE): mascot clipped, wordmark overlaps the mascot

## Steps to reproduce

1. Open `http://localhost:8081/` at 375×812 (and again at 320×568)
2. Scroll to the empty-state "Hi! I'm here to help…"
3. Observe the brand block above the title

## Expected

On viewports ≤480px: stack mascot above wordmark (vertical layout) OR show mascot only and let the wordmark live in the header.

## Actual

Horizontal flex pushes them together; at 320px the mascot is cropped by the container's `overflow: hidden`.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-052/screenshots/`
  - `mobile-index.png` — 375px showing collision
  - `iphonese-home.png` — 320px showing the mascot clipped

## Notes

Not a duplicate of WE-20260527-062 (which is sidebar-clipping). This is the empty-state branding.
