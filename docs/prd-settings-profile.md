# PRD — Settings & User Profile Redesign

**Scope:** Section 5 of `docs/improvement.md`
**Owner:** Platform / Account
**Status:** Draft for review
**Benchmark:** ChatGPT, Claude, Gemini settings surfaces

---

## 1. Problem

Today, clicking the avatar in the top-right only exposes a language switcher and sign-out. The "Settings" modal (opened from the sidebar) covers Identity / Tone / Voice — nothing about *account*, *plan*, *billing*, or *profile*. There is no way for a user to see who they are logged in as, what tier they're on, update their name/photo, or manage their account lifecycle. The `isPremium` and `usage` fields exist on `UserProfile` but are never surfaced or enforced.

This blocks monetization (Section 2 of improvement.md), hurts trust, and makes the product feel half-built compared to ChatGPT/Claude.

## 2. Goals

1. Give every user a real **Account hub** reachable from the avatar.
2. Let users update **identity** (name, nickname, photo, phone, wedding details) without asking support.
3. Surface **plan, usage, and billing** as first-class citizens — even before payments land, so the UI is wired and ready.
4. Consolidate all preferences (language, theme, notifications, AI personality, voice) into one coherent settings surface.
5. Match the polish level of ChatGPT/Claude so the "is this product real?" question never comes up.

## 3. Non-Goals

- Building the payment gateway itself (owned by Section 2).
- Enterprise/team accounts, SSO beyond Google, 2FA hardware keys.
- Full notification delivery backend — this PRD only defines the preference surface.

## 4. Benchmark Analysis (ChatGPT / Claude / Gemini)

| Surface | ChatGPT | Claude | Gemini | Easebot today |
|---|---|---|---|---|
| Avatar dropdown | Profile, Customize, Settings, Upgrade, Help, Logout | Profile pic, email, Settings, Upgrade, Logout | Account, Privacy, Settings, Sign out | Language list + Sign out |
| Settings surface | Full-screen modal, left-nav tabs | Full-screen modal, left-nav tabs | Dedicated page | Small modal, 3 tabs |
| Tabs | General, Notifications, Personalization, Speech, Data controls, Builder, Connected apps, Security, Account | Account, Profile, Appearance, Feature preview, Data privacy | Account, Personalization, Apps, Data | Identity, Tone, Voice |
| Plan/billing | Account tab → "Upgrade to Plus" | Account tab → "Manage subscription" | Google One | None |
| Usage meter | Yes (message cap on GPT-5) | Yes (5-hour window) | No explicit meter | None |

**Patterns to adopt:**
- Left-nav tabbed settings **modal** (not a page — preserves chat context, matches both ChatGPT and Claude).
- Avatar dropdown = *quick access + identity*, Settings modal = *deep config*. Don't duplicate.
- Plan & usage always visible in Account tab, even on free tier.
- Every destructive action (delete account, sign out everywhere) guarded by confirm dialog.

## 5. Information Architecture

**Avatar dropdown (top-right, compact):**
```
[Photo] Full Name
        email@domain.com
──────────────────────
Current plan: Free · 42/100 msgs used   → click opens Settings → Account
──────────────────────
⚙  Settings
💎 Upgrade plan
❓ Help & feedback
──────────────────────
↪  Sign out
```

**Settings modal (full-height, left-nav):**
1. **Account** — photo, name, nickname, email (read-only + change flow), phone, password, connected providers (Google), delete account
2. **Plan & Billing** — current tier, usage meter, upgrade CTA, billing history (stub), invoices (stub), manage subscription
3. **Personalization** — wedding date, partner name, budget range, role, active vibe (moved from scattered places)
4. **AI Behavior** — tone sliders, voice preset, default mode *(migrated from current modal)*
5. **Appearance** — theme (system/light/dark), density, language
6. **Notifications** — email, WhatsApp, in-app toggles per category (reminders, tips, product updates)
7. **Data & Privacy** — export data, clear chat history, training opt-out, cookie prefs
8. **About** — version, changelog, ToS, privacy policy, status page

