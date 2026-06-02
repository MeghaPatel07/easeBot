# WE-20260528-068: AnalyticsConsent banner blocks the action chips + input row on mobile (both light and dark) — covers primary CTAs

| Field | Value |
|---|---|
| **ID** | `WE-20260528-068` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/AnalyticsConsent.tsx` |
| **URL / Page** | every page; most painful on `/` mobile |
| **Breakpoint** | `mobile` (in light AND dark) |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

On first load the AnalyticsConsent banner occupies the bottom ~28% of the mobile viewport, blocking the action chips ("Engagement / Haldi / Mehendi…") and pushing the chat input behind it. Even worse on small phones (iPhone SE 320) where it covers half the empty-state and the bottom 4 tiles ("Show me ideas", "Ask anything").

WE-20260527-050 reported the banner overlaying content, but did not capture that on **mobile in dark mode** the banner's "Decline" button label is invisible (related to WE-20260528-056) AND the banner physically covers the chip rail + send button — making the primary CTAs unreachable until the user notices the banner.

## Steps to reproduce

1. Clear localStorage + cookies
2. Visit `http://localhost:8081/` at 375×812 in dark mode
3. Note the input area + chip rail are hidden under the consent card

## Expected

Banner is non-modal and either inline at the top of the page or anchored above the input rail with `safe-area` padding so it never covers the input.

## Actual

Banner overlays content; tab key can land on covered items but visually they are gone.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-068/screenshots/`
  - `mobile-dark-help.png` (banner covering FAQ items)

## Notes

This is the **mobile + dark-mode subset** of WE-20260527-050 plus visible-only-on-mobile chip blockage. Triage may collapse — but worth noting because the dark-mode contrast aspect is new.
