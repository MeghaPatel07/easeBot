# Sprint 2 — Sofia Rossi (Senior Full-Stack)

**Track:** Settings & User Profile redesign — Account tab implementation
**PRD:** `docs/prd-settings-profile.md` §6.2–6.7, §7
**Design contract:** `docs/settings-design-system.md`
**Status:** Complete (Sprint 2 scope)

## Files modified

- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx`
  - Replaced the Sprint 1 stub with the full Account hub.
  - **No other file was touched** — `useAccount`, `accountService`, types,
    backend, `SettingsShell`, `SettingsModal`, and the other tabs are
    untouched. Auth/Firebase config is untouched.

## Sections implemented (in PRD order)

1. **Profile header** — `Avatar` (photoUrl with initials fallback), display
   name, email, plan badge derived from `useAccount().plan?.tier ?? profile.plan`,
   "Change photo" button. File picker is wired with `accept="image/png,image/jpeg"`,
   5 MB limit, client-side square crop via `<canvas>`, preview in confirm
   dialog. Confirm currently surfaces "Photo upload coming soon" toast and
   reverts the preview because backend `POST /api/account/photo` is a 501 stub
   (Rohan, Sprint 1) and `accountService.uploadPhoto` is not yet exported.
2. **Identity card** — `Name`, `Nickname`, `Phone (country code + national)`
   bound to local form state. Save button is disabled until the form is
   dirty. On save → `useAccount.updateProfile()` (PATCH `/api/account/profile`,
   live in backend). Toast on success. On failure: rollback local fields and
   toast (`destructive` variant for real errors, soft toast for 501).
3. **Email card** — current email, verified/unverified `Badge`, "Change email"
   `Button`. Opens an `AlertDialog` requiring re-auth: password input for
   password users, a copy hint about Google popup for Google-only users.
   Submit shows "Feature coming soon, please contact support" — backend
   `POST /api/account/email/change` is a 501 stub. Dialog state is wiped on
   close (no plaintext leak).
4. **Password card** — only renders when `linkedProviders` includes
   `'password'` (falls back to Firebase `auth.currentUser.providerData`).
   Dialog has current/new/confirm fields, live rule checklist (≥8 chars, 1
   upper, 1 lower, 1 digit, 1 special), match-check helper text. Submit is
   disabled until rules pass and confirm matches. Submit currently shows
   "Coming soon" — backend `POST /api/account/password/change` is a 501 stub.
   **Plaintext is wiped from React state every time the dialog closes**
   (no `useEffect` leaks, no console logging).
5. **Connected accounts** — reads `linkedProviders`, falling back to
   `auth.currentUser.providerData` per spec. Renders `Email & password` and
   `Google` rows with linked badges. "Link Google" stub toast; no unlinking
   in this sprint (safety).
6. **Danger zone** — destructive-bordered card, "Delete account" button.
   Opens `AlertDialog` requiring exact (case-sensitive) email match. Submit
   currently surfaces a "Deletion coming soon" toast — `accountService`
   does not export `deleteAccount` yet (Sprint 1 only wired the four
   endpoints actually needed by the hook). Backend `POST /api/account/delete`
   is "live (soft)" but plumbing is deferred to a follow-up sprint.

## Endpoint status handling (501 / not yet wired)

| Action | Endpoint | Status | UX |
|---|---|---|---|
| Profile update | PATCH `/api/account/profile` | live | optimistic, rollback on error |
| Photo upload | POST `/api/account/photo` | 501 stub | toast "Photo upload coming soon", revert preview |
| Email change | POST `/api/account/email/change` | 501 stub | toast "Feature coming soon, contact support" |
| Password change | POST `/api/account/password/change` | 501 stub | toast "Coming soon" |
| Link Google | n/a (out of sprint scope) | not wired | toast "Linking coming soon" |
| Delete account | POST `/api/account/delete` | live (soft) but no service export | toast "Deletion coming soon, contact support" |

Every async path has `try/finally` for loading state and toasts on both
branches. Nothing throws to React. No 501 path crashes the UI.

## Design contract conformance

- Tokens only: `bg-card`, `bg-input`, `bg-background`, `bg-muted`,
  `bg-primary`, `bg-destructive`, `text-foreground`,
  `text-muted-foreground`, `text-destructive`, `text-primary-foreground`,
  `border-border`, `border-destructive/60`, `ring-ring`. Zero hex,
  zero `slate/gray/zinc`, zero `dark:` color variants.
- Every interactive element: `min-h-11 min-w-11`,
  `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`,
  proper `<Label htmlFor>` or `aria-label`.
- Mobile-first: cards stack vertically, header avatar/text stack on
  `<md`, switch to row at `md:`. Phone fields sit on a single row with a
  fixed-width country code and flex-1 number.
- shadcn primitives only: `Card`, `Button`, `Input`, `Label`,
  `AlertDialog*`, `Avatar*`, `Badge`, `Separator`. No new components
  invented.
- All destructive flows wrapped in `AlertDialog`.

## Hard constraints — confirmation

- **Only `AccountTab.tsx` was modified.** No other file touched.
- **No new npm packages installed.**
- **No Firebase deploy.** `firestore.rules`, `storage.rules`,
  `firebase.json`, `services/firebase.ts` not touched.
- `SettingsModal.tsx` not deleted, not modified.
- `useAccount`, `accountService`, types, backend, `SettingsShell`, other
  tabs not modified — used as-is from Sprint 1.

## Verification

- `npm run build` from `Wedding-Ease-Viva-Chat/` → **zero new errors**
  (built in 4.01s, same chunk names as Sprint 1, only the `Index-*` chunk
  picks up the new tab body).
- Code walk-through of every interactive element at the 375px tier:
  - Profile header avatar + name + plan badge + email + Change photo button
    → all stack vertically (`flex-col` base, `md:flex-row`); Change photo
    button is full-width-friendly via its `min-h-11`.
  - Identity card: Name, Nickname, Phone (CC+National row, CC `w-24`,
    National `flex-1`). Save button right-aligned via `justify-end`.
  - Email card: email + badge wraps (`break-all`); button moves under it
    on `<sm` via `flex-col sm:flex-row`.
  - Password card only shows for password providers; button is left-aligned.
  - Connected accounts rows are rounded boxes with `min-h-11` rows.
  - Danger zone uses `border-destructive/60` and red title per spec.
  - All AlertDialog footers stack vertically on mobile (default Radix
    behavior in this codebase).

## Interactive elements

- `Change photo` button → opens hidden file input.
- File input (sr-only) → `accept="image/png,image/jpeg"`, validates type
  and 5 MB limit, crops via canvas, opens photo confirm dialog.
- Photo confirm dialog: `Cancel`, `Use photo` (501 → toast + revert).
- Identity inputs: Name, Nickname, Phone CC, Phone National.
- `Save changes` button — disabled until dirty, optimistic save with
  rollback on error.
- Email card `Change email` button → opens email dialog.
- Email dialog inputs: `Current password` (only for password users),
  `New email`. `Cancel` and `Submit` buttons.
- Password card `Change password` button → opens password dialog.
- Password dialog inputs: `Current password`, `New password`, `Confirm
  password`. Live rule checklist with check/X icons. `Cancel` and
  `Update password` buttons (disabled until rules pass).
- Connected accounts `Link Google` button (when not linked) → stub toast.
- Danger zone `Delete account` button → opens delete dialog.
- Delete dialog: `Type your email to confirm` input, `Cancel` and
  `Delete account` buttons (disabled until exact case-sensitive match).

## Notes for the next sprint

- `accountService` should export `uploadPhoto`, `changeEmail`,
  `changePassword`, `linkGoogle`, and `deleteAccount` so this tab can
  swap the 501 toasts for real calls.
- `useAccount.updateProfile` currently swallows errors internally; for
  the optimistic-rollback semantics in the Identity card it would be
  cleaner if the mutation surfaced the error to the caller. Today the
  tab still shows a destructive toast on failure because the mutation
  state can be observed, but a proper rejected promise would simplify
  things. Flagged for a follow-up.
- Re-auth for Google users currently has a soft message instead of a
  popup — once `accountService.changeEmail` lands, the dialog should
  trigger `signInWithPopup` for Google-only users before submitting.
