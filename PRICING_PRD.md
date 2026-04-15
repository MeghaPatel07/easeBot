# Easebot Pricing PRD — Free / Pro / Pro Max

**Owner:** Product
**Status:** Draft v1
**Date:** 2026-04-14

---

## 1. Strategic Framing

### 1.1 What we actually sell
Easebot is **vertical AI for weddings**, not a horizontal LLM wrapper. Customers do not pay per token — they pay to avoid the pain of planning a ~$33k event with a 6–14 month deadline. Pricing must anchor to **"hiring a wedding planner" ($2,000–$8,000 one-time)**, not "ChatGPT Plus" ($20).

### 1.2 Competitive landscape

| Product | Free | Mid | Top | Model of monetization |
|---|---|---|---|---|
| ChatGPT | GPT-4o (capped) | Plus $20 | Pro $200 | Horizontal, usage-heavy |
| Claude | Sonnet (capped) | Pro $20 | Max $100 / $200 | Horizontal, message caps |
| Gemini | 2.5 Flash | AI Pro $20 | AI Ultra $250 | Horizontal + Workspace |
| **Zola / The Knot** | **Full product free** | — | — | **Vendor marketplace ads** |
| **Notion AI** | — | $10 add-on | — | Bundled into SaaS seat |
| **Canva Pro** | Watermark limits | $15 | Teams $30 | Freemium → feature gate |

**Key insight:** The horizontal LLMs cap by *compute* (messages/tokens). Vertical SaaS caps by *outcome* (projects, exports, seats). Easebot sits in-between — we have real LLM cost per user (GPT-4o + GPT-Image-1.5 + Azure Speech), so we *must* cap compute on the top tier to survive whales. But user-facing packaging should lead with **wedding outcomes**, not token counts.

### 1.3 Positioning vs. the incumbents

- **vs. ChatGPT/Claude/Gemini:** "They are smart generalists. Easebot knows *your* wedding — your date, vendors, budget, family dynamics, reminders that actually fire on WhatsApp."
- **vs. The Knot/Zola:** "They are vendor directories with checklists. Easebot is a planner that *talks back*, styles your look, calms you down at 2am."
- **vs. human planner:** "A planner costs $5k and you get them 40 hours/month. Easebot is $15 and available at 3am when you're spiraling about seating charts."

The ladder should mirror the **planning lifecycle**:
- **Free** — engagement week / tire-kicking (0–2 months in)
- **Pro** — active planning (3–9 months out, the biggest cohort)
- **Pro Max** — crunch mode + high-spend couples (final 90 days, destination weddings, >$50k budgets)

---

## 2. Product Inventory (what we can actually gate)

Pulled from code audit, not aspirational.

| Capability | Backing service | Cost driver |
|---|---|---|
| 3 live AI modes (Planner, Stylist, Knowledge) + Assistant fallback. Therapist & Consultant prompts exist but are **disabled in `modeRouter.ts`**. | Azure GPT-4o | Input + output tokens |
| Image generation / edit | Azure GPT-Image-1.5 (fallback GPT-Image-1) | Per-image call |
| Voice TTS (6 personas, 13 languages) | Azure Speech SDK | Per-character |
| Voice STT (multi-language) | Azure Speech | Per-minute |
| Vision / photo analysis | GPT-4o multimodal | Tokens + image tokens |
| Reminders (Email + WhatsApp) | In-process scheduler, Firestore | ~$0 marginal; WhatsApp is per-message |
| Chat history (last 10 msgs) | Firestore | Storage |
| Product search (Stylist) | Algolia | Per-query |

**Today's enforced limits:** Image gen 10/day free, 50/day premium. Message tokens are *tracked but not capped*. No PDF/export/web search.

---

## 3. The Unified Token Meter (the foundation of every tier)

**Principle:** One meter, not five. Every call that costs Azure/Algolia/Twilio money converts into a single "Easebot Token" count. Users see one pool deplete. Engineering enforces one number. No mode is ever locked — all 3 modes (Planner, Stylist, Knowledge) are open to **every** user including guests. **Usage is the meter, not features.**

