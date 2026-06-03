# WE-20260528-051: Header logo "The Wedding Bot" wraps onto 3 lines on mobile (375px) and 2 on tablet (768px)

| Field | Value |
|---|---|
| **ID** | `WE-20260528-051` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatHeader.tsx` (suspected — the logo brand block) |
| **URL / Page** | `http://localhost:8081/` (every chat / index route) |
| **Breakpoint** | `mobile` (375x812) AND `tablet` (768x1024) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

The top-left brand block ("The Wedding Bot" wordmark) collapses to 3 stacked lines on mobile and 2 lines on tablet because its `max-width` is too small. The result is a cramped, hard-to-read brand chip that looks broken next to the BETA pill.

- Mobile 375px: renders **"The / Wedding / Bot"** vertically — 3 lines, ~32px wide
- Tablet 768px: renders **"The Wedding / Bot"** — 2 lines
- Desktop 1280px: renders on a single line as designed

## Steps to reproduce

1. `npm run dev` in Wedding-Ease-Viva-Chat (already running on :8081)
2. Open `http://localhost:8081/` at 375×812 viewport
3. Observe the brand block top-left

## Expected

Brand wordmark renders on a single line at every breakpoint, or collapses to a logomark-only (icon) below 480px.

## Actual

Wordmark forced to wrap because container has tight `max-width` (likely ~40px). BETA pill sits comfortably wide while the brand text is compressed.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-051/screenshots/`
  - `mobile-header-zoom.png` — 3-line stacked wordmark at 375px
  - `tablet-header-zoom.png` — 2-line wordmark at 768px

## Notes

Not in yesterday's 165 tickets (closest is WE-20260527-056 about empty sidebar; this is the header brand, distinct).
