# Theme Migration Execution Plan

**Goal:** convert every hardcoded color / shadow / gradient / border in `Wedding-Ease-Viva-Chat/` to semantic theme tokens (CSS variables + Tailwind theme classes), so a future light/dark toggle flips the whole app by swapping one class.

**Hard constraint:** the current visual look & feel must not change by a single pixel. This is a pure refactor — raw values → semantic tokens that resolve back to the same raw values today.

---

## 1. Scope Summary (from audit)

| Category | Count | Notes |
|---|---|---|
| Hex literals (`#XXXXXX`) | ~750 | `#A17A63` alone = 111 uses |
| Tailwind arbitrary values (`bg-[#...]`, `text-[#...]`, `shadow-[...]`) | ~135 | Don't respond to CSS vars |
| `rgba()/rgb()/hsl()` in TS/CSS | ~80 | Mostly in `index.css` utilities + NoteEditor |
| Named palette (`bg-pink-500`, `bg-amber-500`, etc.) | ~90 | Status/category colors |
| Arbitrary shadows | ~50 | Modal elevation duplicated 7× |
| Gradients (arbitrary + keyframe) | ~200 | VibePresets + hero backgrounds |

**Top 10 files** = ~80% of the work:
`src/data/vibePresets.ts`, `src/index.css`, `src/pages/Index.tsx`, `src/components/notes/toolbar/FloatingToolbar.tsx`, `src/components/chat/ChatMessages.tsx`, `src/components/SettingsModal.tsx`, `src/components/chat/ChatInput.tsx`, `src/pages/settings/SettingsShell.tsx`, `src/components/TimelineView.tsx`, `src/components/ui/dialog.tsx`.

**Existing foundation (already good):** `tailwind.config.ts` has `darkMode: ["class"]`, `index.css` has a `:root` + `.dark` skeleton, shadcn/ui is wired. We extend — we don't rebuild.

---

## 2. Phase 0 — Token System Design (1 dev-day, no UI changes)

Define the full semantic token set **before** touching any component. Files touched: only `src/index.css` and `tailwind.config.ts`.

### 2.1 Token taxonomy

```
Surface      --surface-0       page background
             --surface-1       card / panel
             --surface-2       elevated card / popover
             --surface-glass   translucent glass panel
             --surface-scrim   modal backdrop

Brand        --brand           #A17A63 (bronze)   ← replaces 111 uses
             --brand-hover
             --brand-muted     #8A6651
             --brand-soft      tinted bg for chips
             --brand-on        foreground on brand

Accent       --accent-rose     #D6C1C7
             --accent-orange   #D07A46 (sidebar)
             --accent-cocoa    #603B25

Content      --fg              primary text
             --fg-muted        secondary text
             --fg-subtle       tertiary / placeholder
             --fg-on-brand

Border       --border          default 1px strokes
             --border-strong
             --border-subtle   hairline on glass

Status       --success / --warning / --danger / --info  + `-soft` + `-on` variants

Category     --cat-budget  (amber)
             --cat-timeline (pink)
             --cat-milestone (purple)
             --cat-planner (orange)
             --cat-stylist, --cat-knowledge, --cat-auto

Shadow       --shadow-sm / --shadow-md / --shadow-lg / --shadow-modal / --shadow-dropdown / --shadow-glow-brand

Gradient     --grad-hero / --grad-sidebar / --grad-brand-bloom / --grad-accent-soft
```

All tokens defined as HSL triplets (`161 22% 51%`) so Tailwind's `hsl(var(--brand) / <alpha-value>)` pattern + opacity modifiers keep working.

### 2.2 Tailwind wiring

In `tailwind.config.ts`:

- Replace the 5 hardcoded brand/mode hex values (lines 20–123) with `hsl(var(--brand))` etc.
- Add `boxShadow: { modal: 'var(--shadow-modal)', dropdown: 'var(--shadow-dropdown)', ... }`
- Add `backgroundImage: { 'grad-hero': 'var(--grad-hero)', ... }`
- Add category colors under `colors.cat.*`

### 2.3 Dark palette

