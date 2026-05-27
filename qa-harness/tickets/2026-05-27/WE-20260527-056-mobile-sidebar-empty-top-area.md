# WE-20260527-056: Mobile sidebar has a large empty white area at the top (no logo / title / recent-threads list)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-056` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/sidebar/` (Sidebar.tsx / SidebarBody) |
| **URL / Page** | `/` with sidebar opened |
| **Breakpoint** | `mobile` (375x812) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

When the sidebar opens on mobile, the top ~60% is empty space — only the close icon (`PanelLeft`) and the new-chat plus button render at top, then nothing until the "Send Feedback / See Plans And Pricing / Settings / Help" stack near the bottom. In guest mode there are no threads to display, but the empty void looks like a broken layout, not an empty state.

## Steps to reproduce

1. Resize to 375x812, open `http://localhost:8081/`.
2. Tap the open-sidebar button (panel icon top-left).
3. Observe ~480px of blank white above the bottom footer card.

## Expected

In guest mode, show an inviting placeholder (logo + a short "Sign in to keep your chats" CTA) or move the footer card up to fill the vertical space. The blank area currently reads as broken.

## Actual

Sidebar mostly empty above the bottom footer. The "Get Responses Tailored To You" card sits ~600px down, with nothing above.

## Evidence

- `qa-harness/evidence/WE-20260527-056/screenshots/mobile-sidebar-blank-top.png`

## Notes

Tested in guest mode. May look fine for an authed user with chat history — please verify both paths.

---
