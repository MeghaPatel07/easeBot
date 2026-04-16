# PRD — SEO / AEO Layer for TheWeddingBot

**Author:** Engineering
**Status:** Draft v1
**Created:** 2026-04-13
**Related strategy:** [SEO_STRATEGY.md](./SEO_STRATEGY.md)

---

## 1. Summary

Add a unified, reusable SEO layer to the TheWeddingBot React SPA so that every route emits correct per-page metadata, structured data, canonical URLs, and social tags — and so that engineering teams can extend the system without touching `index.html` or repeating Helmet boilerplate in every page.

This PRD covers **Phase 0 (Technical Foundation)** from `SEO_STRATEGY.md`. Later phases (prerendering, content hub, i18n, dynamic OG via Edge functions) are tracked separately.

## 2. Problem

The product is a Vite + React CSR SPA deployed to Vercel. All 21 routes currently render the same static `<title>` and `<meta description>` baked into `index.html`. There is no canonical URL, no JSON-LD, no per-page Open Graph, no sitemap, no robots directive for the private user-scoped routes, and nothing for AI crawlers to ground answers on. This makes TheWeddingBot:

- **Invisible** to Google beyond the homepage.
- **Unquotable** by answer engines (ChatGPT, Perplexity, Gemini, Claude).
- **Unsafe** — authenticated routes like `/:userId/budget` are currently Allow-listed for crawling, which risks leaking URL patterns even though the content is gated.
- **Unshareable** — WhatsApp/Twitter/Slack unfurls show the placeholder Lovable OG image.

## 3. Goals

1. Every public route emits a correct `<title>`, `<meta name="description">`, canonical URL, Open Graph tags, Twitter card, and — where relevant — JSON-LD.
2. Private user-scoped routes emit `noindex, nofollow` and are disallowed in `robots.txt`.
3. Shareable routes (`/share/*`, `/shared/note/*`) emit dynamic meta based on the loaded content, with a safe fallback while data is loading.
4. The system is **zero-new-dependency** — no `react-helmet-async` install required — because the runtime is a tiny custom hook that manages `document.head` directly. This keeps the bundle flat and avoids provider wrapping.
5. Developers can add SEO to a new page in **one line**: `useSEO({ title, description, canonical })`.
6. Baseline JSON-LD (`Organization`, `WebSite`, `SoftwareApplication`) ships inside `index.html` so it's visible to non-JS crawlers on first byte.

## 4. Non-goals (for this PRD)

- Server-side rendering or static prerendering (Phase 1).
- Content hub / blog / guides (Phase 1).
- Locale-prefixed routes and hreflang (Phase 2).
- Vercel Edge functions for dynamic OG on shared URLs (Phase 3).
- Analytics, GA4, Search Console verification — covered by a separate PRD.

## 5. Scope of change

### Files created
| File | Purpose |
|---|---|
| `src/seo/useSEO.ts` | React hook that mutates `document.head` (title, meta, link, script[type=application/ld+json]) with cleanup. |
| `src/seo/SEO.tsx` | Declarative `<SEO {...}/>` component wrapping `useSEO` for pages that prefer JSX. |
| `src/seo/seoConfig.ts` | Central config: site constants, per-route defaults, route-pattern matching. |
| `src/seo/structuredData.ts` | JSON-LD generators for `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`, `Article`. |
| `src/seo/RouteSEO.tsx` | Component mounted once in `App.tsx` that watches `useLocation()` and applies the matching route config automatically. |
| `public/sitemap.xml` | Static sitemap for public routes. |
| `docs/SEO_STRATEGY.md` | Strategic plan (already authored). |
| `docs/SEO_PRD.md` | This document. |

