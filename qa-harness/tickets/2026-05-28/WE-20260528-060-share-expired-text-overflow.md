# WE-20260528-060: /share/:id "expired or does not exist" text reaches viewport edges on mobile (no horizontal padding)

| Field | Value |
|---|---|
| **ID** | `WE-20260528-060` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `P3` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/SharedChat.tsx` |
| **URL / Page** | `http://localhost:8081/share/<bad-id>` |
| **Breakpoint** | `mobile` (375) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

On `/share/<bad-id>` at mobile width, the body copy *"This shared conversation has expired or does not exist."* touches the left and right viewport edges with effectively zero horizontal padding — the container has no `px-*` class on small screens.

## Steps to reproduce

1. Open `http://localhost:8081/share/anything` at 375×812
2. Inspect the gap between the body text and the viewport sides

## Expected

Container has `px-4`/`px-6` so text sits at least 16-24px from the viewport edges.

## Actual

Text spans the full 375px width; reads as cramped.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-060/screenshots/`
  - `mobile-share.png`

## Notes

Small CSS fix. Same component may share with `/shared/note/:shareId`.
