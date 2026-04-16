# EaseBot — Improvement Sprint & GTM Execution Plan

> **Date:** 2026-04-16  
> **Branch:** `ui-update`  
> **Author:** Product Audit (Claude)  
> **Scope:** Full-stack audit of Wedding-Ease-Viva-Chat + easebot-backend

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Inventory](#2-current-system-inventory)
3. [Gap Analysis vs Market Leaders](#3-gap-analysis-vs-market-leaders)
4. [Improvements from improvementsfinal.md — Mapped & Expanded](#4-improvements-from-improvementsfinmd--mapped--expanded)
5. [SEO & AEO Audit](#5-seo--aeo-audit)
6. [GTM Additions — My Recommendations](#6-gtm-additions--my-recommendations)
7. [Execution Plan — Sprint Breakdown](#7-execution-plan--sprint-breakdown)
8. [Priority Matrix](#8-priority-matrix)

---

## 1. Executive Summary

EaseBot is a vertical AI wedding planning chatbot with a rich feature set: multi-mode AI (planner, stylist, knowledge, assistant), image generation, checklists, budgets, timelines, notes, voice I/O, and a subscription billing system. The product has strong bones but has **critical GTM blockers** around guest experience, SEO/discoverability, confirmation UX, help/feedback infrastructure, and subscription lifecycle polish. This document maps every gap, prioritizes fixes, and provides a sprint execution plan.

---

## 2. Current System Inventory

### 2.1 Frontend (React 18 + Vite + Tailwind + shadcn/ui)

| Area | Status | Files |
|------|--------|-------|
| **Chat (core)** | Working — streaming, branching, inline edit, TTS, voice input, image attach | `ChatMessages`, `ChatInput`, `ChatHeader`, `ChatSidebar` |
| **AI Modes** | 4 active: planner, stylist, knowledge, assistant (therapist/consultant commented out) | `constants.ts`, `modeRouter.ts` |
| **Auth** | Email, Google, WhatsApp OTP phone sign-up/sign-in | `AuthContext`, `SignInModal`, `SignUpModal` |
| **Settings** | Full shell with 6 active tabs: Account, Plan & Billing, AI Behavior, Notifications, Data & Privacy, About | `SettingsShell.tsx`, `tabs/*` |
| **Pricing** | 3-tier (Free, Pro $14.99, ProMax $39) with currency conversion, annual toggle | `Pricing.tsx`, `PricingTierCard` |
| **Checkout** | Modal skeleton + PayU CTA — **Sprint 2 stubs still present** | `CheckoutModal.tsx`, `UpgradeFlow.tsx` |
| **Billing** | Usage meter, plan display | `BillingSettings.tsx` |
| **Planner** | Checklists with due dates, vendor refs, AI-driven mark-as-done | `PlannerView`, `ChecklistDetail` |
| **Budget** | Dashboard with categories | `BudgetDashboard` |
| **Timeline** | Events from chat + manual | `TimelineView` |
| **Notes** | Rich editor, comments, sharing, templates | `NotesView`, `NoteEditor`, `NotesSidebar` |
| **Images** | Vibe system, gallery, custom vibe form, DNA strip | `ImagesHub`, `VibeCard`, `VibePicker` |
| **Collaboration** | Partner invite | `InvitePartner` |
| **Share** | Chat sharing with social links | `SharedChat`, share modal in Index |

### 2.2 Backend (Express + Azure OpenAI)

| Area | Files |
|------|-------|
| **Routes** | chat, image, payment, account, checklists, notes, transcribe, tts, health |
| **Services** | AI pipeline, image generation, token meter, subscription state machine, reminders, notifications, invoice, email |
| **Infrastructure** | Circuit breaker, conversation summarizer, keyword directory, exchange rate |

### 2.3 What's Working Well
- Dark glassmorphism UI is polished and consistent
- Multi-mode AI with auto-detection
- Real-time Firestore subscriptions for threads, checklists, budget
- Voice input + TTS output
- Image generation with vibe system
- Mobile-responsive layout
- Keyboard shortcuts
- Message branching (edit history)
- Comprehensive settings with accessibility (ARIA, keyboard nav, focus traps)

---

## 3. Gap Analysis vs Market Leaders

### 3.1 vs ChatGPT

| Feature | ChatGPT | EaseBot | Gap |
|---------|---------|---------|-----|
| **Guest experience** | Full chat with limits shown, upgrade prompts | Chat works but NO usage limits shown, NO quick actions tailored for guest | **CRITICAL** |
| **Confirmation dialogs** | All destructive actions have confirmations | Thread delete in sidebar has NO confirmation modal — direct `onDeleteThread()` call | **HIGH** |
| **Custom instructions** | "What should ChatGPT know" + "How should it respond" | Fields exist in types (`about`, `responseStyle`) but **UI is not wired** — AI Behavior tab doesn't expose them | **HIGH** |
| **Conversation memory** | Persistent memory across sessions | No cross-session memory | **MEDIUM** |
| **Search** | Full-text search across all chats | Implemented (debounced Firestore search) | OK |
| **File uploads** | PDF, images, code files | Images only (4MB limit) | **MEDIUM** |
| **Artifacts/Canvas** | Side panel for code, docs, tables | Convert-to-table exists but no canvas/artifact panel | **LOW** |
| **Help center** | Comprehensive help.openai.com | "Help" button in sidebar only shows keyboard shortcuts overlay — **no real help page** | **CRITICAL** |
| **Pricing gate** | Clear upgrade prompts when limits hit | `CapHitBanner` exists but guest limits not shown | **HIGH** |

### 3.2 vs Claude

| Feature | Claude | EaseBot | Gap |
|---------|--------|---------|-----|
| **Plan upgrade/downgrade flow** | Prorated credit, instant provisioning, billing date reset | UpgradeFlow has **Sprint 2 placeholder text still visible** ("Placeholder — Sprint 2 will show proration") | **CRITICAL** |
| **Usage visibility** | Clear token/message counters per plan | `UsageMeter` exists but guest sees nothing; free tier limits unclear | **HIGH** |
| **Projects/Knowledge bases** | Organize chats into projects with system prompts | No project/workspace concept | **MEDIUM** |
| **Pricing page auth gate** | Redirects to login if not signed in, with return URL | Pricing page accessible to all but "Buy" redirects to `/?auth=signup` — **no return URL param handling on landing page** | **HIGH** |
| **Subscription lifecycle** | Downgrade keeps benefits until cycle end | No downgrade flow at all | **HIGH** |

### 3.3 vs Gemini

| Feature | Gemini | EaseBot | Gap |
|---------|--------|---------|-----|
| **Multi-modal** | Images, audio, video, PDF | Images + audio (TTS/STT) | **MEDIUM** |
| **Extensions/Integrations** | Google Calendar, Maps, YouTube | No external integrations beyond WhatsApp reminders | **LOW** (niche product) |
| **Real-time information** | Google Search grounding | Web search tool exists in backend | OK |

### 3.4 EaseBot-Specific Missing Pieces

| Gap | Severity | Details |
|-----|----------|---------|
| **No confirmation modal for chat delete** | CRITICAL | Sidebar's delete dropdown item calls `onDeleteThread(thread.id)` directly — no `AlertDialog` wrapping it |
| **No confirmation for logout** | HIGH | `signOut` called directly from profile menu |
| **Help = keyboard shortcuts only** | CRITICAL | Sidebar "help" button (`onShowShortcuts`) shows the keyboard shortcuts overlay, not a help/support page |
| **No feedback/ticket system** | CRITICAL | No feedback page, no ticket submission, no support form anywhere |
| **Image cleanup on chat delete** | HIGH | `deleteThread()` in `chatService.ts` deletes Firestore docs but does NOT delete associated Firebase Storage images |
| **Titles not in TitleCase** | MEDIUM | Sidebar nav items are all `lowercase` CSS. Section titles use mixed casing |
| **Guest session management** | HIGH | No localStorage-based guest chat storage; guest chats vanish on refresh |
| **Package validity/token reset from purchase date** | HIGH | Token meter exists but validity logic tied to `resetAt` server field — unclear if anchored to purchase date or calendar month |
| **Extras/top-up after package purchase** | MEDIUM | Top-up exists on pricing page but `improvementsfinal.md` says "extra limit part will be available after buying the package" — need Claude-like contextual upsell |

---

## 4. Improvements from improvementsfinal.md — Mapped & Expanded

### IMP-1: Guest User Experience
**Source:** Lines 1-4  
**Current state:** Guest can chat but sees no limits. No quick actions. No session persistence.  
**Required changes:**
- [ ] Show usage limits banner for guest (messages remaining, token count)
- [ ] Add guest-specific quick actions (e.g., "Try planning a wedding", "Explore styles") — remove actions that require auth (planner, notes, etc.)
- [ ] Implement localStorage-based guest session storage so refreshing doesn't lose the chat
- [ ] Cap guest to N messages/session and show "Sign up to continue" modal
- [ ] Guest should be able to start new chats while retaining active session chats

### IMP-2: Package Validity from Purchase Date
**Source:** Line 9  
**Current state:** `resetAt` and `dailyResetAt` fields exist in usage snapshot  
**Required changes:**
- [ ] Ensure backend `subscriptionStateMachine.ts` anchors monthly pool reset to purchase timestamp, not calendar month
- [ ] Ensure daily 24hr token window resets from exact purchase time
- [ ] Display "Your plan renews on [date]" in billing settings

### IMP-3: Image Cleanup on Chat Delete
**Source:** Line 10  
**Current state:** `deleteThread()` deletes Firestore docs only. `removeMessageImage()` exists but isn't called during thread deletion.  
**Required changes:**
- [ ] In `chatService.ts:deleteThread()` — before deleting messages, iterate all messages with `imageUrl`/`imageUrls`/`attachedImageUrl` and call `deleteObject()` for each Storage ref
- [ ] Same logic for "Delete All Chats" in `DataPrivacyTab.tsx` → `clearChatHistory()`
- [ ] Handle external URLs gracefully (try/catch, skip non-Storage URLs)

### IMP-4: Confirmation Modals for All Destructive Actions
**Source:** Line 11  
**Current state:** Only `DataPrivacyTab` (clear chat history) and `AccountTab` (delete account) have confirmation dialogs. Thread delete and logout do NOT.  
**Required changes:**
- [ ] **Chat delete:** Wrap `onDeleteThread` in sidebar with `AlertDialog` confirmation
- [ ] **Logout:** Add confirmation dialog before `signOut()` in `ProfileMenu.tsx` and sidebar
- [ ] **Archive thread:** Add confirmation (optional but recommended)
- [ ] **Delete All Chats (sidebar-level):** Already handled in DataPrivacyTab — verify it works

### IMP-5: Remove Help from Sidebar, Build Help & Feedback Page
**Source:** Lines 12-13  
**Current state:** Sidebar bottom has "help" button → shows keyboard shortcuts overlay. No feedback page exists.  
**Required changes:**
- [ ] Remove the "help" button from sidebar bottom (both logged-in and guest states in `ChatSidebar.tsx`)
- [ ] Create new `/help` page with:
  - FAQ/knowledge base section
  - Ticket submission form (name, email, category, description, screenshot upload)
  - Feedback section (rating + free text)
- [ ] Store tickets in Firestore `support_tickets` collection
- [ ] Add "Help & Feedback" link in Settings → About tab
- [ ] Add "Help" link in profile dropdown menu

### IMP-6: TitleCase All Section Titles
**Source:** Line 14  
**Current state:** Sidebar nav uses CSS `lowercase`. Settings tabs use `lowercase`. Various section headers use mixed case.  
**Required changes:**
- [ ] Remove `lowercase` class from sidebar nav items in `ChatSidebar.tsx`
- [ ] Apply TitleCase to all sidebar items: "Planner", "Liked", "Reminders", "Timeline", "Images", "Notes"
- [ ] Apply TitleCase to settings nav: Already proper in TABS array labels
- [ ] Audit all page headers (Budget Tracker, Shopping Lists, etc.) — most are already TitleCase
- [ ] Sidebar bottom: "help" → "Help", "settings" → "Settings"
- [ ] Settings shell title: "settings" → "Settings"

### IMP-7: Extra Token Limits After Package Purchase (Claude Reference)
**Source:** Line 15  
**Current state:** Top-up pack exists on pricing page ($10/2M tokens). No in-context upsell.  
**Required changes:**
- [ ] When user hits daily/monthly limit, show contextual upsell banner (like Claude's "You've used your daily limit. Buy more tokens?")
- [ ] `CapHitBanner.tsx` already exists — enhance it to show "Buy top-up" CTA for Pro/ProMax users
- [ ] Free users should see "Upgrade to Pro" instead

### IMP-8: Pricing Page Auth Gate (Claude Reference)
**Source:** Line 16  
**Current state:** Pricing page is accessible to all. "Buy" button redirects to `/?auth=signup&next=/pricing` but the landing page doesn't handle `?auth=signup` or `?next=` params.  
**Required changes:**
- [ ] If user is NOT logged in and visits `/pricing`, redirect to sign-in page with return URL
- [ ] Implement `?auth=signin` and `?next=` query param handling in `Index.tsx` to auto-open the SignIn modal and redirect after auth
- [ ] Keep pricing page viewable for SEO (show plans, but CTA says "Sign in to subscribe")

### IMP-9: Subscription Upgrade/Downgrade Flow (Claude Reference)
**Source:** Lines 18-79  
**Current state:** `UpgradeFlow.tsx` has Sprint 2 placeholder text visible. No proration logic. No downgrade flow.  
**Required changes:**
- [ ] **Remove placeholder text** from UpgradeFlow ("Placeholder — Sprint 2 will show proration + billing date here")
- [ ] Implement prorated credit logic: remaining days of current plan → credit toward new plan
- [ ] Wire real price calculation: `newPlanPrice - proratedCredit`
- [ ] Implement downgrade flow: keep current tier benefits until billing cycle end
- [ ] Handle edge cases: annual-to-monthly block, API vs subscription separation
- [ ] Update billing settings to show "Downgrade" option for paid users
- [ ] Wire `UpgradeFlow` step 3 to real `/api/account/plan/checkout` endpoint

---

## 5. SEO & AEO Audit

### 5.1 SEO Issues Found

| Issue | Severity | Details |
|-------|----------|---------|
| **No sitemap.xml** | CRITICAL | `/public/sitemap.xml` does not exist. Google cannot discover pages. |
| **No manifest.json** | HIGH | No PWA manifest. Cannot install as app. No app icon, theme, or start URL defined. |
| **OG image points to lovable.dev** | HIGH | `og:image` is `https://lovable.dev/opengraph-image-p98pqg.png` — not EaseBot branded. Same for Twitter card. |
| **Twitter site is @lovable_dev** | HIGH | `twitter:site` is `@lovable_dev` — should be EaseBot's handle. |
| **Third-party script in HTML** | MEDIUM | `<script src="https://cdn.gpteng.co/gptengineer.js">` is a Lovable/GPTEngineer artifact. Remove for production. |
| **SPA = zero crawlable content** | CRITICAL | Pure client-side React SPA. Google sees an empty `<div id="root">`. No SSR, no prerendering, no static HTML for any page. |
| **No structured data (JSON-LD)** | HIGH | No schema.org markup for Organization, Product, SoftwareApplication, FAQ, or BreadcrumbList. |
| **No canonical URLs** | MEDIUM | No `<link rel="canonical">` on any page. Dynamic routes (`:userId/*`) could cause duplicate content. |
| **No meta robots per page** | LOW | Only global `robots.txt` (allows all). No per-page noindex for internal routes like `/checkout`, `/payment/*`. |
| **Title tag is static** | MEDIUM | All pages show "EaseBot AI - Your Personal Wedding Planning Assistant". No per-page titles for Pricing, Terms, Privacy, etc. |
| **No hreflang tags** | LOW | Multi-language support exists but no hreflang for search engines. |
| **robots.txt has no sitemap reference** | MEDIUM | `robots.txt` exists but doesn't include `Sitemap:` directive. |
| **No favicon variants** | LOW | Only `favicon.ico`. No apple-touch-icon, no 192/512 PNG for PWA. |

### 5.2 AEO (Answer Engine Optimization) Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **No FAQ structured data** | HIGH | No `FAQPage` schema. AI search engines (Perplexity, Google AI Overviews, Bing Copilot) cannot extract Q&A pairs. |
| **No How-To structured data** | MEDIUM | Wedding planning is a prime "how to" domain — no `HowTo` schema for any content. |
| **No blog/content marketing** | HIGH | No `/blog` or content pages. Zero organic content for AI engines to surface. |
| **No public-facing feature descriptions** | HIGH | All features are behind the SPA. AI search engines cannot describe what EaseBot does. |
| **No pricing structured data** | MEDIUM | No `Product` or `Offer` schema on the pricing page. |

### 5.3 SEO Fix Roadmap

**Quick wins (can ship this sprint):**
1. Create `sitemap.xml` with all public routes
2. Create `manifest.json` for PWA
3. Replace OG images with EaseBot branding
4. Fix Twitter card metadata
5. Remove `gptengineer.js` script
6. Add `Sitemap:` directive to `robots.txt`
7. Add per-page `<title>` via `react-helmet-async`

**Medium-term (next sprint):**
1. Add prerendering via `vite-plugin-ssr` or `prerender-spa-plugin` for key public pages (/, /pricing, /terms, /privacy)
2. Add JSON-LD structured data (Organization, Product, FAQ)
3. Add canonical URLs
4. Create a landing page with static HTML content describing features

**Long-term (GTM):**
1. Blog with wedding planning content (SEO + AEO fuel)
2. HowTo structured data for planning guides
3. hreflang for multi-language support

---

## 6. GTM Additions — My Recommendations

### GTM-1: Onboarding Flow (CRITICAL)
**Current:** User lands on chat, no guidance, no profile setup.  
**Recommended:** After first sign-up, show a 3-step onboarding:
1. "What's your name?" + "When's your wedding?" (date picker)
2. "What's your budget range?" (slider: ₹5L / ₹10L / ₹25L / ₹50L+)
3. "What's your style?" (pick 2-3 vibes from preset grid)

This seeds the AI with context from message #1. Massive improvement in first-session value.

### GTM-2: Landing Page / Marketing Site (CRITICAL)
**Current:** Landing page is the chat interface.  
**Recommended:** Build a proper marketing landing page at `/` (pre-auth) with:
- Hero section with value prop + CTA
- Feature showcase (planner, stylist, images, budget)
- Testimonials / social proof
- Pricing summary with CTA to `/pricing`
- Footer with Terms, Privacy, Contact

The chat interface moves to `/chat` (post-auth or guest).

### GTM-3: Email Notifications & Re-engagement
**Current:** Reminder system exists (WhatsApp + email) but only for calendar events.  
**Recommended:**
- Welcome email on signup
- "Your wedding is X days away" weekly digest
- "You haven't visited in 7 days" re-engagement email
- "Your checklist has 3 overdue items" nudge

### GTM-4: Social Sharing & Virality
**Current:** Chat sharing exists but no shareable content pages.  
**Recommended:**
- Shareable public moodboard pages (from image generation)
- "Share my checklist" public link
- "Built with EaseBot" watermark on shared content
- Referral system: "Invite a friend, get 500K bonus tokens"

### GTM-5: WhatsApp Bot Channel
**Current:** WhatsApp is only used for OTP + reminders.  
**Recommended:** WhatsApp chatbot interface (via Business API) — users can chat with EaseBot directly in WhatsApp. This is a massive distribution channel in India.

### GTM-6: Mobile PWA Polish
**Current:** No `manifest.json`. No service worker. No offline support.  
**Recommended:**
- Add PWA manifest with icons
- "Add to Home Screen" prompt
- Offline mode with cached last N chats
- Push notifications for reminders

### GTM-7: Analytics & Event Tracking
**Current:** No analytics visible in codebase.  
**Recommended:**
- Google Analytics 4 or Mixpanel
- Track: sign-up, first message, mode usage, image generation, plan upgrade, churn events
- Funnel: Landing → Signup → First Chat → Return Visit → Paid Conversion

### GTM-8: Rate Limiting & Abuse Prevention
**Current:** Token meter exists on backend but guest abuse prevention unclear.  
**Recommended:**
- IP-based rate limiting for guest sessions
- CAPTCHA on sign-up (already using reCAPTCHA for phone OTP)
- Abuse detection for image generation (content policy)

### GTM-9: Delete Account Data Cascade
**Current:** Account deletion exists but unclear if it cascades to:
- Storage images
- Checklists sub-collections
- Notes
- Reminders
- Timeline events
- Shared chats

**Recommended:** Audit the backend `deleteAccount` endpoint to ensure GDPR-compliant full cascade.

### GTM-10: Accessibility Audit
**Current:** Good ARIA usage in settings shell. But:
- Chat messages lack `role="log"` or `aria-live="polite"` for screen readers
- Occasion chips have no `aria-pressed` state
- Image gallery lacks alt text on generated images
- Color contrast needs audit (white/40, white/30 text on dark bg)

---

## 7. Execution Plan — Sprint Breakdown

### Sprint A: Critical Blockers (Week 1-2)

| # | Task | Source | Effort | Files |
|---|------|--------|--------|-------|
| A1 | Add confirmation modal for chat delete | IMP-4 | S | `ChatSidebar.tsx` |
| A2 | Add confirmation modal for logout | IMP-4 | S | `ProfileMenu.tsx`, `ChatSidebar.tsx` |
| A3 | Remove "help" from sidebar, route to new help page | IMP-5 | M | `ChatSidebar.tsx` |
| A4 | Build Help & Feedback page with ticket system | IMP-5 | L | New: `pages/Help.tsx`, `services/supportService.ts` |
| A5 | Guest usage limits display + guest quick actions | IMP-1 | L | `Index.tsx`, `ChatHeader.tsx`, new: `GuestBanner.tsx` |
| A6 | Image cleanup on chat/thread delete | IMP-3 | M | `chatService.ts`, `accountService.ts` |
| A7 | Remove Sprint 2 placeholder text from UpgradeFlow | IMP-9 | S | `UpgradeFlow.tsx`, `CheckoutModal.tsx` |
| A8 | TitleCase all section titles | IMP-6 | S | `ChatSidebar.tsx`, `SettingsShell.tsx` |

### Sprint B: SEO & Discoverability (Week 2-3)

| # | Task | Effort | Details |
|---|------|--------|---------|
| B1 | Create `sitemap.xml` | S | Public routes: /, /pricing, /terms, /privacy |
| B2 | Create `manifest.json` + PWA icons | M | App name, icons (192, 512), theme color, start URL |
| B3 | Replace OG/Twitter meta with EaseBot branding | S | `index.html` |
| B4 | Remove `gptengineer.js` script | S | `index.html` |
| B5 | Add `react-helmet-async` for per-page titles | M | All page components |
| B6 | Add JSON-LD structured data | M | Organization, Product (pricing), FAQ |
| B7 | Add `Sitemap:` to robots.txt | S | `public/robots.txt` |
| B8 | Add canonical URLs | S | `index.html` + per-page |
| B9 | Prerender public pages (vite plugin) | L | Pricing, Terms, Privacy, Landing |

### Sprint C: Subscription & Billing (Week 3-4)

| # | Task | Source | Effort |
|---|------|--------|--------|
| C1 | Implement prorated upgrade logic | IMP-9 | L |
| C2 | Implement downgrade flow (keep benefits until cycle end) | IMP-9 | L |
| C3 | Package validity from purchase date | IMP-2 | M |
| C4 | Pricing page auth gate with return URL | IMP-8 | M |
| C5 | CapHitBanner → contextual upsell for token top-up | IMP-7 | M |
| C6 | Wire UpgradeFlow step 3 to real checkout API | IMP-9 | L |

### Sprint D: GTM Polish (Week 4-5)

| # | Task | Source | Effort |
|---|------|--------|--------|
| D1 | Onboarding flow (3-step post-signup) | GTM-1 | L |
| D2 | Guest session persistence (localStorage) | IMP-1 | M |
| D3 | Marketing landing page | GTM-2 | L |
| D4 | Analytics integration (GA4/Mixpanel) | GTM-7 | M |
| D5 | PWA service worker + offline | GTM-6 | M |
| D6 | Welcome email + re-engagement emails | GTM-3 | M |
| D7 | Accessibility audit fixes | GTM-10 | M |
| D8 | Account deletion cascade audit | GTM-9 | M |

---

## 8. Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │  A1 A2 A5 A6     │  D1 D3 GTM-5      │
    │  A3 A4 B1 B3     │  C1 C2 C6          │
    │  B4 A7 IMP-9     │                   │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFF │                   │                   │  EFFORT
    │  A8 B7 B8         │  B9 D5 D6          │
    │  B2 B6            │  D4 GTM-4          │
    │                   │                   │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

**Ship first (top-left quadrant):** Confirmation modals, guest limits, image cleanup, SEO quick fixes, help page, remove placeholders.

**Ship next (top-right quadrant):** Onboarding, marketing page, subscription lifecycle, WhatsApp bot.

**Easy wins (bottom-left):** TitleCase, robots.txt, manifest, structured data.

**Plan later (bottom-right):** Prerendering, PWA offline, analytics, social sharing virality.

---

## Appendix: File-Level Change Map

| File | Changes Needed |
|------|---------------|
| `ChatSidebar.tsx` | Add delete confirmation AlertDialog, remove "help" button, TitleCase nav labels |
| `ProfileMenu.tsx` | Add logout confirmation dialog |
| `Index.tsx` | Handle `?auth=signin` + `?next=` params, guest session management |
| `chatService.ts` | Add image cleanup in `deleteThread()` |
| `UpgradeFlow.tsx` | Remove placeholder text, wire real proration |
| `CheckoutModal.tsx` | Remove placeholder text |
| `CapHitBanner.tsx` | Enhance with contextual upsell (top-up for paid, upgrade for free) |
| `SettingsShell.tsx` | TitleCase the "settings" title |
| `index.html` | Fix OG/Twitter meta, remove gptengineer.js, add manifest link, structured data |
| `public/robots.txt` | Add Sitemap directive |
| **New:** `public/sitemap.xml` | All public routes |
| **New:** `public/manifest.json` | PWA manifest |
| **New:** `pages/Help.tsx` | Help & Feedback page with ticket system |
| **New:** `services/supportService.ts` | Ticket CRUD for Firestore |
| **New:** `components/GuestBanner.tsx` | Guest usage limits + upgrade prompt |
| **New:** `components/OnboardingFlow.tsx` | Post-signup 3-step onboarding |

---

*This plan covers all items from `improvementsfinal.md` plus 10 additional GTM recommendations derived from competitive analysis against ChatGPT, Claude, and Gemini.*
