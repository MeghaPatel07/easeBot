# Light / Dark Theme — Execution Plan

**Author:** Senior Software Architect + Multi-Agent Orchestrator
**Target app:** `Wedding-Ease-Viva-Chat/` (React + Vite + Tailwind + Firebase)
**Reference artifact:** `/Users/krish/Desktop/easebot/lightmode.html`
**Default:** Light mode
**Non-negotiable constraints:**
- Do NOT break existing functionality or business logic
- Do NOT change Firebase rules, permissions, or access
- Do NOT deploy or publish to Firebase
- Maintain backward compatibility with current dark-mode visuals

---

## 0. Current State (already in place — do not re-do)

- `src/contexts/ThemeContext.tsx` already exposes `{ theme: 'system'|'light'|'dark', resolvedTheme, setTheme }`. It reads localStorage (key `easebot-theme`), syncs from `profile.preferences.theme`, writes back to localStorage, and toggles `document.documentElement.classList('dark')`.
- `src/index.css` has a full `:root` token set (dark palette) and a `.dark` block mirroring it. **The `.dark` block must stay as the dark palette; `:root` will become the light palette.**
- `tailwind.config.ts` already has `darkMode: ["class"]`. Every color in the extend uses `hsl(var(--token))`.
- All components were migrated in the preceding theme-token sprint — no raw hex / composite shadow literals remain outside legitimate content colors.
- `AppearanceTab.tsx` already has a theme selector calling `setTheme()`.

**What is missing:**
1. A real **light palette** — `:root` currently holds dark values.
2. A visible **header toggle** (the current toggle is buried in Settings → Appearance).
3. A **no-flash inline boot script** in `index.html` to apply the saved theme before React mounts (ThemeContext comments reference one but it must exist and read the correct key).
4. **Profile write-through on login** — ThemeContext reads from profile but does not write user-chosen theme back to Firestore. Needs a dedicated service call that respects existing Firestore rules (writes to `users/{uid}/preferences.theme` only; no rule changes).
5. **Guest → logged-in theme reconciliation** on sign-in (merge localStorage pref into profile if profile has none).
6. **Light-mode visual parity review** against `lightmode.html` semantics (surface hierarchy, accent palette, shadows).
7. **QA sweep**: all routes + modals at light + dark × 4 viewports.

---

## 1. High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  index.html boot script                    │
│  (reads localStorage, adds .dark class before first paint) │
└───────────────────────────┬────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────┐
│                    ThemeProvider (React)                    │
│  state: { theme, resolvedTheme }                            │
│  effects: localStorage sync, profile sync, media query      │
│  write-through to Firestore users/{uid}.preferences.theme   │
└────────┬───────────────────────────┬───────────────────────┘
         │                           │
         ▼                           ▼
   <ThemeToggle /> (header)   Every styled element
                              consumes hsl(var(--token))
                              ---
                              :root  → light palette
                              .dark  → dark palette