Fill `.dark { ... }` in `index.css` with a real dark set (can be refined later — correctness matters more than polish here). Light stays identical to today.

### 2.4 Deliverables of Phase 0

- Updated `src/index.css` with full token set + real `.dark` block
- Updated `tailwind.config.ts` with boxShadow / backgroundImage / cat.* extensions
- **No visual change.** Verify by running dev server against `main` and comparing.

---

## 3. Phase 1 — Baseline QA Sprint (capture reference screenshots)

Run this **before** any component migration. These are the golden references; every later change must match them pixel-for-pixel.

### 3.1 Viewports

- **Laptop:** 1440×900 (primary), 1920×1080 (wide check)
- **Mobile:** 390×844 (iPhone 14), 360×800 (Android)

### 3.2 Screenshot matrix

**Pages (21 routes)** — each captured on all 2 desktop + 2 mobile = 4 shots:

| Route | Notes / extra states |
|---|---|
| `/login` | empty, typing, error |
| `/` (signed-out) | guest landing state |
| `/` (signed-in) | empty chat, after 1st message, with image, with audio |
| `/chat/:threadId` | loaded thread, long thread (scrolled) |
| `/:userId/gallery` | empty, with images |
| `/:userId/images` | hub view |
| `/:userId/planner` | empty, with checklists |
| `/:userId/planner/:checklistId` | open checklist, item expanded |
| `/:userId/liked` | empty, populated |
| `/:userId/reminders` | empty, populated, overdue state |
| `/:userId/budget` | empty, with line items |
| `/:userId/shopping` | empty, populated |
| `/:userId/saved-items` | empty, populated |
| `/:userId/timeline` | empty, with events, status variants (pending / done / overdue) |
| `/:userId/progress` | 0%, 50%, 100% states |
| `/:userId/notifications` | empty, with unread |
| `/:userId/collaborate` | no partner, partner invited, partner active |
| `/:userId/notes` | empty, populated |
| `/:userId/notes/:noteId` | empty note, rich content, selection → floating toolbar visible |
| `/share/:shareId` | public chat view |
| `/shared/note/:shareId` | public note view |
| `/terms`, `/privacy`, `/help`, `/pricing` | static |
| `/checkout` | tier selection, payment entry, processing |
| `/payment/success`, `/payment/failure` | end states |
| `*` | 404 |

**Modals (9 components) × state variants:**

| Modal | States to capture |
|---|---|
| `SignInModal` | empty, typing, invalid, loading, error |
| `SignUpModal` | empty, typing, phone step, OTP step, error |
| `PhoneInput` | empty, valid, invalid |
| `FeedbackDialog` | empty, filled, submitted |
| `SettingsModal` | each tab (Account, AI, Data, Plan/Billing, Appearance), density toggle on/off |
| `CheckoutModal` | free→paid selection, processing, success, error |
| `NoteShareDialog` | copy link, email step, permissions toggle |
| `NoteTemplateDialog` | template list, selected |
| `ProfileMenu` (dropdown) | open, hover states |

**Cross-cutting UI states:**
- Toasts: success, error, info, loading
- Dropdown menus: open on desktop + mobile
- Tooltips: visible
- Hover states on interactive cards (gallery tile, planner item, timeline event)
- Focus rings (tab through inputs)
- Scrollbar appearance (desktop custom bronze scrollbar)

### 3.3 Baseline QA deliverables

- Organized screenshot folder: `qa/baseline/<route-or-modal>/<viewport>/<state>.png`
- Naming convention strict — same names reused in Phase 3 for diffing
- Tools: Playwright or manual (Playwright preferred for reproducibility)

**Estimate:** ~220 screenshots. 1 dev-day with Playwright, 2 dev-days manual.

---

## 4. Phase 2 — Migration Sprints

Ordered by blast radius: start with shared primitives (fixing one file cascades to many screens), finish with leaf pages.

Every sprint ends with: dev server smoke test + re-screenshot the sprint's scope + visual diff vs baseline. Stop-the-line on any mismatch.

