# WE-20260528-053: Chat input "Ask me anything" placeholder wraps to 2 lines on tablet (768px); textarea visibly taller than design

| Field | Value |
|---|---|
| **ID** | `WE-20260528-053` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatInput.tsx` (suspected) |
| **URL / Page** | `http://localhost:8081/` |
| **Breakpoint** | `tablet` (768x1024) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

On tablet (768px) the chat-input box measures only **127×58 px** because three sibling controls (Auto-detect chip + mic button + floater "E") consume the right-hand portion of the row. The placeholder "Ask me anything" wraps to two lines inside this cramped 127-px input. The send/mic buttons crowd the input box and the global floater "E" overlaps the right edge.

## Steps to reproduce

1. Open `http://localhost:8081/` at 768×1024
2. Observe the input row at the bottom of the chat panel
3. Note placeholder wrapping and overall input width

## Expected

Input occupies the majority of the bottom row width (≥60%) on tablet; placeholder fits on one line; floater "E" does not overlap the input.

## Actual

Input is squeezed to 127px (~17% of viewport). Placeholder wraps. Floater overlaps the input's right edge.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-053/screenshots/`
  - `tablet-index.png` — full tablet view showing cramped input row
  - `tablet-input-zoom.png` — zoomed crop of the input region

## Notes

Related to but **not a dup of** WE-20260527-064 (which is desktop floater overlap). This ticket is tablet-specific input width.