```

**Token strategy:** keep the exact token names already in use. Only the HSL values differ per palette. No component edits required for core tokens.

**Edge tokens** (components with hard-earned specific hues — `surface-toast`, `surface-tooltip`, `surface-popover-alt`, `mode-*-active`, `cat.*`): each needs a **light-mode counterpart** chosen to preserve semantic role (warning, success, category) rather than literal color.

---

## 2. Detailed Execution Plan

### Phase 1 — Token Foundation (Frontend Dev Agent)

**Files:** `src/index.css`, `tailwind.config.ts` (read-only here), `index.html`

1. **Swap palettes.** Rename current `:root` block → `.dark` block (since those HSL values *are* the dark palette). Build a fresh `:root` block using the `lightmode.html` reference for:
   - `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--muted`, `--border`, `--input`, `--ring`
   - `--primary*` family (bronze stays bronze but on warm-cream surfaces)
   - `--secondary*`, `--accent*`
   - `--surface-*` hierarchy (container / -low / -high / -highest / elevated / note / popover-alt / tooltip / toast)
   - `--cat-*` family — keep hue, adjust lightness for legibility on light surfaces
   - `--mode-*-active`
   - `--shadow-*` — replace dark-heavy shadows (`rgba(0,0,0,0.55)`) with softer warm-brown shadows from lightmode.html (`rgba(138,95,70,0.08)`)
   - `--grad-*` gradient stops

2. **Update inline boot script in `index.html`** (create `<script>` in `<head>` before React bundle):
   ```html
   <script>
     (function () {
       try {
         var t = localStorage.getItem('easebot-theme') || 'light';
         var resolved = t === 'system'
           ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
           : t;
         if (resolved === 'dark') document.documentElement.classList.add('dark');
       } catch (e) {}
     })();
   </script>
   ```
   This eliminates the light-flash on cold reload.

3. **Default-theme change:** in `ThemeContext.tsx`, change the initial fallback from `'system'` to `'light'` (per spec). Keep `'system'` as a selectable option.

4. **Build & smoke:** `npm run build` must still pass with zero CSS warnings.

**Exit criteria:** Toggling `document.documentElement.classList.toggle('dark')` in DevTools on any page flips the entire UI between palettes with no white patches, no illegible text, no missing borders.

---

### Phase 2 — Header Toggle (UI/UX Agent + Frontend Dev Agent)

**Files:** `src/components/ChatHeader.tsx` (or the nearest shared header — verify), new `src/components/ui/theme-toggle.tsx`

1. **Build `<ThemeToggle />`** — a compact icon button, 36×36, `aria-label` cycling between "Switch to dark/light". Uses the existing `useTheme()` hook. Click cycles `light → dark` (system option stays in Settings).
2. **Icon:** Sun (light) / Moon (dark) from `lucide-react`, cross-fade on toggle with Tailwind `transition-opacity`.
3. **Placement:** chat header, next to settings/profile menu. Visible for both guest and logged-in users.
4. **Keyboard:** Enter / Space toggles. Focus ring uses `ring-primary`.
5. **Mobile:** Moves into the hamburger / overflow menu at `< sm` breakpoint to avoid header crowding.

**Exit criteria:** Toggle appears on every screen that has a header, keyboard-operable, animates smoothly, persists across reloads for guests.

---

### Phase 3 — Persistence & Sync (Backend Dev Agent + Frontend Dev Agent)

**Files:** `src/services/userService.ts` (or nearest profile writer — audit), `src/contexts/ThemeContext.tsx`, `src/contexts/AuthContext.tsx`

**No Firestore rule edits. No new collections.** Write to the existing `users/{uid}` document's `preferences.theme` field. Confirm current rules already permit an authenticated user to write their own `users/{uid}` doc; if not, **abort** and surface to user — do not modify rules.

1. **Write-through:**
   - In `ThemeContext.setTheme(next)`, if `user?.uid` exists, call `updateUserPreferences(uid, { theme: next })` (new thin service wrapper over existing user-update pattern). Fire-and-forget; never block UI.
   - Silently swallow permission errors — fall back to localStorage only.

2. **Login reconciliation:**
   - On auth state change from `null → signed-in`: if `profile.preferences.theme` is missing but localStorage has one, write localStorage → profile.
   - If both exist and differ, **profile wins** (this matches current ThemeContext logic).

3. **Logout:** keep the localStorage value so the guest continues with the theme they were using.

**Exit criteria:** Sign in on device A with theme=light, switch to dark → sign in on device B → device B loads dark. Guest changes persist across reload.

---

### Phase 4 — Component Audit (Frontend Dev Agent)

Audit files that still use dark-only assumptions (text-white, bg-white/[0.04] etc. semantically mean "on dark surface"):

| Pattern | Action |
|---|---|
| `text-white/XX` | Replace with `text-foreground/XX` or a semantic role token |
| `bg-white/[0.0X]` | Replace with `bg-surface-container-*` or `bg-card` |
| `border-white/[0.0X]` | Replace with `border-border` |
| Hard-coded alpha on black | Replace with `bg-foreground/XX` (inverts correctly) |

Scope: chat bubbles, modals, dropdowns, sidebars, empty states. Expect ~40–80 component edits. Batch by feature subtree to keep PRs reviewable.

**Exit criteria:** `rg "text-white|bg-white/\[0\.0"` in `src/**/*.tsx` returns 0 (outside genuinely inverse contexts like colored chips).

---

### Phase 5 — QA Sweep (QA Agent → Bug-Fix Loop)

Use existing `qa/screenshot-harness.mjs`. Extend to capture **both themes**:

1. Add a `--theme light|dark` flag → harness calls `page.evaluate(t => { localStorage.setItem('easebot-theme', t); })` before `page.goto`.
2. Capture matrix: **9 public routes × 4 viewports × 2 themes = 72 screenshots**. Add modal state variants (SignInModal, SignUpModal, CheckoutModal, NoteHeader icon picker, AttachmentPicker dropdown, Settings → Appearance, MessageAttachmentChips hover) → +48 modal screenshots → **~120 total**.
3. Baseline: capture current `main` in dark mode → save under `qa/screenshots-baseline-dark/`. Compare post-migration dark against baseline (pixel-diff or visual review). **Dark mode must not drift.**
4. Light mode review: visual inspection against `lightmode.html` design direction.

QA Agent reports structured findings:
```json
{ "route": "pricing", "viewport": "mobile-390", "theme": "light",
  "severity": "blocker|major|minor", "summary": "…", "file": "path/to.png" }