Mobile: same tabs, rendered as a full-screen stack with a back-button list view.

## 6. User Flows

### 6.1 Open account from avatar
1. User clicks avatar → dropdown renders with live profile (photo, name, email, plan, usage).
2. User clicks **Settings** → modal opens on last-visited tab (default: Account).
3. Dropdown and modal share a single `useUserProfile()` source; no stale reads.

### 6.2 Update profile photo
1. Account tab → click photo → file picker (accept: image/png, image/jpeg, max 5MB).
2. Client-side crop to square, compress to ≤512×512.
3. Upload to Firebase Storage `avatars/{uid}/{timestamp}.jpg`.
4. Write `photoUrl` to Firestore `users/{uid}`.
5. Old avatar object deleted on success; avatar re-renders optimistically.

### 6.3 Change email (with re-auth)
1. Click email field → "Change email" dialog.
2. Re-auth required (password or Google popup).
3. New email entered → Firebase sends verification to new address.
4. Banner in Account tab: "Pending verification — check your inbox."
5. On verification, Firestore `email` updates via Cloud Function trigger.

### 6.4 Change password
1. Requires re-auth. Three fields: current, new, confirm.
2. Enforce same strength rules as signup (Section 1 of improvement.md).
3. On success, sign out all other sessions (Firebase `revokeRefreshTokens`).

### 6.5 Google account merge *(interacts with Section 1)*
1. If a user with password auth later signs in with Google using the same email, detect on backend, link credentials via `linkWithCredential`, keep Google as primary provider. No duplicate Firestore doc.

### 6.6 View plan & usage
1. Plan & Billing tab loads `usage` from profile + tier definition from config.
2. Renders: current plan name, renewal date (if paid), **progress bar** `messagesUsed / messagesAllowed`, reset timestamp.
3. Free tier CTA: "Upgrade to WeddingEase Pro" → payment flow (Section 2).
4. Paid tier: "Manage subscription" → PayU/Stripe customer portal.

### 6.7 Delete account
1. Red button at bottom of Account tab.
2. Two-step confirm: type email to confirm.
3. Backend endpoint soft-deletes Firestore doc, revokes auth, schedules 30-day hard delete, emails confirmation.

## 7. Data Model Changes

Additions to `UserProfile` (`src/types/index.ts`):

```ts
photoUrl?: string;
photoUpdatedAt?: Timestamp;

plan: 'free' | 'pro' | 'premium';   // replaces/augments isPremium
planRenewsAt?: Timestamp;
trialEndsAt?: Timestamp;

usage: {
  messagesUsed: number;
  messagesAllowed: number;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  // keep existing token counters for analytics
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  requestCount: number;
};

preferences: {
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  language: string;          // migrate from preferredLanguage
  notifications: {
    emailReminders: boolean;
    whatsappReminders: boolean;
    productUpdates: boolean;
    tips: boolean;
  };
  dataTrainingOptOut: boolean;
};

linkedProviders: Array<'password' | 'google.com'>;
```

Migration: one-time Cloud Function backfill for existing users — defaults `plan='free'`, `preferences.theme='system'`, copies `preferredLanguage → preferences.language`, initializes `usage` window.

## 8. Backend Endpoints (new, in `easebot-backend`)

