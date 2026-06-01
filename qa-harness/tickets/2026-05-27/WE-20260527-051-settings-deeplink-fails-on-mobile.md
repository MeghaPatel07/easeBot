# WE-20260527-051: Settings deep-link param `?settings=<tab>` ignored on mobile — only top-level menu renders

| Field | Value |
|---|---|
| **ID** | `WE-20260527-051` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P1` |
| **Priority** | `high` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/settings/` (SettingsShell or mobile route logic) |
| **URL / Page** | `/?settings=ai-behavior`, `/?settings=account`, `/?settings=plan-billing`, `/?settings=about` |
| **Breakpoint** | `mobile` (375x812). Works on tablet (768) + desktop (1280). |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

On mobile, navigating to `/?settings=ai-behavior` (or any non-master tab) loads the Settings shell but only shows the top-level master menu (AI Behavior / Data & Privacy / About) with a row-list. The expected behavior — opening that specific tab’s content panel — never happens. The deep-link is silently dropped.

The qa-screenshots.mjs harness comment explicitly says "Settings dialog is opened via ?settings=<tab-id> URL param (SettingsShell wires a useSearchParams listener)" — so this is the documented contract. On mobile it’s broken.

Confirmed by a focused probe: at 375x812, no `role="button" name="AI Behavior"` exists in the DOM yet when `?settings=ai-behavior` is in the URL — the chevron-row variant is rendering instead, and there is no second-level routing to the panel.

## Steps to reproduce

1. Resize browser to 375x812 (mobile).
2. Visit `http://localhost:8081/?settings=ai-behavior`.
3. Observe Settings drawer shows only "AI Behavior / Data & Privacy / About" rows.
4. Repeat with `?settings=plan-billing` and `?settings=about` — same outcome.

## Expected

On all breakpoints, `?settings=<tab>` opens the corresponding panel. On mobile this should push a second-level view into the drawer (back-arrow + panel content), matching the desktop tab.

## Actual

Mobile silently loads the master list. /billing redirect (`<Route path="/billing">` -> `/?settings=plan-billing`) also lands users on this useless screen on phones — meaning all Sprint 1 billing CTAs from any external link are broken on the most-used breakpoint.

## Evidence

- `qa-harness/evidence/WE-20260527-051/screenshots/mobile-settings-deeplink-fails.png` (`?settings=ai-behavior`)
- `qa-harness/evidence/WE-20260527-051/screenshots/mobile-settings-account-deeplink-fails.png` (`?settings=account`)
- `qa-harness/evidence/WE-20260527-051/screenshots/desktop-settings-deeplink-works.png` (working desktop counterpart for contrast)

## Notes

Pricing rollout context (`project_pricing_rollout`) — `/billing` route relies on this param. Blocker for any Sprint-2 mobile billing flow.

---