```

### Phase 6 — Bug-Fix Loop (Dev Loop Agent)

For each QA finding:
1. Orchestrator assigns to Frontend Dev Agent.
2. Fix scoped to the semantic token (never hard-code a hex).
3. Re-capture the specific route+viewport+theme → re-review.
4. Loop until severity ≤ minor and count ≤ agreed threshold (e.g., 0 blocker, 0 major).

Retry policy: up to 3 automated attempts; then escalate to human review with diff + screenshot evidence.

### Phase 7 — Final Validation

- `npm run build` passes
- `npm run lint` clean in changed files
- All routes reachable in both themes for guest + logged-in flows
- localStorage + profile persistence verified on two browsers
- Harness screenshots attached to PR description

---

## 3. Agent Responsibilities (summary)

| Agent | Owns | Blocks on |
|---|---|---|
| **Orchestrator** | Phase gating, reassignment, QA triggers, retry policy | — |
| **Frontend Dev** | Phases 1, 2, 4, 6 code edits | UI/UX sign-off on toggle |
| **Backend Dev** | Phase 3 write-through, login merge | Firestore rule verification (read-only check) |
| **UI/UX** | Toggle interaction spec, contrast audit (WCAG AA), cross-theme type & focus states | — |
| **QA** | Harness extension, screenshot capture, structured bug reports | Phase 1–4 completion |
| **Dev Loop** | Fixing QA findings, regression re-capture | QA report |

---

## 4. Communication Protocol (textual flow)

```
Orchestrator →(assign Phase 1)→ Frontend Dev
Frontend Dev →(phase1.done + build.ok)→ Orchestrator
Orchestrator →(assign Phase 2)→ UI/UX + Frontend Dev (parallel)
UI/UX →(toggle.spec)→ Frontend Dev
Frontend Dev →(phase2.done)→ Orchestrator
Orchestrator →(assign Phase 3)→ Backend Dev (verify rules), Frontend Dev (wire hook)
Backend Dev →(rules.verified OR BLOCKED)→ Orchestrator
[if BLOCKED on rules → halt; report to human; do NOT edit rules]
Frontend Dev →(phase3.done)→ Orchestrator
Orchestrator →(assign Phase 4)→ Frontend Dev (batched by subtree)
Frontend Dev →(phase4.done)→ Orchestrator
Orchestrator →(trigger QA)→ QA
QA →(report[])→ Orchestrator
for finding in report:
   Orchestrator →(assign fix)→ Dev Loop
   Dev Loop →(fix.done)→ Orchestrator → re-trigger QA on affected slice
