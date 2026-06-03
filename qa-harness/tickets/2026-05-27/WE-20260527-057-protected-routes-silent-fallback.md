# WE-20260527-057: Protected routes `/:userId/<feature>` silently render chat landing for guests (no auth gate UI)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-057` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P1` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/App.tsx`, `src/pages/Index.tsx`, guard logic in `src/contexts/AuthContext.tsx` |
| **URL / Page** | `/<uid>/gallery`, `/<uid>/planner`, `/<uid>/liked`, `/<uid>/reminders`, `/<uid>/budget`, `/<uid>/shopping`, `/<uid>/timeline`, `/<uid>/progress`, `/<uid>/notifications`, `/<uid>/collaborate`, `/<uid>/notes` |
| **Breakpoint** | `all` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

Visiting any of the per-user feature routes (e.g. `/guest-test-user/planner`) as an unauthenticated guest does not redirect to login and does not show a "Sign in to view your planner" empty state. Instead, the page silently mounts the same chat landing as `/` — same suggested-prompt cards, same "Hi! I’m here to help…". URL bar stays at `/<uid>/planner`.

A user who clicks a shared deep-link (e.g. a marketing email or saved bookmark) gets a non-debug-able dead end: the URL says they’re on a planner, the UI shows them a chat onboarding.

## Steps to reproduce

1. Visit `http://localhost:8081/guest-test-user/planner` (or any other `/:userId/<feature>` route) in incognito.
2. Observe chat landing renders.
3. URL is unchanged.

## Expected

Either: redirect to `/login?next=/<uid>/planner` with a flash message; OR render a feature-gated empty state describing the planner with a sign-in CTA.

## Actual

Silent fall-through to chat home. No indication to the user that this route is gated.

## Evidence

- `qa-harness/evidence/WE-20260527-057/screenshots/mobile-planner-silent-fallback.png`
- `qa-harness/evidence/WE-20260527-057/screenshots/desktop-notes-silent-fallback.png`

## Notes

Same behavior for all 11 protected routes. The routing config in App.tsx maps them all to `Index`, so the auth check must be inside `Index.tsx` — and currently isn’t branching for guests.

---
