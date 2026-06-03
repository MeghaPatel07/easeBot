# WE-20260527-063: Mobile chat input grows on long text and overlaps the suggestion-chip row above it

| Field | Value |
|---|---|
| **ID** | `WE-20260527-063` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/chat/ChatInput.tsx`, `src/components/chat/SuggestionChips.tsx` |
| **URL / Page** | `/` |
| **Breakpoint** | `mobile` (375x812) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

When you type a long single line into the chat input on mobile, the textarea expands upwards (auto-grow) but the suggestion chip row above ("Engagement / Haldi / Mehendi / Sangeet" with the "Auto" pill) does not lift out of the way. The textarea's expanded edge crowds the chip row — at certain heights the "Auto" mode pill is partially behind the textarea bevel.

## Steps to reproduce

1. Open `/` at 375x812.
2. Type ~80 characters of unbroken text into the input (mock data: see evidence).
3. Watch the textarea expand to ~3 lines.
4. Observe the chip row above sits at the same vertical position with no spacer.

## Expected

Either (a) chip row hides when textarea > 1 line, or (b) chip row shifts up to maintain spacing.

## Actual

Layout cramps; chips and input visually merge.

## Evidence

- `qa-harness/evidence/WE-20260527-063/screenshots/mobile-input-overlap-chips.png`

## Notes

User-perceived as "buggy" even though tap targets still work.

---
