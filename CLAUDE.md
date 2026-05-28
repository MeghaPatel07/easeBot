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
