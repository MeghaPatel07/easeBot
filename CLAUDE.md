# easeBot — WeddingEase Viva AI Chat

Workspace root: `/Users/krish/Desktop/easebot/`

This directory hosts the **WeddingEase Viva chatbot** — the AI chat experience. Two active code repos sit here, plus product docs and QA artifacts.

## What lives here

| Subdir | Purpose |
|---|---|
| `Wedding-Ease-Viva-Chat/` | Frontend: React 18 + Vite + TS + shadcn/Radix + TipTap. Cloud Functions (TS) under `functions/`. Firebase hosting via `firebase.json`. |
| `easebot-backend/` | Backend: Express + TS. Hits Azure Cognitive Services Speech (TTS/STT), OpenAI, Firebase Admin, PostHog. |
| `docs/`, `qa-screenshots/`, `qa-screenshots.mjs` | Product specs, QA flows, visual regression artifacts. |
| `qa-harness/` | QA + fix harness — tickets, evidence, progress logs, sheet exports. |
| `*.md` (PRD-*, IMPROVEMENT_*, QA_*, MARATHON_*) | Sprint planning, PRDs, retro notes, marathon reports. |
| `tmp/`, `stitch/`, `.orchestrator/` | Scratch, generated, and orchestration state. Treat as read-only. |
| `wedding-ease-*-firebase-adminsdk-*.json` | Firebase admin service-account credentials. **Never read, write, or commit.** |

## Sibling repos (different working dirs)

| Repo | Path | Stack |
|---|---|---|
| WeddingEase main app (Flutter) | `/Users/krish/Desktop/Admins/wedding-ease-{admin,vendor}/` | Flutter + Firebase. Has its own `.mcp.json`. |
| Marketing/SEO site (React+Vite) | `/Users/krish/Desktop/Wedding-Ease-User-Interface/` | React + Vite + Playwright + SEO. |
| QA harness root | `/Users/krish/Desktop/weddingease/` | Orchestration + Playwright tests for Admins repos. |

## Quick start

```bash
# Terminal 1 — backend (Express on :3001)
cd /Users/krish/Desktop/easebot/easebot-backend
npm install
npm run dev

# Terminal 2 — frontend (Vite on :8080, may auto-bump to :8081 if busy)
cd /Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat
npm install
npm run dev
```

## Dev ports (canonical)

- `easebot-backend` listens on **:3001** (per `easebot-backend/.env` `PORT=3001`)
- `Wedding-Ease-Viva-Chat` serves on **:8080** (per `vite.config.ts` `port: 8080`) — Vite auto-bumps to :8081 if 8080 is taken

> Older docs / memory snapshots referenced `:8787` (backend) and `:5173` (frontend). Those are stale — use the values above.

## Backend architecture (`easebot-backend/src/`)

### AI Pipeline (inbound → mode → LLM → tools → outbound)
- **LLM**: OpenAI (`openai` package) — chat completions + function calling, streaming via SSE
- **Voice / STT**: Azure Cognitive Services Speech SDK (`microsoft-cognitiveservices-speech-sdk`)
- **TTS**: Azure neural voices via SSML (allowlisted voice IDs per security fix)
- **Image gen**: Azure GPT-Image-1.5 primary + GPT-Image-1 fallback, behind 60s timeout + circuit breaker
- **Translation**: Azure Translator (detect + translate, behind `translatorCircuitBreaker`)
- **Main controller**: `src/controllers/chatController.ts` — handles the full AI pipeline

### Key services / lib
- `src/services/` — AI, Firestore, email, reminder, payment, TTS, translation, image generation
- `src/pipeline/` — inbound message processing pipeline
- `src/prompts/{planner,stylist,knowledge,assistant}.ts` — mode-specific system prompts
- `src/lib/userPrefsCache.ts` — LRU cache for user preferences (avoids repeated Firestore reads)
- `src/middleware/inputSanitizer.ts` — denylist-based control-char stripper
- `src/middleware/rateLimiter.ts` — `express-rate-limit` with `standardHeaders: 'draft-7'` + structured JSON 429 body

### Rate limiting & security
- `express-rate-limit` on all endpoints — 429 returns `{error, retry_after, limit, window_seconds, scope}` + `Retry-After` header
- `helmet` for security headers
- CORS: `ALLOWED_ORIGINS` env var (comma-separated, never `*` in prod)
- Zod validation on chat request bodies (both `/api/chat` and `/api/chat/stream`)