### 3.1 Why a unified meter
- **Simplicity for users:** Instead of "50 images + 1,500 messages + 200k TTS chars + 30 vision uploads," the user sees one number: "You have X tokens left this month." Nobody budgets 7 separate dials.
- **Simplicity for us:** One function, `chargeTokens(uid, cost)`, wraps every outbound call. One Firestore doc. One dashboard.
- **Cost-correct:** Whale behavior in any dimension (image whale, voice whale, chat whale) hits the same wall. We can't be blindsided by a user who discovers image gen on day 3 and burns $150 in a week.
- **Fair:** A user who writes long planning chats but never generates images gets to use their full pool on chat. A visual-first user gets to use theirs on images. No wasted allowance.

### 3.2 Conversion table (internal — never shown to users)

Normalized against GPT-4o **input** token cost (~$2.50 / 1M tokens on Azure) as "1 Easebot Token = 1 GPT-4o input token."

| Service | Actual cost | Easebot Token cost |
|---|---|---|
| GPT-4o chat — input | $2.50/1M | **1× raw tokens** |
| GPT-4o chat — output | $10.00/1M | **4× raw tokens** (priced at 4x input) |
| GPT-4o vision (per image input) | ~$0.005 | **2,000 tokens** |
| GPT-Image-1.5 — 1024×1024 standard | ~$0.04 | **16,000 tokens** |
| GPT-Image-1.5 — HD / 1536 | ~$0.08 | **32,000 tokens** |
| Azure Speech TTS | $16/1M chars | **0.3 tokens / character** |
| Azure Speech STT | $1/hour | **7,000 tokens / minute** |
| Algolia product search | trivial | **50 tokens / query** |
| WhatsApp reminder send | ~$0.005 | **2,000 tokens** |
| Email reminder send | $0 | **0 tokens** (free to us) |

**Billing rule:** Charge happens *after* the call completes, using actual measured values (Azure returns `prompt_tokens` + `completion_tokens`; image and speech costs are fixed per call). Pre-call check uses a conservative estimate to prevent the user from blowing past the cap on a single expensive call.

### 3.3 Daily AND monthly caps — both enforced
Every tier has **both** a daily ceiling and a monthly ceiling. Daily exists to prevent one 3am binge from burning the whole month's budget. Monthly is the true resource allocation. A request is allowed only if **both** `daily_used + cost ≤ daily_cap` AND `monthly_used + cost ≤ monthly_cap`.

---

## 4. Tier Design

**All tiers: all 3 modes open, all features available. Differentiation is the token pool size, persistence, reminders, and support.**

### 4.1 Guest — "Try it without signing up"

**Goal:** Let visitors feel the product in <60 seconds. Zero friction. The only job of Guest is to produce one magical moment that makes the user create an account.

| Feature | Limit |
|---|---|
| AI modes | **All 3** (Planner, Stylist, Knowledge) |
| Chat messages | **10 total** (lifetime per browser, not per day) |
| Image generation | **3 total** (watermarked "Made with Easebot") |
| Voice TTS | On |- 3 max per session
| Voice STT | On |3 max per session
| Vision / photo upload | on |3 max per session
| Reminders | Off |
| Notes / checklists | Session-only (lost on tab close) | No share access 
| Chat history | Session-only, not persisted |
| Export | Off |

**Enforcement:** hard counters on `guestId` (browser fingerprint + localStorage + IP hash, stored server-side in a `guests/{guestId}` Firestore doc with 7-day TTL). Not abuse-proof — a determined user can clear cookies — but it's the industry standard ceiling. ChatGPT, Perplexity, and Copilot all accept this leakage because the friction of going incognito + re-verifying is enough to convert most people to signup anyway.

**Guest-tier research — what competitors allow:**
| Platform | Messages | Image gen | History | Voice |
|---|---|---|---|---|
| ChatGPT guest | ~10 before nag | **No** | None | No |
| Perplexity guest | 5 Pro searches/day | No | None | No |
| Copilot guest | Limited | Yes, limited | None | No |
| Claude | **Signup required** | — | — | — |
| Gemini | **Signup required** | — | — | — |

Easebot's **10 messages + 3 images** for guests is deliberately *more generous* than ChatGPT (which gives zero guest images). This is a vertical-SaaS acquisition play: weddings are an emotional purchase, and we need the user to see themselves in a dress / a venue / a palette before we ask them to commit. That first visual is worth the ~$0.12 of Azure cost it takes to generate it.

