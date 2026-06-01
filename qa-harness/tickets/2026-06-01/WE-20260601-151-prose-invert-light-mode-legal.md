# WE-20260601-151: `prose prose-invert` forces dark prose palette → invisible bullets/rules/code in light mode on legal pages

| Field | Value |
|---|---|
| **ID** | `WE-20260601-151` |
| **Created** | `2026-06-01T12:34:00Z` |
| **Reporter** | `qa-visual-responsive` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `visual` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/PrivacyPolicy.tsx:41` + `src/pages/TermsOfService.tsx:41` |
| **URL / Page** | `/privacy`, `/terms` |
| **Breakpoint** | `all` (light theme only) |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description

Both legal pages render their body inside
`<article className="prose prose-invert max-w-prose prose-p:text-foreground/70 prose-li:text-foreground/70 prose-strong:text-foreground/90 ...">`.

`prose-invert` (from `@tailwindcss/typography`, confirmed loaded in `tailwind.config.ts:250` and `package.json:96`) hard-codes the **inverted (light-text-on-dark-background)** typographic palette. It is unconditional — it does NOT react to the app's `.light` / `.dark` theme class.

The app DOES ship a real light mode (`.light` block at `src/index.css:561`, `ThemeToggle` calls `setTheme('light')`). When a user switches to light mode, `gradient-bg` + `--foreground` flip to a dark-on-cream scheme, but `prose-invert` keeps emitting near-white values for every prose sub-element the page did NOT explicitly override.

The inline `prose-p:`, `prose-headings:`, `prose-strong:`, `prose-li:`, `prose-a:` overrides cover paragraphs, headings, bold, list text, and links — so the bulk of copy is fine. But `prose-invert` still governs the elements with NO override:
- list **bullet/marker** color (`--tw-prose-invert-bullets` / counters)
- `<hr>` divider color (`--tw-prose-invert-hr`)
- blockquote **left border** + quote marks
- inline `<code>` / `<pre>` text + background
- table borders / `<th>` text (if any)

There is **no `.light .prose-invert` override** anywhere in `index.css` (verified by grep), so in light mode these elements paint with the dark-theme (light/near-white) palette on a light background → invisible or sub-AA contrast.

## Steps to reproduce

1. Open `/privacy` or `/terms`.
2. Toggle the app to **light** mode (ThemeToggle).
3. Observe list bullets, any `<hr>` dividers, blockquote borders, and inline `code` — they render in the inverted (near-white) prose color, washing out against the light `gradient-bg`.

## Expected

Prose decorative elements (bullets, rules, blockquote borders, code) follow the active theme: dark-on-light in light mode, light-on-dark in dark mode.

## Actual

`prose-invert` is unconditional. In light mode the un-overridden prose sub-elements stay near-white → invisible / low contrast. The explicit `prose-p/li/strong/a` overrides mask most of it, which is why this is P2 not P0, but bulleted lists (heavy in both legal docs, e.g. Privacy §1 summary list, Terms §2 account list) lose their visible markers.

## Evidence

- `grep -rn 'prose-invert' src` → PrivacyPolicy:41, TermsOfService:41 (plus ChatMessages:442 and Index:1302, which are dark-surface bubbles where invert is intentional — NOT in scope here).
- `grep -n 'prose' src/index.css` → only a comment; no `.light` prose override exists.
- `@tailwindcss/typography` confirmed in `tailwind.config.ts:250`.

## Notes

STATIC — needs live re-verify when MCP+backend restored (toggle light mode on /privacy and /terms, inspect ul markers + hr + inline code contrast).
Suggested fix (fix-frontend): make invert theme-aware — either drop `prose-invert` and add explicit `prose-hr:`, `prose-bullets`-equivalent and `prose-code:` token overrides, or gate it (`dark:prose-invert`) and supply a light prose variant. Same change applies to both files.
NOTE: ChatMessages.tsx:442 and Index.tsx:1302 also use `prose-invert` but sit on dark glass bubbles in BOTH themes — confirm with live check before touching; likely out of scope.

---

_Filed by `qa-visual-responsive` on `2026-06-01T12:34:00Z`._
