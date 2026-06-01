# WE-20260527-059: Tablet (/help) — floater "E" sits directly on top of "How do I..." FAQ accordion chevron

| Field | Value |
|---|---|
| **ID** | `WE-20260527-059` |
| **Created** | `2026-05-27T15:23:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `medium` |
| **Category** | `responsive` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/components/WeddingEaseFloater.tsx`, `src/pages/Help.tsx` |
| **URL / Page** | `/help` |
| **Breakpoint** | `tablet` (768x1024) |
| **Status** | `triaged` |
| **Assigned** | `fix-frontend` |

## Description

At 768x1024 the floater button covers the right-side chevron-down icon of the bottom FAQ row ("How do I [last item]"). User cannot tap the chevron there to expand because the floater is layered above. Larger problem than WE-058 because here the floater actually intercepts pointer events on a usable element.

## Steps to reproduce

1. Open `http://localhost:8081/help` at 768x1024.
2. Scroll the FAQ list until the bottommost row sits in the lower-right quadrant.
3. Try to tap that row’s chevron — clicks land on the floater (which opens its CTA), not on the accordion.

## Expected

Floater either repositions or is occluded on `/help`. Or accordion row chevron is large enough / positioned far enough left to dodge the floater.

## Actual

Floater wins z-order; FAQ row chevron is unreachable on tablet.

## Evidence

- `qa-harness/evidence/WE-20260527-059/screenshots/tablet-help-floater-on-content.png`

## Notes

Combine the fix with WE-058 (broader floater placement rules).

---
