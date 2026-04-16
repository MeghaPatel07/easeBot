# Settings & Profile — Design System Reference

**Owner:** Daniyal Ahmad (Staff Design Engineer)
**Sprint:** 1 — Foundation
**Scope:** Authoritative design rules for every Settings/Profile UI built in this redesign. All other agents (frontend, a11y, QA) MUST conform to this doc.

This is a **read-only contract** over the existing token system in `Wedding-Ease-Viva-Chat/tailwind.config.ts` and `Wedding-Ease-Viva-Chat/src/index.css`. Nothing here invents new tokens. Nothing here overrides existing component styles.

---

## 1. Dark Mode Strategy

**Strategy in use: `class`-based dark mode.**

Configured in `tailwind.config.ts`:

```ts
darkMode: ["class"],
```

Tokens are defined twice in `src/index.css`:
- `:root { ... }` — the **default (wine/burgundy) theme**. This is currently the only theme actually shipped; the app is "dark by default."
- `.dark { ... }` — an **even darker** override applied when the `dark` class is present on `<html>`.

### How to apply it correctly

1. **Never hardcode colors.** Always reference semantic tokens (`bg-background`, `text-foreground`, `border-border`, etc.). Both `:root` and `.dark` redefine the same `--*` HSL variables, so token consumers automatically restyle when the user toggles theme.
2. **Theme toggle** must add/remove the `dark` class on `document.documentElement`. Persist the choice in `preferences.theme` (`'system' | 'light' | 'dark'`) per PRD §7.
3. For `'system'`, listen to `window.matchMedia('(prefers-color-scheme: dark)')` and add/remove `.dark` accordingly.
4. **Do NOT add a new `light` block.** A light variant is out-of-scope for Sprint 1 — the Appearance tab can render the option but the implementation is deferred. If/when a true light theme lands, it will be added by overriding `:root` variables, not by introducing new tokens.
5. Never use `dark:` Tailwind variants for color values — the tokens already swap. `dark:` is reserved for *layout* changes (e.g. switching an inline image asset).

---

## 2. Color Tokens — Reuse Contract

These are the **only** color classes Settings UI may use for surfaces, text, borders, and states. No raw hex values, no `slate-*`/`zinc-*`/`gray-*` Tailwind palette utilities.

| Purpose | Tailwind class | Token (HSL var) |
|---|---|---|
| Page / modal backdrop | `bg-background` | `--background` |
| Default body text | `text-foreground` | `--foreground` |
| Card / panel surface | `bg-card` | `--card` |
| Card / panel text | `text-card-foreground` | `--card-foreground` |
| Subtle / secondary surface | `bg-muted` | `--muted` |
| Subtle / secondary text, helper text, placeholders | `text-muted-foreground` | `--muted-foreground` |
| Borders, dividers, hairlines | `border-border` | `--border` |
| Form input background | `bg-input` | `--input` |
| Focus ring color | `ring-ring` | `--ring` |
| Primary action / brand | `bg-primary` | `--primary` |
| Primary action label | `text-primary-foreground` | `--primary-foreground` |
| Hover/selected nav row | `bg-accent` / `text-accent-foreground` | `--accent` |
| Destructive action (delete account, sign-out-everywhere) | `bg-destructive` / `text-destructive-foreground` | `--destructive` |
| Popover / dropdown surface | `bg-popover` / `text-popover-foreground` | `--popover` |

**Optional surface elevation scale** (already defined, prefer for layered settings panels): `bg-surface`, `bg-surface-container`, `bg-surface-container-low`, `bg-surface-container-high`, `bg-surface-container-highest`, plus `border-outline` and `border-outline-variant`.

