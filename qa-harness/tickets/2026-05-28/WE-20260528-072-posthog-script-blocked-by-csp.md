# WE-20260528-072: PostHog telemetry blocked at runtime — "Refused to execute script from /ingest/array/…" 84× per page load

| Field | Value |
|---|---|
| **ID** | `WE-20260528-072` |
| **Created** | `2026-05-28T17:30:00Z` |
| **Reporter** | `qa-visual` |
| **Severity** | `P2` |
| **Priority** | `P2` |
| **Category** | `functional` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `vite.config.ts` (PostHog proxy) + `src/services/analytics.ts` (suspected) |
| **URL / Page** | every page on dev (`:8081`) |
| **Breakpoint** | `all` |
| **Status** | `new` |
| **Assigned** | fix-frontend |

## Description

Every page load logs:

```
Refused to execute script from 'http://localhost:8081/ingest/array/phc_…/config.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
```

This fired **84 times** during the visual capture run (once per page-load × 3 breakpoints + retries). Either the Vite proxy is not routing `/ingest/*` to the PostHog backend, or the proxy returns the dev `index.html` for unmatched routes, which then fails strict MIME checking.

Net effect: **no analytics data leaves the dev environment**, and the browser pollutes the console. May also be true on production if the proxy config didn't ship.

## Steps to reproduce

1. Open DevTools console on any page at `http://localhost:8081/`
2. Refresh — count the "Refused to execute script" warnings (multiple per load)

## Expected

PostHog `/ingest/array/.../config.js` returns a JavaScript file with `Content-Type: application/javascript` — script executes.

## Actual

The dev server returns `index.html` for `/ingest/*` (200 status, but HTML body), which is rejected by strict MIME.

## Evidence

- `qa-harness/evidence/WE-20260528-072/_results.json` — raw console errors from the capture run (84 × MIME refusal, 168 × 404 for related ingest endpoints)

## Notes

Also relevant to production observability — surface to backend / chairman to verify the prod proxy. Visual category is wrong but uncategorized "console errors" don't fit a fix-specialist neatly — keeping `functional`.
