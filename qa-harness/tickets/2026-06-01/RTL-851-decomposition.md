# RTL Decomposition — WE-20260528-851

> **Parent ticket:** [`WE-20260528-851`](../2026-05-28/WE-20260528-851.md) — "No i18n / RTL infrastructure — flipping `dir="rtl"` breaks every page."
> **Decomposed by:** fix-frontend (source audit) on `2026-06-01`.
> **Repo:** `Wedding-Ease-Viva-Chat`.

---

## ⚠️ BUILD IS DEFERRED — GTM confirmation required before any code

**This document is a planning artifact only.** No build, no code, no PR has been produced.
**Do NOT start any of the child tickets below until the GTM/chairman explicitly confirms the
UAE/Saudi (AED-region) launch.** RTL is a multi-area refactor (~900+ physical-direction class
touch-points across the app); starting speculatively risks churn and merge conflicts against the
55+ in-flight QA fix branches. Each child ticket is written to be **shovel-ready**: when GTM
confirms, a fix agent can pick up any single ticket and ship it in isolation.

---

## Audit summary (current state, verified `2026-06-01`)

Source scan of `Wedding-Ease-Viva-Chat/src`:

| Signal | Result |
|---|---|
| `<html>` `dir` attribute | **absent** (`index.html:2` is `<html lang="en">`, hard-coded, no `dir`) |
| Genuine `dir=` attribute usage in JSX | **0** matches |
| `rtl:` / `ltr:` Tailwind variants | **0** matches |
| Genuine logical Tailwind classes (`ps-/pe-/ms-/me-/start-/end-/border-s/border-e/rounded-s/rounded-e`) | **4** (incidental — e.g. `Index.tsx:1599 sm:ps-6`; not a deliberate RTL pattern) |
| `tailwindcss-rtl` / logical-property plugin | **not installed** (no `rtl`/`logical` reference in `tailwind.config.*`) |
| Physical-direction classes app-wide (`pl-/pr-/ml-/mr-/left-/right-/border-l/border-r/rounded-l/rounded-r/text-left/text-right/-left-/-right-`), **excluding** `src/components/ui/` | **451** |
| Same, in `src/components/ui/` shadcn primitives | **139** |
| **Grand total physical-direction touch-points** | **≈590** |
| Directional lucide icons used in app code (`ChevronLeft/Right`, `ArrowLeft/Right`, `Send`, `PanelLeft`, `MoveLeft/Right`) | spread across ~30 files |

**Key nuance — there is already a "language" control, but it is NOT a direction control.**
`src/components/chat/constants.ts:9` defines `SUPPORTED_LANGUAGES` including **`{ code: 'ar', label: 'Arabic' }`**.
`ChatHeader.tsx` exposes a Globe-icon dropdown (`MobileLanguageSelector` + desktop variant) wired through
`Index.tsx` (`preferredLang` state, `onLanguageChange` → `setPreferredLang`, line ~481). But `preferredLang`
is consumed **only** as `langHint` for the **AI response language** (`Index.tsx:355`) and TTS playback
(`Index.tsx:748`). It does **not** touch `document.documentElement.dir`. **Net effect today: an Arabic
user gets Arabic response *text* laid out in an LTR shell** — backward chevrons, left-anchored sidebar,
right-anchored close-X. That gap is what the parent ticket describes.

---

## Effort signal — physical-direction classes per area

Counts below are physical-direction touch-points per area (the primary effort driver). Icon-flip and
animation-flip work is called out per ticket separately.