All require Firebase ID token.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/account/me` | Full profile + plan + usage (single read for UI hydration) |
| `PATCH` | `/api/account/profile` | Update name, nickname, phone, wedding fields |
| `POST` | `/api/account/photo` | Signed upload URL for Firebase Storage |
| `DELETE` | `/api/account/photo` | Remove avatar |
| `POST` | `/api/account/email/change` | Initiate email change (re-auth required) |
| `POST` | `/api/account/password/change` | Re-auth + password update |
| `GET` | `/api/account/plan` | Current plan + usage meter |
| `POST` | `/api/account/plan/checkout` | (Section 2) payment gateway session |
| `POST` | `/api/account/delete` | Soft-delete + schedule hard delete |
| `PATCH` | `/api/account/preferences` | Theme, language, notifications, privacy |
| `GET` | `/api/account/export` | Async data export job (GDPR-ish) |

Rate-limit profile mutations to 10/min/user to prevent abuse.

## 9. Frontend Architecture

**New files:**
- `src/pages/settings/SettingsShell.tsx` — modal shell, left nav, router for tab state
- `src/pages/settings/tabs/AccountTab.tsx`
- `src/pages/settings/tabs/PlanBillingTab.tsx`
- `src/pages/settings/tabs/PersonalizationTab.tsx`
- `src/pages/settings/tabs/AiBehaviorTab.tsx` (migrate existing Tone + Voice)
- `src/pages/settings/tabs/AppearanceTab.tsx`
- `src/pages/settings/tabs/NotificationsTab.tsx`
- `src/pages/settings/tabs/DataPrivacyTab.tsx`
- `src/pages/settings/tabs/AboutTab.tsx`
- `src/hooks/useAccount.ts` — single source for profile + mutations (TanStack Query)
- `src/services/accountService.ts` — wraps backend calls
- `src/components/ProfileMenu.tsx` — replaces inline dropdown in `ChatHeader.tsx`
- `src/components/UsageMeter.tsx`

**Deleted/migrated:**
- Existing `SettingsModal.tsx` → content moved into `AiBehaviorTab` + `PersonalizationTab`.
- Language picker in `ChatHeader.tsx` → moved to Appearance tab; dropdown replaced by `ProfileMenu`.

**Routing:** Settings stays a modal but gets a deep-linkable URL param `?settings=account` so support can send links like `/?settings=plan`.

**State:** Zustand or TanStack Query for account data; optimistic updates on text fields, rollback on 4xx.

## 10. Phased Rollout

**Phase 1 — Foundation (1 week)**
- Data model migration + backfill.
- `GET /api/account/me` + `useAccount` hook.
- New `ProfileMenu` with real name/email/photo/plan.

**Phase 2 — Settings Shell (1 week)**
- `SettingsShell` with left nav, all 8 tabs stubbed.
- Migrate Tone/Voice/Identity into AI Behavior + Personalization tabs.
- Account tab: name, nickname, phone editable; photo upload.

**Phase 3 — Plan & Preferences (1 week)**
- Plan & Billing tab with free-tier usage meter (reads `usage`).
- Appearance tab with theme + language.
- Notifications tab wired to existing reminder service.

**Phase 4 — Security & Lifecycle (1 week)**
- Email change, password change with re-auth.
- Google account merging (coordinates with Section 1).
- Delete account flow.
- Data export stub.

**Phase 5 — Polish**
- Keyboard nav, a11y audit, mobile stack, empty states, toasts, deep-link URL param.

## 11. Success Metrics

- **Completion rate** of profile (photo + name + wedding date) > 60% within 7 days of signup.
- **Settings open rate** (% DAU who open Settings/week) — baseline then target +3× after launch.
- **Avatar dropdown click-through** to Plan tab — proxy for monetization interest.
- **Support tickets** tagged `account` or `profile` → target −70%.
- **Zero** accounts stuck in the email/Google duplicate state post-launch.

## 12. Risks & Open Questions

- **Firebase Auth email change** triggers re-auth requirement — UX must handle Google users who have no password.
- **Usage meter source of truth** — frontend count vs. backend count must reconcile; pick backend as authoritative, push via WebSocket or refetch on send.
- **Plan enum coordination** with Section 2 payments — align names (`free`, `pro`, `premium`) before any migration ships.
- **Theme dark mode** — existing components not audited for dark mode; may need a CSS token pass before shipping Appearance tab.
- **Data export format** — JSON vs. ZIP of markdown; defer to Phase 4.

## 13. Dependencies

- Section 1 (Auth): Google/email merge + password strength rules
- Section 2 (Payments): Plan tiers, checkout, subscription portal
- Section 7 (Security Review): re-auth flows, delete account, data export
- Section 8 (Pre-launch): analytics events for settings opens, plan upgrade clicks