### 4.2 Free (logged in) — "Your planning notebook" — **$0**

**Goal:** The account exists so we can persist data, send reminders, and build a retention loop. Free is enough to plan a tiny low-stress wedding or to stay active during a 12-month engagement runway. Anyone actively planning a real wedding will hit a wall and upgrade.

| Feature | Limit |
|---|---|
| AI modes | **All 3** |
| **Token pool — daily** | **50,000 tokens / day** |
| **Token pool — monthly** | **300,000 tokens / month** |
| Voice TTS | On (counts against pool) |
| Voice STT | On (counts against pool) |
| Vision / photo upload | On (counts against pool) |
| Reminders | **3 active**, email only |
| Chat history | **30 days rolling** |
| Wedding projects | 1 |
| Export | Checklist → PDF |
| Support | Community / docs |
Notes | No editable or collabrator access , only view .

**Why 300k / month:** At the conversion 1 avg chat turn ≈ 1,200 tokens (includes 4x-weighted output), 300k = ~250 normal chat turns **or** ~18 image generations **or** any mix. Enough to feel real. Not enough to plan a wedding end-to-end — which is the point.

**Cost check:** 300k tokens @ blended $4.75/1M real cost = **~$1.42/month per free user** in Azure cost, before infra. Sustainable at scale if free-to-paid conversion hits 3%+.

### 4.3 Pro — "Your wedding co-pilot" — **$14.99/month** or **$119/year (34% off)**

**Goal:** Primary revenue tier. Target: actively planning couples 3–9 months out. This is 80% of paid users.

| Feature | Limit |
|---|---|
| AI modes | All 3 |
| **Token pool — daily** | **300,000 tokens / day** |
| **Token pool — monthly** | **3,000,000 tokens / month** |
| Voice TTS + STT | On |
| Vision / photo upload | On |
| Reminders | **Unlimited active**, Email + **WhatsApp** |
| Chat history | **Full history**, searchable |
| Wedding projects | 2 |
| Export | PDF, CSV |
| Support | Email (support ticket system — coming in future release; best-effort response until then) |
| No watermarks on generated images | ✓ |

**Why 3M / month:** At blended real cost ~$4.75/1M, 3M = **~$14.25/month in Azure spend**, leaving effectively zero margin at the raw ceiling. That's intentional: we price for the *average* user (who will consume 30-50% of the cap), and the cap protects us from whales. Average user hits ~1.2M = $5.70 Azure cost = $9.29 margin before payment processing.

**Daily cap of 300k** prevents a single-day binge from eating a third of the monthly budget. A normal active day is 30k-60k tokens.

**Price anchoring:**
- $14.99 is the "specialty product" price point. $10 feels like a Notion add-on; $20 feels like ChatGPT Plus (commoditized).
- Annual at $119 = effective $9.92/mo. Annual plans deliver 60%+ of LTV in month 1 and cut post-wedding churn drop-off.
- **Lifecycle pack:** Offer **"$49 for 6 months"** at checkout. Couples know their wedding date — a fixed-duration pack converts better than a subscription they'll have to remember to cancel.

### 4.4 Pro Max — "The crunch-mode concierge" — **$39/month** or **$299/year**

**Goal:** Final-90-days panic, destination weddings, $50k+ budgets, and freelance wedding planners using Easebot as a force-multiplier.

| Feature | Limit |
|---|---|
| AI modes | All 3 + **priority routing** (faster first-token latency) |
| **Token pool — daily** | **800,000 tokens / day** |
| **Token pool — monthly** | **8,000,000 tokens / month** |
| Voice TTS + STT | On, priority queue |
| Vision / photo upload | On |
| Reminders | Unlimited, Email + WhatsApp + SMS (when available) |
| Chat history | Full, searchable, exportable |
| Wedding projects | **5** (planners managing multiple clients) |
| Export | PDF, CSV, JSON, shareable read-only links |
| Mood boards / vibe boards | Included |
| Vendor outreach drafts | Included |
| Concierge (human-in-the-loop) | 24h response |
| Support | Priority (support ticket system — coming in future release; best-effort response until then) |
| **Token overage pack** | **$10 for +2M tokens** (one-time, stackable, max **10 packs / month**) |

