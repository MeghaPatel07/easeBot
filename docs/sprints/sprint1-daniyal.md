# Sprint 1 — Daniyal Ahmad (Staff Design Engineer)

**Scope:** Foundations for the Settings & User Profile redesign. Audit existing tokens, lock the design contract, hand other agents an enforceable checklist.

**Date:** 2026-04-14

---

## What I audited

- `docs/prd-settings-profile.md` — sections 5 (IA) and 9 (frontend architecture)
- `Wedding-Ease-Viva-Chat/tailwind.config.ts` — full token map, surface elevation scale, font scale, dark mode strategy
- `Wedding-Ease-Viva-Chat/src/index.css` — `:root` and `.dark` HSL variable blocks, safe-area + dvh utilities, scrollbar utilities, reduced-motion handling
- `Wedding-Ease-Viva-Chat/src/components/ui/` — confirmed presence of every primitive needed by the 8 settings tabs (Avatar, AlertDialog, Calendar, Card, Dialog, Drawer, Input, Label, Popover, Progress, RadioGroup, ScrollArea, Select, Separator, Sheet, Slider, Switch, Tabs)

## Output

- **Design system contract:** `/Users/krish/Desktop/easebot/docs/settings-design-system.md`
  - Dark mode strategy
  - Color token reuse table (every class name listed)
  - Typography scale
  - Responsive breakpoints
  - A11y rules (focus rings, tap targets, contrast, labels, keyboard)
  - shadcn primitive recommendations per tab
  - Copy-pasteable dark-mode snippets
  - SettingsShell responsive layout skeleton

## Token additions

**None.** Existing tokens fully cover every requirement in PRD §5/§9. No changes to `tailwind.config.ts` or `index.css`.

## Checklist — rules other agents MUST enforce

Frontend, a11y, and QA agents: every Settings PR must satisfy ALL of the following. PRs missing any item should be rejected.

### Tokens
- [ ] No raw hex / `rgb(...)` / `slate-*` / `gray-*` / `zinc-*` color classes anywhere in Settings code
- [ ] Surfaces use only: `bg-background`, `bg-card`, `bg-muted`, `bg-popover`, `bg-sidebar`, or the `bg-surface*` elevation scale
- [ ] Text uses only: `text-foreground`, `text-card-foreground`, `text-muted-foreground`, `text-primary`, `text-destructive-foreground`, `text-sidebar-foreground`
- [ ] Borders use `border-border` (or `border-sidebar-border` / `border-outline*` inside the shell)
- [ ] Inputs use `bg-input` + `border-border`
- [ ] Destructive actions use `bg-destructive` / `text-destructive-foreground` and are wrapped in `AlertDialog`

### Dark mode
- [ ] Theme toggle adds/removes `dark` class on `document.documentElement`
- [ ] `'system'` mode listens to `prefers-color-scheme` media query
- [ ] No `dark:` Tailwind variants for color values (tokens already swap)
- [ ] Persisted to `preferences.theme` per PRD §7

### Typography
- [ ] No inline `style={{ fontSize }}`
- [ ] Titles use `font-headline`; body defaults to Inter (no class needed)
- [ ] Helper text is `text-xs text-muted-foreground`
- [ ] Field labels are `text-sm font-medium` paired with `<Label>`

### Responsive
- [ ] Mobile-first classes; `md:` for tablet, `lg:` for desktop
- [ ] Settings modal renders as `Sheet` on mobile, `Dialog` from `md:` up
- [ ] Left-nav is horizontal on mobile, vertical column from `md:` up
- [ ] No horizontal scroll on viewports ≥ 360px
- [ ] Uses `h-dvh-safe` / `pb-safe` for iOS safe areas where the modal touches edges

### A11y (non-negotiable)
- [ ] Every interactive element has `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`
- [ ] Every button / switch / tab trigger meets `min-h-11 min-w-11` (44px)
- [ ] Body text contrast ≥ 4.5:1 against its actual background
- [ ] `text-muted-foreground` never sits on `bg-muted`
- [ ] Every `<Input>`, `<Switch>`, `<Select>`, `<RadioGroupItem>` has an associated `<Label htmlFor>` or `aria-label`
- [ ] No `tabIndex` > 0; tab order = visual order
- [ ] Esc closes modals (Radix default — don't override)
- [ ] Arrow keys work on left-nav and any RadioGroup
- [ ] Decorative icons have `aria-hidden="true"`
- [ ] Destructive actions (delete account, revoke sessions, clear history) require an `AlertDialog` confirmation

### Primitives
- [ ] Only compose existing shadcn primitives from `src/components/ui/` — no new variants, no parallel button styles
- [ ] Use the per-tab primitive recommendations in `settings-design-system.md` §6

## Hand-off

Other Sprint 1 agents (frontend shell builder, account-tab builder, etc.) should `Read` the design system doc before writing any JSX. The doc is the contract; this status file is the checklist they grade themselves against.