### Files modified
| File | Change |
|---|---|
| `index.html` | Refresh title/description, add canonical placeholder, inline `Organization` + `WebSite` + `SoftwareApplication` JSON-LD, remove placeholder Lovable OG image, add theme-color, add link to `sitemap.xml`. |
| `public/robots.txt` | Add `Sitemap:` directive, explicit `Disallow:` for user-scoped routes, allow `/`, `/terms`, `/privacy`, `/share/*` (with the note that shares will be noindex'd at the page level). |
| `src/App.tsx` | Mount `<RouteSEO />` inside `<BrowserRouter>`. |
| `src/pages/SharedChat.tsx` | Add `<SEO>` with dynamic title from `data.threadTitle` + `noindex`. |
| `src/pages/SharedNote.tsx` | Add `<SEO>` with dynamic title from `note.title` + `noindex`. |
| `src/pages/TermsOfService.tsx` | Add `<SEO>` — legal page defaults. |
| `src/pages/PrivacyPolicy.tsx` | Add `<SEO>` — legal page defaults. |
| `src/pages/NotFound.tsx` | Add `<SEO>` — `noindex` + proper 404 title. |

### Files intentionally NOT changed
- `src/pages/Index.tsx` — the RouteSEO mount in `App.tsx` handles its metadata via route pattern matching. We don't want 16 sub-routes each importing the SEO component.

## 6. Functional requirements

### FR-1 — `useSEO` hook
- MUST accept: `title`, `description`, `canonical`, `image`, `type` (og:type, default `website`), `robots` (default `index, follow`), `keywords`, `structuredData` (array of JSON-LD objects), `locale` (default `en_US`).
- MUST update `document.title` synchronously on mount.
- MUST upsert each meta tag by selector (`meta[name="description"]`, `meta[property="og:title"]`, …) — never duplicate.
- MUST insert JSON-LD as `<script type="application/ld+json" data-seo="1">` with `data-seo` marker for cleanup.
- MUST restore previous tag values on unmount so that route transitions don't leave stale tags.
- MUST be SSR-safe (no-op if `typeof document === 'undefined'`) so that a future prerender step doesn't crash.

### FR-2 — `seoConfig.ts`
- Exports `SITE` constants: `name`, `url`, `defaultTitle`, `titleTemplate`, `defaultDescription`, `defaultImage`, `twitterHandle`, `locale`.
- Exports `routeSEO`: an ordered array of `{ pattern: RegExp, seo: SEOProps }` entries.
- `titleTemplate` is `"%s · TheWeddingBot"`; if a page passes an absolute title (no `%s`), the template is bypassed.
- Every entry MUST include a canonical URL derived from `SITE.url + pathname`.

### FR-3 — `RouteSEO` component
- MUST be mounted inside `<BrowserRouter>` once.
- On every `useLocation()` change, finds the first `routeSEO` entry whose pattern matches the pathname and calls `useSEO` with it.
- User-scoped routes (pattern: `^/[^/]+/(gallery|planner|…)`) MUST resolve to `robots: 'noindex, nofollow'`.
- If no pattern matches, MUST fall back to site defaults (still valid tags).

### FR-4 — Baseline structured data in `index.html`
- `Organization` JSON-LD: name, url, logo, `sameAs` placeholder array, contactPoint email.
- `WebSite` JSON-LD with `potentialAction` (`SearchAction`) so Google can offer a sitelinks search box once we expose a search endpoint.
- `SoftwareApplication` JSON-LD: `applicationCategory: LifestyleApplication`, `operatingSystem: Web, iOS, Android`, `offers` with freemium pricing, `aggregateRating` placeholder.

### FR-5 — `robots.txt`
```
User-agent: *
Allow: /
Allow: /terms
Allow: /privacy
Disallow: /chat/
Disallow: /share/
Disallow: /shared/
Disallow: /*/gallery
Disallow: /*/planner
Disallow: /*/liked
Disallow: /*/reminders
Disallow: /*/budget
Disallow: /*/shopping
Disallow: /*/saved-items
Disallow: /*/timeline
Disallow: /*/progress
Disallow: /*/notifications
Disallow: /*/collaborate
Disallow: /*/notes

Sitemap: https://theweddingbot.ai/sitemap.xml
```

### FR-6 — `sitemap.xml`
- Contains `/`, `/terms`, `/privacy` at minimum.
- `lastmod` dates in ISO-8601.
- `changefreq` = `weekly` for `/`, `yearly` for legal pages.
- Hostname driven by `SITE.url` — a simple Node script in a future PR can regenerate this at build time.

### FR-7 — Page-level dynamic SEO
- `SharedChat` MUST set title from `data.threadTitle` once loaded; until then, use `"Shared Wedding Chat · TheWeddingBot"` and `noindex`.
- `SharedNote` MUST set title from `note.title`; until loaded, use `"Shared Wedding Note · TheWeddingBot"` and `noindex`.
- `NotFound` MUST set `"Page not found · TheWeddingBot"` and `noindex`.

## 7. Non-functional requirements

- **Bundle impact:** ≤ 3KB gzip added to the main chunk. No new runtime dependencies.
- **INP impact:** Zero. `useSEO` runs inside `useEffect`, not render. No `requestAnimationFrame` thrash.
- **Type safety:** Full TypeScript. No `any`.
- **Determinism:** Given the same pathname, SEO output is identical between reloads (no `Date.now()` in tags).

## 8. User stories

- As a **growth marketer**, I can share a link to `/terms` and the Twitter card shows the correct TheWeddingBot branding.
- As an **AI crawler (Perplexity)**, I can read the landing page HTML and see `Organization` + `SoftwareApplication` JSON-LD on first byte, so I can cite TheWeddingBot as an entity.
- As a **Googlebot**, I receive a `noindex` directive on `/me/budget` and do not attempt to index a user's private budget URL.
- As a **product engineer**, I can add a new public route and give it full SEO by adding a single entry to `routeSEO` — no imports inside the page component.
- As a **user sharing a chat**, the WhatsApp unfurl for `/share/abc123` shows the actual thread title, not "Lovable".

## 9. Acceptance criteria

- [ ] Visiting `/` in an incognito browser shows `<title>` = `"TheWeddingBot · Your AI Wedding Planner & Concierge"` (or whatever is configured), not the static placeholder.
- [ ] Visiting `/terms` shows `<title>` = `"Terms of Service · TheWeddingBot"` and the canonical meta points to `https://theweddingbot.ai/terms`.
- [ ] Visiting `/some-user-id/budget` shows `<meta name="robots" content="noindex, nofollow">`.
- [ ] View-source on `/` contains three `<script type="application/ld+json">` blocks (Organization, WebSite, SoftwareApplication) **without** running JS.
- [ ] `GET /robots.txt` returns a Sitemap directive pointing at `/sitemap.xml`.
- [ ] `GET /sitemap.xml` returns valid XML with at least 3 URLs.
- [ ] Google Rich Results Test passes on `/`, `/terms`, `/privacy` with zero errors.
- [ ] Lighthouse SEO score ≥ 95 on `/`, `/terms`, `/privacy`.
- [ ] Navigating between `/` → `/terms` → `/privacy` → `/` produces no duplicate meta tags in the DOM (inspect `document.head` after navigation).
- [ ] Opening `/share/<expired-id>` still emits `noindex` even when the content is not loaded.
- [ ] Type-check passes: `tsc --noEmit` clean.
- [ ] Build passes: `npm run build` clean.

## 10. Implementation plan

1. **Scaffolding (this PR):** create `src/seo/*`, write `useSEO`, `seoConfig`, `structuredData`, `SEO`, `RouteSEO`.
2. **Wiring (this PR):** mount `<RouteSEO />` in `App.tsx`, add `<SEO>` calls to `SharedChat`, `SharedNote`, `TermsOfService`, `PrivacyPolicy`, `NotFound`.
3. **Static assets (this PR):** rewrite `index.html` head, update `robots.txt`, add `public/sitemap.xml`.
4. **Manual QA:** walk through acceptance criteria above in a staging Vercel deployment.
5. **Search Console submission:** after staging QA, verify domain and submit sitemap in production (separate PR — no code change).

## 11. Open questions

- **Canonical domain.** This PRD assumes `https://theweddingbot.ai`. If production uses a different domain (e.g. `www.theweddingbot.ai` or a `.in` variant), `SITE.url` must be updated before merging.
- **`twitter:site` handle.** The current static HTML lists `@lovable_dev`, which must be replaced with the real TheWeddingBot handle (or the tag should be dropped).
- **`Organization.sameAs`.** We need the live URLs for LinkedIn, Instagram, X, possibly Wikidata. Ship with empty array v1 and fill in as accounts come online.
- **`aggregateRating`.** Ship without it until we have real app-store / review data. Fabricating ratings in schema is a penalty risk.
- **Share link policy.** Keep `/share/*` `noindex` forever, or make it opt-in per user? Decision gates whether we add a sitemap entry later.

## 12. Out-of-scope — tracked elsewhere

- GA4 + `web-vitals` wiring → separate Measurement PRD.
- Prerendering / SSR → Phase 1 PRD.
- Content hub (`/guides/*`) → Phase 1 PRD.
- i18n URL prefixes + hreflang → Phase 2 PRD.
- Edge-function dynamic OG for shared URLs → Phase 3 PRD.