**Why 8M / month:** At blended ~$4.75/1M, 8M = **~$38 Azure cost at the raw ceiling** — essentially at break-even on the subscription price. This is by design:
- ~70% of Pro Max users will consume 2–4M (average ~3M = $14 cost → $25 margin). These users fund the tier.
- ~25% will consume 4–7M (healthy usage, $19–33 cost → $6–20 margin). Still profitable.
- ~5% will hit 8M+ (whales). They are *capped*, not unlimited, and pushed to the $10/+2M overage pack. An honest whale who wants more pays incremental cost.

**Why not "unlimited":** Because every "unlimited" plan in this market either silently caps (ChatGPT Pro, Claude Max with 5-hour windows) or loses money (early Perplexity Pro). Honesty + a clear cap + cheap overage is a better deal *and* a more sustainable business than "unlimited*" with an asterisk.

**Why $39 and not $99/$200:** ChatGPT Pro ($200) and Claude Max ($100) target professional power users. Easebot's Pro Max target is a **consumer under time pressure** — a bride 45 days out who has woken up at 3am thinking about the seating chart. $39 is the "fancy dinner once" price, impulse-range for someone already spending $30k on the wedding itself. Above $50 creates a psychological wall.

### 4.5 Currency & Geolocation

**Base currency:** USD. Every price in this PRD — $14.99, $39, $119, $299, $10 top-up — is the **canonical value**. Local-currency display is a UI concern, not a business-logic concern.

**Detection:** On first visit, frontend calls `GeolocationService` (`https://api.ipgeolocation.io/ipgeo`) to resolve the user's country → currency (IN → INR, GB → GBP, EU → EUR, etc.).

**Conversion:** Frontend calls `ExchangeRateService` (`https://v6.exchangerate-api.com/v6`) to fetch USD → localCurrency rate. Converted prices are shown on the pricing page, and the **same rate is re-fetched server-side at checkout** to lock the final charge amount. The server is authoritative; the frontend display is indicative.

**Checkout lock rule:** Exchange rate is captured at the moment `/payment/initiate` is called and stored on the `payments/{txnid}` doc. If the user abandons and returns an hour later, they get a fresh rate — no honoring stale quotes.

**Rounding:** Localized prices round to culturally sensible values (INR to nearest ₹49/₹99, EUR to nearest €0.99, JPY to nearest ¥100). A rounding table lives in `services/currencyFormat.ts` (Architect owns). The token pool size never changes across currencies — a Pro user in India gets the same 3M tokens as a Pro user in the US.

**Invoicing currency:** The invoice shows **both** the local-currency charged amount AND the USD canonical price as an FYI line. This prevents support disputes when exchange rates drift.

**No refund policy.** Because currency conversion locks at checkout, users cannot arbitrage rate movements. (See §8.)

---

## 5. What happens when a user hits the cap

**Everyone runs on the same model (full GPT-4o).** No mini fallback. When the pool is exhausted, the user is stopped cleanly and offered a top-up (paid tiers) or upgrade (Free / Guest).

| Cap state | Behavior |
|---|---|
| 0–75% of monthly pool | Normal. No UI indication. |
| 75–90% of monthly pool | Soft banner: "You've used 75% of your monthly Easebot tokens. Here's what's left." + link to usage page. |
| 90–100% | Amber banner + explicit token-cost preview on expensive actions (image gen confirm: "This will use 16,000 tokens. Continue?"). |
| 100% monthly, **paid tier** | Chat, image, voice all paused. Modal: "You've used your full monthly pool. Add a top-up pack (+2M tokens / $10) or wait until {reset_date}." Data and history remain fully accessible. |
| 100% monthly, **Free tier** | Chat paused. Modal: "Your free pool is used up. Upgrade to Pro to continue." |
| 100% daily cap | "You've hit today's limit. Resets at midnight UTC." No upgrade push on daily — it's a pacing signal. |
| Guest 10 msgs / 3 imgs / 3 voice / 3 vision | "Create a free account to keep planning. Your conversation will be saved." |

**No mini-model fallback anywhere.** Graceful degradation is done by (a) clear advance warning, (b) an immediate top-up path on paid tiers, (c) the daily cap preventing accidental burn-through. Pro Max users in 3am crunch can buy a top-up in <60 seconds.

