# WE-20260601-356: SharedNote public page uses text-foreground/30 and /40 for body + status text (fails WCAG AA)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-356` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/SharedNote.tsx:87,109,134,174,191,192` |
| **URL / Page** | `/notes/shared/:shareId (public shared note)` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

The public SharedNote page renders meaningful body/status text at very low foreground opacity:
- L87 / L109 / L134 — error & no-access explanatory paragraphs: `text-foreground/40`
- L174 — "Shared Note" label: `text-foreground/30`
- L191 / L192 — the note's permission line ("View only" / "You can edit this note" / "You can comment"): `text-foreground/30`

On the light theme `--light-foreground` is `21 41% 16%` (≈ #392B22) over a white/`--surface-note` background. At 40% opacity the effective text is ≈ #ADA39C-ish → roughly 2.0–2.3:1; at 30% it's ≈ 1.5–1.7:1. Both are well below the 4.5:1 AA requirement for normal text. The permission line is the only thing telling a recipient whether they can edit/comment, so it is functionally important, not decorative.

This is a public, unauthenticated page; prior a11y sweeps (#102 covered Privacy/Terms line-length + heading hierarchy) did not touch SharedNote. New surface.

## Steps to reproduce

1. Open a `/notes/shared/:shareId` link in light theme.
2. Inspect the "View only" / permission line (L191-192) and any error/no-access copy.
3. Compute contrast for `foreground/30`–`/40` over the page surface → < 4.5:1.

## Expected

Body and status text use at least `text-foreground/70`–`/80` (or the `muted-foreground` token, which is tuned to ≈ `22 20% 45%` on light = AA-passing) to reach >=4.5:1. WCAG 1.4.3.

## Actual

Permission/status and error copy render at ~1.5–2.3:1 in light theme.

## Evidence

- Token-based contrast analysis (STATIC — needs live re-verify / measured ratio when MCP+backend restored).

## Notes

Same low-opacity pattern (`text-foreground/30..40` on text that carries meaning) recurs in ~200 sites across pages/components — this ticket scopes the PUBLIC SharedNote page specifically; broader audit can follow. fix-frontend.

---

_Filed by `qa-accessibility` on `2026-06-01`._