Orchestrator →(phase7.done)→ Human review
```

Message envelope:
```json
{ "from": "qa", "to": "orchestrator", "type": "report",
  "runId": "2026-04-20T14:00Z",
  "findings": [{ "id": "F-012", "route": "/pricing", "theme": "light",
                 "viewport": "mobile-390", "severity": "major",
                 "summary": "CTA button low contrast on cream bg",
                 "screenshot": "qa/screenshots/pricing/light/mobile-390.png" }] }
```

---

## 5. QA Checklist

- [ ] Light mode is default for first-visit guest
- [ ] `localStorage.getItem('easebot-theme')` survives reload
- [ ] No white flash on cold reload in dark mode
- [ ] No dark flash on cold reload in light mode
- [ ] Header toggle visible on every authenticated route
- [ ] Toggle is keyboard-operable (Tab-reach, Enter/Space activate)
- [ ] Settings → Appearance still works and stays in sync with header toggle
- [ ] Sign-in with profile preference overrides guest choice
- [ ] Theme change writes to `users/{uid}.preferences.theme` (verified via Firestore console, not rule edit)
- [ ] Every route × light × { mobile-360, mobile-390, desktop-1440, desktop-1920 } renders without overflow, clipped chrome, or illegible text
- [ ] Every modal × both themes renders cleanly (SignIn, SignUp, Checkout, CapHitBanner, NoteHeader popover, AttachmentPicker, ProfileMenu, SettingsModal tabs)
- [ ] WCAG AA contrast: body text ≥ 4.5:1, large text / UI ≥ 3:1 in both themes
- [ ] Category chips (budget / timeline / milestone / planner / stylist / knowledge) remain distinguishable in light mode
- [ ] Shadows are visible but subtle in light mode (no heavy black halos)
- [ ] No regressions against pre-migration dark-mode baseline screenshots
- [ ] `npm run build` passes
- [ ] No Firebase rule / permission / config change in diff

---

## 6. Retry & Bug-Fix Loop Strategy

1. **Auto-retry budget:** 3 passes per finding.
2. **Circuit breaker:** if > 10 findings of severity ≥ major after first QA pass, halt automation, surface summary to human before continuing — indicates palette regression.
3. **Scope isolation:** each fix touches only tokens or one component subtree; never both in one pass (prevents fix-causing-new-break cycles).
4. **Regression guard:** after every fix, re-run QA on the fixed route AND one randomly chosen other route to catch cross-contamination.
5. **Escalation triggers:**
   - Any failing Firestore permission attempt → halt, report; do not edit rules.
   - Build failure → halt, no auto-retry on build errors.
   - QA finding suggests a rule/permission change is needed → halt, report as out-of-scope.

---

## 7. Sequencing & Estimated Effort

| Phase | Work | Dependencies | Est. dev-hours |
|---|---|---|---|
| 1 | Token foundation (light palette in `:root`, dark in `.dark`, boot script) | — | 4–6 |
| 2 | Header toggle component + integration | 1 | 2–3 |
| 3 | Persistence write-through + login merge | 1 | 2–3 |
| 4 | Component audit (`text-white` → `text-foreground`, etc.) | 1 | 6–10 |
| 5 | QA harness extension + capture | 1–4 | 2 (harness) + 1 (run) |
| 6 | Bug-fix loop | 5 | 4–8 (highly variable) |
| 7 | Final validation | 6 | 1 |

**Total:** ~22–33 dev-hours end-to-end.

---

## 8. Out of Scope (explicit)

- Changing Firebase security rules, indexes, or functions
- Deploying to Firebase hosting / functions / firestore
- Altering business logic, pricing tiers, token/credit metering, or AI prompts
- Touching `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `functions/**`
- Brand-color SVG icons (Google OAuth logo) — these remain literal hex per brand guidelines
- User-selectable note highlight palette in `FloatingToolbar` — these are content, not theme