---

## 6. Enforcement — Engineering Requirements

Today's code tracks chat tokens in `accountController` usage docs but does **not** enforce limits, and image/speech/Algolia costs are not pooled into the same meter at all. Required changes:

1. **New shared module: `easebot-backend/src/services/tokenMeter.ts`** — the single source of truth.
   ```ts
   chargeTokens(uid | guestId, service: 'chat' | 'image' | 'tts' | 'stt' | 'vision' | 'algolia' | 'whatsapp', rawCost: number)
     → { allowed: boolean, remainingDaily, remainingMonthly, remainingExtras, consumedFrom: 'monthly' | 'extras' | 'both' }
   ```
   Converts raw cost → Easebot tokens using §3.2 table. Reads tier + current usage, checks **both** daily and monthly caps, atomically increments the counter.

   **Two-bucket ledger:**
   - `monthlyPool` — resets at the start of each billing cycle to the tier's allotment.
   - `extrasBucket` — only grows via `/payment/topup`; never resets; persists across cycles indefinitely.
   - **Consumption order:** drain `monthlyPool` first, then `extrasBucket`. This protects purchased tokens from being eaten by low-usage months.
   - **Daily cap** is evaluated against total consumption for the day (monthly + extras combined). Top-ups do not bypass the daily cap — they only extend the monthly horizon.
   - A single call may consume partially from `monthlyPool` and partially from `extrasBucket` (one call crossing the boundary is allowed).

2. **New middleware: `quotaMiddleware.ts`** — runs on every `/chat`, `/image`, `/tts`, `/stt` route. Pre-call estimate + post-call actual reconciliation. On over-limit: return 402 (Payment Required) with `{ reason, resetAt, upgradeUrl }`.

3. **Guest counter store** — `guests/{guestId}` Firestore doc with:
   ```ts
   { msgCount: number, imgCount: number, firstSeenAt, ipHash, lastActivityAt, ttl: 7d }
   ```
   `guestId` derived from signed cookie + IP hash + browser fingerprint (not foolproof, industry-standard-leaky).

4. **Usage doc schema** (logged-in users) — `users/{uid}/usage/{YYYY-MM}`:
   ```ts
   {
     tier: 'free' | 'pro' | 'promax',
     monthlyTokensUsed: number,   // this month's subscription pool consumption
     monthlyTokensCap: number,    // snapshot of the tier limit
     extrasBucket: number,        // current balance, persists across months
     extrasPurchasedThisMonth: number,  // used for the 10/month top-up cap
     dailyTokensUsed: number,     // monthly + extras combined, resets at UTC midnight
     dailyResetAt: timestamp,
     byService: { chat, image, tts, stt, vision, algolia, whatsapp }
   }
   ```

5. **No model downgrade switch.** Every user runs the full GPT-4o deployment. When `monthlyPool + extrasBucket = 0`, calls return a clean 402 with a top-up CTA. No mini model, no degraded mode, no fallback deployment.

6. **Refactor existing cost sites:**
   - `chatController.ts` — already captures `prompt_tokens`/`completion_tokens`; wire to `chargeTokens`.
   - Image generation route — wrap with `chargeTokens('image', ...)`.
   - TTS/STT routes — same.
   - `algoliaProducts.ts` — add charge call per query.
   - `whatsappReminderService.ts` — charge on send.

7. **`accountController.ts`** — extend `GET /account/me` to return `{ tier, limits, usage: { daily, monthly, extras, byService, remaining } }` for the frontend to render a usage meter that shows both the monthly pool and the extras bucket side by side.

8. **`Pricing.tsx`** — rewrite to match this PRD (currently sketches $12 / $29, not $14.99 / $39).

9. **Stripe integration** (not in repo yet) — products: `easebot_pro_monthly`, `easebot_pro_annual`, `easebot_pro_6mo`, `easebot_promax_monthly`, `easebot_promax_annual`, `easebot_topup_2m`.

10. **Webhook** — Stripe → Firebase Auth custom claim `tier: 'free' | 'pro' | 'promax'`. Read from claim in middleware, not Firestore (faster, no race).