**Sidebar tokens** (use only inside `SettingsShell` left-nav, mirroring the app sidebar pattern): `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `text-sidebar-accent-foreground`, `border-sidebar-border`, `ring-sidebar-ring`.

---

## 3. Typography Scale

Reuse the existing scale only. No custom `style={{ fontSize }}`.

| Use | Class | Notes |
|---|---|---|
| Page / modal title | `text-2xl font-headline font-semibold` | Noto Serif via `font-headline` |
| Tab heading inside content | `text-lg font-semibold` | |
| Section heading | `text-base font-semibold` | |
| Body / form value | `text-sm font-normal` | Default for almost every row |
| Field label | `text-sm font-medium` | Pair with `<Label>` shadcn primitive |
| Helper text / descriptions | `text-xs text-muted-foreground` | |
| Caption / timestamp | `text-caption text-muted-foreground` | Custom 13px scale already in config |
| Micro labels / badges | `text-label` or `text-2xs` | 11px / 10px from config |

**Font families:** `font-headline` (Noto Serif — titles only), `font-body` (Inter — default, do not need to declare), `font-label` (Inter — alias for label rows).

**Line height** is already baked into the named sizes; do not override with `leading-*` unless wrapping a multi-line block where you need `leading-relaxed` for readability (>2 lines of body copy).

**Font weights allowed:** `font-normal` (400), `font-medium` (500), `font-semibold` (600), `font-bold` (700, headlines only).

---

## 4. Responsive Breakpoints

| Range | Tailwind prefix | Use |
|---|---|---|
| Mobile, <768px | (no prefix; mobile-first base) — `sm:` is 640+, only use for >small phones | Stack tabs as a list view, full-screen sheet |
| Tablet, 768–1023px | `md:` | Two-pane (collapsed nav) optional |
| Desktop, ≥1024px | `lg:` | Full SettingsShell: persistent left-nav 240px + content |
| XL / 2XL | `xl:` `2xl:` | Optional max-width caps; do not redesign layout |

**Rules:**
- Always start mobile-first. Default classes target mobile; layer up with `md:`/`lg:`.
- The Settings modal is a **`Sheet` (bottom slide-up) on mobile**, **`Dialog` (centered card) from `md:` up**.
- Left-nav becomes a **horizontal `Tabs` strip** below `md:`; **vertical column** at `md:` and above.

---

## 5. Accessibility Rules (Enforced on Every Interactive Element)

These rules are non-negotiable. The QA agent will fail any PR that misses one.

1. **Focus ring (visible):** every focusable element MUST have
   ```
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
   ```
   The shadcn primitives already include this — do not strip it. Custom interactives must add it.
2. **Tap target ≥ 44×44 px:** use `min-h-11 min-w-11` (44px = 11 × 4px) or larger. Apply to every `<button>`, link, `Switch`, `RadioGroupItem` clickable area, icon button, and tab trigger. Compact icon buttons need `p-2` plus `min-h-11 min-w-11`.
3. **Contrast:**
   - Body text ≥ **4.5:1** against its background. `text-foreground on bg-background` and `text-foreground on bg-card` are pre-vetted; `text-muted-foreground` is allowed for **secondary** text only and only on `bg-background`/`bg-card`.
   - Large text (≥18px or ≥14px bold) ≥ **3:1**.
   - Never put `text-muted-foreground` on `bg-muted` (fails contrast).
4. **Labels:** every form input requires either a visible `<Label htmlFor>` (shadcn) or `aria-label` if the label is icon-only. Placeholders are NOT labels.
5. **Keyboard:**
   - Tab order must follow visual reading order. No `tabIndex` > 0.
   - **Esc** closes any open `Dialog`/`Sheet`/`AlertDialog` (Radix primitives do this for free — keep it).
   - **Arrow keys** navigate the left-nav list (`Tabs` primitive) and any `RadioGroup`.
   - **Enter / Space** activates `Button`, `Switch`, `RadioGroupItem`.
6. **Destructive guards:** every destructive action (delete account, revoke sessions, clear chat history) MUST be wrapped in `<AlertDialog>` with an explicit confirmation step. Per PRD §6.7, "Delete Account" requires the user to type their email.
7. **Reduced motion:** index.css already honors `prefers-reduced-motion`. Do not add new `transition-duration` > 200ms without checking.
8. **Screen reader:** decorative icons get `aria-hidden="true"`. Any Switch row's parent label must be associated, e.g. `<Label htmlFor="email-reminders">…</Label><Switch id="email-reminders" />`.

---

## 6. Recommended shadcn Primitives Per Tab

All primitives below already exist in `src/components/ui/`. Do not author new variants.

| Tab | Primitives to compose |
|---|---|
| **Account** | `Avatar`, `Input`, `Label`, `Button`, `Separator`, `AlertDialog` (delete account), `Dialog` (change email / change password re-auth), `Badge` (verification status) |
| **Plan & Billing** | `Card`, `Progress` (usage meter), `Badge` (plan tier), `Button` (upgrade / manage), `Separator`, `Skeleton` (loading) |
| **Personalization** | `Input`, `Label`, `Calendar` + `Popover` (wedding date), `Slider` (budget range), `Select` (role), `Card` |
| **AI Behavior** | `Slider` (tone), `Select` (voice preset, default mode), `Switch` (toggles), `Label`, `Card` |
| **Appearance** | `RadioGroup` + `RadioGroupItem` (theme: system / light / dark), `Select` (language), `RadioGroup` (density: comfortable / compact), `Label` |
| **Notifications** | `Switch` (one per row), `Label`, `Separator`, `Card` (group container) |
| **Data & Privacy** | `Button` (export data, clear history), `Switch` (training opt-out), `AlertDialog` (delete confirmation), `Label` |
| **About** | Plain text blocks, `Separator`, anchor `<a>` styled with `text-primary hover:underline`, `Badge` (version) |

The **shell** uses: `Dialog` (desktop) / `Sheet` (mobile) for the modal frame, `Tabs` for tab state OR a custom left-nav `<button>` list mapped to URL param `?settings=…` per PRD §9.

---

## 7. Dark Mode Pattern Snippets

**Card with title and helper text:**
```tsx
<div className="rounded-lg border bg-card p-6 text-card-foreground">
  <h3 className="text-base font-semibold">Profile photo</h3>
  <p className="mt-1 text-xs text-muted-foreground">
    PNG or JPG, square, max 5MB.
  </p>