### Sprint A — Global primitives & shadcn/ui (1–2 dev-days)

**Files:** `src/index.css` utility classes (`.glass-panel`, `.glass-sidebar`, `.custom-scrollbar`, `.gradient-bg`, `.bot-avatar`, etc.); all 52 files in `src/components/ui/`.

**Work:**
- Replace arbitrary shadows in `ui/dialog.tsx`, `ui/dropdown-menu.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx`, `ui/popover.tsx`, `ui/hover-card.tsx`, `ui/context-menu.tsx` with `shadow-modal` / `shadow-dropdown`.
- Replace rgba() inside `.glass-*` utilities with `hsl(var(--surface-glass) / 0.03)` style.
- Replace keyframe rgba values (`pulse-glow`, `avatar-shimmer`, `gradient-*`) with `hsl(var(--brand) / 0.2)` patterns.
- Convert `ui/slider.tsx` bronze thumb to `bg-brand`.

**Why first:** fixing `dialog.tsx` alone propagates the correct shadow to 7+ modals without touching them individually.

### Sprint B — Chat subsystem (1.5 dev-days)

**Files:** `src/components/chat/*` (ChatMessages, ChatInput, ChatSidebar, ChatHeader, AttachmentPicker, MessageAttachmentChips, constants.ts), `src/components/AudioPlayer.tsx`, `src/components/ImageActions.tsx`.

**Work:**
- `text-[#A17A63]` → `text-brand` (≈70 replacements)
- `bg-[#0F0D0C]/90` → `bg-surface-2/90`
- Mode category colors in `constants.ts` → `cat.*` tokens
- Custom scrollbars → utility class using brand token

### Sprint C — Notes subsystem (1 dev-day)

**Files:** `src/components/notes/**/*`, including `FloatingToolbar.tsx` (20 hex colors), `NoteEditor.tsx` (16 rgba), `NotesSidebar.tsx`, `NoteShareDialog.tsx`, `NoteTemplateDialog.tsx`.

**Work:**
- FloatingToolbar bronze accents → `brand` tokens
- NoteEditor rgba() for rich-text styling → `surface-glass` tokens
- Rich-text prose styling via Tailwind typography plugin + theme-aware overrides

### Sprint D — Shell pages (1.5 dev-days)

**Files:** `src/pages/Index.tsx`, `src/pages/settings/SettingsShell.tsx` + 5 tabs, `src/pages/Login.tsx`, `src/pages/Pricing.tsx`, `src/pages/Checkout.tsx`, `src/pages/Payment{Success,Failure}.tsx`, `src/components/SettingsModal.tsx`, `src/components/auth/SignInModal.tsx`, `src/components/auth/SignUpModal.tsx`, `src/components/auth/PhoneInput.tsx`.

Highest-visibility surfaces — do after the primitives are solid so nothing here needs re-work.

### Sprint E — Planning / Media / Business (1.5 dev-days)

**Files:** `TimelineView.tsx`, `PlannerView.tsx`, `RemindersView.tsx`, `ShoppingListView.tsx`, `BudgetDashboard.tsx`, `SavedItemsView.tsx`, `ProgressDashboard.tsx`, `ChecklistDetail.tsx`, `GalleryView.tsx`, `ImageCarousel.tsx`, all `components/images/*`, `components/billing/*`, `ProfileMenu.tsx`, `NotificationPanel.tsx`, `FeedbackDialog.tsx`, `InvitePartner.tsx`, `ComparisonTable.tsx`.

**Work:**
- Named-palette statuses (`bg-pink-500/15`, `bg-amber-500/15`, `bg-purple-500/15`) → `bg-cat-timeline/15`, `bg-cat-budget/15`, `bg-cat-milestone/15`.

### Sprint F — Data + legal + misc (0.5 dev-day)

**Files:** `src/data/vibePresets.ts` (78 colors), `src/utils/imageOptimization.ts`, `src/pages/Terms*.tsx`, `src/pages/Privacy*.tsx`, `src/pages/Help.tsx`, `src/pages/NotFound.tsx`, `src/pages/Shared*.tsx`.

