# easeBot — WeddingEase Viva AI Chat

AI chat assistant for WeddingEase. Two sub-repos that run together:

| Sub-repo | Type | Port | Start |
|----------|------|------|-------|
| `easebot-backend/` | TypeScript + Express API | 3099 | `npm run dev` |
| `Wedding-Ease-Viva-Chat/` | React + Vite frontend | 5173 | `npm run dev` |

## Quick start
```powershell
# Terminal 1 — backend
cd D:\weddingease\easeBot\easebot-backend
npm install
npm run dev    # nodemon + ts-node at PORT=3099

# Terminal 2 — frontend
cd D:\weddingease\easeBot\Wedding-Ease-Viva-Chat
npm install
npm run dev    # Vite at localhost:5173
```

## Backend architecture (`easebot-backend/src/`)

### AI Pipeline
- **LLM**: OpenAI (`openai` package) — chat completions + function calling
- **Voice/STT**: Azure Cognitive Services Speech SDK (`microsoft-cognitiveservices-speech-sdk`)
- **Audio processing**: `fluent-ffmpeg` + `ffmpeg-static`
- **Main controller**: `src/controllers/chatController.ts` — handles the full AI pipeline

### Key services
- `src/services/` — AI, Firestore, email, reminder services
- `src/pipeline/` — inbound message processing pipeline
- `src/lib/userPrefsCache.ts` — LRU cache for user preferences (avoids repeated Firestore reads)

### Rate limiting & security
- `express-rate-limit` on all endpoints
- `helmet` for security headers
- CORS: `ALLOWED_ORIGINS` env var (comma-separated)

### Tests
```powershell
cd D:\weddingease\easeBot\easebot-backend
npm run test:all          # all tests
npm run test:phase1       # cache + controller tests
npm run test:phase2       # STT phrase list tests
npm run test:langfix      # inbound pipeline tests
```

### TypeScript check
```powershell
cd D:\weddingease\easeBot\easebot-backend
npx tsc --noEmit
```

## Frontend architecture (`Wedding-Ease-Viva-Chat/src/`)
- React + Vite + TypeScript + Tailwind
- Firebase Auth for user session
- Connects to `easebot-backend` via REST + WebSocket
- Key hook: `src/hooks/useChat.ts` — manages chat state + streaming
- Key page: `src/pages/Index.tsx` — main chat interface

### TypeScript check
```powershell
cd D:\weddingease\easeBot\Wedding-Ease-Viva-Chat
npx tsc --noEmit
```

## Firebase
Same project as main UI: `wedding-ease-dc99a`
- Firestore: chat history, user prefs, sessions
- Auth: shared with main UI (same Firebase project)
- Cloud Functions: `Wedding-Ease-Viva-Chat/functions/`

## Analytics
PostHog (`posthog-node` in backend, `posthog-js` in frontend)
- Track AI response quality, voice usage, session length

## Environment variables (easebot-backend)
```
PORT=3099
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
OPENAI_API_KEY=...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...
FIREBASE_SERVICE_ACCOUNT_PATH=~/.secrets/easebot-sa.json
POSTHOG_API_KEY=...
```

## ⛔ ABSOLUTE RULE — NO EXCEPTIONS
**DO NOT PUSH, PUBLISH, OR DEPLOY ANY FIREBASE FUNCTIONS, ACCESS, PERMISSIONS, OR RIGHTS WITHOUT EXPLICITLY ASKING THE USER FIRST.**
This applies to: `firebase deploy`, `firebase deploy --only functions`, `firebase deploy --only firestore:rules`, `firebase deploy --only storage:rules`, any IAM permission changes, any Firebase Auth configuration changes, any Cloud Function publish, any Firestore security rule deploy. Always stop and confirm with the user before any of these actions, even if they seem routine.

## Rules
- Never commit Firebase service account JSON to git
- Service account goes in `~/.secrets/easebot-sa.json` (chmod 600)
- Run `npm run test:all` before any backend changes deploy
- Keep ALLOWED_ORIGINS strict — never use `*` in production

## QA Harness Integration

This repo is covered by the WeddingEase QA harness at `D:\weddingease\qa-harness\`.

**Actual dev ports (override older docs):**
- `easebot-backend` listens on **3001** (per `easebot-backend/.env` `PORT=3001`)
- `Wedding-Ease-Viva-Chat` serves on **8080** (per `vite.config.ts` `port: 8080`)

**Backend QA run:**
```powershell
cd D:\weddingease\easeBot\easebot-backend
npx tsc --noEmit && npm run test:all
curl -s http://localhost:3001/api/health
```

**Bug tickets:** TypeScript/test failures → `REPO=easebot-be`, `ASSIGNED_TO=Backend Dev Agent`
**Frontend issues:** Viva Chat visual/functional → `REPO=viva-chat`, `ASSIGNED_TO=Frontend Dev Agent`

**When fixing from QA tickets:**
1. `git worktree add D:/weddingease/worktrees/fix-{ID} -b fix/{ID}` from the repo root
2. Copy `wedding-ease-dc99a-firebase-adminsdk-hp8cd-2136a8a0c3.json` to the worktree's `easeBot/` dir (the path is relative in `.env`)
3. Fix → `npx tsc --noEmit` (zero errors) → `npm run test:all` (all pass) → curl smoke
4. PR targeting `main` with test evidence + curl output + `qa-harness/progress/<date>-*-progress.html` link
5. Update Google Sheets: `STATUS=PR Created`, `ASSIGNED_TO=Chairman`, `PR_LINK=<url>` then `node scripts/move-bug-tab.js <ID> BACKLOG PR_REVIEW`

### easeBot-scoped harness files (added 2026-05-25)
- `qa-harness/agents/qa-agent-easebot.md` — QA prompt scoped to easebot-be + viva-chat only
- `qa-harness/agents/frontend-dev-agent-easebot.md` — viva-chat fix loop
- `qa-harness/agents/backend-dev-agent-easebot.md` — easebot-be fix loop
- `qa-harness/scripts/master-loop-prompt-easebot.md` — the canonical `/loop` argument for the daily QA → fix → PR cycle
- `Wedding-Ease-Viva-Chat/easebot-sweep.mjs` — Playwright sweep driver
- `Wedding-Ease-Viva-Chat/drive-app.mjs` — generic per-route screenshot+console driver
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
