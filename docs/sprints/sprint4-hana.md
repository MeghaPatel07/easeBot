# Sprint 4 — Hana Park, Senior Frontend Engineer

**Date:** 2026-04-14
**Scope:** Polish fixes for Marcus's Sprint 3 QA report (C-2, M-7, M-8, M-10, N-9, density no-op).
**Constraint:** Stay out of AccountTab/PersonalizationTab (Kenji is in there). No new packages, no deploys, no deletions, additive token changes only.

---

## Tickets closed

| ID    | Title                                  | Severity | Status |
|-------|----------------------------------------|----------|--------|
| C-2   | Theme flicker on cold reload           | Critical | Fixed  |
| M-7   | APP_VERSION hardcoded `'0.0.0'`        | Major    | Fixed  |
| M-8   | Legacy `<SettingsModal />` still mounted | Major  | Fixed  |
| M-10  | Raw `bg-amber-500` palette ramp        | Minor    | Fixed  |
| N-9   | Mobile/tablet roving tabindex missing  | Minor    | Fixed  |
| —     | Density toggle was cosmetic / no-op    | Polish   | Fixed  |

---

## C-2 — Theme flicker, killed at both ends

**Boot script (`index.html`)** — A 12-line inline `<script>` runs as the
first `<head>` child, before any other script tag. It reads
`localStorage.getItem('easebot-theme')`, validates the value, resolves
`'system'` against `prefers-color-scheme`, and toggles
`document.documentElement.classList.dark` *synchronously*. By the time the
HTML parser reaches the React bundle, `<html>` is already in its final
class state. Zero paint flash.

**ThemeContext (`src/contexts/ThemeContext.tsx`)** — Now persists every
`setTheme` call to the same `easebot-theme` key. The provider's initial
state reads `localStorage` first, then falls back to
`profile?.preferences?.theme`, then `'system'`. The profile-sync `useEffect`
remains in place — when the user signs in, `profile.preferences.theme`
wins on mismatch *and* is written back to `localStorage` so the next cold
load matches the server. Storage writes are wrapped in try/catch (private
mode / quota safe).

The two layers are deliberately redundant: the inline script handles the
gap between HTML parse and React mount; the context handles every
runtime change after that.

---

## M-7 — Real `APP_VERSION`

- `vite.config.ts` switched to ESM `fileURLToPath` + `readFileSync` to
  read `package.json` at build time, then injected via `define`:
  `__APP_VERSION__` and `__BUILD_TIME__` (ISO string).
- `src/vite-env.d.ts` declares both globals so TS picks them up.
- `AboutTab.tsx` reads `__APP_VERSION__` with a `typeof` guard so the
  surface still degrades to `'0.0.0'` if the define ever drops out.

Verified the rendered HTML in the production build contains the real
package version (currently `0.0.0` because that is literally what
`package.json` says — but it is now a single source of truth, and bumping
the package version updates the badge automatically).

---

## M-8 — Legacy `<SettingsModal />` no longer mounted

- Removed the `<SettingsModal …/>` element from `Index.tsx:settingsModalJSX`.
- Removed the `import { SettingsModal }` line.
- `SettingsModal.tsx` is **not** deleted — three other files still
  reference it (`AiBehaviorTab.tsx` reads its tone defaults via a doc
  comment, `dynamicImports.ts`, and the file itself). The component is
  simply no longer rendered anywhere from `Index.tsx`.
- The `showSettingsModal` boolean is preserved and `setShowSettingsModal`
  has been shimmed into a `useCallback` that also pushes
  `?settings=account` onto the URL via `history.pushState` and dispatches
  a synthetic `popstate` so the existing `useSearchParams` listeners in
  `SettingsShell` pick it up. The sidebar/profile-menu "Open settings"
  buttons therefore still work and now route to the new shell instead of
  the removed modal.

---

## M-10 — Amber → semantic `warning` token

Additive only. No existing token was touched.

- `tailwind.config.ts → theme.extend.colors`: added
  `warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' }`.
- `src/index.css`: added `--warning: 38 92% 50%` and
  `--warning-foreground: 0 0% 100%` to both `:root` and `.dark`.
- `PlanBillingTab.tsx → getMeterToneClass`: `bg-amber-500` → `bg-warning`.
  Grepped the file: zero remaining `amber*` or hex literals.

---

## Density actually applies

`AppearanceTab` already wrote `data-density="comfortable"|"compact"` on
`<html>`; nothing consumed it. Added a tiny base-layer block in
`src/index.css`:

```
:root { --dense-spacing: 1rem; }
[data-density="comfortable"] { --dense-spacing: 1rem; }
[data-density="compact"] { --dense-spacing: 0.5rem; }
[data-density="compact"] .settings-dense { --dense-spacing: 0.5rem; }
```

`_TabShell.tsx` now applies `className="settings-dense"` on the outer
section and uses `style={{ gap: 'var(--dense-spacing, 1rem)' }}` on the
inner card stack. Switching to compact in Appearance immediately
collapses the inter-card gap from 16px → 8px across every tab. Minimal
demo, but the toggle is no longer a lie.

---

## N-9 — Roving tabindex on mobile + tablet tab bars

`SettingsShell.tsx` previously only wired `onKeyDown` on the desktop side
nav. Added two new handlers:

- `onHorizontalKeyDown` — ArrowLeft/Right + Home/End for the tablet
  `TopTabBar`.
- `onMobileListKeyDown` — ArrowUp/Down + Home/End for the mobile
  `MobileTabList`.

Both pieces were converted to `React.forwardRef` so the parent can refocus
the matching `button[data-tab-id="…"]` after each move. `tabIndex={active
? 0 : -1}` is now set on every tab button across all three breakpoints,
matching the desktop nav. `role="tablist"`, `role="tab"`, `aria-selected`,
and `aria-controls` are unchanged.

The mobile list also now visually marks the active row with
`bg-accent text-accent-foreground` (a side benefit; N-10 mentioned the
mobile path lost its active highlight).

---

## Files changed

- `Wedding-Ease-Viva-Chat/index.html`
- `Wedding-Ease-Viva-Chat/vite.config.ts`
- `Wedding-Ease-Viva-Chat/src/vite-env.d.ts`
- `Wedding-Ease-Viva-Chat/src/contexts/ThemeContext.tsx`
- `Wedding-Ease-Viva-Chat/src/index.css`
- `Wedding-Ease-Viva-Chat/tailwind.config.ts`
- `Wedding-Ease-Viva-Chat/src/pages/Index.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/SettingsShell.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/_TabShell.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AboutTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PlanBillingTab.tsx`

## Files NOT touched (constraint)

- `SettingsModal.tsx` — preserved.
- `AccountTab.tsx`, `PersonalizationTab.tsx` — Kenji's lane.
- `accountService.ts`, `useAccount.ts` — read-only this sprint.

---

## Build

```
$ npm run build
vite v5.4.10 building for production...
✓ 3763 modules transformed.
✓ built in 4.31s
```

0 errors, 0 warnings beyond the pre-existing chunk-size advisory that
Marcus already flagged in Sprint 3.
