# Sprint 2 — Yuki Tanaka (Senior Frontend, WeddingEase)

**Scope:** Settings redesign — Appearance, Notifications, Data & Privacy, About tabs.
**Sprint:** 2 of the Settings & Profile redesign (PRD §5).
**Owner:** Yuki Tanaka

---

## Summary

Filled the four Sprint 1 stubs and wired them to `useAccount.updatePreferences`,
the existing `authService.updatePreferredLanguage` (back-compat), and the
existing language list in `src/components/chat/constants.ts`. Created a minimal
class-based `ThemeContext` because no app-level theme provider existed
(`next-themes` is in `package.json` but only `sonner.tsx` consumes it, and
nothing mounts `ThemeProvider`). Mounted the new context in `App.tsx`.

All changes are isolated to the four tab files plus the documented exception
(ThemeContext + one wrapper in App.tsx).

---

## Files modified / created

**Modified — tab implementations:**
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AppearanceTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/NotificationsTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/DataPrivacyTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AboutTab.tsx`

**Created (exception):**
- `Wedding-Ease-Viva-Chat/src/contexts/ThemeContext.tsx`

**Modified (exception — single provider mount):**
- `Wedding-Ease-Viva-Chat/src/App.tsx` — wraps the existing tree in
  `<ThemeProvider>` immediately inside `<AuthProvider>` so the theme can read
  `profile.preferences.theme`.

No other files touched. No npm packages added. No Firebase rules edited.

---

## Tab specs

### Appearance
- **Theme card** — `RadioGroup` with system/light/dark. Apply immediately
  via `useTheme().setTheme`, persist via `updatePreferences({ theme })`.
  Optimistic; rollback on error with destructive toast.
- **Density card** — `RadioGroup` with comfortable/compact. Persists; also
  writes `document.documentElement.dataset.density` so future styles can
  hook off `[data-density="compact"]`.
- **Language card** — `Select` populated from `SUPPORTED_LANGUAGES` in
  `src/components/chat/constants.ts`. Persists via `updatePreferences({
  language })` AND calls `authService.updatePreferredLanguage` for
  back-compat with the legacy `preferredLanguage` field.

### Notifications
- **Email** — switches for `emailReminders`, `tips`, `productUpdates`.
- **WhatsApp** — switch for `whatsappReminders`. If `profile.phone` is
  missing, the row is disabled and a muted warning instructs the user to
  add a number in Account.
- **In-app** — placeholder row with "Coming soon" copy.
- All rows: `min-h-11`, `aria-label`, `Label htmlFor`, focus ring.

### Data & Privacy
- **Training opt-out** — switch bound to `dataTrainingOptOut`.
- **Export your data** — button → toast "Export coming soon" (501 stub).
- **Clear chat history** — destructive button wrapped in `AlertDialog`,
  confirms then toasts "Clear history coming soon".
- **Cookie preferences** — placeholder card.
- **Your rights** — GDPR/DPDP copy with link to `/privacy`.

### About
- App version (currently `0.0.0` from `package.json`).
- Environment from `import.meta.env.MODE`.
- Resource grid: Terms (`/terms`), Privacy (`/privacy`), Status, Changelog,
  Help center. The latter three render as disabled tooltips ("Coming soon")
  until the routes/pages exist.
- Plain-text "Built with care by WeddingEase" credit (no emoji — the app
  files do not use emoji as a default pattern).

---

## ThemeContext rationale

There was no app-level theme provider. `next-themes` is in `package.json`
but only `src/components/ui/sonner.tsx` calls `useTheme()` from it, and
nothing mounts `<ThemeProvider>` from `next-themes`. Per the Sprint 2
exception, I created `src/contexts/ThemeContext.tsx`:

- Initial theme from `profile.preferences.theme` or `'system'`.
- `document.documentElement.classList.toggle('dark', resolvedIsDark)`.
- Subscribes to `prefers-color-scheme` when `theme === 'system'`.
- Exposes `{ theme, resolvedTheme, setTheme }`.
- Soft-fails (returns a no-op) when called outside the provider so tests
  and tab files never crash.

Mounted inside `AuthProvider` (so it can read profile) and outside
`TooltipProvider` in `App.tsx`.

---

## Constraint checklist

- [x] Touched only the four tab files + `ThemeContext.tsx` + one wrap in `App.tsx`.
- [x] No new npm packages.
- [x] No Firebase rules / deploy / new routes.
- [x] Tokens only — `bg-card`, `text-foreground`, `text-muted-foreground`,
      `border-border`, `bg-input`, `bg-popover`, `bg-destructive`, etc.
- [x] shadcn primitives only: `RadioGroup`, `Switch`, `Select`, `Card`,
      `AlertDialog`, `Tooltip`, `Badge`, `Separator`, `Label`, `Button`.
- [x] `min-h-11` and focus rings on every interactive element.
- [x] All 501 endpoints degraded to toasts.
- [x] Did not modify the existing language list, only consumed it.
- [x] `npm run build` succeeds (Vite, 0 errors, 4.2s).

---

## Verification

- `npm run build` — passes cleanly (4.22s, no TS errors). Bundle warnings
  about `> 500kB` chunks are pre-existing and unrelated.
- Theme toggle: `useTheme().setTheme('dark')` runs
  `document.documentElement.classList.toggle('dark', true)`. Selecting
  Light removes the class. Selecting System falls back to
  `prefers-color-scheme`.
- Mobile width: each card uses `grid gap-3 sm:grid-cols-2` (or 3 for the
  three-up theme grid), so the four tabs collapse to single-column under
  640px.

---

## Follow-ups for future sprints

1. Hook up the actual `accountService.exportData` and
   `clearChatHistory` once Rohan ships the endpoints — both are gated to
   toasts today.
2. Apply real density styles based on `[data-density="compact"]` (the
   attribute is already written; nothing is consuming it yet).
3. Wire `APP_VERSION` to `package.json` via Vite `define` once the
   bundler is configured to expose it; right now it is a const literal.
4. Consider adopting `next-themes` (already a dep) instead of the
   in-tree `ThemeContext` if a cross-cutting provider becomes needed.