| Area | Physical-class count | Notes |
|---|---:|---|
| Notes feature (`components/notes/`) | 119 | Largest single surface; editor toolbar + sidebars |
| Auth modals (`components/auth/`) | 67 | SignIn/SignUp + PhoneInput |
| Chat shell (`components/chat/`) | 58 | Header, input, messages, sidebar |
| Lists/dashboards (budget, timeline, shopping, checklist, saved, reminders, planner, progress) | 63 | Many small files |
| Top-level pages + ProfileMenu (`Index.tsx`, `Login`, `Help`, `ProfileMenu`) | 43 | App scaffolding |
| Settings (`pages/settings/` + `SettingsModal.tsx`) | 35 | Tabbed shell + back/close affordances |
| Images/Gallery (`GalleryView`, `ImageCarousel`, `ImageActions`, `images/`) | 33 | Lightbox prev/next chevrons |
| Pricing/Checkout/Billing | 9 | Lowest |
| shadcn UI primitives (`components/ui/`) | 139 | Shared infra — Dialog/Sheet/Drawer/Sidebar/Carousel |

---

## Child tickets (shovel-ready, one area each)

> Suggested execution order is **RTL-INFRA first** (everything depends on it), then **RTL-UI-PRIMITIVES**
> (shared infra), then per-feature areas in roughly P0→P2 priority. Each ticket is independently
> shippable once RTL-INFRA lands.

---

### RTL-INFRA-001 — Direction plumbing + language→dir wiring (FOUNDATION, do first)

**Scope**
- `index.html:2` — add a default `dir="ltr"` to `<html>` and a render-time/boot script (or in `App.tsx`)
  that sets `document.documentElement.dir` from profile language / `Accept-Language`.
- Introduce a single source of truth for "is this language RTL?" (`ar`, `he`, `fa`, `ur`). Today only
  `ar` is in `SUPPORTED_LANGUAGES`; keep the set extensible.
- Wire the **existing** `preferredLang` flow (`Index.tsx` `setPreferredLang`, `onLanguageChange`) so that
  selecting an RTL language ALSO flips `document.documentElement.dir`. Decide: does `preferredLang` (AI
  response language) drive UI direction, or is UI direction a separate profile field? **Recommendation:**
  derive UI `dir` from the chosen UI/response language for v1; revisit if a separate UI-locale is added.
- Add the Tailwind logical-property capability: enable `rtl:`/`ltr:` variants and/or adopt logical
  utilities. **No new runtime dependency preferred** — Tailwind's built-in `rtl:`/`ltr:` modifiers +
  logical utilities (`ps-/pe-/ms-/me-/start-/end-`) cover this with zero deps. If a plugin is truly
  needed, `--save-dev` only.

**Files**
- `index.html`
- `src/App.tsx` (or a new `src/hooks/useDocumentDir.ts`)
- `src/pages/Index.tsx` (`preferredLang` / `handleLanguageChange` wiring, ~lines 167, 252, 481)
- `src/components/chat/constants.ts` (`SUPPORTED_LANGUAGES` — flag which codes are RTL)
- `tailwind.config.ts` (confirm `rtl:`/`ltr:` available; no plugin unless unavoidable)

**Acceptance criteria**
- Selecting Arabic from the Globe language dropdown sets `document.documentElement.dir = 'rtl'` and
  `lang = 'ar'`; selecting a LTR language restores `dir = 'ltr'`.
- A reusable helper (`isRtlLang(code)` or equivalent) exists and is unit-tested.
- No visual regression in LTR (default) mode — this ticket adds plumbing only, no layout class changes.
- `npx tsc --noEmit` clean.

**Physical-class count:** N/A (plumbing). **Blocks:** all other RTL tickets.

---

### RTL-UI-PRIMITIVES-002 — shadcn primitives: Dialog / Sheet / Drawer / Sidebar / Carousel direction-awareness

**Scope** Shared Radix-based primitives whose slide/anchor direction and close-affordance are physically
pinned. Fixing these once fixes direction for every consumer.
- `dialog.tsx:39` — `slide-in-from-left-1/2` / `slide-out-to-left-1/2` (symmetry-axis dependent) and
  `dialog.tsx:45` close-`X` at `absolute right-4` → must move to start in RTL.
