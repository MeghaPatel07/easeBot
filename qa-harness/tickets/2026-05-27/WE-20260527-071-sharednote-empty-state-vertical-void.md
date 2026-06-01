# WE-20260527-071: /shared/note/<invalid-id> renders empty-state floating in a sea of beige whitespace (no header / footer chrome)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-071` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `low` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/SharedNote.tsx` |
| **URL / Page** | `/shared/note/<bad-id>` |
| **Breakpoint** | `desktop` (worst), present at all sizes |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

When a shared-note URL is invalid, the page renders `Note not found / This note doesn’t exist or the link may be invalid. / Go to TheWeddingBot` centered in the middle of the page. There is no top branding bar, no footer, just empty cream space. On a 1280x800 viewport this looks like the page failed to load.

Functionally fine; visually under-designed for an entry point that arrives via shared link / SMS / email — first impression should be more polished.

## Steps to reproduce

1. Open `http://localhost:8081/shared/note/foo-bar-baz` at 1280x800.
2. Observe empty cream void with a small centered card.

## Expected

Either add a top-of-page TheWeddingBot logo + back link (matching /payment/failure pattern) or expand the empty state with a brief "What is TheWeddingBot?" pitch.

## Actual

Lone centered card on a near-blank page.

## Evidence

- `qa-harness/evidence/WE-20260527-071/screenshots/desktop-shared-note-empty-state.png`

---
