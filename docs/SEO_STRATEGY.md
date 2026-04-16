# TheWeddingBot — SEO / AEO / GEO Strategic Plan

**Owner:** Growth + Engineering
**Last updated:** 2026-04-13
**Status:** Draft v1 — ready for review
**Related:** [SEO_PRD.md](./SEO_PRD.md)

---

## 1. Why this plan exists

TheWeddingBot is an AI wedding-planning chatbot shipped as a Vite + React SPA on Vercel. Today the product is functionally rich but **practically invisible to search engines and answer engines**:

- Every route ships the same static `<title>` and `<meta description>` from `index.html`.
- There is no JSON-LD, no canonical URLs, no sitemap, no hreflang, no analytics.
- The 10-language translation stack has **zero SEO expression** (no `/hi/`, no `hreflang`).
- Open Graph still points to `lovable.dev/opengraph-image-p98pqg.png` (scaffolded placeholder).
- Rendering is pure CSR — JS must execute before any content appears, which hurts classical SEO *and* kills most AEO crawlers (Perplexity, ChatGPT search, Google AI Overviews, Claude) that don't run JavaScript.

The market has also shifted. In 2025–2026 a large and growing share of high-intent commercial queries — *"best AI wedding planner", "how to plan an Indian wedding in 6 months"* — are answered directly inside **ChatGPT, Perplexity, Google AI Overviews, Gemini and Claude**, not on a classic SERP. Winning traffic now requires being both **crawlable** (classical SEO) and **quotable** (AEO / GEO — Generative Engine Optimization).

This plan defines the strategy. Implementation is tracked in [SEO_PRD.md](./SEO_PRD.md).

---

## 2. Current-state snapshot

| Area | State | Severity |
|---|---|---|
| Rendering | Pure CSR (Vite + React Router v6) | 🔴 High |
| Per-route `<title>` / `<meta>` | None (static only) | 🔴 High |
| Canonical URLs | None | 🔴 High |
| JSON-LD structured data | None | 🔴 High |
| Sitemap.xml | Missing | 🔴 High |
| robots.txt | Exists, but no `Sitemap:` directive | 🟡 Med |
| Open Graph image | Placeholder (`lovable.dev/...`) | 🟡 Med |
| Hreflang / i18n URLs | None — session-based language only | 🔴 High |
| Analytics (GA4 / Search Console) | None | 🔴 High |
| Core Web Vitals monitoring | None | 🟡 Med |
| Content hub / blog | None | 🟡 Med (strategic) |
| Public shareable URLs (`/share/*`, `/shared/note/*`) | Exist, not SEO-optimized, no dynamic OG | 🔴 High |
| Alt text on generated images | Missing | 🟡 Med |

See the project context report dated 2026-04-13 for file-level details.

---

## 3. What is different about SEO in 2026 — the trends we're designing for

### 3.1 Classical SEO is now a subset
Google still matters, but it now competes with **Answer Engines** that paraphrase rather than link. Our playbook must satisfy both at once.

### 3.2 Answer Engine Optimization (AEO) — being *quotable*
AEO is about being the passage a generative model chooses to ground its answer on. Signals that matter:

- **Extractable passages.** Short, self-contained Q&A blocks (40–80 words) with the question verbatim in an `<h2>` or `<h3>`.
- **Schema.org `FAQPage`, `HowTo`, `Article`, `SoftwareApplication`, `Organization`.** These give LLM crawlers structured anchors.
- **Named authorship + dateline.** LLMs weight content that has an author, `datePublished`, and `dateModified`.
- **Citable statistics, not fluff.** Concrete numbers ("typical Indian wedding budget: ₹15–25 lakh") get quoted far more than adjectives.
- **Clean, semantic HTML.** `<article>`, `<section>`, `<h1>`–`<h3>` hierarchy, not a soup of `<div>`s.
- **Static HTML first paint.** LLM crawlers rarely run JS. Critical content must be in the HTML response, not injected by React.

### 3.3 Generative Engine Optimization (GEO)
GEO extends AEO with *brand-level* signals: consistent entity definition across the web (Wikidata, LinkedIn, G2, Crunchbase), coherent `sameAs` linking inside `Organization` JSON-LD, and being mentioned by other sites that LLMs already trust.

### 3.4 E-E-A-T + YMYL for wedding planning
Weddings sit close to YMYL (Your Money, Your Life) — big spend, emotional, culturally sensitive. Google's March 2024 and later core updates explicitly reward **first-hand experience**. That means real photos, real names, real couples, real numbers — not generic "top 10 tips" copy.

