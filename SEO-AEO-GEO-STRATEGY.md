# SEO / AEO / GEO / Google-Indexing Strategy — TheWeddingBot (Viva-Chat)

**Status:** Strategy / roadmap (no code shipped yet)
**Scope:** `Wedding-Ease-Viva-Chat/` — React 18 + Vite + TypeScript SPA, domain `theweddingbot.ai`
**Decisions locked (2026-06-22):**
- **Rank target:** *all* — brand term, category head terms, and long-tail tool/guide intent.
- **Surface location:** prerender this app's public pages **in this repo** (no separate marketing site for now).
- **This document:** approved-plan-first; implementation follows in a separate pass.

---

## 1. Executive summary

The chatbot is a **pure client-side SPA** (`src/main.tsx` mounts into an empty `<div id="root">`; no SSR/SSG). That one architectural fact is the bottleneck for *every* channel below:

- **Google** can render JS but defers it to a slow, unreliable "second wave."
- **Answer engines & AI crawlers** (GPTBot, PerplexityBot, ClaudeBot, Google-Extended) **do not execute JavaScript at all** — they download an empty `<div>`. Today we are uncitable by ChatGPT, Perplexity, and AI Overviews regardless of content quality.

**The mental model that fixes this:** stop treating the chat app as an SEO surface. Split into two:

| Surface | Routes | SEO posture |
|---|---|---|
| **Acquisition surface** (ranks) | `/`, `/pricing`, `/help`, `/terms`, `/privacy`, future `/guides/*` | **Prerendered to static HTML**, unique meta, schema, indexable |
| **Product surface** (does NOT rank) | `/chat/*`, `/:userId/*`, `/share/*`, `/checkout`, `/payment/*`, `/login` | **`noindex`** — gated user data, never indexed |

`#1 rankings come only from the acquisition surface.` This strategy builds it out and walls off the rest.

---

## 2. Current-state audit (what exists today)

### Already in place (good bones — keep)
- `index.html` has a real `<title>`, description, OpenGraph + Twitter cards, `theme-color`, `canonical`, PWA manifest, and a `SoftwareApplication` JSON-LD block.
- `public/robots.txt` exists and explicitly allows Googlebot/Bingbot/Twitterbot/facebookexternalhit.
- `public/sitemap.xml` exists (4 URLs).
- `src/hooks/useCanonical.ts` keeps `<link rel=canonical>` + `og:url` in sync per route.

### Gaps / defects (fix these)
| # | Issue | Location | Impact |
|---|---|---|---|
| A | **No prerender/SSG** — crawlers get an empty DOM | `vite.config.ts`, `main.tsx` | Critical. Blocks GEO entirely; weakens SEO. |
| B | **All routes share one `<title>`/description/OG** | `index.html` is the only HTML | `/pricing`, `/help` etc. are indistinguishable to crawlers. |
| C | **Canonical/og:url set client-side only** (`useEffect`) | `useCanonical.ts` | Non-JS crawlers never see the corrected URL. |
| D | **Private/app routes are crawlable** — `robots.txt` `*` block only excludes `/checkout`, `/payment/`, `/login` | `public/robots.txt` | `/chat/*`, `/:userId/*`, `/share/*` waste crawl budget and risk indexing user content. |
| E | **Sitemap incomplete + static** — missing `/help`, no `lastmod`, hand-maintained | `public/sitemap.xml` | Slower discovery, drift. |
| F | **JSON-LD price defect** — Pro listed as `"price":"1","priceCurrency":"INR"` | `index.html` JSON-LD | Google may surface "₹1" in rich results; erodes trust + CTR. |
| G | **Only `SoftwareApplication` schema** — no `Organization`, `FAQPage`, `HowTo`, `BreadcrumbList` | `index.html` | Misses AEO snippet & rich-result opportunities. |
| H | **No `llms.txt`**, no explicit AI-crawler allow rules | site root / robots | GEO crawlers have no map and no clear permission. |
| I | **No content surface** — zero blog/guides/programmatic pages | n/a | Category & long-tail #1s have nothing to rank. |
| J | **Share routes indexable** — `/share/:shareId`, `/shared/note/:shareId` | `App.tsx` | User-generated content could enter the index. Should be `noindex`. |

---

## 3. Pillar 1 — Technical foundation & Google indexing (P0)

> Nothing else works until the acquisition pages render real HTML. This pillar is the prerequisite for Pillars 3 & 4.

### 3.1 Prerendering (SSG) — the #1 lever
Generate static HTML for the public routes at build time. Two viable paths on Vite + react-router-dom v6:

**Option A — `react-snap` (fastest to adopt, lowest code churn) — recommended start**
- Post-build Puppeteer crawl; zero changes to `App.tsx` routing.
- Add to `package.json`: `"postbuild": "react-snap"`, configure `include: ["/", "/pricing", "/help", "/terms", "/privacy"]`.
- Switch `main.tsx` hydration to `hydrateRoot` when prerendered markup is present.
- Trade-off: react-snap is lightly maintained; pin Puppeteer/Node versions.

