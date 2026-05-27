# /Users/krish/Desktop/easebot — workspace root

This directory hosts the **WeddingEase Viva chatbot** — the AI chat experience. Two active code repos sit here, plus product docs and QA artifacts.

## What lives here

| Subdir | Purpose |
|---|---|
| `Wedding-Ease-Viva-Chat/` | Frontend: React 18 + Vite + TS + shadcn/Radix + TipTap. Cloud Functions (TS) under `functions/`. Firebase hosting via `firebase.json`. |
| `easebot-backend/` | Backend: Express + TS. Hits Azure Cognitive Services Speech (TTS/STT), OpenAI, Firebase Admin, PostHog. Runs on `:8787` in dev. |
| `docs/`, `qa-screenshots/`, `qa-screenshots.mjs` | Product specs, QA flows, visual regression artifacts. |
| `*.md` (PRD-*, IMPROVEMENT_*, QA_*, etc.) | Sprint planning, PRDs, retro notes. |
| `tmp/`, `stitch/`, `.orchestrator/` | Scratch, generated, and orchestration state. Treat as read-only. |
| `wedding-ease-*-firebase-adminsdk-*.json` | Firebase admin service-account credentials. **Never read, write, or commit.** |

## Sibling repos (different working dirs)

| Repo | Path | Stack |
|---|---|---|
| WeddingEase main app (Flutter) | `/Users/krish/Desktop/Admins/wedding-ease-{admin,vendor}/` | Flutter + Firebase. Has its own `.mcp.json`. |
| Marketing/SEO site (React+Vite) | `/Users/krish/Desktop/Wedding-Ease-User-Interface/` | React + Vite + Playwright + SEO. |
| QA harness root | `/Users/krish/Desktop/weddingease/` | Orchestration + Playwright tests for Admins repos. |

## MCP servers (configured in `.mcp.json`)

- `context7` — live docs for the stack
- `firebase` — Firestore queries, Auth lookups, Storage (via `@gannonh/firebase-mcp`)
- `playwright` — browser automation for Viva-Chat QA
- `chrome-devtools` — official Chrome DevTools MCP (network, console, perf, screenshots)
- `posthog` — analytics queries (chat event funnels)

Set env vars in your shell before `claude` starts: `SERVICE_ACCOUNT_KEY_PATH`, `FIREBASE_STORAGE_BUCKET`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`.

**Note**: Stripe MCP was deliberately removed — billing runs on PayU. If you ever adopt Stripe alongside PayU, add it back with `@stripe/agent-toolkit@latest` + `STRIPE_SECRET_KEY` (test mode only).

## Hard rules (also enforced by global hooks)

1. **🚫 PERMANENT STRICT RULE — Firebase is FORBIDDEN for writes.** NEVER push, publish, deploy, or change access rights / rules / permissions in Firebase. NEVER run `firebase deploy*`, `firebase functions:deploy/delete`, `firebase firestore:delete/import/export`, `firebase hosting:*` (modifying), `firebase auth:import/export/delete`, `gcloud iam *`, `gcloud projects add/remove-iam-policy-binding`, `gcloud functions deploy`, `gcloud run deploy`, `gsutil cp/mv/rm`, `npm/yarn/pnpm/bun run deploy`. The hook `pretool-firebase-strict.py` enforces this with 30+ blocked patterns + exit-code-2. READ is allowed (`firebase list`, `firebase use`, `gcloud config list`, `gsutil ls`). If you need a Firebase write to ship something, output the command and ask Krish to run it.
2. **NEVER** push to `main` / `master` / `production` directly. No `--force` pushes ever.
3. **NEVER** read, write, or stage `*-firebase-adminsdk-*.json`, `.env`, `*.lock`, or anything matching `webhook.*secret`.
4. **NEVER** commit a `sk_live_*` Stripe key. Test keys (`sk_test_*`) are fine in env, never in source.
5. **NEVER** edit `firestore.rules` / `storage.rules` / `database.rules.json` / `firestore.indexes.json` / `firebase.json` / `.firebaserc` — blocked by deploy-configs hook. Surface findings only; Krish edits.
6. **NEVER** drop or bulk-delete Firestore collections — global hook blocks the CLI; the MCP server is read-only by default.

## Common tasks

| Task | How |
|---|---|
| Run frontend dev | `cd Wedding-Ease-Viva-Chat && npm run dev` (Vite on :5173) |
| Run backend dev | `cd easebot-backend && npm run dev` (Express on :8787) |
| QA screenshots | `node qa-screenshots.mjs` — outputs to `qa-screenshots/` |
| Lint frontend | `cd Wedding-Ease-Viva-Chat && npm run lint` |
| Test backend audio | `cd easebot-backend && npm run test:phase1` |
| Open in browser via MCP | `playwright` MCP → `browser_navigate` |

## Pricing rollout context

Sprint 1 is closed; Sprint 2 paused. 4-tier pricing + token meter + PayU + locked decisions live in auto-memory under `project_pricing_rollout`. Read that memory before any pricing/tier work.

## Notes GTM sprint context

Staircase Notes GTM roadmap: A1(B)/A2/A3/A4/C1/C3 shipped; B1/B2/B3/C2/D1/E1/E2 remain. Wait for explicit "next" from Krish before starting any of the remaining items.

## Active modes

Three AI modes live in `easebot-backend/src/pipeline/` — therapist + consultant modes are commented out, only `chat`/`planner`/`image` are wired. Don't re-enable the commented modes without Krish's say-so.
