# WE-20260527-062: iPhone SE (320px) — sidebar Help link completely hidden behind consent banner; no scroll

| Field | Value |
|---|---|
| **ID** | `WE-20260527-062` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/sidebar/`, `src/components/AnalyticsConsent.tsx` |
| **URL / Page** | `/` with sidebar open |
| **Breakpoint** | `320x568` (iPhone SE 1st gen / very small screens) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |
| **Related fix** | Partly addressed by `WE-20260527-050` PR (`fix-WE-20260527-050`) — pointer-events-none wrapper means clicks on the Help link now pass through the wrapper. However, the sidebar's own scroll container does NOT pick up `--analytics-consent-height`; a follow-up tweak on the sidebar to apply `consent-bottom-clearance` (utility class added in this PR) is still needed to make the Help link visible without scrolling tricks. Re-verify after merge before closing. |

## Description

At 320x568 (still a real-world device size — iPhone SE 1st-gen), opening the sidebar shows: Feedback / Plans / Settings rows visible; then the consent banner sits directly over where the **Help** link would be, fully hiding it. Sidebar does not scroll independently of the banner, so user can never reach Help.

The "Get Responses Tailored To You" footer card and Log In button are entirely below the consent banner — invisible.

## Steps to reproduce

1. Open `http://localhost:8081/` at 320x568 (iPhone SE / DevTools).
2. Open sidebar.
3. Observe Help / Log In nav items hidden behind the consent banner.

## Expected

Either sidebar scrolls independently OR consent banner is dismissable inline and not fixed.

## Actual

Help row and Login CTA covered. No way to reach them without dismissing the consent banner first.

## Evidence

- `qa-harness/evidence/WE-20260527-062/screenshots/iphonese-320-sidebar-help-hidden.png`

## Notes

Compound with WE-050 — banner is the root cause across many of these tickets. Filing this one separately because at 320px Login is no longer reachable.

---
