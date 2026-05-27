# WE-20260527-070: Two different sign-in surfaces exist — Settings modal ("Lets continue your story") and /login page ("Welcome Back")

| Field | Value |
|---|---|
| **ID** | `WE-20260527-070` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/Login.tsx` vs `Wedding-Ease-Viva-Chat/src/components/auth/SignInModal.tsx` (or wherever Settings invokes Sign In) |
| **URL / Page** | `/login` vs `/?settings=*` → "Sign in" button |
| **Breakpoint** | `all` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

The app has TWO different sign-in UIs depending on entry point:

- `/login` (full page): "Welcome Back" headline, single email input → password-only second step; legalese footer + "WHAT YOU GET" benefits column on the right (desktop).
- Settings → "Sign in" button (modal): "WELCOME BACK" eyebrow + "Lets continue your story" headline, Email / Phone tab switcher, both fields visible at once (Email + Password), Google option, explicit "Don't have an account? Sign up" footer.

Different copy ("Plan Your Dream Wedding" vs "Lets continue your story"), different layout (page vs modal), different fields visible upfront. This is a visual inconsistency — pick one auth pattern.

## Steps to reproduce

1. Visit `/login` — observe page A.
2. Visit `/?settings=ai-behavior` and tap "Sign in" — observe modal B.
3. Compare.

## Expected

Single design (probably the modal one — it’s richer and shorter). Either redirect `/login` to the modal route or unify the components.

## Actual

Two divergent surfaces. The modal even has phone-number auth which the `/login` page does not expose.

## Evidence

- `qa-harness/evidence/WE-20260527-070/screenshots/tablet-signin-modal-variant.png`
- `qa-harness/evidence/WE-20260527-070/screenshots/mobile-login-page-variant.png`

## Notes

Also see WE-068 — the `/login` page incorrectly assumes a returning user; the modal does not have that problem.

---