- `sheet.tsx:36-41` — `left`/`right` side variants + `slide-in-from-left/right`; close-`X` at `right-4`.
- `drawer.tsx:44` — `inset-x-0` bottom drawer (mostly OK) — verify handle/affordances.
- `ui/sidebar.tsx` — `side="left"|"right"`, `left-0`/`right-0`, `border-r`/`border-l`,
  `group-data-[side=right]:rotate-180` (lines ~228, 236-243, 302-307, 462, 608) — used by Notes.
- `carousel.tsx`, `pagination.tsx`, `breadcrumb.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`,
  `menubar.tsx`, `calendar.tsx` — directional chevrons / physical offsets.

**Files** `src/components/ui/{dialog,sheet,drawer,sidebar,carousel,pagination,breadcrumb,context-menu,dropdown-menu,menubar,calendar}.tsx`

**Acceptance criteria**
- In RTL, Dialog/Sheet close-`X` renders at the **start** (visual left becomes logical end → X at top-left
  for RTL).
- Sheet/Sidebar slide-from direction mirrors in RTL.
- Built-in directional chevrons (carousel prev/next, pagination) point correctly for RTL reading order.
- LTR behavior byte-for-byte unchanged.

**Physical-class count:** 139 (shared infra). **Depends on:** RTL-INFRA-001.

---

### RTL-CHAT-003 — Chat shell (header, input, messages, sidebar)

**Scope**
- `ChatSidebar.tsx` — `aside` is `fixed left-0` (line 311); the open/close trigger and slide direction
  must mirror to the start edge in RTL so the sidebar no longer covers its own trigger. Plus
  `text-left`, `absolute right-2`, `absolute left-6` (search icon) physical offsets.
- `ChatInput.tsx` — `Send` icon (line ~480) needs `rtl:rotate-180` / direction-aware mirroring;
  mode-dropdown `ChevronDown ... rotate-180` (lines 191, 427) is symmetry-axis dependent; `pl-2 pr-1`
  trigger padding (line 209) and `pr-0.5` (line 416) → logical.
- `ChatMessages.tsx` — message-bubble alignment (assistant vs user) currently physical; in RTL the
  user/assistant sides should mirror. Add/confirm `dir="auto"` on bubble + textarea (parent ticket notes
  this overlaps `-210`; coordinate to avoid double-fix).
- `ChatHeader.tsx`, `AttachmentPicker.tsx`, `MessageAttachmentChips.tsx`, `constants.ts` physical offsets.

**Files** `src/components/chat/{ChatSidebar,ChatInput,ChatMessages,ChatHeader,AttachmentPicker,MessageAttachmentChips,constants}.tsx`

**Acceptance criteria**
- At `/chat` with `dir="rtl"`: sidebar slides from the start edge and does not overlap its trigger;
  Send icon mirrors; mode-dropdown chevron lands in the correct corner; message bubbles mirror so
  assistant/user sit on the reading-correct sides.
- LTR unchanged.

**Physical-class count:** 58. **Depends on:** RTL-INFRA-001, RTL-UI-PRIMITIVES-002 (dropdown).
**Priority:** P0 within RTL set (primary surface).

---

### RTL-ICONS-004 — App-wide directional icon mirroring (cross-cutting sweep)

**Scope** Make directional lucide icons direction-aware everywhere they convey navigation/reading
direction (NOT icons where the glyph is meaning-fixed, e.g. a "Send" paper-plane may or may not mirror —
decide per icon). Establish a convention: `className="rtl:rotate-180"` for chevrons/arrows, or a small
wrapper that swaps `ChevronLeft`↔`ChevronRight` based on `dir`.
- `ImageCarousel.tsx:113,119,268,274` — lightbox prev/next chevrons.
- `GalleryView.tsx:221,231` — lightbox prev/next chevrons.
- `SettingsShell.tsx` — `ArrowLeft` back button (line 31).
- `notes/NoteHeader.tsx`, `notes/NotesSidebar.tsx`, `notes/NoteCommentsSidebar.tsx` — directional chevrons/arrows.
- `auth/SignInModal.tsx`, `auth/SignUpModal.tsx` — back/`ArrowLeft`.
- `ShoppingListView.tsx`, `ProgressDashboard.tsx`, `BudgetDashboard.tsx`, `InvitePartner.tsx`,
  `FeedbackDialog.tsx`, `UpgradeFlow.tsx`, `Login.tsx`, `Help.tsx`, `Checkout.tsx`, `Pricing.tsx`,
  `SharedChat.tsx`, `Index.tsx` — audit each `ChevronLeft/Right`, `ArrowLeft/Right`, `PanelLeft`.

