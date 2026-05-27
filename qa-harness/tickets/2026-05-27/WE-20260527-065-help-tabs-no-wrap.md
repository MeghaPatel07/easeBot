# WE-20260527-065: /help tab pills "FAQ / Help" + "Support & Feedback" force same width on mobile, truncating tab labels

| Field | Value |
|---|---|
| **ID** | `WE-20260527-065` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P3` |
| **Priority** | `low` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/Help.tsx` |
| **URL / Page** | `/help` |
| **Breakpoint** | `mobile` (375x812) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

On mobile, the FAQ / Help tab pill is visibly wider than its label requires while "Support & Feedback" is tight at the edges. Both pills look fine at desktop but the unequal padding contrast on mobile reads as a layout bug.

## Steps to reproduce

1. Open `/help` at 375x812.
2. Notice the visual imbalance between the two tab pills (FAQ pill is heavily padded, S&F pill is at the edge).

## Expected

Either equal pill widths with centered labels, or pill widths proportional to label content + matching horizontal padding.

## Actual

Unequal-padded pills. Mostly cosmetic.

## Evidence

- `qa-harness/evidence/WE-20260527-065/screenshots/mobile-help-tabs-equal-width-truncated.png`
- `qa-harness/evidence/WE-20260527-065/screenshots/desktop-help.png` (baseline desktop, for compare)

---