### 3.5 Core Web Vitals + INP
`INP` replaced `FID` in March 2024. For a chat UI with heavy JS, INP is our biggest risk. Any SEO win is cancelled out if INP > 200ms.

### 3.6 Multilingual is now mandatory, not optional
Our backend already translates into 10 languages. Not exposing that via crawlable URLs + hreflang leaves 90% of our addressable market invisible to search.

---

## 4. Strategic pillars

We organize the work into five pillars. Each pillar has a clear outcome and a small number of KRs.

### Pillar 1 — Technical SEO foundation ("be crawlable")
**Outcome:** Every route returns correct `<title>`, `<meta description>`, canonical, OG, Twitter, and valid JSON-LD — and Google / Bing / AI crawlers can discover them.

- Per-route metadata via a lightweight `<SEO>` component (no heavy deps).
- Canonical URLs on every page.
- `sitemap.xml` (static for public routes + dynamic for `/share/*` if we ever index shares — default is `noindex`).
- `robots.txt` with `Sitemap:` directive and explicit `Disallow:` for authenticated, user-scoped routes (`/:userId/*`).
- JSON-LD: `Organization`, `WebSite` + `SearchAction`, `SoftwareApplication`, `FAQPage` on the landing view, `BreadcrumbList` on deep views.
- Google Search Console + Bing Webmaster + IndexNow submission.

### Pillar 2 — Render-path SEO ("be indexable")
**Outcome:** Classical and AI crawlers see real HTML on first byte for the pages that matter for acquisition (marketing-oriented routes and shared content).

Two viable paths — we pick **prerendering** for phase 1 because it ships without a framework migration:

- **Phase 1 (ships now):** Vite + `vite-plugin-prerender` (or `react-snap`) to prerender a small set of crawl-critical routes (`/`, `/terms`, `/privacy`, plus future marketing pages) into static HTML at build time. JSON-LD and meta are baked in.
- **Phase 2 (Q3):** Evaluate migration of marketing surface to Next.js App Router (or Astro) for true SSR/ISR. Keep the chat app as a CSR sub-route.

### Pillar 3 — Answer Engine Optimization ("be quotable")
**Outcome:** When a user asks ChatGPT / Perplexity / Gemini *"best AI wedding planner for an Indian wedding"*, TheWeddingBot is named and linked.

- Launch a **FAQ block** on the landing page covering the 15 highest-intent questions. Mark up as `FAQPage` JSON-LD.
- Ship a **content hub** (`/guides/*`) with first-party, opinionated, numbered guides (Indian wedding budget breakdown, Hindu ceremony order of events, Catholic/Nikah/court options, vendor-selection checklist). Each guide: `Article` + `HowTo` schema, author byline, `datePublished`, `dateModified`.
- Every guide includes an **"At a glance" box** (40–80 words, answer-engine-ready).
- Add a machine-readable `/.well-known/ai.txt` (emerging convention) declaring how AI crawlers may use the content.
- Include a "Cite this page" copy block on guides — raises the citation signal for LLMs that scrape the web.

### Pillar 4 — International SEO ("be findable in Hindi and beyond")
**Outcome:** Hindi / Gujarati / Spanish / Arabic speakers searching in their own language find TheWeddingBot.

- Introduce optional locale prefixes: `/hi/`, `/gu/`, `/es/`, `/ar/`, `/pt/`, `/de/`, `/zh/`. Default remains no-prefix = English.
- Every localized marketing route emits `<link rel="alternate" hreflang="...">` plus an `x-default` pointing at the English version.
- Translated strings for meta `title` / `description` / OG copy live in a single `seoLocale.ts` file — same shape as the existing language constants in `src/components/chat/constants.ts`.
- Do **not** localize the authenticated app chrome yet — scope is marketing surface only.

### Pillar 5 — Measurement & observability ("know what's working")
**Outcome:** We can see organic traffic, AEO citation traffic, Core Web Vitals, and conversion — per page, per locale, per source.

- GA4 via `gtag` loaded with `defer` (no GTM yet — keeps INP clean).
- Core Web Vitals via the `web-vitals` library, posted to GA4 as custom events.
- Google Search Console + Bing Webmaster verified via DNS TXT.
- Weekly SEO dashboard (manual v1): clicks, impressions, CTR, average position, top queries, top pages, Core Web Vitals buckets.
- Tag inbound traffic from AI engines using UTM heuristics + `document.referrer` pattern matching (`perplexity.ai`, `chat.openai.com`, `gemini.google.com`, `claude.ai`).

---

## 5. Phased roadmap

