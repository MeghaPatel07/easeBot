# WE-20260527-073: Guest-Mode banner stack at top of chat (Guest Mode / Won't save / Sign in to save) takes ~10% of mobile viewport

| Field | Value |
|---|---|
| **ID** | `WE-20260527-073` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/chat/GuestModeBanner.tsx` (or equivalent) |
| **URL / Page** | `/` (guest) |
| **Breakpoint** | `mobile` |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |
| **Related fix** | The bottom-half (consent banner contribution to mobile chrome) is addressed by `WE-20260527-050` PR (`fix-WE-20260527-050`). Top-banner stack itself still needs a tighter mobile layout — leaving this ticket open for the GuestModeBanner cleanup. |

## Description

On mobile chat home, the guest-mode banner shows: "Guest Mode — 10 messages remaining" + a second line "This chat won't be saved. Sign in to save your conversations." Combined with the consent banner at the bottom, ~30% of vertical mobile space is consumed by chrome before any chat content shows. The hero "The Wedding Bot" + suggestion cards then have very little room.

## Steps to reproduce

1. Open `http://localhost:8081/` in guest mode at 375x812.
2. Count vertical space consumed by the top guest-mode notice + the bottom consent banner = ~30% of 812.
3. Hero + suggestion grid fits but only just.

## Expected

Collapse the guest-mode notice to a single thin pill (e.g. "Guest · 10 left · Sign in"). Save vertical space.

## Actual

Two-line pill consuming ~80px vertical on a 812-tall viewport.

## Evidence

- `qa-harness/evidence/WE-20260527-073/screenshots/mobile-guestmode-banner.png`

## Notes

Coordinate with WE-050 — both compete for the same chrome budget.

---
