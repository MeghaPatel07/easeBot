# WE-20260601-353: NotificationPanel rows are <div onClick> — not keyboard-focusable, mark-as-read unreachable by keyboard

| Field | Value |
|---|---|
| **ID** | `WE-20260601-353` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/NotificationPanel.tsx:226-237` |
| **URL / Page** | `ProfileMenu → Notifications panel` |
| **Breakpoint** | `all` |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/113 |
| **Progress** | |

## Description

DISTINCT from the already-filed NotificationPanel a11y tickets (WE-20260528-672 = type-icon color-only; WE-20260528-667 = no live-region for new arrivals). THIS is the row-interaction bug those did not cover.

Each notification row is a clickable `<div onClick={() => handleMarkAsRead(...)}>` (L226-237). It is not a `<button>`, has no `role="button"`, no `tabIndex`, and no key handler. The row's click action (mark-as-read) is therefore unreachable for keyboard-only and screen-reader users — Tab skips the rows entirely, landing only on the per-row Delete `<button>` (L261, which is correctly labeled). So a keyboard user can delete a notification but cannot mark it read by activating it.

This is the div-impersonating-button anti-pattern: a `<div onClick>` that carries a primary action but is invisible to the keyboard and to AT (announced as static text, not as an actionable control).

## Steps to reproduce

1. Open the Notifications panel (ProfileMenu → Notifications) with at least one unread item.
2. Tab through it — focus never lands on a row, only on Delete buttons.
3. Read L226: `<div ... onClick={() => { if (!notif.read) handleMarkAsRead(notif.id) }}>`.

## Expected

The mark-as-read affordance is keyboard-operable: either make the row (or an inner element) a real `<button>` / add `role="button" tabIndex={0}` + Enter/Space handler, or mark-as-read automatically on focus/view. WCAG 2.1.1 (Keyboard) + 4.1.2.

## Actual

Row click action (mark-as-read) is mouse-only; rows are not focusable.

## Notes

STATIC — needs live re-verify when MCP+backend restored. Color-only type icon (= -672) and live-region (= -667) deliberately NOT re-filed here. fix-frontend.

---

_Filed by `qa-accessibility` on `2026-06-01`._