</div>
```

**Primary button:**
```tsx
<button
  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md
             bg-primary px-4 text-sm font-medium text-primary-foreground
             hover:bg-primary-muted
             focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-ring focus-visible:ring-offset-2
             focus-visible:ring-offset-background
             disabled:pointer-events-none disabled:opacity-50">
  Save changes
</button>
```

**Destructive button (use sparingly, always behind `AlertDialog`):**
```tsx
<button
  className="inline-flex min-h-11 items-center justify-center rounded-md
             bg-destructive px-4 text-sm font-medium text-destructive-foreground
             hover:opacity-90
             focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
             focus-visible:ring-offset-background">
  Delete account
</button>
```

**Form row (label + input):**
```tsx
<div className="space-y-2">
  <Label htmlFor="nickname" className="text-sm font-medium">Nickname</Label>
  <Input
    id="nickname"
    className="bg-input text-foreground
               placeholder:text-muted-foreground
               focus-visible:ring-ring"
  />
  <p className="text-xs text-muted-foreground">Shown in chat headers.</p>
</div>
```

**Switch row (notifications):**
```tsx
<div className="flex min-h-11 items-center justify-between gap-4 py-3">
  <div className="flex-1">
    <Label htmlFor="email-reminders" className="text-sm font-medium">
      Email reminders
    </Label>
    <p className="text-xs text-muted-foreground">
      Wedding tasks, RSVPs, vendor follow-ups.
    </p>
  </div>
  <Switch id="email-reminders" />
</div>
```

**Left-nav item (active vs idle):**
```tsx
<button
  data-active={isActive}
  className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm
             text-sidebar-foreground hover:bg-sidebar-accent
             data-[active=true]:bg-sidebar-accent
             data-[active=true]:text-sidebar-accent-foreground
             focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-sidebar-ring focus-visible:ring-offset-2
             focus-visible:ring-offset-sidebar">
  <Icon aria-hidden="true" className="h-4 w-4" />
  <span>Account</span>
</button>
```

---

## 8. Responsive Pattern — `SettingsShell` Layout

```tsx
// SettingsShell.tsx — layout skeleton only
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent
    className="
      /* Mobile: full-screen sheet */
      h-dvh-safe w-screen max-w-none rounded-none p-0
      /* Tablet+: centered modal */
      md:h-[min(720px,90vh)] md:w-[min(960px,92vw)]
      md:max-w-[960px] md:rounded-2xl
      bg-background text-foreground border border-border
      flex flex-col md:flex-row overflow-hidden
    ">
    {/* Left nav */}
    <aside className="
      shrink-0 border-b border-border
      md:w-60 md:border-b-0 md:border-r md:border-border
      bg-sidebar text-sidebar-foreground
      md:flex md:flex-col
    ">
      {/* Mobile: horizontal scrollable tabs. md+: vertical list */}
      <nav className="
        flex flex-row gap-1 overflow-x-auto p-2 scrollbar-hide
        md:flex-col md:gap-1 md:overflow-y-auto md:p-3
      ">
        {tabs.map(tab => <NavItem key={tab.id} {...tab} />)}
      </nav>
    </aside>

    {/* Content */}
    <section className="flex-1 overflow-y-auto bg-background custom-scrollbar">
      <div className="mx-auto max-w-2xl p-4 md:p-6 lg:p-8">
        {children}
      </div>
    </section>
  </DialogContent>
</Dialog>
```

Key points:
- Mobile-first: column layout, full viewport, tabs scroll horizontally.
- `md:` switch to row layout, fixed-width left nav.
- `lg:` does not change structure — only generous padding via `lg:p-8`.
- All surfaces use semantic tokens; nothing is hardcoded.
- `h-dvh-safe`, `custom-scrollbar`, `scrollbar-hide` are pre-existing utilities in `index.css` — reuse them.

---

## 9. Token Additions

**None.** Every requirement in PRD §5 / §9 is satisfiable with existing tokens, surface scale, and shadcn primitives. No edits made to `tailwind.config.ts`.

If a future tab discovers a genuine gap, the addition must:
1. Be additive only (new variable, never an override of an existing one).
2. Be defined in both `:root` and `.dark` blocks of `index.css`.
3. Be referenced via `hsl(var(--…))` in `tailwind.config.ts`.
4. Be documented here with a justification block.