### Tests
```bash
cd /Users/krish/Desktop/easebot/easebot-backend
npm run test:all          # all phases (phase1 cache + controller, phase2 phrase, langfix, tts, sanitizer, rate-limit, modeRouter)
npm run test:phase1       # cache + controller
npm run test:phase2       # STT phrase list
npm run test:langfix      # inbound language detection
npx tsc --noEmit          # type check
```

## Frontend architecture (`Wedding-Ease-Viva-Chat/src/`)
- React 18 + Vite + TypeScript + Tailwind + shadcn/Radix + TipTap
- Firebase Auth for user session
- Connects to `easebot-backend` via REST + SSE
- Key hook: `src/hooks/useChat.ts` — manages chat state + streaming
- Key page: `src/pages/Index.tsx` — main chat interface
- Vite chunk graph: `react-vendor`, `tiptap-vendor`, `firebase-vendor`, `radix-vendor`, `posthog-vendor`, `tanstack-vendor`, plus per-view lazy chunks
- Analytics: `src/lib/analytics.ts` is a Proxy with bounded FIFO queues + dynamic-imported PostHog (deferred to `requestIdleCallback`)

### TypeScript / lint
```bash
cd /Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat
npx tsc --noEmit -p tsconfig.app.json
npm run lint   # ⚠ pre-existing eslint 9.39 + @typescript-eslint plugin crash in functions/ subdir — known issue
```

## Firebase
Same project as main UI: `wedding-ease-dc99a`
- Firestore: chat history, user prefs, sessions, subscriptions, invoices
- Auth: shared with main UI (same Firebase project)
- Storage: image generation outputs
- Cloud Functions: `Wedding-Ease-Viva-Chat/functions/`

## MCP servers (configured in `.mcp.json`)

- `context7` — live docs for the stack
- `firebase` — Firestore queries, Auth lookups, Storage (via `@gannonh/firebase-mcp`)
- `playwright` — browser automation for Viva-Chat QA
- `chrome-devtools` — official Chrome DevTools MCP (network, console, perf, screenshots)
- `posthog` — analytics queries (chat event funnels)

