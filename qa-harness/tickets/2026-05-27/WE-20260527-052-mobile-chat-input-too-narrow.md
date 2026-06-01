# WE-20260527-052: Mobile chat input is only 251px wide and 37px tall (under touch-target) — primary CTA cramped

| Field | Value |
|---|---|
| **ID** | `WE-20260527-052` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P1` |
| **Priority** | `high` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/chat/ChatInput.tsx` |
| **URL / Page** | `/` (mobile chat input) |
| **Breakpoint** | `mobile` (375x812) |
| **Status** | `in_review` |
| **Assigned** | `fix-frontend` |
| **Branch** | `fix-WE-20260527-052` (base: `Bug-Resolve-claude`) |
| **PR URL** | `https://github.com/MeghaPatel07/easeBot/compare/Bug-Resolve-claude...fix-WE-20260527-052?expand=1` (open manually — no `gh` CLI on host) |
| **PR Body** | `/tmp/we-052-pr-body.md` |
| **Progress HTML** | `qa-harness/progress/WE-20260527-052/progress.html` |

## Description

On mobile (375 wide), the chat textarea measures `251 × 37px` (measured via `getBoundingClientRect`), sitting at `top:762, left:67` — meaning ~33% of horizontal space is consumed by side margins/buttons. Height (37px) is under the iOS 44px minimum touch target for an interactive field. The input is the single most-used surface in the entire app and it is the cramped on the smallest viewport.

The voice / mic / `+` icons flanking the input each measure ~40x32 (also under 44).

## Steps to reproduce

1. Open `http://localhost:8081/` at 375x812.
2. Dismiss the consent banner.
3. Tap the chat input — note that hit area is narrower than expected; missed taps end up on the page background or adjacent buttons.

## Expected

Input row uses the full content width (after a small horizontal page margin, e.g. 16px each side ≈ 343px usable). Input height ≥ 44px; mic / + buttons ≥ 44x44.

## Actual

`textarea` 251x37; surrounding icon buttons 40x32. Aggregate input row probably looks 343-wide visually but the actual textarea is shrunken by oversized flanking icon containers / padding.

## Evidence

- `qa-harness/evidence/WE-20260527-052/screenshots/mobile-chat-input-touch.png`

## Notes

Found via JS measurement: `[{"tag":"textarea","w":251,"h":37,"top":762,"left":67}]`. Touch-target audit details below.

---
