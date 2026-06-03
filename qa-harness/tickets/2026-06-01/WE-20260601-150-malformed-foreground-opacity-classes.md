# WE-20260601-150: Malformed `text-foreground/90/90` Tailwind classes silently drop color in Help + CapHitBanner

| Field | Value |
|---|---|
| **ID** | `WE-20260601-150` |
| **Created** | `2026-06-01T12:30:00Z` |
| **Reporter** | `qa-visual-responsive` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Help.tsx:176,188,240,265,275,288,308,320` + `src/components/pricing/CapHitBanner.tsx:32` |
| **URL / Page** | `/help` and quota cap-hit banner (any page) |
| **Breakpoint** | `all` |
| **Status** | `in_review`|
| **Assigned** | `fix-frontend`|
| **PR** | https://github.com/MeghaPatel07/easeBot/pull/114 |
| **Progress** | `qa-harness/progress/WE-20260601-150/progress.html` |

## Description

`text-foreground/90/90` and `text-foreground/90/85` are **invalid Tailwind classes** — a Tailwind color utility takes at most ONE opacity modifier (`text-foreground/90`), not two. The arbitrary token `foreground/90/90` matches no Tailwind rule, so the JIT compiler emits **nothing** and the element silently falls back to its inherited `color`.

This looks like a botched find-and-replace (likely a global `text-white` -> `text-foreground/90` sweep that re-ran over already-replaced strings, doubling the suffix). Introduced in commit `7c3d40e "feat: update contact information..."`.

Affected (verified by `grep -rE '/[0-9]+/[0-9]+'`):
- `Help.tsx:176`  page root `text-foreground/90/85` (page-wide base text color — dropped)
- `Help.tsx:188`  Back link `hover:text-foreground/90/90` (hover state never applies)
- `Help.tsx:240`  FAQ accordion trigger text
- `Help.tsx:265,275,308,320`  guest name/email/subject/description inputs
- `Help.tsx:288`  category SelectTrigger
- `CapHitBanner.tsx:32`  quota banner body wrapper `text-foreground/90/90`

## Steps to reproduce

1. Open `src/pages/Help.tsx` and `grep` for `foreground/90/`.
2. Confirm 8 occurrences in Help.tsx, 1 in CapHitBanner.tsx with the double-slash opacity suffix.
3. (Static) Tailwind JIT only matches `text-foreground/<single-number>`; `text-foreground/90/90` produces no CSS rule.

## Expected

Each element renders the intended muted-foreground color (e.g. `text-foreground/90`), with hover states working.

## Actual

Tailwind emits no rule for these tokens. Text inherits whatever ancestor color is in scope:
- The Help page root (`:176`) loses its intended base text tint entirely — child text leans on per-element classes; anything relying on inheritance gets the wrong color.
- The Back-link `hover:text-foreground/90/90` (`:188`) means the hover affordance never fires.
- Form input / FAQ / Select text may render at full `--foreground` (too dark) or inherit a faded ancestor — inconsistent with the design tokens and a contrast risk in light mode where `--foreground` flips.

## Evidence

- `grep -rEn '[a-z-]+/[0-9]{1,3}/[0-9]{1,3}' Wedding-Ease-Viva-Chat/src --include='*.tsx'` returns exactly these 9 lines.
- No `.text-foreground\/90\/90` rule exists anywhere in `src/index.css`.

## Notes

STATIC — needs live re-verify when MCP+backend restored (confirm actual rendered color on /help in both themes).
Trivial fix: drop the duplicated `/90` (and the stray `/85` on :176) so each becomes a single valid modifier, e.g. `text-foreground/90`, `hover:text-foreground/90`, page root `text-foreground/85`.
Fix specialist: **fix-frontend**.

---

_Filed by `qa-visual-responsive` on `2026-06-01T12:30:00Z`._
