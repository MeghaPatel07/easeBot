# WE-20260527-067: "Sign up" button on shared-thread auth gate has near-zero contrast (cream-on-cream)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-067` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/SharedChat.tsx` (auth-gate fragment) or shared `Button variant="secondary"` |
| **URL / Page** | `/chat/<unknown-thread-id>` (renders "You cannot view this chat" gate) |
| **Breakpoint** | `all` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

The "You cannot view this chat" empty state has a primary brown "Login" button (good contrast) followed by a secondary "Sign up" button rendered in **cream text on a cream background**. The button outline is barely visible; the label "Sign up" reads as ghosted/disabled, even though the button is fully active.

## Steps to reproduce

1. Visit `http://localhost:8081/chat/nonexistent-thread-id-12345` in incognito.
2. Observe the "Login" + "Sign up" stacked buttons.
3. The "Sign up" button label has insufficient contrast against its background.

## Expected

The secondary button should still meet WCAG 4.5:1 (or 3:1 for large/UI text). Either darken the label text or add a visible border with sufficient contrast.

## Actual

Cream-on-cream pill, very low contrast — looks disabled.

## Evidence

- `qa-harness/evidence/WE-20260527-067/screenshots/mobile-bad-thread-low-contrast-signup.png`

## Notes

A11y agent will catch this with Axe; filing on visual side because the brand impression is the immediate problem.

---
