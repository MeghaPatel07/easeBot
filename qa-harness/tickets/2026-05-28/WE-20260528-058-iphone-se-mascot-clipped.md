# WE-20260528-058: iPhone SE (320×568) — bot mascot in empty-state is visually clipped on the left edge

| Field | Value |
|---|---|
| **ID** | `WE-20260528-058` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/EmptyState.tsx` |
| **URL / Page** | `http://localhost:8081/` |
| **Breakpoint** | `mobile` (320×568, iPhone SE) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

At iPhone SE 320×568, the empty-state mascot illustration in the empty chat hero is partially **clipped on the left** because the containing flex row exceeds the viewport. The wordmark "The / Wedding / Bot" sits next to it and also overflows.

At 600w (in-between tablet/mobile) the mascot + wordmark sit side-by-side with no extra padding, looking similar to mobile but at an awkward proportion.

## Steps to reproduce

1. Open `http://localhost:8081/` at 320×568 (iPhone SE)
2. Observe the empty-state hero region

## Expected

Mascot and wordmark stack vertically and remain fully visible inside the safe area at all viewport widths down to 320px.

## Actual

Mascot is cropped; wordmark overlaps mascot. Bottom of the page (chip row + input) also affected.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-058/screenshots/`
  - `iphonese-home.png` — mascot clipped
  - `600w-home.png` — awkward in-between layout

## Notes

WE-20260527-062 covers sidebar-bottom clipping at 320 — this is a distinct issue in the hero.