11. **Frontend usage meter** — add a token meter component in the chat header and settings, showing monthly % used with a progress bar. Inline confirm dialog before image gen when >90% used.

---

## 6.5 Refund, Cancellation, and Data Retention Policy

### No refund policy
- **All sales are final.** Monthly, annual, and top-up purchases are non-refundable.
- **Exchange rate movements** after purchase are not grounds for refund (rate is locked at checkout per §4.5).
- **Accidental purchase** within 24 hours: if the user has consumed <1% of the new period's token pool AND the charge was within 24 hours, the support team *may* issue a goodwill refund at their discretion. This is **not** a published policy — it's an internal escalation path.
- **Chargebacks** are disputed with evidence of usage (token-meter logs).

### Cancellation behavior
- **Cancel = stop auto-renewal.** There is no formal cancellation policy or cooling-off period. The user presses "Cancel subscription," the flag `cancel_at_period_end = true` is set, and access continues until the period ends.
- **No immediate refund**, no prorated refund, no "cancel and get money back."
- **Reactivate before period end:** flip the flag off. No new charge, no penalty.
- **After period end:** tier drops to Free automatically. Data is retained (see below).

### Data retention after downgrade or cancellation
- **Keep everything.** Threads, notes, reminders, generated images, saved projects — all retained indefinitely on downgrade. Storage is cheap; user trust is not.
- **Read access stays full** at all tiers. A Free user who used to be on Pro can still read their old threads, view their old images, view their old projects — they just can't **create new content beyond Free limits**.
- **Reminders:** existing reminders created on a paid tier continue to fire even after downgrade to Free. No "punishment" for cancelling. New reminders are subject to the Free tier's limits.
- **Account deletion:** user-initiated account deletion wipes all data; handled by existing `accountController` logic.

### Why this policy shape
- **No refunds + generous data retention** is a better deal than the industry norm (refunds + data hostage). It trades short-term refund risk for long-term trust and word-of-mouth.
- **Top-ups are strictly additive.** A $10 / +2M pack adds exactly 2,000,000 tokens to a user's **extra tokens** bucket. It does **not** add extra reminders, extra projects, extra voice minutes, extra anything else — just tokens. This is deliberate: top-ups are a pure-usage release valve, not a mini plan upgrade.
- **Top-up tokens persist until consumed.** They do not expire at the monthly reset. The monthly subscription pool resets on schedule; the extras bucket is an untouched parallel ledger that depletes only when the monthly pool is empty. A user who buys 2M extras and uses 500k this month keeps 1.5M for next month.
- **Consumption order:** always monthly pool first, then extras. This protects the user's "paid for" tokens from being eaten by a month where they barely used the product.

---

## 7. Launch Strategy

### 7.1 Rollout phases
1. **Phase 0 (now):** Ship Pricing.tsx + Stripe wiring + quota middleware. Don't turn on enforcement yet — observe actual usage for 2 weeks.
2. **Phase 1 (+2 weeks):** Enable enforcement. Existing users grandfathered into Pro for 30 days free to avoid rage-churn.
3. **Phase 2 (+6 weeks):** Launch Pro Max. Run an A/B: 50% see it at $39, 50% at $49. Measure conversion and rage-churn at the two price points.
4. **Phase 3 (+3 months):** Introduce the **6-month fixed pack** as a checkout experiment.

### 7.2 Metrics to watch
- **Guest → Free conversion:** target 15% of guests who send ≥5 messages create an account within 24h.
- **Free → Pro conversion:** target 4% of active free users in first 30 days post-signup.
- **Pro → Pro Max upgrade:** target 8% of Pro users within 60 days of their wedding date.
- **Blended cost per paid user:** Pro under $6/mo Azure, Pro Max under $22/mo Azure (both leaving healthy margin).
- **% of users hitting monthly cap:** healthy range is Free 40%+ (drives upgrade), Pro 15–25%, Pro Max 5–10%. If Pro Max cap-hit rate >15%, the cap is too tight.
- **% of daily-cap hits vs. monthly-cap hits:** if daily cap is hit often without the monthly one, daily is set too low (annoying). If monthly is hit without daily, monthly is the real ceiling (fine).
- **Churn at wedding+30 days:** expected spike; annual plans are the moat against this.