**Files** ~30 files (see audit). Cross-cutting — coordinate with per-area tickets to avoid touching the
same icon twice; **recommendation:** land the convention/helper here, apply per-area in the area tickets,
or do the whole sweep in this ticket and have area tickets assume icons are done.

**Acceptance criteria**
- In RTL, navigational chevrons/arrows point in the reading-correct direction (prev = end side, next =
  start side per RTL convention) at: gallery lightbox, image carousel, settings back, auth back, notes nav.
- Keyboard `ArrowLeft`/`ArrowRight` handlers (e.g. `ImageCarousel.tsx:61-62`, `GalleryView.tsx:72-73`)
  reviewed: decide whether physical arrow keys should swap meaning in RTL (recommend: keep physical key →
  physical movement, but ensure it matches the now-mirrored visual order).
- LTR unchanged.

**Physical-class count:** N/A (icon-focused). **Depends on:** RTL-INFRA-001.
**Priority:** P0 within RTL set (most visible breakage per parent ticket).

---

### RTL-SETTINGS-005 — Settings shell + tabs

**Scope** `pages/settings/SettingsShell.tsx` (tab nav, `ArrowLeft` back, close-`X`, `ArrowLeft/Right`
keyboard tab nav at lines 187-194 — confirm horizontal nav direction in RTL) and all
`pages/settings/tabs/*` + legacy `SettingsModal.tsx` physical offsets.

**Files** `src/pages/settings/SettingsShell.tsx`, `src/pages/settings/tabs/{Account,Personalization,AiBehavior,About,DataPrivacy,Appearance}Tab.tsx`, `src/components/SettingsModal.tsx`

**Acceptance criteria** Settings dialog close-`X` and back-arrow at the start edge in RTL; tab keyboard
nav (`ArrowLeft`/`ArrowRight`) moves in reading-correct direction; tab content padding mirrors. LTR unchanged.

**Physical-class count:** 35. **Depends on:** RTL-INFRA-001, RTL-UI-PRIMITIVES-002, RTL-ICONS-004.

---

### RTL-DRAWER-006 — Mobile drawer / sheet slide-direction polish (consumer side)

**Scope** Audit every Drawer/Sheet **invocation** (which `side` is passed, slide-from animation) after
RTL-UI-PRIMITIVES-002 makes the primitives direction-aware — ensure consumers don't hard-pin `side="left"`
where it should be logical. Includes mobile nav, mobile language selector popover anchoring, notes sidebars
on mobile.

**Files** consumers of `ui/sheet.tsx` / `ui/drawer.tsx` / `ui/sidebar.tsx` (e.g. `notes/NotesSidebar.tsx`,
`notes/NoteCommentsSidebar.tsx`, mobile nav in `Index.tsx`).

**Acceptance criteria** In RTL on mobile, drawers/sheets slide from the reading-correct edge; no element
covers its own trigger; popovers anchor to the correct side. LTR unchanged.

**Physical-class count:** counted within consuming areas. **Depends on:** RTL-INFRA-001, RTL-UI-PRIMITIVES-002.

---

### RTL-NOTES-007 — Notes feature (largest surface)

**Scope** `components/notes/*` — editor, toolbars (`toolbar/*`), sidebars (`NotesSidebar`,
`NoteCommentsSidebar`), headers (`NoteHeader`, `NotesTopbar`), dialogs. Rich-text editor direction
handling needs extra care (caret/selection, list bullets, blockquote bars use `border-l`).

**Files** `src/components/notes/**`

