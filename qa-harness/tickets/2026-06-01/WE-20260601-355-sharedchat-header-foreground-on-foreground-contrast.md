# WE-20260601-355: SharedChat header puts foreground-colored text on a bg-foreground/80 background (contrast collapse)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-355` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-accessibility` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `a11y` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `Wedding-Ease-Viva-Chat/src/pages/SharedChat.tsx:57-69` |
| **URL / Page** | `/share/:shareId (public shared conversation)` |
| **Breakpoint** | `all` |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/114 (shared with WE-20260601-150) |
| **Progress** | `qa-harness/progress/WE-20260601-355/progress.html` |

## Description

The public SharedChat header bar uses `bg-foreground/80` (L57) and then layers text colored from the SAME foreground token on top of it:
- L63 `<h1 className="text-foreground/80">{threadTitle}</h1>`
- L64 `<p className="text-foreground/40">Shared … Expires …</p>`
- L69 `<span className="text-foreground/40 bg-foreground/10">Read-only</span>`

Since both the background and the text derive from `--foreground` (white in dark theme #FFFFFF, dark brown `21 41% 16%` in light theme), foreground-on-foreground means the title is ~white text on an ~80%-white background (dark theme) — effectively invisible — or dark-on-dark in light theme. The timestamp at /40 on /80 is worse. The "Read-only" pill (/40 text on /10 bg) is also far under AA.

This is a PUBLIC, unauthenticated, shareable page — first impression for recipients of a shared link.

## Steps to reproduce

1. Open any `/share/:shareId` link.
2. Inspect header: `bg-foreground/80` with `text-foreground/80` title.
3. Compute contrast: same hue, ~white-on-white (dark) / dark-on-dark (light). Far below 4.5:1.

## Expected

Header background uses a surface/card token and text uses `foreground` / `muted-foreground` so body text >=4.5:1 and the read-only badge >=4.5:1 (or 3:1 for the large h1). WCAG 1.4.3.

## Actual

Title and metadata text nearly invisible against a same-token background in at least one theme.

## Evidence

- Code-only contrast analysis (STATIC — needs live re-verify / actual ratio measurement when MCP+backend restored). Tokens: `--dark-foreground: 0 0% 100%`, `--light-foreground: 21 41% 16%` (index.css L41/L235).

## Notes

Almost certainly a token-name slip (`bg-foreground/80` where a `bg-card`/`bg-background/80` glass header was intended, mirroring SharedNote's header which uses `border-foreground/[0.06]` over `bg-surface-note`). fix-frontend.

---

_Filed by `qa-accessibility` on `2026-06-01`._
