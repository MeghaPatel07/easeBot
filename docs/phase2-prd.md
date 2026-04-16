# Phase 2 — PRD: AI Pipeline (Cloud Functions)

**Product:** WeddingEase — TheWeddingBot Chat
**Phase:** 2 — Azure AI Pipeline via Firebase Cloud Functions
**Stack:** Azure AI Foundry · Azure AI Speech · Azure AI Translator · Firebase Cloud Functions · Firestore

---

## 1. Objective

Replace all mock AI responses with a production-ready pipeline using Azure services exclusively. All sensitive logic (API keys, AI calls, translation) runs server-side inside Firebase Cloud Functions — never exposed to the client.

---

## 2. Azure Resource Provisioning

| Resource | Service | Purpose |
|----------|---------|---------|
| Azure AI Foundry | GPT-4o deployment | Chat completions for all 6 modes |
| Azure AI Speech | Speech-to-Text + Language ID | Transcribe audio + auto-detect spoken language |
| Azure AI Translator | Translator resource | Inbound (any language → English) + Outbound (English → user's language) |

### 2.1 Azure AI Foundry Setup
- Create a new project in Azure AI Foundry
- Deploy model: **GPT-4o** (best reasoning across all 6 agent modes)
- Note the **endpoint URL**, **API key**, and **deployment name**

### 2.2 Azure AI Speech Setup
- Enable **Speech-to-Text** with **Continuous Language Identification (LID)**
- LID automatically detects the spoken language (e.g. `gu-IN` for Gujarati, `hi-IN` for Hindi) without a manual toggle
- Note the **Speech resource key** and **region**

### 2.3 Azure AI Translator Setup
- Deploy a Translator resource
- Used for both inbound normalisation and outbound response translation
- Note the **Translator key**, **endpoint**, and **region**

---

## 3. Full Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT                                                             │
│  User speaks (audio) ──► base64 ──┐                                │
│  User types (text)   ─────────────┼──► httpsCallable('chat')       │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────┐
│  CLOUD FUNCTION: chat                                               │
│                                                                     │
│  INBOUND PIPELINE                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1. [STT] Azure AI Speech                                     │   │
│  │    audio (base64) → text + detectedLanguageCode             │   │
│  │    (Continuous LID: auto-detects gu-IN, hi-IN, es-ES, etc.) │   │
│  │    ↓ (skip if text input — use detectedLanguage from hint)  │   │
│  │                                                              │   │
│  │ 2. [TRANSLATE] Azure AI Translator                          │   │
│  │    text (any language) → English                            │   │
│  │    (skip if already English)                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│  ROUTING LAYER           ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 3. [MODE ROUTER] Keyword classifier → 1 of 6 modes          │   │
│  │    Planner · Stylist · Therapist · Knowledge · Consultant   │   │
│  │    · Assistant (default)                                    │   │
│  │                                                              │   │
│  │ 4. [CONTEXT] Fetch last 10 messages from Firestore           │   │
│  │    chats/{threadId}/messages  (orderBy timestamp desc)      │   │
│  │                                                              │   │
│  │ 5. [STYLIST SPECIAL] If mode = stylist                      │   │
│  │    → Query Firestore products collection                    │   │
│  │    → Inject ProductUID + link into system prompt            │   │
│  │    → AI returns: [Product Name](weddingease.ai/product/UID) │   │
│  │                                                              │   │
│  │ 6. [AI] Azure AI Foundry — GPT-4o                           │   │
│  │    system prompt (mode) + chat history + user message       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│  OUTBOUND PIPELINE       ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 7. [TRANSLATE] Azure AI Translator                          │   │
│  │    English response → user's original detected language     │   │
│  │    (skip if English)                                        │   │
│  │                                                              │   │
│  │ 8. Return { text, mode, detectedLanguage, audioUrl: null }  │   │
│  │    (no audio output — text only, per spec)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────┐
│  CLIENT                                                             │
│  Display translated text response in chat UI                        │
│  Client writes both user + AI messages to Firestore via SDK         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Cloud Functions

### 4.1 `chat` — Primary callable

**Trigger:** `httpsCallable` from client
**Auth:** Required (throws `unauthenticated` if no auth)

**Input payload:**
```ts
{
  message: string          // typed text (required if no audioBase64)
  threadId: string         // Firestore thread doc ID
  audioBase64?: string     // base64-encoded audio blob (voice input)
  language?: string        // hint: 'en', 'hi', 'gu' (optional override)
  mode?: Mode              // manual mode override (optional)
}
```

**Output:**
```ts
{
  text: string             // translated AI response in user's language
  mode: Mode               // mode that was used
  detectedLanguage: string // BCP-47 code e.g. 'en', 'hi', 'gu'
  audioUrl: null           // always null — no TTS in scope
}
```

### 4.2 `transcribeAudio` — Standalone STT callable

**Trigger:** `httpsCallable`
**Auth:** Required
**Input:** `{ audioBase64: string }`
**Output:** `{ text: string, detectedLanguage: string }`
**Use case:** Client calls this before sending to `chat` if it needs the transcription text to display in the input box

---

## 5. Service Implementations

### 5.1 STT — `functions/src/services/stt.ts`
- Replace current OpenAI Whisper with **Azure AI Speech SDK** (`microsoft-cognitiveservices-speech-sdk`)
- Use `SpeechRecognizer` with `AutoDetectSourceLanguageConfig`
- Languages to support: `en-US`, `hi-IN`, `gu-IN`, `es-ES`, `fr-FR`, `ar-SA` (expandable)
- Return: `{ text: string, detectedLanguageCode: string }`

### 5.2 Translation — `functions/src/services/translation.ts`
- Replace current Google Translate with **Azure AI Translator REST API**
- Endpoint: `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0`
- Functions: `detectLanguage(text)` → BCP-47 code, `translateText(text, to)` → translated string

### 5.3 Azure AI — `functions/src/services/azureAI.ts`
- Already correctly using `AzureOpenAI` from `openai` SDK — **no changes needed**

### 5.4 Stylist Products — `functions/src/services/products.ts` *(new)*
- Query Firestore `products` collection: filter by `tags` or `category` keywords extracted from user message
- Return top 5 results as formatted context string for the system prompt:
  ```
  Available products:
  - [Ivory Lace Gown](https://weddingease.ai/product-detail/abc123) — ₹45,000
  - [Rose Gold Rings](https://weddingease.ai/product-detail/def456) — ₹12,000
  ```
- Stylist system prompt instructs GPT-4o: **"Only link products from the provided list. Do not hallucinate links."**

---

## 6. Environment Variables

```bash
# functions/.env

# Azure AI Foundry — GPT-4o
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=
AZURE_DEPLOYMENT_NAME=gpt-4o

# Azure AI Speech — STT + Language ID
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastus

# Azure AI Translator
AZURE_TRANSLATOR_KEY=
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AZURE_TRANSLATOR_REGION=eastus
```

---

## 7. Firestore Changes

### 7.1 `users/{uid}` — add `preferredLanguage`
Already in schema. Updated on first detected language if not set.

### 7.2 `messages/{messageId}` — `language` field
Already in schema. Store BCP-47 code returned by pipeline (`detectedLanguage`).

### 7.3 `products/{productId}` — used by Stylist mode
```json
{
  "uid": "string",
  "name": "string",
  "category": "dress | venue | florist | rings | decor | ...",
  "price": "number",
  "currency": "INR",
  "vendor": "string",
  "tags": ["string"],
  "imageUrl": "string",
  "productUrl": "https://weddingease.ai/product-detail/{uid}"
}
```

---

## 8. Updated `functions/src/services/` File List

| File | Change |
|------|--------|
| `stt.ts` | **Replace** Whisper → Azure AI Speech SDK with LID |
| `translation.ts` | **Replace** Google Translate → Azure AI Translator |
| `azureAI.ts` | No change — already correct |
| `products.ts` | **New** — Firestore products query for Stylist mode |
| `tts.ts` | **Delete** — TTS not in scope |

---

## 9. Updated `functions/package.json` Dependencies

```json
"dependencies": {
  "firebase-admin": "^12.2.0",
  "firebase-functions": "^5.0.0",
  "openai": "^4.47.1",
  "microsoft-cognitiveservices-speech-sdk": "^1.38.0"
}
```
*(Remove `@google-cloud/translate` — replaced by Azure Translator REST)*

---

## 10. Session & Storage Behaviour

| Action | Behaviour |
|--------|-----------|
| User sends message | Client calls `chat` function → receives `{ text, mode, detectedLanguage }` |
| Client saves messages | Client SDK writes user msg + AI response to `chats/{threadId}/messages` |
| New Chat | Client calls `createThread()` → new Firestore doc → clean slate while preserving `users/{uid}` profile |
| Language preference | First detected language saved to `users/{uid}.preferredLanguage` |
| Product links (Stylist) | Only links from Firestore `products` collection are injected — AI strictly forbidden from hallucinating |

---

## 11. Acceptance Criteria

- [ ] Voice input in Gujarati/Hindi is correctly transcribed via Azure Speech with LID
- [ ] Non-English input is translated to English before reaching GPT-4o
- [ ] GPT-4o response is translated back to the user's detected language
- [ ] Stylist mode returns real product links from Firestore `products` collection
- [ ] No API keys are ever sent to or accessible by the client
- [ ] Cloud Function returns within 10 seconds for text-only requests
- [ ] All 6 modes produce contextually correct responses
- [ ] Guest users fall back to mock AI gracefully (no function call attempted)
- [ ] Chat history (last 10 messages) is passed as context to GPT-4o