**Acceptance criteria** Notes list, editor, comment sidebar, and toolbars lay out RTL-correctly;
blockquote/list indent uses logical borders; editor content respects `dir`. LTR unchanged.

**Physical-class count:** 119 (largest). **Depends on:** RTL-INFRA-001, RTL-UI-PRIMITIVES-002, RTL-ICONS-004.
**Note:** Notes is a distinct GTM track (per Notes GTM sprint memory) — confirm Notes is in scope for the
UAE/Saudi launch before scheduling; may be deferrable independently.

---

### RTL-AUTH-008 — Auth modals (SignIn / SignUp / PhoneInput)

**Scope** `components/auth/SignInModal.tsx` (67 physical classes across the dir), `SignUpModal.tsx`,
`PhoneInput.tsx` (country-code prefix is direction-sensitive — phone numbers stay LTR even in RTL UI;
use `dir="ltr"` on the number field while the label/layout mirrors).

**Files** `src/components/auth/{SignInModal,SignUpModal,PhoneInput}.tsx`

**Acceptance criteria** Auth modals mirror in RTL; **phone number input remains LTR** (numerals/`+code`)
inside an RTL layout; back-arrow at start edge. LTR unchanged.

**Physical-class count:** 67. **Depends on:** RTL-INFRA-001, RTL-UI-PRIMITIVES-002, RTL-ICONS-004.

---

### RTL-LISTS-009 — Planner / Budget / Timeline / Shopping / Checklist / Saved / Reminders / Progress

**Scope** The data-view family. Each has progress bars (`left-`/`right-` fills), category rows with
leading icons (`mr-`/`ml-`), and status dots that should mirror. `TimelineView` countdown and monthly
group headers; `BudgetDashboard` color-coded progress fills.

**Files** `src/components/{BudgetDashboard,TimelineView,ShoppingListView,ChecklistDetail,SavedItemsView,RemindersView,PlannerView,ProgressDashboard,ImageActions}.tsx`

**Acceptance criteria** Progress fills grow from the start edge in RTL; leading icons/labels mirror;
numeric/currency values use locale-correct formatting (coordinate with `utils/currencyFormat.ts`). LTR unchanged.

**Physical-class count:** ~63 (+ ImageActions 10). **Depends on:** RTL-INFRA-001, RTL-ICONS-004.

---

### RTL-IMAGES-010 — Gallery / Carousel / Vibe composer

**Scope** `GalleryView.tsx` (grid + lightbox prev/next + zoom controls), `ImageCarousel.tsx` (prev/next
chevrons, thumbnail strip direction), `images/VibeComposer.tsx`, `VibeDNAStrip.tsx`, `VibeCard.tsx`.
Image grids themselves are usually direction-neutral; focus is on the lightbox controls and thumbnail
scroll direction.

**Files** `src/components/GalleryView.tsx`, `src/components/ImageCarousel.tsx`, `src/components/images/*`

**Acceptance criteria** Lightbox prev/next and thumbnail strip scroll in reading-correct direction in RTL
(coordinate with RTL-ICONS-004 for the chevrons). LTR unchanged.

**Physical-class count:** 33. **Depends on:** RTL-INFRA-001, RTL-ICONS-004.

---

### RTL-PRICING-011 — Pricing / Checkout / Billing / ComparisonTable

**Scope** Lowest physical-class surface. `pages/Pricing.tsx`, `pages/Checkout.tsx`,
`components/pricing/*`, `components/billing/*`, `components/ComparisonTable.tsx`. Comparison table
column order and check/cross alignment, price label alignment.
**Pricing guardrail:** per pricing-rollout memory, do NOT change any price values, tiers, or locked
decisions — this ticket is **layout/direction only**.

**Files** `src/pages/{Pricing,Checkout}.tsx`, `src/components/pricing/*`, `src/components/billing/*`, `src/components/ComparisonTable.tsx`

**Acceptance criteria** Pricing cards, comparison table, and checkout form mirror correctly in RTL;
prices/numerals stay LTR; **no pricing data changed**. LTR unchanged.