Timelines assume one part-time engineer and one part-time content owner. Adjust if capacity changes.

| Phase | Window | Scope | Exit criteria |
|---|---|---|---|
| **P0 — Foundation** | Week 1–2 | Pillar 1 in full: per-route meta, canonical, sitemap, robots, Org + WebSite + SoftwareApplication JSON-LD, OG image refresh. Shipped via the `<SEO>` component in this PR. | Lighthouse SEO ≥ 95 on `/`, `/terms`, `/privacy`. Google Search Console verified. First sitemap submitted. |
| **P0.5 — Measurement** | Week 2 | GA4 + `web-vitals` + Search Console + Bing Webmaster. | GA4 receiving events. CWV dashboard populated. |
| **P1 — AEO content hub MVP** | Week 3–6 | 5 cornerstone guides under `/guides/*` with `Article` + `FAQPage` + `HowTo` schema. Prerendering via `vite-plugin-prerender`. | 5 guides live. Each prerendered. Each with ≥ 4 FAQ entries in JSON-LD. |
| **P2 — International** | Week 7–9 | Locale-prefixed marketing routes for hi, es, ar. Hreflang. Translated meta. | 3 locales live, GSC shows per-locale impressions. |
| **P3 — Shared content SEO** | Week 10–11 | `/share/:shareId` and `/shared/note/:shareId` get dynamic OG + Twitter card via a tiny Edge function on Vercel (server-side OG only; the page itself stays client-rendered for auth reasons). | WhatsApp / Slack / Twitter unfurl with correct thumbnail and title. |
| **P4 — GEO + authority** | Week 12+ | Wikidata entity, LinkedIn company page canonicalized, `sameAs` links in Org JSON-LD, outreach to 3–5 wedding blogs. | TheWeddingBot appears as a named entity in at least one AI engine response for a target query. |

---

## 6. Guardrails & non-goals

- **Do not index user-scoped routes.** `/:userId/*` is private by design. Ship with `Disallow:` in robots *and* `<meta name="robots" content="noindex, nofollow">` in those views. Belt and braces.
- **Do not index `/share/:shareId` by default.** Shared chats are semi-private and expire in 7 days. Index only if the user explicitly opts in (future feature). Until then, emit `noindex` but keep the `og:*` tags for social unfurls.
- **Do not sacrifice INP for SEO.** Any SEO script we add must be `defer` or `async`. No GTM. No blocking third parties.
- **Do not write generic content.** If a guide reads like it could have been written by any AI with no wedding-planning experience, it will be demoted by Google's helpful-content systems and ignored by answer engines. First-hand, opinionated, specific.
- **Do not over-schema.** One accurate JSON-LD block beats five speculative ones. Google's structured-data report will flag mismatches.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CSR keeps us out of AI crawlers | High | High | Prerender marketing surface (P1). Evaluate SSR in P4. |
| Helpful-content penalty on thin guides | Medium | High | Editorial review before publish. First-hand voice mandatory. |
| INP regression from `web-vitals` + GA4 | Low | Medium | Load both with `defer`, after first paint. |
| Hreflang misconfiguration causing duplicate-content penalty | Medium | Medium | Ship locales one at a time. Validate with GSC hreflang report. |
| Competitors (The Knot, WeddingWire, Zola) dominate branded queries | High | Medium | Focus on long-tail cultural + AI-specific queries first. |

---

## 8. Success metrics (first 90 days after P0 ships)

- **Lighthouse SEO score ≥ 95** on every prerendered page.
- **Core Web Vitals:** LCP < 2.5s (p75), INP < 200ms (p75), CLS < 0.1 (p75).
- **Google Search Console:** ≥ 500 indexed URLs, ≥ 2,000 impressions/mo, CTR ≥ 3%.
- **AEO presence:** TheWeddingBot named in ≥ 1 answer from each of ChatGPT, Perplexity, Gemini on a target query.
- **Organic acquisition share:** ≥ 15% of new signups attributed to organic / AI referral (currently 0%).

---

## 9. Open questions for the team

1. Are we OK adding `vite-plugin-prerender` in P1, or do we want to jump straight to Next.js / Astro?
2. Who owns guide content? Options: in-house, freelance wedding editor, hybrid.
3. Do we want `/share/:shareId` indexable at all, ever? Affects the robots.txt decision today.
4. Is there appetite for a Wikidata entry + LinkedIn company page refresh in P4?
5. What's the canonical domain? `theweddingbot.ai` vs `viva.theweddingbot.ai` vs `www.theweddingbot.ai` — we must pick one before P0 ships, otherwise canonicals will be wrong.