Set env vars in your shell before `claude` starts: `SERVICE_ACCOUNT_KEY_PATH`, `FIREBASE_STORAGE_BUCKET`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`.

**Note**: Stripe MCP was deliberately removed — billing runs on PayU. If you ever adopt Stripe alongside PayU, add it back with `@stripe/agent-toolkit@latest` + `STRIPE_SECRET_KEY` (test mode only).

## Analytics
PostHog (`posthog-node` in backend, `posthog-js` in frontend, dynamic-imported on idle)
- Track AI response quality, voice usage, session length, funnel conversion, consent decisions

## Environment variables (easebot-backend)
```
PORT=3001
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:8081
FRONTEND_BASE_URL=http://localhost:8081   # must match Vite served port; required in production
OPENAI_API_KEY=...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...
AZURE_TRANSLATOR_KEY=...
AZURE_TRANSLATOR_REGION=...
AZURE_OPENAI_API_KEY=...                  # image generation
FIREBASE_SERVICE_ACCOUNT_PATH=...         # path to wedding-ease-dc99a-firebase-adminsdk-*.json
POSTHOG_API_KEY=...
# PayU (sandbox)
PAYU_MERCHANT_KEY=...
PAYU_MERCHANT_SALT=...
# Legal entity (for invoice GST routing)
LEGAL_ENTITY_COUNTRY=IN
LEGAL_ENTITY_*=...
```

## QA + Fix Harness

Tickets, evidence, progress logs, sheet exports all live under `qa-harness/`.

**Daily flow:**
1. `/qa-sprint` — spawns 8 QA specialist agents in parallel; tickets land in `qa-harness/tickets/YYYY-MM-DD/`
2. `qa-triage` agent runs at the end of the sprint — dedupes, calibrates severity, assigns to a fix specialist
3. `/qa-fix-cycle` (manual gate) — takes one ticket, dispatches the right fix specialist (fix-frontend / fix-backend-api / fix-state-data / fix-performance) into an isolated git worktree at `worktrees/fix-WE-YYYYMMDD-NNN/`
4. Fix agent: reproduce → diagnose → fix → test pyramid → commit → PR
5. PR opens against `Bug-Resolve-claude` (NEVER main, NEVER any other branch) with evidence + progress.html audit trail
6. Krish (chairman) reviews + merges

**Daily PR queue + backlog + skipped sheets:** see `qa-harness/sheet-export/marathon-*.csv` and the corresponding Google Sheets uploaded via the Drive MCP.

**When fixing from QA tickets:**
1. `git worktree add worktrees/fix-WE-YYYYMMDD-NNN -b fix-WE-YYYYMMDD-NNN origin/Bug-Resolve-claude` from the workspace root
2. Initialize `qa-harness/progress/WE-YYYYMMDD-NNN/progress.html` from `qa-harness/templates/progress.html`
3. Reproduce → diagnose → fix → `npx tsc --noEmit` → `npm run test:all` → manual smoke
4. PR `--base Bug-Resolve-claude --head fix-WE-YYYYMMDD-NNN` with body from `qa-harness/templates/pr-body.md` (fill in clear "What was broken" + "What this PR does" sections)
5. Update ticket file: `Status: in_review`, `PR: <URL>`, `Progress: <path>`

## Hard rules (also enforced by global hooks)

1. **🚫 PERMANENT STRICT RULE — Firebase is FORBIDDEN for writes / deploys / permission changes.** NEVER run `firebase deploy*`, `firebase functions:deploy/delete`, `firebase firestore:delete/import/export`, `firebase hosting:*` (modifying), `firebase auth:import/export/delete`, `gcloud iam *`, `gcloud projects add/remove-iam-policy-binding`, `gcloud functions deploy`, `gcloud run deploy`, `gsutil cp/mv/rm`, `npm/yarn/pnpm/bun run deploy`. The hook `pretool-firebase-strict.py` enforces this with 30+ blocked patterns + exit-code-2. READ is allowed (`firebase list`, `firebase use`, `gcloud config list`, `gsutil ls`). If you need a Firebase write to ship something, output the command and ask Krish to run it.
2. **NEVER** push to `main` / `master` / `production` directly. No `--force` pushes ever. All fix PRs target `Bug-Resolve-claude` only.
3. **NEVER** read, write, or stage `*-firebase-adminsdk-*.json`, `.env`, `*.lock`, or anything matching `webhook.*secret`.
4. **NEVER** commit a `sk_live_*` Stripe key. Test keys (`sk_test_*`) are fine in env, never in source.
5. **NEVER** edit `firestore.rules` / `storage.rules` / `database.rules.json` / `firestore.indexes.json` / `firebase.json` / `.firebaserc` — blocked by deploy-configs hook. Surface findings only; Krish edits.
6. **NEVER** drop or bulk-delete Firestore collections — global hook blocks the CLI; the MCP server is read-only by default.
7. **NEVER** commit Firebase service account JSON to git (chmod 600, kept under `~/.secrets/easebot-sa.json` or workspace-root with the gitignored filename pattern).

## Common tasks

| Task | How |
|---|---|
| Run frontend dev | `cd Wedding-Ease-Viva-Chat && npm run dev` (Vite on :8080 → :8081) |
| Run backend dev | `cd easebot-backend && npm run dev` (Express on :3001) |
| Backend health | `curl http://localhost:3001/api/health` |
| QA screenshots | `node qa-screenshots.mjs` — outputs to `qa-screenshots/` |
| Lint frontend | `cd Wedding-Ease-Viva-Chat && npm run lint` (see eslint caveat) |
| Backend test pyramid | `cd easebot-backend && npm run test:all` |
| Backend type check | `cd easebot-backend && npx tsc --noEmit` |
| Frontend type check | `cd Wedding-Ease-Viva-Chat && npx tsc --noEmit -p tsconfig.app.json` |
| Open app via MCP | `playwright` MCP → `browser_navigate` |

## Pricing rollout context

Sprint 1 closed; Sprint 2 paused. 4-tier pricing + token meter + PayU + locked decisions live in auto-memory under `project_pricing_rollout`. Read that memory before any pricing/tier work.

> **Active drift watch**: Pro tier currently ships at $10/$79 but the locked spec is $14.99/$119. This is the highest-revenue-impact carry-forward in the backlog; needs Krish reconciliation before any pricing-related fix-agent runs.

## Notes GTM sprint context

Staircase Notes GTM roadmap: A1(B)/A2/A3/A4/C1/C3 shipped; B1/B2/B3/C2/D1/E1/E2 remain. Wait for explicit "next" from Krish before starting any of the remaining items.

## Active modes

Three AI modes live in `easebot-backend/src/prompts/` — `planner`, `stylist`, `knowledge` + `assistant` fallback. Therapist + consultant modes are commented out in `modeRouter.ts`, `chatController.ts`, prompts, types — NOT deleted. Don't re-enable without Krish's say-so.

All three active prompts now inject `today` (YYYY-MM-DD) to prevent date-math drift, carry a `CULTURAL HUMILITY` rail (no fabricated Sanskrit/scripture/ceremony names), and a `SPECULATION FRAMING` rail (currently trending vs presented as fact).
