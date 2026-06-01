# WE-20260528-059: /chat/:threadId paywall page has no nav/header/back link — user trapped if they hit the URL without login

| Field | Value |
|---|---|
| **ID** | `WE-20260528-059` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Index.tsx` (chat-thread guard branch) |
| **URL / Page** | `http://localhost:8081/chat/<any-thread-id>` (guest user) |
| **Breakpoint** | `all` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

When a guest visits `/chat/anything`, the page renders an isolated centered "You cannot view this chat" card with **Login / Sign up** buttons, but NO header, NO back-to-home link, and no branding. A user who lands here from a stale shared link cannot navigate back to the marketing site without typing `/` in the URL bar.

On tablet, the "Sign up" outline button has near-invisible border (consistent with WE-20260528-056 ghost-button issue).

## Steps to reproduce

1. Open `http://localhost:8081/chat/random-id-123` in a fresh window (no auth)
2. Observe the page — no header, no back link, no branding

## Expected

Render the standard branded header (logo + Back to TheWeddingBot) above the paywall card, matching `/payment/success` and `/login` chrome.

## Actual

Bare centered card on an empty hero — feels like a dead-end page.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-059/screenshots/`
  - `mobile-chat.png`, `tablet-chat.png`, `desktop-chat.png`

## Notes

Related to but **not a dup of** WE-20260527-057 (silent fallback to chat). This is the explicit private-thread paywall route.
