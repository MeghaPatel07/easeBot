# Sprint 2 — Aarav (Frontend, Settings & Profile redesign)

Owner: Aarav Iyer, Senior Frontend Engineer, WeddingEase
Scope: PRD §5 (Personalization, AI Behavior tabs) and §6 (flows). Migrates
the legacy `SettingsModal.tsx` Tone + Voice surfaces onto the new
`SettingsShell` tab system without touching the legacy modal.

## Files modified (only these two)

- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PersonalizationTab.tsx`
- `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AiBehaviorTab.tsx`

## Files intentionally NOT touched

- `Wedding-Ease-Viva-Chat/src/components/SettingsModal.tsx` — legacy modal
  remains intact and still mounts in `Index.tsx`. This tab is the new
  surface but does not delete the old entry point yet.
- `Wedding-Ease-Viva-Chat/src/services/settingsService.ts` — reused, not
  modified.
- `Wedding-Ease-Viva-Chat/src/types/index.ts` — `UserProfile`, `ToneSettings`
  unchanged.
- `Wedding-Ease-Viva-Chat/src/hooks/useAccount.ts`, `accountService.ts` — used
  as-is from Sprint 1.

## PersonalizationTab — sections

1. **Wedding details card** — `Calendar` + `Popover` for `weddingDate`,
   `Input` for `partnerName`, `Select` for `role` (bride / groom / partner /
   planner / family), numeric `Input` with INR prefix for `budget`. Dirty
   detection, single Save button, `useToast` success/error feedback. Saves via
   `useAccount.updateProfile` (Sprint 1 hook), which targets
   `PATCH /api/account/profile`.
2. **Active vibe card** — renders `profile.activeVibe` (title, subtitle,
   descriptor chips) when present, with a `Clear vibe` button that surfaces a
   toast pointing the user back to chat (no backend mutation path exists yet).
   Empty state explains how to set a vibe from chat.
3. **Wedding context summary** — read-only `dl` showing days-until-wedding
   (computed from `profile.weddingDate`), `Intl.NumberFormat`-formatted budget,
   and role.

Layout: single column on mobile, `lg:grid-cols-2` for the wedding-details form
fields.

## AiBehaviorTab — sections (migrated from SettingsModal)

1. **Conversation tone card** — all 10 `ToneSettings` sliders with the exact
   labels and 0-100 / step=5 ranges from `SettingsModal.tsx:232–241`. Reads
   `profile.toneSettings`, writes via `savePersonalization(uid, { toneSettings })`.
   Per-slider value pill, dirty detection, dedicated Save button.
2. **Voice card** — radiogroup of `VOICE_PRESETS` (reused, not redeclared),
   per-row preview button using `requestTTS` (same TTS service the legacy modal
   uses). Saves via `savePersonalization(uid, { voiceId })`. Cleans up audio on
   unmount and on tab switch.
3. **Default AI mode card** (new, placeholder) — disabled `Select` populated
   from `MODE_CONFIG` in `components/chat/constants.ts`. Marked "Coming soon"
   because no `defaultMode` field exists on `UserProfile` yet.
4. **Reset to defaults** — `RotateCcw` button in the tone-card header wrapped
   in `AlertDialog`. On confirm, sets all 10 sliders to neutral defaults and
   immediately persists via `savePersonalization`.

Layout: tone sliders in `md:grid-cols-2`, voice presets in `sm:grid-cols-2`,
both collapse to single column under `md`/`sm`.

## settingsService functions reused (file:line)

- `savePersonalization` — `Wedding-Ease-Viva-Chat/src/services/settingsService.ts:5`
  - Called for tone save, tone reset, and voice save.
  - Nickname is intentionally NOT written from this tab (per spec, nickname
    will live in `AccountTab` once Sofia owns it).

Other reuses:

- `VOICE_PRESETS`, `getVoicePreset` — `services/voicePresets.ts:19`
- `requestTTS` — `services/ttsService.ts`
- `MODE_CONFIG` — `components/chat/constants.ts:37`
- `useAccount.updateProfile` — `hooks/useAccount.ts:79` (Personalization save)
- `useAuth` — for `user.uid` + `profile.toneSettings` + `profile.voiceId`

## Design system compliance

- Tokens only: `bg-card`, `bg-input`, `bg-popover`, `bg-muted`, `bg-primary`,
  `text-foreground`, `text-muted-foreground`, `text-primary-foreground`,
  `border-border`, `ring-ring`. No raw hex, no `gray-*`/`zinc-*`.
- shadcn primitives only: `Card`, `Button`, `Input`, `Label`, `Slider`,
  `Select`, `Calendar`, `Popover`, `AlertDialog`. No new variants.
- Every interactive control: `min-h-11`, visible focus ring
  (`focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`),
  associated `<Label htmlFor>` or `aria-label`.
- Voice preview buttons declare both `aria-label` and `aria-hidden` icons.
- Tone slider value badges use `aria-live="polite"` so screen readers hear
  updates as the user drags.
- Reset destructive guard: wrapped in `AlertDialog` per design-system §5.6.
- Dark-mode safe: all colors come from semantic tokens that are redefined in
  both `:root` and `.dark`.

## Verification

- `npm run build` — passes (Vite 5.4.10, ✓ built in 4.38s, no TS errors).
- Code review of bindings:
  - `tone[s.key]` reads from `profile.toneSettings` via `initialTone` memo.
  - Save calls hit `savePersonalization(user.uid, { ... })`.
  - `useAccount.updateProfile` is the only Personalization mutation path.
- Mobile (375px): all cards stack to single column, tap targets ≥44px,
  preview buttons remain reachable thanks to `shrink-0` on the icon button.

## Constraint checklist

- [x] Touched ONLY `PersonalizationTab.tsx` and `AiBehaviorTab.tsx`.
- [x] No new packages, no Firebase deploy, no rules changes.
- [x] `SettingsModal.tsx`, `settingsService.ts`, `useAccount.ts`,
      `accountService.ts`, `types/index.ts` all unmodified.
- [x] Reused existing exports (`savePersonalization`, `VOICE_PRESETS`,
      `requestTTS`, `MODE_CONFIG`, `useAccount`).
- [x] Nickname intentionally absent from both tabs (Sofia owns it in Account).
- [x] `npm run build` passes.
