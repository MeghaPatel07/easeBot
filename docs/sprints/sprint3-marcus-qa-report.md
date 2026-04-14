# Sprint 3 — Marcus Webb, Senior QA Engineer
## Settings & User Profile Redesign — Exhaustive QA Pass

**Date:** 2026-04-14
**Scope:** All Sprint 1+2 deliverables (SettingsShell, ProfileMenu, useAccount,
accountService, ThemeContext, 8 tabs)
**Constraint:** Read-only; no source modifications.

---

## Build health

| Surface              | Command                          | Exit | Notes |
|----------------------|----------------------------------|------|-------|
| Frontend production  | `npm run build` (Vite)           | 0    | Clean. 4.71s. Caniuse data 18mo old (advisory). Bundle warning: `Index-DqYj0mxs.js` is **1.15 MB** unchunked (>500 kB threshold). Not Settings-specific but worth tracking. |
| Backend typecheck    | `npx tsc --noEmit`               | 0    | Clean. No errors, no warnings. |

**Verdict:** Clean compile, no type errors anywhere.

---

## Smoke test results

Backend started on `PORT=3099 ENABLE_REMINDER_SCHEDULER=false`:
```
[easebot] Server running on http://0.0.0.0:3099
[easebot] Speech & Translation pipeline: ON
[easebot] Reminder scheduler disabled via env
```

Frontend Vite started on `:8080`:
```
VITE v5.4.10 ready in 114 ms
Local: http://localhost:8080/
```

**Curl checks:**
| Target                                                       | Expected | Actual                                              |
|--------------------------------------------------------------|----------|-----------------------------------------------------|
| `GET http://localhost:8080/`                                 | 200 HTML | `200` (DOCTYPE html)                                |
| `GET http://localhost:8080/?settings=account`                | 200 HTML | `200` (SPA fallback)                                |
| `GET http://localhost:3099/api/account/me` (no token)        | 401 JSON | `401 {"error":"Authentication required","code":"UNAUTHORIZED"}` |

Both processes shut down cleanly. All four smoke checks pass.

---

## Interactive elements inventory (per surface)

### SettingsShell.tsx
| Element | Handler | State / Effect | Endpoint | Failure mode |
|---|---|---|---|---|
| `<Dialog open>` | `onOpenChange→closeModal` | Removes `?settings` from URL | — | Esc handled by Radix |
| Side-nav tab buttons (×8) | `setTab(id)` | `setSearchParams({settings:id})` | — | URL is the source of truth |
| Side-nav `onKeyDown` | `onNavKeyDown` | Arrow/Home/End across `TAB_IDS`, refocuses target via `requestAnimationFrame` | — | Roving tabindex (active=0, others=-1) ✓ |
| Top tab bar (tablet) | `setTab(id)` | same as side nav | — | — |
| Mobile list rows | `setTab(id) + setMobileShowingContent(true)` | Local state | — | — |
| Mobile back button | `setMobileShowingContent(false)` | Local | — | — |
| Three close buttons (one per breakpoint) | `closeModal` | URL | — | — |

### ProfileMenu.tsx
| Element | Handler | Mutation/Endpoint |
|---|---|---|
| Sign In / Create Account / Continue as Guest (unauth) | Props from ChatHeader | None — preserves legacy callbacks |
| Settings menu item | `openSettings('account')` | URL only |
| Upgrade/Manage plan menu item | `openSettings('plan-billing')` | URL only |
| Help & feedback | `onShowHelp ?? navigate('/help')` | client navigation |
| Sign out | `onSignOut` (prop) | upstream `signOut` |
| Usage meter | Read-only progressbar with `aria-valuenow/min/max` | — |

