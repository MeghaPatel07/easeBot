# WeddingEase — Static → AI Platform: Implementation Plan

## Architecture Decision
**No separate backend server.** All server-side logic runs via:
- **Firebase SDK** (client-side): Auth, Firestore, Storage
- **Firebase Cloud Functions**: Secure server-side logic (AI pipeline, STT, TTS, Translation) — API keys never exposed to client

## Current State
- React/Vite/TypeScript + shadcn/ui frontend
- Mock AI responses (hardcoded strings)
- Auth UI only (no Firebase)
- No persistence

---

## Phase 1: Firebase Project Setup

### 1.1 Firebase Services to Enable
- **Authentication**: Email/Password + Phone (OTP)
- **Firestore**: Chat history, user profiles, products
- **Cloud Functions**: AI pipeline (Azure, STT, TTS, Translation)
- **Storage**: TTS audio file output

### 1.2 Install Firebase SDK (Frontend)
```bash
npm install firebase
```

### 1.3 Firestore Schema
```json
// users/{uid}
{
  "uid": "string",
  "email": "string",
  "displayName": "string",
  "weddingDate": "Timestamp | null",
  "budget": "number | null",
  "partnerName": "string | null",
  "preferredLanguage": "string",
  "createdAt": "Timestamp"
}

// chats/{threadId}
{
  "userId": "string",
  "title": "string",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp",
  "activeMode": "planner | stylist | therapist | knowledge | consultant | assistant"
}

// chats/{threadId}/messages/{messageId}
{
  "role": "user | assistant",
  "content": "string",
  "originalContent": "string | null",
  "mode": "planner | stylist | therapist | knowledge | consultant | assistant",
  "language": "string",
  "audioUrl": "string | null",
  "timestamp": "Timestamp",
  "liked": "boolean"
}

// products/{productId}
{
  "name": "string",
  "category": "dress | venue | florist | ...",
  "price": "number",
  "vendor": "string",
  "tags": ["string"],
  "imageUrl": "string",
  "affiliateLink": "string"
}
```

---

## Phase 2: Firebase Cloud Functions (AI Pipeline)

All sensitive logic and API keys live here — never on the client.
**All Azure services** — no OpenAI Whisper, no Google Translate, no ElevenLabs. Output is text-only (no TTS).

### 2.1 Functions Project Structure
```
functions/
├── src/
│   ├── index.ts               # chat + transcribeAudio callable exports
│   ├── types.ts               # Mode, ChatPayload, ChatResponse, HistoryMessage
│   ├── modeRouter.ts          # Regex keyword classifier → 6 modes
│   ├── pipeline/
│   │   ├── inbound.ts         # Azure STT (LID) → Azure Translator → English
│   │   └── outbound.ts        # Azure Translator → user language (text only, no TTS)
│   ├── services/
│   │   ├── azureAI.ts         # Azure AI Foundry — GPT-4o via openai SDK
│   │   ├── stt.ts             # Azure AI Speech SDK — STT + Continuous Language ID
│   │   ├── translation.ts     # Azure AI Translator REST API
│   │   └── products.ts        # Firestore products query (Stylist mode)
│   └── prompts/
│       ├── assistant.ts
│       ├── planner.ts
│       ├── stylist.ts         # Injects product links — no hallucinated URLs
│       ├── therapist.ts
│       ├── knowledge.ts
│       └── consultant.ts
├── .env                       # Secret keys (never committed)
└── package.json
```

### 2.2 Callable Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `chat` | `httpsCallable` | Full pipeline: STT → translate → route → GPT-4o → translate back |
| `transcribeAudio` | `httpsCallable` | STT only — returns `{ text, detectedLanguage }` |

### 2.3 Full Pipeline
```
Client sends: { message, threadId, audioBase64?, language?, mode? }
    │
    ▼
[STT] Azure AI Speech — Continuous Language ID
    auto-detects: en-US, hi-IN, gu-IN, es-ES, fr-FR, ar-SA ...
    (skip if text input)
    │
    ▼
[TRANSLATE INBOUND] Azure AI Translator → English
    (skip if already English)
    │
    ▼
[MODE ROUTER] regex keyword classifier → 1 of 6 modes
    │
    ├── if mode = stylist → [PRODUCTS] query Firestore products collection
    │                        inject ProductUID links into system prompt
    ▼
[CONTEXT] fetch last 10 messages from chats/{threadId}/messages
    │
    ▼
[GPT-4o] Azure AI Foundry — system prompt + history + user message
    │
    ▼
[TRANSLATE OUTBOUND] Azure AI Translator → user's detected language
    (skip if English)
    │
    ▼
Returns: { text, mode, detectedLanguage, audioUrl: null }
    │
    ▼
Client saves user msg + AI response to Firestore via SDK
```