**Note on `vibePresets.ts`:** these are creative content (gradient presets users pick from) — they are data, not theme. **Do not tokenize.** Leave as hex literals but document in a code comment that they are intentional content, not chrome. Exception confirmed by scope.

---

## 5. Phase 3 — Post-migration QA Sprint

Re-capture the **exact same matrix** from Phase 1 (same routes × viewports × states × naming).

**Diff workflow:**
1. Run `qa/baseline/` vs `qa/post-migration/` through a pixel-diff tool (`pixelmatch` / Playwright's `toHaveScreenshot`).
2. Acceptable diff threshold: **0 pixels**. Any diff = bug in migration.
3. Known false positives (animated elements, timestamps, user data): mask before diffing.

**Sign-off criteria:**
- 100% of baseline screenshots match post-migration
- `grep -rE "#[0-9a-fA-F]{6}" src/` returns only: `vibePresets.ts`, `index.css` (token definitions), `data/` content
- `grep -rE "rgba?\(" src/` returns only: `index.css` + MDX/legal content
- `grep -rE "\[#" src/` (Tailwind arbitrary hex) returns 0
- Typecheck + existing test suite green

---

## 6. Phase 4 — Dark Theme Smoke Test (0.5 dev-day)

Once Phase 3 signs off, flip `<html class="dark">` manually and re-run QA on 5 representative routes:
- `/` (chat)
- `/:userId/notes/:noteId`
- `/:userId/timeline`
- `/pricing`
- `SettingsModal` open

**Purpose:** prove the token system actually switches. Pixel-perfect dark styling is **not** the goal of this plan — that's a separate design sprint. The goal here is: no hardcoded value remains that blocks the toggle.

---

## 7. Timeline & Ownership

| Phase | Effort | Owner |
|---|---|---|
| 0 — Token system | 1 day | frontend lead |
| 1 — Baseline QA | 1–2 days | QA |
| 2A — Primitives | 1–2 days | dev 1 |
| 2B — Chat | 1.5 days | dev 1 |
| 2C — Notes | 1 day | dev 2 |
| 2D — Shell pages | 1.5 days | dev 2 |
| 2E — Planning/Media | 1.5 days | dev 1 |
| 2F — Data + legal | 0.5 day | dev 2 |
| 3 — Post-migration QA | 1–2 days | QA |
| 4 — Dark smoke test | 0.5 day | frontend lead |
| **Total** | **~11–14 dev-days** | parallelizable to ~7 calendar days with 2 devs + 1 QA |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| rgba values in keyframes drift visually | Render keyframes on a test page in Phase 0 to confirm `hsl(var()/alpha)` renders identically |
| Tailwind's `hsl(var(--x) / <alpha-value>)` needs HSL triplet, not `hsl(...)` wrapper | Define tokens without `hsl()` wrapper; document in `index.css` header comment |
| shadcn/ui updates conflict with our shadow tokens | Lock shadcn primitives' shadow to our `shadow-modal` class — changes only propagate from our theme |
| Hover/focus/active states miss tokenization | QA must capture hover & focus explicitly; don't rely only on default state |
| `vibePresets.ts` gradients are data, not theme | Explicit scope decision: left as literals, documented inline |
| Arbitrary Tailwind `[#...]` syntax silently survives | Add pre-commit grep guard: any `\[#[0-9a-fA-F]` in `src/**/*.tsx` fails CI |

---

## 9. Acceptance Checklist (for PR review)

- [ ] Phase 0 tokens merged, no visual change vs `main`
- [ ] Baseline screenshots committed to `qa/baseline/` (or stored in CI artifact)
- [ ] All 6 migration sprints merged
- [ ] `grep` guards pass (see §5 sign-off criteria)
- [ ] Post-migration screenshots match baseline at 0-pixel threshold
- [ ] `.dark` class toggles the 5 smoke-test routes without layout break
- [ ] `tailwind.config.ts` is the single source of truth for brand / category / shadow / gradient tokens
- [ ] `index.css` is the single source of truth for CSS variables (light + dark)