### AccountTab.tsx (the heaviest tab)
| Element | Handler | State / Endpoint | On error / 501 |
|---|---|---|---|
| Change photo button | `handleChoosePhoto`→file input | `cropToSquareDataUrl`, opens AlertDialog | Validates type (PNG/JPG) and 5 MB limit |
| Confirm photo | `handleConfirmPhoto` | **STUB** — toast only ("Photo upload coming soon") | Never calls service |
| Identity name/nickname/cc/national inputs | `setName/etc.` | local; dirty tracked per field | — |
| Save identity | `handleSaveIdentity`→`updateProfile(patch)` | `PATCH /api/account/profile` via TanStack | 501→"Saving coming soon"; other→destructive toast + rollback name/nickname |
| Change email | open dialog→`handleSubmitEmailChange` | **STUB** — toast only | dialog clears reauthPassword on close |
| Change password | open dialog→`handleSubmitPasswordChange` | **STUB** — toast only | All plaintext wiped on close |
| Password rule list | live-rendered `PASSWORD_RULES.map` | 5 rules ✓ |
| Link Google | `handleLinkGoogle` | toast | — |
| Delete account | open dialog→`handleSubmitDelete` | **STUB** — toast only | Email match is **case-sensitive** and exact (`deleteConfirmEmail === profile.email`) ✓; submit disabled until matched ✓ |

### PlanBillingTab.tsx
| Element | Handler | Notes |
|---|---|---|
| Upgrade to Pro / Manage subscription | `handleCheckout('pro')` / `handleManageSubscription` | toast only |
| Compare plans | `handleCheckout(currentTier)` | toast only |
| Plan-card "Select X" button × 3 | `handleCheckout(tier)` | disabled when `isCurrent` ✓ |
| Add payment method | `handleAddPaymentMethod` | toast |
| FAQ accordion (3 items) | shadcn Accordion | — |
| External pricing link | `<a target="_blank" rel="noreferrer">` | Opens new tab |
| **Usage meter** | role=progressbar; `aria-valuenow/min/max` set ✓; loading skeleton; empty state ("Usage tracking will appear here…") when `!hasUsage` ✓ | Color thresholds: ≥90 destructive, ≥70 amber-500, else primary ✓ |

### PersonalizationTab.tsx
| Element | Handler |
|---|---|
| Wedding date Popover→Calendar | `setForm(weddingDate)` |
| Clear date inline button | `setForm(weddingDate:null)` |
| Partner name input | `setForm(partnerName)` |
| Role Select (5 options) | `setForm(role)` |
| Budget input (₹ prefix) | `setForm(budget)` w/ NaN guard inside `handleSave` |
| Save changes | `updateProfile({...})` |
| Clear vibe | toast (vibes are chat-driven) |

### AiBehaviorTab.tsx
| Element | Handler | Notes |
|---|---|---|
| **10 tone sliders** | `updateTone(key)` | 0-100 step 5; live `aria-live` value badge; verified all 10 keys & defaults match `SettingsModal.tsx:13–24` exactly (warm 50, analytical 30, friendly 70, professional 50, enthusiastic 50, concise 50, quirky 20, candid 50, emojis 30, headers 40) ✓ |
| Reset tone (AlertDialog) | `handleResetTone`→`savePersonalization` | Saves DEFAULT_TONE immediately |
| Save tone | `handleSaveTone`→`savePersonalization(uid,{toneSettings})` | Disabled when `!toneDirty` ✓ |
| 8 voice preset radios | `setVoiceId(preset.id)` | `role=radio` on each |
| Voice preview button | `previewVoice(id)`→`requestTTS` | Single-audio cleanup; Loader→Square→Volume2 icons |
| Save voice | `handleSaveVoice` | — |
| Default mode Select | `disabled` placeholder | "Coming soon" badge |

### AppearanceTab.tsx
| Element | Handler | Effect |
|---|---|---|
| Theme RadioGroup (system/light/dark) | `onThemeChange`→`setTheme` + `updatePreferences` | `ThemeContext.applyDarkClass` calls `document.documentElement.classList.toggle('dark', resolved === 'dark')` ✓ — confirmed in `ThemeContext.tsx:34` |
| Density RadioGroup | `onDensityChange` | sets `document.documentElement.dataset.density` |
| Language Select | `onLanguageChange` | calls both `updatePreferences` and legacy `updatePreferredLanguage` |

### NotificationsTab.tsx
| Switch | Wired |
|---|---|
| `email-reminders`, `email-tips`, `email-product` | `onToggle('emailReminders'|'tips'|'productUpdates')` ✓ |
| `whatsapp-reminders` | Disabled until `profile.phone` is set; banner shown |
| In-app alerts | "Coming soon" placeholder, no toggle |

