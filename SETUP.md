# Easebot — Setup Checklist

## Required API Keys

### 1. Gemini TTS (Text-to-Speech)
Used for: AI voice playback in chat messages and voice previews in Settings modal.

1. Go to https://aistudio.google.com/app/apikey
2. Create a new API key (free tier available)
3. Open `/Users/krish/Desktop/easebot/easebot-backend/.env`
4. Add:
   ```
   GEMINI_API_KEY=your_key_here
   ```

---

## Environment File Reference

Full `.env` for `easebot-backend` — all keys needed:

```env
# Server
PORT=3001

# Pipeline toggle (true = enable STT + translation, false = English only)
ENABLE_SPEECH_TRANSLATION=false

# Azure AI Foundry — GPT-4o (chat AI)
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_DEPLOYMENT_NAME=

# Azure AI Speech — speech-to-text
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=

# Azure AI Translator
AZURE_TRANSLATOR_KEY=
AZURE_TRANSLATOR_ENDPOINT=
AZURE_TRANSLATOR_REGION=

# Firebase Admin SDK
FIREBASE_SERVICE_ACCOUNT_PATH=

# Algolia — product search for stylist mode
ALGOLIA_APP_ID=
ALGOLIA_SEARCH_KEY=

# Google Gemini — TTS
GEMINI_API_KEY=        ← ADD THIS
```

---

## Features Unlocked by Each Key

| Key | Feature |
|---|---|
| `GEMINI_API_KEY` | Voice playback in chat (Aria/Echo/Nova/Vale/Luna/Sol), voice preview in Settings |
| `AZURE_OPENAI_*` | AI chat responses |
| `AZURE_SPEECH_*` | Voice input (microphone) |
| `AZURE_TRANSLATOR_*` | Multi-language translation (requires `ENABLE_SPEECH_TRANSLATION=true`) |
| `ALGOLIA_*` | Product search in stylist mode |
| `FIREBASE_*` | Auth + database (Firestore) |


 Add GEMINI_API_KEY=your_key_here to /Users/krish/Desktop/easebot/easebot-backend/.env — get it free from https://aistudio.google.com/app/apikey 