**Physical-class count:** 9. **Depends on:** RTL-INFRA-001.

---

### RTL-SHELL-012 — App scaffolding: Index layout, ProfileMenu, Login, Help, top-level pages

**Scope** `pages/Index.tsx` (19 physical classes — the main orchestrator layout, view-switch panel,
mobile language selector anchoring), `components/ProfileMenu.tsx` (12), `pages/Login.tsx`,
`pages/Help.tsx`, `pages/SharedChat.tsx`, `pages/{PrivacyPolicy,TermsOfService}.tsx`, floaters
(`WeddingEaseFloater`, `FeedbackButton`), `NotificationPanel`.

**Files** `src/pages/{Index,Login,Help,SharedChat,PrivacyPolicy,TermsOfService}.tsx`, `src/components/{ProfileMenu,WeddingEaseFloater,FeedbackButton,NotificationPanel,AnalyticsConsent}.tsx`

**Acceptance criteria** App shell, profile menu anchoring, floaters, and notification panel mirror in RTL.
LTR unchanged.

**Physical-class count:** ~43. **Depends on:** RTL-INFRA-001, RTL-UI-PRIMITIVES-002, RTL-ICONS-004.

---

### RTL-LANGSWITCH-013 — Promote response-language control to UI-direction control + add a true language switcher (optional / product decision)

**Scope** Today the Globe dropdown sets **response language only** (`preferredLang` → `langHint`, TTS).
This ticket covers the **product/UX decision**: should the existing control also be the UI-locale control,
or do we add a distinct UI-language switcher? Includes persisting the choice to profile
(`preferredLanguage` already exists in `types/index.ts` / migrations) and ensuring first-paint direction
(SSR/boot) matches the persisted choice so RTL users don't see an LTR flash.

**Files** `src/components/chat/ChatHeader.tsx` (Globe dropdown), `src/pages/Index.tsx`,
`src/components/chat/constants.ts`, profile/migration code as needed.

**Acceptance criteria** Product decision documented; the chosen control drives both response language and
(for RTL locales) `document.documentElement.dir`; choice persists across reload with no LTR→RTL flash.
LTR unchanged for LTR locales.

**Physical-class count:** N/A. **Depends on:** RTL-INFRA-001. **Status:** needs product input.

---

## Suggested execution order

1. **RTL-INFRA-001** (foundation — unblocks everything)
2. **RTL-UI-PRIMITIVES-002** (shared infra — unblocks dialog/sheet/drawer/dropdown consumers)
3. **RTL-ICONS-004** (cross-cutting convention + sweep)
4. **RTL-CHAT-003** (primary surface, P0)
5. **RTL-SETTINGS-005**, **RTL-DRAWER-006**, **RTL-SHELL-012** (core app)
6. **RTL-AUTH-008**, **RTL-LISTS-009**, **RTL-IMAGES-010** (feature areas)
7. **RTL-PRICING-011** (smallest)
8. **RTL-NOTES-007** (largest; confirm Notes is in launch scope first)
9. **RTL-LANGSWITCH-013** (product decision; can run in parallel after INFRA)

## Cross-cutting acceptance gates (every child ticket)

- LTR (default) layout must be **byte-for-byte unchanged** — RTL work is additive (`rtl:` variants /
  logical utilities), never destructive to LTR.
- `npx tsc --noEmit` clean; lint clean; affected component tests pass.
- Visual evidence at mobile/tablet/desktop in **both** `dir="ltr"` and `dir="rtl"`.
- Numerals, phone numbers, currency, and code/URLs stay LTR even inside RTL layout.
- Zero new runtime dependencies (Tailwind built-in `rtl:`/`ltr:` + logical utilities suffice). Any
  dev-only tooling via `--save-dev` only.

---

_Decomposition produced by source audit on `2026-06-01`. **No code written. No PR opened. BUILD DEFERRED
pending GTM confirmation of the UAE/Saudi launch.**_
