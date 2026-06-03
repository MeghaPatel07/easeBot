# WE-20260528-070: Tablet /help — FAQ chevrons on rows 6-7 are visually hidden because the floater "E" sits on top of them

| Field | Value |
|---|---|
| **ID** | `WE-20260528-070` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/WeddingEaseFloater.tsx` overlap on `src/pages/Help.tsx` FAQ |
| **URL / Page** | `http://localhost:8081/help` |
| **Breakpoint** | `tablet` (768) |
| **Status** | `duplicate` |
| **Duplicate of** | `WE-20260527-059` |
| **Assigned** | fix-frontend |

## Description

On `/help` at tablet width the floater "E" badge sits inside the FAQ panel and covers the chevrons of two adjacent rows ("What are the subscription plans?" and "How do I invite my partner?"). The chevrons cannot be clicked to expand those questions.

Filing as a duplicate of WE-20260527-059 for triage tracking — captured fresh evidence at full page height showing the exact two chevrons that are obscured.

## Steps to reproduce

1. Open `http://localhost:8081/help` at 768×1024
2. Scroll to the FAQ list — note the floater "E" pinned to bottom-right
3. Try to click the chevron on "What are the subscription plans?"

## Expected

Floater never covers interactive controls; either offset further from the right edge on tablet, or only render the floater on routes that don't have a list of right-aligned interactive elements.

## Actual

Chevrons on two FAQ rows are obscured / mis-clicked.

## Evidence

- Screenshots: `qa-harness/evidence/WE-20260528-070/screenshots/`
  - `tablet-help-fullpage.png` (annotated visible overlap zone)

## Notes

Pure duplicate of WE-20260527-059 — included only to add the new full-page screenshot evidence.
