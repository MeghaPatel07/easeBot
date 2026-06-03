# WE-20260528-066: Tablet — "10 messages remaining" + "3 images remaining" guest-mode chip wraps to 2 lines, looks broken

| Field | Value |
|---|---|
| **ID** | `WE-20260528-066` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `P3` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/GuestQuotaBar.tsx` (or similar) |
| **URL / Page** | `http://localhost:8081/` |
| **Breakpoint** | `tablet` (768) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

On tablet, the guest-mode quota chip in the header reads **"Guest Mode — 10 messages remaining  ·  3 images remaining"** but the two counters wrap awkwardly onto two lines because the chip's `max-width` is too small at this breakpoint. Looks like the second counter was tacked on without a width review.

## Steps to reproduce

1. Open `http://localhost:8081/` at 768×1024 in a fresh window (guest)
2. Inspect the top quota chip

## Expected

Both counters on one line, with comfortable spacing. Or stack with a visual rhythm if narrow.

## Actual

"10 messages remaining" wraps, then "3 images remaining" wraps. Chip height grows ~2x.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-066/screenshots/`
  - `tablet-index.png`

## Notes

Filed as visual, not functional. Likely just a `whitespace-nowrap` or container `max-w` fix.
