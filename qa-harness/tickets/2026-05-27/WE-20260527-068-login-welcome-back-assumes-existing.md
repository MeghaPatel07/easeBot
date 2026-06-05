# WE-20260527-068: Email login flow shows "Welcome Back" + password field for every email — no signup branch for new users

| Field | Value |
|---|---|
| **ID** | `WE-20260527-068` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/Login.tsx` (post-email step) |
| **URL / Page** | `/login` after entering an email |
| **Breakpoint** | `mobile`, `desktop` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

After entering any email and tapping "Continue With Email", the next step shows headline "Welcome Back" + "Enter your password for `test@example.com`" — even though this is a brand-new email that has never registered. The signup path is hidden behind a small "Create an account" link at the bottom-right of the form, not visually prominent.

The functional bug (do we know the user exists?) is separate; the **visual** bug is that the headline assumes a returning user. For a new visitor, this is misleading and likely depresses signup conversion.

## Steps to reproduce

1. Open `/login` (incognito).
2. Type any email like `notarealuser@example.com`.
3. Tap "Continue With Email".
4. Page transitions to "Welcome Back" + password — but you’ve never logged in here.

## Expected

Detect user existence first (server side) and split: existing -> "Welcome Back" + password; new -> "Create your account" + password (or magic link).

## Actual

Single "Welcome Back" branch for everyone.

## Evidence

- `qa-harness/evidence/WE-20260527-068/screenshots/mobile-login-welcome-back-assumed.png`

## Notes

Borders on functional but the wording itself is the immediate visual UX issue. Could be filed in functional triage too.

---