**Option B — `vite-react-ssg` (cleaner, longer-term) — recommended target**
- Purpose-built for Vite; actively maintained; built-in `<Head>` per route.
- Requires adopting its route-config + `ViteReactSSG` entry (a refactor of the `BrowserRouter`/`Routes` block in `App.tsx`).
- Best end-state; do this once the page set stabilizes.

**Decision:** Ship **Option A** in P0 to unblock GEO/SEO immediately; schedule **Option B** as a P1 hardening task. Only the 5 public routes need prerendering — the app routes stay CSR + `noindex`.

### 3.2 Per-route meta tags
- Add **`react-helmet-async`**; wrap `App` in `<HelmetProvider>`.
- Create one `<SEO title description canonical ogImage jsonLd />` component; drop it into each public page (`Pricing.tsx`, `Help.tsx`, `TermsOfService.tsx`, `PrivacyPolicy.tsx`, landing in `Index.tsx`).
- This **replaces** the manual `useCanonical` approach for public pages (keep the hook only as a fallback) and makes title/description/canonical correct in prerendered HTML.

### 3.3 Robots split — index marketing, wall off the app
Rewrite `public/robots.txt` to:
- Keep allowing Googlebot/Bingbot/social unfurlers.
- **Explicitly allow AI crawlers** for public pages: `GPTBot`, `OAI-SearchBot`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`.
- **Disallow** product/data paths: `/chat/`, `/share/`, `/shared/`, `/checkout`, `/payment/`, `/login`, plus the per-user app views.
- `:userId` is a path-param wildcard robots can't cleanly match — so **also** render `<meta name="robots" content="noindex,nofollow">` (via the SEO component) on all `/:userId/*`, `/chat/*`, and `/share/*` views, and ideally serve `X-Robots-Tag: noindex` from hosting for those path patterns.

### 3.4 Sitemap — complete + build-generated
- Add a build step that emits `sitemap.xml` from the known public-route list with `lastmod`.
- Include `/`, `/pricing`, `/help`, `/terms`, `/privacy`, and every future `/guides/*` page.

### 3.5 Fix the structured-data price defect (item F)
- Correct the `SoftwareApplication` `offers` in `index.html` to real prices, or remove the placeholder `₹1` offer. Cross-check against the locked pricing in `project_pricing_rollout` memory before editing (run the `pricing-tier-check` skill).

### 3.6 Search Console / Bing Webmaster + indexing
- Verify `theweddingbot.ai` in **Google Search Console** + **Bing Webmaster Tools**.
- Submit `sitemap.xml`; use **URL Inspection** + the **Indexing API** to force fast pickup of the prerendered pages.
- Monitor Coverage/Crawl reports for the `noindex` split landing correctly.

### 3.7 Core Web Vitals
- LCP/INP/CLS are ranking inputs. The heavy lazy-loaded `Index.tsx` and font/image preloads need measurement.
- Run the **`qa-performance`** agent (Chrome DevTools MCP + Lighthouse) against the prerendered landing; apply the `vercel-react-best-practices` skill. Target: LCP < 2.5s, INP < 200ms, CLS < 0.1 on the landing page.

---

## 4. Pillar 2 — SEO (content + authority)

Since the target is *all* intent tiers, build a keyword architecture in three clusters:

| Cluster | Example queries | Page type | Difficulty |
|---|---|---|---|
| **Brand** | "TheWeddingBot", "wedding bot ai" | Landing `/` | Easy — win in weeks |
| **Category head** | "AI wedding planner", "wedding planning assistant", "AI wedding planning app" | Landing + `/pricing` + comparison pages | Hard — 3–6 mo, needs links |
| **Long-tail / tool intent** | "wedding budget calculator", "wedding checklist template", "how to plan a wedding in 6 months", "wedding planning timeline India" | `/guides/*` content hub (prerendered) | Medium — volume play, fastest ROI |

### Build-out
- **Content/guides hub** under `/guides/*`, prerendered like the other public pages. Each guide: one focused intent, a `<h1>`, semantic structure, internal links to the product, and a soft CTA into the chat.
- **On-page hygiene:** unique title/description/H1 per page, descriptive image `alt`, clean internal linking, breadcrumb schema.
- **Regional angle:** you bill in INR via PayU — "wedding planning India / Indian wedding" terms are lower-competition, high-intent. Prioritize a few in the guides hub.
- **Authority:** AI-tool directories (There's An AI For That, Futurepedia), Product Hunt launch, wedding directories, digital PR / guest posts. Backlinks are the gating factor for category head terms.

---

## 5. Pillar 3 — AEO (answer engines, snippets, People-Also-Ask)

- **Schema expansion** (JSON-LD in `index.html` + per-page via the SEO component):
  - `Organization` (logo, sameAs social links) — establishes entity.
  - `FAQPage` on `/pricing` and `/help`.
  - `HowTo` on relevant guides ("How to plan a wedding in 6 months").
  - `BreadcrumbList` on guides.
- **Snippet-shaped content:** phrase headings as the actual question (`<h2>How much does TheWeddingBot cost?</h2>`), then a **direct 40–60 word answer first**, detail after. This is what wins Featured Snippets and "People Also Ask."
- **Crisp entity facts:** a clear, factual "what it is / what it does / pricing / who it's for" block that answer engines can lift verbatim.

---

## 6. Pillar 4 — GEO (ChatGPT, Perplexity, AI Overviews, Gemini, Claude)

- **Prerendering (Pillar 1) is the hard prerequisite.** No static HTML → no citation. This is why Pillar 1 is P0.
- **`llms.txt`** at the site root (`/llms.txt`): a concise, LLM-readable map — product description, key facts, and links to the canonical public pages + top guides.
- **Allow the AI crawlers** (done in §3.3). Blocking them = opting out of generative search.
- **Declarative, factual writing** with structured data is more "liftable" by generative engines than marketing prose.
- **Third-party presence is the biggest GEO lever** — LLMs cite sources they trust more than your own domain: get into "best AI wedding planners" listicles, Reddit threads, G2/Capterra, and AI directories. Off-site work, but it disproportionately drives GEO citations.

---

## 7. Prioritized roadmap

### P0 — Foundation (week 1, unblocks everything)
1. Prerender the 5 public routes (`react-snap`, Option A) + switch to `hydrateRoot`.
2. `react-helmet-async` + `<SEO>` component → unique meta/canonical/title per public page.
3. Robots split + `noindex` on all app/chat/share routes (§3.3).
4. Build-generated `sitemap.xml` incl. `/help` + `lastmod` (§3.4).
5. Fix the `₹1` JSON-LD price defect (§3.5, after `pricing-tier-check`).
6. Verify Search Console + Bing; submit sitemap (§3.6).

### P1 — Optimize & expand (weeks 2–4)
7. Schema expansion: `Organization`, `FAQPage`, `HowTo`, `BreadcrumbList` (§5).
8. `llms.txt` + confirm AI-crawler access (§6).
9. Core Web Vitals pass via `qa-performance` (§3.7).
10. Scaffold `/guides/*` content hub (routing + prerender + first 3–5 guides).
11. Migrate prerender to `vite-react-ssg` (Option B) once routes stabilize.

### P2 — Scale (month 2+)
12. Content engine: 15–30 guides across long-tail clusters, refreshed on cadence.
13. Off-site: directory listings, Product Hunt, backlinks, digital PR.
14. Programmatic pages for tool intent (calculators/templates) where it fits.

---

## 8. Measurement / KPIs

| Metric | Tool | Target |
|---|---|---|
| Indexed public pages | Search Console Coverage | 100% of acquisition surface; 0 app routes |
| Brand-term rank | Search Console / rank tracker | #1 within ~4 weeks |
| Category-term rank | rank tracker | Top-10 by month 3, climbing |
| Organic clicks/impressions | Search Console | Up and to the right MoM |
| AI-citation presence | manual checks in ChatGPT/Perplexity/AI Overviews | Cited for brand + key category queries |
| Core Web Vitals (landing) | Lighthouse / CrUX | LCP <2.5s, INP <200ms, CLS <0.1 |

---

## 9. Implementation appendix (touch-points for the P0 pass)

| Change | File(s) |
|---|---|
| Prerender config + `postbuild` | `vite.config.ts`, `package.json` |
| Hydration switch | `src/main.tsx` (`createRoot` → `hydrateRoot` when prerendered) |
| Helmet provider | `src/App.tsx` (wrap in `<HelmetProvider>`) |
| `<SEO>` component | new `src/components/seo/SEO.tsx` |
| Per-page meta usage | `src/pages/{Index,Pricing,Help,TermsOfService,PrivacyPolicy}.tsx` |
| `noindex` on app routes | SEO component invoked from `Index.tsx` app views + `SharedChat.tsx` + `SharedNote.tsx` |
| Robots | `public/robots.txt` |
| Sitemap generator | build script + `public/sitemap.xml` output |
| JSON-LD price + Org/FAQ schema | `index.html` (+ per-page via SEO component) |
| `llms.txt` | `public/llms.txt` |

**Guardrails:** Do not touch Firebase config/rules. Run `pricing-tier-check` before editing any price in JSON-LD. Open PRs against `Bug-Resolve-claude`, never `main` (per workspace rules).

---

*Generated 2026-06-22. Next step on approval: execute the P0 checklist in §7.*