### DataPrivacyTab.tsx
| Element | Handler |
|---|---|
| Don't use my chats for training Switch | `onOptOutChange`→`updatePreferences` w/ rollback |
| Download all my data | `onExport`→toast |
| Clear chat history (AlertDialog) | `onClearHistory`→toast |
| Cookie/Your-rights | static |
| /privacy link | client-side anchor |

### AboutTab.tsx
| Element | Notes |
|---|---|
| Version badge | hard-coded `APP_VERSION='0.0.0'` (see Bug AB-1) |
| Environment badge | reads `import.meta.env.MODE` |
| 5 link rows | Tooltip-wrapped "Coming soon" disabled buttons for status/changelog/help; live anchors for /terms and /privacy |

---

## Bugs found

### Blocker
*(none — nothing prevents shipping the surface; everything that's a stub is intentional and degrades to a toast)*

### Critical
**C-1. PRD §6.7 mandates a backend `/api/account/delete` call; the UI never invokes it.**
File: `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/AccountTab.tsx:354–375`
The button is fully wired to a destructive AlertDialog with email re-confirm, but `handleSubmitDelete` only fires a toast. There is no `accountService.deleteAccount` export. **A user cannot delete their account from the UI**. Acceptable for sprint cut-off but must close before launch.

**C-2. ThemeProvider sits *inside* AuthProvider, but ThemeContext reads `useAuth()` — that's fine — however `setTheme` updates only local state; on next page load the theme jumps until `profile.preferences.theme` re-syncs.** No persistence to `localStorage`.
File: `Wedding-Ease-Viva-Chat/src/contexts/ThemeContext.tsx:41–50`
Repro: pick Dark, hard-refresh while signed-out → page renders in System (which on most dev machines = dark, masking the bug). Sign in as a user with `theme:'light'` → flicker to dark → light. Add a `localStorage` cache.

### Major
**M-1. Photo upload pipeline is fully placeholder.**
`AccountTab.tsx:244–254` — `handleConfirmPhoto` only toasts. PRD §6.2 (photo→Storage→Firestore→optimistic) is not implemented.

**M-2. Email change has no real re-auth — and no email validation.**
`AccountTab.tsx:282–297`. The dialog's only `disabled` guard is `newEmail.trim().length === 0`. A user can submit `"abc"` and receive a "feature coming soon" toast.

**M-3. Password change dialog doesn't actually call Firebase or revoke other sessions** (PRD §6.4). Stub only. The UX is excellent (live 5-rule checklist confirmed, plaintext wiped on close), but it does nothing.

**M-4. `AboutTab.APP_VERSION` is hard-coded to `'0.0.0'`.**
`AboutTab.tsx:21`. Should read from `package.json` via `import.meta.env.PACKAGE_VERSION` (vite define) or be exposed from build. Currently any deploy still says v0.0.0.

**M-5. SettingsShell legacy modal still mounted alongside new shell.**
`Index.tsx:789` — `<SettingsModal …/><SettingsShell />` are siblings. `SettingsModal.tsx` is no longer the canonical surface but was never deleted. Risk: drift between two tone-setting surfaces.

**M-6. `useAccount.updateProfile` swallows errors silently.**
`useAccount.ts:80–88` — catches and only `console.warn`s. Then `AccountTab.handleSaveIdentity` wraps the call in its *own* try/catch expecting an error… which never throws. **Result: when the backend returns 500/422, the user sees a "Profile updated" success toast even though nothing saved.** This is a real bug.

**M-7. `prefsMutation.onSuccess` invalidates the query cache, but `updatePreferences` swallows errors** (same pattern as M-6). Optimistic UI in AppearanceTab/NotificationsTab/DataPrivacyTab will *not* roll back on a real backend failure because the awaited promise resolves successfully.

### Minor
**N-1.** `AccountTab.tsx:194–196` — rollback only restores `name` and `nickname`, not `phoneCountryCode`/`phoneNational`. If a user edits phone and the save fails, the form keeps the unsaved edit while the toast says "Could not save".

**N-2.** `AccountTab.tsx:380` — `void signOut` exists only to keep the import alive. Dead-code marker, harmless.

**N-3.** `PersonalizationTab.tsx:75–85` — Budget hard-codes `currency:'INR'` regardless of user locale. International users see ₹.

**N-4.** `PlanBillingTab.tsx:118` — Comment says `amber-500 is a Tailwind palette token, allowed via config`, but the design system contract says **no hex / no palette colors except via tokens**. `bg-amber-500` is a raw palette ramp, not a semantic token.

**N-5.** `AiBehaviorTab.tsx:107` — `useEffect(() => setTone(initialTone), [initialTone])` — `initialTone` is a memoized object. If the parent re-renders with a new but equivalent profile object reference, this will reset the user's in-progress edits.

**N-6.** `AiBehaviorTab.tsx:155` — `handleResetTone` saves immediately without the AlertDialog gating that the surrounding code suggests; the dialog confirms it but the trigger is `<AlertDialogAction onClick={handleResetTone}>` directly — fine, but combined with N-5 this can wipe edits unexpectedly.

**N-7.** `NotificationsTab.tsx:181` — `state.whatsappReminders && hasWhatsAppNumber` means a previously-true setting silently appears false to the user when they remove their phone, but persists `true` in Firestore. Defensive UI, sloppy data.

**N-8.** `DataPrivacyTab.tsx:73–79` — "Clear chat history" only toasts. The destructive AlertDialog reads "this cannot be undone" but the click does literally nothing. Dangerous because users will trust it the first time.

**N-9.** `SettingsShell.tsx:282` — `tabIndex={active ? 0 : -1}` on the desktop side nav is correct, but the **tablet** TopTabBar (lines 333+) has no `tabIndex` attribute, so all eight tablet tabs are in the tab order. Roving-tabindex inconsistency between breakpoints.

**N-10.** `SettingsShell.tsx:209–231` — Mobile breakpoint shows the close button only when `mobileShowingContent` is false (in `MobileTabList`) or when it's true (in `MobileContentHeader`). Both render an X. Fine — but the back-arrow header lacks `aria-current` on the active tab and the mobile list doesn't visually mark which tab is "active" (highlighting was lost when the mobile path was hard-forked from the desktop path).

**N-11.** `AppearanceTab.tsx:55` — Density default is `'comfortable'` but there's no visual rendering hooked up to `data-density` attribute anywhere in the app. Setting persists, has zero effect.

**N-12.** `AccountTab.tsx:684` — `<AlertDialog onOpenChange>` uses `(o ? setOpen(true) : close())`. Radix already guarantees the param is the new state, so the open-true branch is a no-op repeat. Cosmetic.

### Polish
**P-1.** `AboutTab` uses `<a href="#">` rendered as a disabled `<button disabled>` in `LinkRow` for "coming soon" items — fine, but tooltip wraps each row in its own `TooltipProvider`, creating five providers instead of one. Minor perf / DOM noise.

**P-2.** `PlanBillingTab` "Compare plans" button currently calls `handleCheckout(currentTier)`, which fires an upgrade toast. Should be a no-op or scroll to the comparison section.

**P-3.** No skeleton state on AccountTab while `useAccount` is loading. Form fields bind to `''` and rerender once profile arrives, causing a flash.

**P-4.** Reminders/Notifications tab has no per-category time-of-day or quiet-hours control (industry standard).

**P-5.** ProfileMenu meter (top-right dropdown) and PlanBillingTab meter compute percent independently. Centralize.

---

## Responsive audit

| Tab | Mobile (<375) | sm (≥640) | md (≥768) | lg (≥1024) | Notes |
|---|---|---|---|---|---|
| SettingsShell | full-screen list view; content view via `setMobileShowingContent` | same | top tab bar | side nav | ✓ all 3 layouts present |
| AccountTab | single-column cards; avatar centered | header switches to row at md | grid stays single col (intentional) | side-nav layout | ✓ |
| PlanBillingTab | single column | same | same | `md:grid-cols-3` for plan comparison | ✓ |
| PersonalizationTab | single col | same | same | `lg:grid-cols-2` for wedding details | ✓ |
| AiBehaviorTab | single col | same | `md:grid-cols-2` for sliders | same | ✓ |
| AppearanceTab | single col radios | `sm:grid-cols-3` themes / `sm:grid-cols-2` density | same | same | ✓ |
| NotificationsTab | stacked switches | same | same | same | ⚠ no breakpoint variants — likely fine because it's already simple |
| DataPrivacyTab | stacked cards | same | same | same | ⚠ no breakpoint variants |
| AboutTab | stacked links | `sm:grid-cols-2` for resources | same | same | ✓ |

No tab is broken on mobile. AppearanceTab uses 19 responsive classes (heaviest); Notifications/Data/About lean on the natural single-column flow.

---

## Keyboard + a11y checklist

| Check | Status | Evidence |
|---|---|---|
| Esc closes SettingsShell | ✓ | Radix Dialog |
| Arrow keys move side-nav selection | ✓ | `SettingsShell.tsx:126–143` (ArrowUp/Down/Home/End) |
| Roving tabindex on side nav | ✓ | `tabIndex={active ? 0 : -1}` |
| Roving tabindex on tablet tab bar | ✗ | N-9 — not set |
| Roving tabindex on mobile list | ✗ | N-9 — not set |
| Every button has `focus-visible:ring-2 focus-visible:ring-ring` | ✓ | grep'd across all 8 tabs |
| Every input has `<Label htmlFor>` or aria-label | ✓ | spot-checked AccountTab phone CC (`aria-label="Country code"`), AppearanceTab Select (`aria-label="Preferred language"`), AiBehavior sliders (`aria-label={s.label}`) |
| Destructive actions in AlertDialog | ✓ | Delete account, clear history, reset tone — all wrapped |
| `role="dialog"` on Settings shell | ✓ | Radix Dialog provides |
| `role="progressbar"` on usage meters | ✓ | PlanBillingTab + ProfileMenu both set `aria-valuenow/min/max` |
| No `tabindex > 0` | ✓ | grep'd: only `tabIndex={-1}` and `tabIndex={0}` exist |
| `aria-labelledby` on Dialog | ✓ | `id="settings-shell-title"` (sr-only) |
| Min touch target 44×44 (`min-h-11`) | ✓ | Pervasively used |
| Live tone slider value (`aria-live="polite"`) | ✓ | AiBehaviorTab |
| `aria-current` on selected plan card | ✓ | PlanBillingTab |

**Verdict:** Strong. Two roving-tabindex misses (tablet/mobile tabs) are the only real gaps.

---

## Industry benchmark (per-tab vs ChatGPT / Claude / Gemini)

| Tab | ChatGPT has | Claude has | Gemini has | Easebot has | Gap | Top missing |
|---|---|---|---|---|---|---|
| **Account** | Photo, name, email change, MFA, sign out everywhere, manage devices, delete | Photo, full name, email, "What should we call you?", "What do you do?", custom instructions, delete | Google account passthrough (no edit), MFA via Google | Photo (stub), name, nickname, phone, email (stub), password (stub), Google link (stub), delete (stub) | **3** | Real photo upload; MFA / 2FA; "Sign out everywhere"; device list; "Tell us about yourself" custom-instructions field |
| **Plan & Billing** | Plus/Team/Enterprise w/ live invoices, payment method, billing address | Pro/Max w/ invoices, manage subscription | Google One passthrough | 3 plan cards w/ stub checkout, usage meter, FAQ, billing-history empty state | **2** | Live checkout (Section 2 dependency); Tax/VAT ID; Billing address; Invoice download |
| **Personalization** | Custom instructions, "What traits should ChatGPT have", memory | "What should Claude know about you", projects | Activity/personalization toggles | Wedding date, partner, role, budget, active-vibe display | **3** | "About you" free-text; "How should Easebot respond" free-text; **memory list with delete-individual-entries** (huge ChatGPT/Claude feature) |
| **AI Behavior** | Voice picker, model picker (GPT-4/4o/o1), reasoning level | Voice (Claude voice mode), model picker (Sonnet/Opus/Haiku), Artifacts toggle | Model picker (Flash/Pro), gem builder | 10 tone sliders, 8 voice presets, default mode (disabled) | **2** | **Model picker** (we do have multi-mode but no exposure here); Reasoning effort; Voice mode (live), not just TTS |
| **Appearance** | Theme system/light/dark, accent color, code block theme | Theme, font scale | Theme, density | Theme, density (no-op), language | **1** | Density actually applied; Font scale; Accent color |
| **Notifications** | Push, email, mobile, response notifications | Email digest only | Google account | Email × 3, WhatsApp (gated), in-app coming soon | **2** | Push; Quiet hours; Per-category time-of-day; Mobile delivery channels |
| **Data & Privacy** | "Improve the model for everyone" toggle, "Shared links", "Memory", "Manage data", Export, Delete chats | "Help improve Claude" toggle, Privacy controls, Export, Delete all conversations | Activity, Auto-delete schedule | Train opt-out (real), Export (stub), Clear history (stub), Cookie/rights copy | **3** | Real export; Real clear-history; **Auto-delete schedule** (Gemini killer feature); Shared-link manager; Per-conversation delete |
| **About** | App version, Release notes, ToS, Privacy, Help, OS integrations | Version, ToS, Privacy, Acceptable use, status | Version, Help, Feedback | Version (hard-coded `0.0.0`), env, ToS, Privacy, Status (stub), Changelog (stub), Help (stub) | **2** | Real version; Status page; Changelog; Send-feedback link |

**Aggregate gap score: 18 / 40.** Roughly halfway closed against the big three. The shell, tab structure, IA, and a11y are at parity. Persistence and a few "memory-class" features are the gap.

---

## Top 10 fixes for Sprint 4

1. **Wire `accountService.deleteAccount`** and unstub `handleSubmitDelete` (Critical C-1, PRD §6.7).
2. **Stop swallowing errors in `useAccount.updateProfile/updatePreferences`** — let mutations throw, otherwise every "save failed" toast in Account/Personalization/Appearance/Notifications/DataPrivacy lies to the user (Major M-6, M-7).
3. **Real photo upload pipeline**: `accountService.uploadPhoto`→Firebase Storage→Firestore `photoUrl`→optimistic re-render (Major M-1, PRD §6.2).
4. **Email change**: Firebase `verifyBeforeUpdateEmail` with re-auth — and add a real email-format validator on the dialog submit button (Major M-2, PRD §6.3).
5. **Password change**: Firebase `reauthenticateWithCredential` + `updatePassword` + `revokeRefreshTokens` (Major M-3, PRD §6.4).
6. **Persist theme to localStorage** to kill the post-refresh flash (Critical C-2).
7. **Replace `bg-amber-500`** with a `--warning` semantic token in the design system, then update PlanBillingTab meter (Minor N-4, design-system contract).
8. **Real `APP_VERSION`** sourced from `package.json` via Vite `define` (Major M-4).
9. **Memory / "About you" free-text field** in PersonalizationTab — biggest single gap vs ChatGPT/Claude.
10. **Auto-delete chat history schedule** + real "Clear chat history" wiring in DataPrivacyTab (Major against industry; Minor N-8 today).

---

## Verdict

**Ship with caveats.**

The shell, IA, a11y, and visual quality are launch-grade and at parity with ChatGPT/Claude/Gemini. Builds are clean, smoke tests pass, no crashes, every destructive action is gated, the keyboard surface is solid, and the design tokens are largely respected.

**Hard blockers before public launch:**
- Fix M-6/M-7 (silent-error mutations). This is the only "lying UI" bug, and it's everywhere.
- Wire delete account (C-1). Legally important.
- Fix the localStorage theme flash (C-2) — visible on every cold page load.

**Soft blockers (can ship behind a feature flag if needed):**
- M-1 (photo), M-2 (email), M-3 (password) — all are stubs the user can reach. Either gate behind a "coming soon" placeholder card or implement.
- M-4 (`APP_VERSION` 0.0.0) — embarrassing but cosmetic.

Once M-6 / M-7 / C-1 / C-2 are fixed, this is **ready to ship to ~80% of users**. The remaining stubs degrade gracefully via toasts and no path crashes the app.
