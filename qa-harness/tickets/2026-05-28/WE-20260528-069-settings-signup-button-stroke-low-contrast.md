# WE-20260528-069: Settings dialog header — "Sign in" outline button has barely-visible border ring; looks like flat text

| Field | Value |
|---|---|
| **ID** | `WE-20260528-069` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `P3` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/settings/SettingsShell.tsx` (top-right action area) |
| **URL / Page** | `http://localhost:8081/?settings=ai-behavior` (any tab) — tablet/desktop guest |
| **Breakpoint** | `tablet`, `desktop` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

In the Settings dialog the top-right exposes two CTAs: a filled "Sign up" and an outline "Sign in". The outline button's border ring is rendered in a near-cream colour against the same cream/white background, making it look like the text floats with no button frame. Users on tablet/desktop may not see "Sign in" as a button.

## Steps to reproduce

1. Visit `http://localhost:8081/?settings=ai-behavior` (guest mode, tablet 768)
2. Compare the "Sign up" (filled) and "Sign in" (outline) buttons in the dialog header

## Expected

Visible 1-2px stroke or background tint so "Sign in" reads as a clickable button at a glance.

## Actual

Stroke is nearly the same colour as the surface; button reads as floating text.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-069/screenshots/`
  - `tablet-settings-account.png` (clearly visible top-right)

## Notes

Same `outline` button variant — global fix.