### 2.4 Stylist Mode — Product Link Injection
- Cloud Function queries `products/{uid}` filtered by category/tags
- Injects top 5 results into system prompt as formatted context
- System prompt strictly instructs GPT-4o:
  > "Only link products from the provided list using format:
  > [Product Name](https://weddingease.ai/product-detail/{uid})
  > Do not hallucinate links."

### 2.5 Functions `.env`
```bash
# Azure AI Foundry — GPT-4o
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=
AZURE_DEPLOYMENT_NAME=gpt-4o

# Azure AI Speech — STT + Continuous Language ID
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastus

# Azure AI Translator
AZURE_TRANSLATOR_KEY=
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AZURE_TRANSLATOR_REGION=eastus
```

### 2.6 npm Dependencies
```json
{
  "openai": "^4.47.1",
  "microsoft-cognitiveservices-speech-sdk": "^1.38.0",
  "firebase-admin": "^12.2.0",
  "firebase-functions": "^5.0.0"
}
```

---

## Phase 3: Frontend Service Layer

### 3.1 New Files in `src/`
```
src/
├── lib/
│   └── firebase.ts            # Firebase app init + SDK exports
├── services/
│   ├── authService.ts         # signIn, signUp, signOut, phoneOTP
│   ├── chatService.ts         # Firestore thread + message CRUD
│   ├── functionsService.ts    # httpsCallable wrappers (chat, transcribe)
│   └── audioRecorder.ts      # Web Audio API for mic input
├── hooks/
│   ├── useAuth.ts             # Firebase onAuthStateChanged listener
│   ├── useChat.ts             # Active thread state + send message
│   └── useVoice.ts            # Record audio → base64
├── contexts/
│   └── AuthContext.tsx        # Global auth provider
└── types/
    └── index.ts               # Message, Thread, User, Mode types
```

### 3.2 `src/lib/firebase.ts`
```ts
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const app = initializeApp({ /* VITE_ env vars */ })
export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)
export const storage = getStorage(app)
```

### 3.3 Frontend `.env`
```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

---

## Phase 4: 6-Mode Router Logic

### Mode Classification (runs inside Cloud Function)

| Mode | Trigger Keywords / Intent | System Prompt Focus |
|------|--------------------------|---------------------|
| **Stylist** | dress, flowers, decor, colors, aesthetic, theme | Curates style boards, links to `products` collection |
| **Planner** | timeline, checklist, vendors, schedule, when | 12-month countdown, task management |
| **Therapist** | stressed, overwhelmed, nervous, family drama, anxiety | Empathetic, non-clinical emotional support |
| **Knowledge** | what is, how does, tradition, meaning, history | Factual wedding encyclopedia |
| **Consultant** | budget, cost, compare, worth it, negotiate | Financial advice, ROI on vendors |
| **Assistant** | general, default, mixed intent | Catch-all, light routing to other modes |

### Stylist Mode Special Behavior
- Cloud Function queries `products` Firestore collection
- Returns product cards with Firebase Storage image URLs
- Affiliate link redirects tracked in Firestore
- Different agents for each mode with different system prompts + master prompt 

---

## Phase 5: Replace Mocks in `Index.tsx`

| Current (Mock) | Replace With |
|---------------|--------------|
| `setTimeout` mock AI response | `functionsService.sendMessage()` → `httpsCallable('chat')` |
| `useState` chat history array | `onSnapshot` listener on `chats/{uid}` |
| `handleLogin` stub | `authService.signInWithEmail()` |
| `handleRegister` stub | `authService.createAccount()` → auto-creates Firestore user doc |
| OTP modal stub | `authService.signInWithPhone()` |
| `handleNewChat` | `chatService.createThread()` → new Firestore doc + clear local state |

### Additional UI Changes
- Add microphone button → `useVoice` hook → sends `audioBase64` to `chat` function
- Add audio playback element for `audioUrl` in AI messages
- Add mode indicator pill on each AI message (from `response.mode`)
- Add language selector in header/settings (stored in `users/{uid}.preferredLanguage`)
- Mode selector strip above input (defaults to **Assistant** / auto)

---

## Implementation Order (Sprint Plan)

| Sprint | Duration | Deliverable |
|--------|----------|-------------|
| **S1** | Day 1 | Firebase project setup + SDK init + `firebase.ts` + `.env` |
| **S2** | Day 2 | `AuthContext` + `authService` + wire real Login/Register/OTP modals |
| **S3** | Day 3 | `chatService` + Firestore thread/message CRUD + `useChat` hook |
| **S4** | Day 4 | Replace mock AI with `chat` Cloud Function (Azure Foundry basic call) |
| **S5** | Day 5 | Mode router + all 6 system prompts in Cloud Functions |
| **S6** | Day 6 | STT (Whisper) + mic button + `useVoice` hook |
| **S7** | Day 7 | TTS (ElevenLabs) + audio playback in chat |
| **S8** | Day 8 | Translation pipeline (Google Translate) in Cloud Function |
| **S9** | Day 9-10 | Stylist mode: products collection + product card UI |
| **S10** | Day 11 | Streaming responses via Firestore real-time writes from function |
| **S11** | Day 12 | Polish, error handling, loading states, deployment |