### 7.3 Risks
- **The Knot / Zola compete on "free."** Mitigation: lean hard on the conversational + styling experience that directory apps can't build.
- **Azure cost volatility.** GPT-4o pricing has dropped 3x in 18 months — if it drops again, loosen caps before competitors do. If it rises, tighten (or raise prices).
- **Post-wedding churn is structural.** No fix; lean into annual pre-pay and the 6-month pack.
- **Guest abuse.** Determined users can reset `guestId` and re-grind 10 messages. Mitigate with IP hash + ASN blocklist + simple behavioral signals (10 messages in 90 seconds = bot). Accept some leakage — the cost of a couple of extra GPT-4o calls is lower than the cost of adding signup friction.
- **Image gen whales on Pro Max.** One user spamming HD images = 32k tokens each × 250 = 8M tokens burned in a day. The 800k daily cap stops this — but monitor and tighten if abused.

---

## 8. Summary Table

| | **Guest** | **Free** | **Pro** | **Pro Max** |
|---|---|---|---|---|
| **Price (USD base, localized at checkout)** | $0, no signup | $0 | $14.99/mo or $119/yr | $39/mo or $299/yr |
| **AI modes** | All 3 | All 3 | All 3 | All 3 + priority |
| **Daily tokens** | — (counted in lifetime) | 50,000 | 300,000 | 800,000 |
| **Monthly tokens** | 10 msgs + 3 imgs (lifetime) | 300,000 | 3,000,000 | 8,000,000 |
| **Voice TTS/STT** | — | ✓ (counts pool) | ✓ | ✓ priority |
| **Vision upload** | — | ✓ (counts pool) | ✓ | ✓ |
| **Reminders** | — | 3, email only | Unlimited, Email + WA | Unlimited, Email + WA + SMS |
| **Chat history** | Session only | 30 days | Full, searchable | Full, exportable |
| **Projects** | — (session) | 1 | 2 | 5 |
| **Image watermark** | ✓ | — | — | — |
| **Export** | — | PDF | PDF, CSV | PDF, CSV, JSON, share links |
| **Mood boards** | — | — | — | ✓ |
| **Concierge** | — | — | — | 24h human-in-the-loop |
| **Top-up packs** | — | Upgrade to Pro | — | $10 / +2M tokens, max 10/mo, never expire |
| **Support** | — | Community | Email, ticket system coming | Priority, ticket system coming |
| **Refund / cancel** | n/a | n/a | No refunds. Cancel = stop renewal. | No refunds. Cancel = stop renewal. |

---

## 9. Decisions Locked (previously open)

1. **Student discount:** No. One ladder, no complications.
2. **B2B planner tier:** No at launch. Watch Pro Max's 5-project cap for clustering; revisit in v2.
3. **Regional pricing:** Handled by USD-base + live exchange-rate conversion at checkout (§4.5). No separate regional SKUs.
4. **Refund policy:** None — all sales final (§6.5).
5. **Cancellation policy:** No formal policy — "cancel" means stop auto-renew; access runs until period end; no refund.
6. **Therapist + Consultant modes:** **Do not exist.** Not in Planner. Not in Stylist. Not in pricing. Not in copy. All logic commented out in `modeRouter.ts`, `types.ts`, `prompts/therapist.ts`, `prompts/consultant.ts`, and anywhere else they appear. Sprint 1 opens with a grep-and-comment cleanup ticket. Do not re-enable without a product-level decision.
7. **Data retention on downgrade:** Everything kept indefinitely. Read access full. Reminders created on paid tiers continue firing after downgrade.
8. **Top-up tokens:** Never expire. Max 10 top-ups per calendar month.
9. **Model policy:** Everyone — guest, Free, Pro, Pro Max — runs on full GPT-4o. No mini fallback, no tier-based model downgrade, no degraded-mode path.
10. **Support:** Ticket system is a v2 feature. For now, best-effort email support. Pricing page copy reflects this.
11. **Currency:** USD is the canonical price. Frontend localizes via `GeolocationService` + `ExchangeRateService`. Server locks the rate at `/payment/initiate`.
12. **GST / company info on invoice:** Checkout has optional fields for buyer to enter their own company name + GSTIN; these are printed on the invoice if provided (standard Indian B2B flow). Easebot's own legal entity appears on every invoice regardless.
