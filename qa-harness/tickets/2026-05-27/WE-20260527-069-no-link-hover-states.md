# WE-20260527-069: Inline links lack hover-state feedback (no color change / underline on hover)

| Field | Value |
|---|---|
| **ID** | `WE-20260527-069` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `low` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/index.css` (anchor defaults), individual link components |
| **URL / Page** | `/pricing`, `/help`, `/terms`, `/privacy` (anywhere with text links in body) |
| **Breakpoint** | `desktop` (hover only) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

Hovering inline anchor links — e.g. "← Back to TheWeddingBot" on `/pricing`, contact phone/email on `/help`, "Terms of Service" / "Privacy Policy" at the bottom of `/login` — produces no visible state change. No underline change, no color shift, no cursor effect beyond `cursor: pointer`. Users have to guess what is interactive.

## Steps to reproduce

1. Open `/pricing` at desktop.
2. Hover the "Back to TheWeddingBot" link in the top-left.
3. Compare with hover state on a button like "Monthly".

## Expected

Inline anchors gain an underline on hover and/or a slightly darker brand color. Buttons get a clearer pressed/hover background.

## Actual

No state delta on most inline anchors.

## Evidence

- `qa-harness/evidence/WE-20260527-069/screenshots/desktop-back-link-no-hover.png`

## Notes

Coordinate with focus-ring update in WE-061.

---
