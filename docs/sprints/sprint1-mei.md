# Sprint 1 — Mei (Frontend, Settings & Profile redesign)

Scope: PRD §5, §6, §9. Build the new Settings shell scaffold, account hook,
account service, and the new ProfileMenu — all stubbed but URL-deep-linkable
and ready for Sprint 2 to populate.

## Files created

- `Wedding-Ease-Viva-Chat/src/services/accountService.ts`
- `Wedding-Ease-Viva-Chat/src/hooks/useAccount.ts`
- `Wedding-Ease-Viva-Chat/src/components/ProfileMenu.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/SettingsShell.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/_TabShell.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PlanBillingTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PersonalizationTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AiBehaviorTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AppearanceTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/NotificationsTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/DataPrivacyTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AboutTab.tsx`

## Files modified (minimally)

- `Wedding-Ease-Viva-Chat/src/components/chat/ChatHeader.tsx`
  — only the body of the avatar `DropdownMenuContent` was replaced with
  `<ProfileMenu />`. Trigger button + props/callbacks untouched.
- `Wedding-Ease-Viva-Chat/src/pages/Index.tsx`
  — one new import (`SettingsShell`) and one JSX line: `<SettingsShell />`
  is now mounted alongside the existing `<SettingsModal />` so it is always
  available, with visibility driven entirely by `?settings=<tab-id>`.

## Responsive behaviour (verified in code review at 375 / 768 / 1440)

- **1440px (≥1024 / `lg`)**: 240px left side nav (`role=tablist`,
  arrow-key navigation, ≥44px hit targets) + flex-1 content pane. Modal
  is `max-w-[960px]`, height `85dvh`, rounded `2xl`, centered.
- **768px (`md` and below `lg`)**: side nav collapses to a horizontal
  scrollable top tab bar above the content. Same modal centering and
  rounding as desktop.
- **375px (`<md`)**: modal goes edge-to-edge full-screen (`100vw / 100dvh`,
  `rounded-none`). Initial view is the list-of-tabs; tapping a tab swaps
  to the content view with a back button (`ArrowLeft`) in the header that
  returns to the list. URL stays in sync via `setSearchParams`.

All buttons use `min-h-11` (≥44px), focus rings via
`focus-visible:ring-ring`, and only token classes
(`bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`,
`bg-accent`, `text-accent-foreground`, `border-border`, `text-destructive`)
so the shell is dark-mode-correct out of the box.

## Accessibility checklist

- `role="dialog"` (Radix Dialog) + `aria-labelledby` + `aria-describedby`
  (sr-only `DialogTitle` / `DialogDescription`).
- Focus trap + Esc-to-close handled by Radix Dialog.
- Side nav is `role="tablist"`, vertical orientation; each item is
  `role="tab"` with `aria-selected` and `aria-controls`.
- Arrow Up/Down/Home/End on the side nav move active tab and focus.
- Usage meter in `ProfileMenu` exposes `role="progressbar"` with valid
  `aria-valuenow / valuemin / valuemax / aria-label`.
- Plan badge readable at micro size with adequate contrast on both themes.

## Account hook resilience (PRD §9)

`useAccount()` uses TanStack Query for `GET /api/account/me` and
`PATCH /api/account/profile` + `PATCH /api/account/preferences`. It never
throws to the UI:

- 401 (`unauthenticated`) → returns fallback derived from
  `AuthContext.profile` (so the avatar dropdown still renders for
  signed-in users when the backend is unreachable).
- 501 (`not_implemented`) → no retry; shell still renders against the
  fallback derived data.
- network errors → caught in service, surfaced as `error` field only.

`accountService.ts` reuses `import.meta.env.VITE_API_BASE_URL` (matching
`functionsService`, `ttsService`, `notesSharingService`) and attaches a
fresh Firebase ID token from `auth.currentUser.getIdToken()` on every
call.

## Build + dev server

- `npm run build` → ✓ built in 4.02s, zero new TypeScript errors.
  All existing chunks unchanged in name; new `Index-*.js` chunk picks up
  the SettingsShell tree without any size regression beyond the stubs.
- `npm run dev` → boots cleanly on `http://localhost:8081/` (8080 in use).
  `GET /?settings=account` returns `HTTP 200` and the SettingsShell mounts
  on the URL param (verified — open-state is computed from
  `searchParams.get('settings')`, which is `'account'` on first load,
  matching `isTabId`, so the dialog is `open`).

## Hard constraints — confirmation

No deploys attempted, no Firebase config touched, no new packages.

- `SettingsModal.tsx` not deleted / not modified.
- `firestore.rules`, `storage.rules`, `firebase.json`, `services/firebase.ts`
  not touched.
- `UserProfile` type not modified (Priya's territory) — only read with
  optional-field tolerance.
- No backend code touched (Rohan's territory). New endpoints exist only
  as TypeScript signatures in `accountService.ts`, gated by the
  graceful-degradation in `useAccount`.
- No new dependencies. Uses only what's already in `package.json`:
  `@tanstack/react-query`, `react-router-dom`, `lucide-react`, shadcn
  `Dialog`/`Card`/`Avatar`/`DropdownMenu`.
