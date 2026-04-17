# PRD: Text-to-Speech (TTS) Pipeline — WeddingEase AI

**Version:** 1.0  
**Date:** 2026-04-17  
**Author:** Engineering  
**Status:** Current-State Documentation + Architecture Reference

---

## 1. Executive Summary

The WeddingEase TTS pipeline converts AI-generated text responses into natural-sounding audio that users can play back on-demand. It uses **Google Gemini 2.5 Flash TTS** as the synthesis provider, supports **6 customizable voice presets**, handles **13+ languages**, and delivers audio through a polished custom `AudioPlayer` UI component with waveform visualization, variable-speed playback, and seek controls.

TTS is **user-initiated** (click-to-listen), not auto-play. Audio is generated per-request with no server-side caching, and is held in browser memory as blob URLs during the session.

---

## 2. System Overview & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        END-TO-END TTS PIPELINE                              │
│                                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  USER     │    │   FRONTEND   │    │   BACKEND    │    │   GEMINI     │  │
│  │  ACTION   │───>│   SERVICE    │───>│  CONTROLLER  │───>│   TTS API    │  │
│  │           │    │              │    │              │    │              │  │
│  │ Click     │    │ ttsService   │    │ ttsController│    │ 2.5 Flash    │  │
│  │ Volume2   │    │ .ts          │    │ .ts          │    │ Preview TTS  │  │
│  │ icon      │    │              │    │              │    │              │  │
│  └──────────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│                         │                   │                    │          │
│                         │  POST /api/tts    │   REST API call    │          │
│                         │  {text,voiceName, │   w/ GEMINI_API_   │          │
│                         │   language}       │   KEY              │          │
│                         │                   │                    │          │
│  ┌──────────┐    ┌──────┴───────┐    ┌──────┴───────┐    ┌──────┴───────┐  │
│  │  AUDIO   │<───│   BLOB URL   │<───│   WAV BUFFER │<───│  BASE64 PCM  │  │
│  │  PLAYER  │    │   in-memory  │    │   (24kHz,    │    │  response    │  │
│  │  UI      │    │   cache      │    │   mono,16bit)│    │              │  │
│  └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Pipeline Stages

### Stage 1: User Trigger (Frontend — `Index.tsx`)

| Attribute | Value |
|-----------|-------|
| **Trigger** | User clicks `Volume2` icon on any assistant message |
| **Location** | `ChatMessages.tsx:605-623` |
| **Handler** | `handleTtsPlay()` in `Index.tsx:475-507` |

**Behavior:**
1. If a **different** message is currently playing → stop it, revoke its blob URL, clear state.
2. If the **same** message is clicked again → toggle off (stop playback, revoke URL).
3. If audio is **already cached** for this message ID → reuse the cached blob URL (skip API call).
4. Otherwise → set loading state, call `requestTTS()`, cache result, activate playback.

**State variables:**
```typescript
ttsLoadingId: string | null      // message ID currently being synthesized
ttsActiveId:  string | null      // message ID currently playing
ttsAudioUrls: Record<string, string>  // messageId → blob URL cache
```

**Constraint:** Only one audio plays at a time (single-playback queue discipline).

---

### Stage 2: Frontend API Call (ttsService.ts)

| Attribute | Value |
|-----------|-------|
| **File** | `Wedding-Ease-Viva-Chat/src/services/ttsService.ts` |
| **Endpoint** | `POST {API_BASE}/api/tts` |
| **Auth** | Firebase ID token (Bearer header), optional for guests |

**Request payload (`TTSRequest`):**
```typescript
{
  text: string        // raw message text (markdown included)
  voiceName?: string  // Gemini voice name: 'Kore', 'Charon', 'Aoede', etc.
  language?: string   // BCP-47 code: 'en', 'hi', 'gu', etc.
}
```

**Voice resolution logic (`Index.tsx:492-494`):**
```
User profile → voiceId (e.g. 'aria') → VoicePreset → geminiVoiceName (e.g. 'Kore')
```
If no voice preference set, defaults to `'Kore'` (Aria) on the backend.

**Language resolution (`Index.tsx:494`):**
```
preferredLang (if set and not 'auto') → else message.language → else 'en'
```

**Response handling:**
- Response body: raw binary WAV data
- Converted to blob → `URL.createObjectURL(blob)`
- Caller responsible for `URL.revokeObjectURL()` on cleanup

---

### Stage 3: Backend Controller (ttsController.ts)

| Attribute | Value |
|-----------|-------|
| **File** | `easebot-backend/src/controllers/ttsController.ts` |
| **Route** | `POST /api/tts` via `easebot-backend/src/routes/tts.ts` |
| **Middleware** | `requireAuth` (Firebase token verification) |

**Processing steps:**

#### 3a. Input Validation
- `text` must be a non-empty string; returns `400` otherwise.

#### 3b. Markdown Stripping
Converts markdown-rich AI response text to speech-friendly plain text:

| Pattern | Replacement | Purpose |
|---------|-------------|---------|
| ` ```...``` ` | `" code block "` | Code blocks → spoken label |
| `` `inline` `` | `inline` | Remove backtick formatting |
| `# ## ###` etc. | _(removed)_ | Strip header markers |
| `**bold**` | `bold` | Strip bold markers |
| `*italic*` | `italic` | Strip italic markers |
| `_~\`>\|[]()` | _(removed)_ | Strip special characters |
| `- item` / `• item` | `, item` | Lists → comma-separated |
| `1. item` | `, item` | Numbered lists → commas |
| Double newlines | `. ` | Paragraph breaks → sentence pauses |
| Single newlines | `, ` | Line breaks → comma pauses |
| Multiple spaces | ` ` | Normalize whitespace |

#### 3c. Character Capping
- Maximum **5,000 characters** sent to Gemini TTS (API limit).
- Excess silently truncated via `.slice(0, 5000)`.

#### 3d. Response Headers
```
Content-Type:   audio/wav
Content-Length:  {buffer.length}
Cache-Control:   no-store
```

---

### Stage 4: Gemini TTS Service (geminiTTS.ts)

| Attribute | Value |
|-----------|-------|
| **File** | `easebot-backend/src/services/geminiTTS.ts` |
| **API** | Gemini 2.5 Flash Preview TTS |
| **Endpoint** | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent` |
| **Auth** | `GEMINI_API_KEY` query parameter |

#### 4a. Language Instruction Injection
For non-English languages, a pseudo-SSML tag is prepended:
```
<speak_language>{LanguageName}</speak_language>
{original text}
```

**Supported language map:**
| Code | Language | Code | Language |
|------|----------|------|----------|
| `hi` | Hindi | `pt` | Portuguese |
| `gu` | Gujarati | `de` | German |
| `es` | Spanish | `zh` | Chinese |
| `fr` | French | `ja` | Japanese |
| `ar` | Arabic | `ko` | Korean |
| `ru` | Russian | `it` | Italian |

English (`en`) and auto-detected (`auto`) skip the language tag.

#### 4b. API Request Body
```json
{
  "contents": [{ "role": "user", "parts": [{ "text": "<speak_text>" }] }],
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": {
      "voiceConfig": {
        "prebuiltVoiceConfig": { "voiceName": "<gemini_voice>" }
      }
    }
  }
}
```

#### 4c. Response Processing
1. Extract base64-encoded PCM audio from `candidates[0].content.parts[0].inlineData.data`
2. Decode base64 → raw PCM buffer
3. Wrap in WAV header via `pcmToWav()`

#### 4d. WAV Header Construction (`pcmToWav`)
| Parameter | Value |
|-----------|-------|
| Sample Rate | 24,000 Hz |
| Channels | 1 (mono) |
| Bit Depth | 16-bit |
| Byte Rate | 48,000 bytes/sec |
| Block Align | 2 bytes |
| Header Size | 44 bytes (standard RIFF/WAVE) |

Output: Complete WAV file buffer ready for HTTP response.

---

### Stage 5: Audio Playback (AudioPlayer.tsx)

| Attribute | Value |
|-----------|-------|
| **File** | `Wedding-Ease-Viva-Chat/src/components/AudioPlayer.tsx` |
| **Technology** | `HTMLAudioElement` |
| **Rendering** | Conditional, below message bubble when `ttsActiveId === message.id` |

#### 5a. Component Lifecycle
```
Mount → 'loading' state → audio.load()
 ↓
onLoadedMetadata → set duration → auto-play → 'playing'
 ↓
requestAnimationFrame loop → update progress/currentTime (smooth)
 ↓
onEnded → 'ended' → callback to parent
```

#### 5b. Player Controls

| Control | Behavior |
|---------|----------|
| **Play/Pause** | Toggle play state; from `ended`/`stopped` → reset to 0:00 |
| **Waveform Seek** | Click on 40-bar waveform visualization → seek to position |
| **Speed** | Cycle through `0.75x → 1x → 1.25x → 1.5x → 2x`; persisted to `localStorage` |
| **Stop** | Pause + reset to 0:00 |
| **Close** | Unmount player, revoke blob URL, clear state |

#### 5c. Visual Design
- Glassmorphism container: `bg-white/[0.08]` with `backdrop-blur-sm`
- 40-bar waveform with static heights, colored gold (`#C6944A`) when filled
- Active bar during playback: `scale-y-125` bounce effect
- Loading state: shimmer overlay animation
- Error state: red alert icon + "Retry" button
- Time display: `current / duration` in monospaced font

#### 5d. Speed Persistence
```
localStorage key: 'audio-player-speed-idx'
Values: 0-4 (index into [0.75, 1, 1.25, 1.5, 2])
Default: 1 (1x speed)
```

---

### Stage 6: Error Handling & Recovery

| Layer | Error | Handling |
|-------|-------|----------|
| **Frontend → Backend** | Network failure / 4xx / 5xx | Toast: "Voice synthesis failed. Please try again." (3s auto-dismiss) |
| **Backend → Gemini** | API error / missing key | `500` JSON: `{ error: "..." }` |
| **Backend** | Empty text input | `400` JSON: `{ error: "text is required" }` |
| **AudioPlayer** | Audio load failure | Error state UI with "Retry" button → `audio.load()` retry |
| **AudioPlayer** | Playback failure | Error state: "Playback failed" |
| **Blob cleanup** | Component unmount | `useEffect` cleanup revokes all blob URLs |

---

## 4. Voice Preset System

### 4a. Available Voices

| UI Name | ID | Gender | Personality | Gemini Voice | Default Rate | Pitch |
|---------|----|--------|-------------|--------------|--------------|-------|
| **Aria** | `aria` | Female | Warm & nurturing | `Kore` | 0.88 | 1.18 |
| **Echo** | `echo` | Male | Deep & confident | `Charon` | 0.84 | 0.85 |
| **Nova** | `nova` | Female | Bright & energetic | `Aoede` | 1.00 | 1.28 |
| **Vale** | `vale` | Male | Calm & thoughtful | `Fenrir` | 0.78 | 0.92 |
| **Luna** | `luna` | Female | Soft & dreamy | `Leda` | 0.76 | 1.22 |
| **Sol** | `sol` | Male | Friendly & clear | `Puck` | 0.92 | 1.02 |

### 4b. Voice Selection Flow
```
Settings Modal (SettingsModal.tsx)
  → User selects voice card
  → Preview: requestTTS({ text: sampleText, voiceName }) → new Audio(url).play()
  → Save: profile.voiceId → Firebase user document
  → Active in all subsequent TTS requests
```

### 4c. Voice Resolution Hierarchy (Frontend)
The preset also carries `voiceCandidates` for browser-native `SpeechSynthesis` (currently unused for playback but available for future use):
1. Exact name match from `voiceCandidates` list
2. Partial keyword match (e.g. "Aria" from "Microsoft Aria Online...")
3. Gender-based English voice
4. Any English voice

---

## 5. How Different Message Types Are Handled

| Message Type | TTS Available? | What Gets Spoken | Notes |
|--------------|---------------|------------------|-------|
| **Regular AI text** | Yes | Full markdown-stripped text | Primary use case |
| **AI text with vendor/product info** | Yes | Entire response including product names/URLs embedded in text | URLs read as-is |
| **AI text with checklist** | Yes | Text portion only | Checklist tool actions rendered separately |
| **AI text with calendar event** | Yes | Text portion; calendar event data rendered as UI card | Event details not synthesized |
| **Image generation response** | Yes | Text description of the image | Image itself displayed visually |
| **User messages** | No | N/A | TTS only on assistant messages |
| **User voice input** | N/A | Transcribed via Azure STT, not re-synthesized | One-way: speech→text only |
| **System/error messages** | No | N/A | Not eligible for TTS |

---

## 6. Relationship to Inbound Speech Pipeline (STT)

The STT (Speech-to-Text) pipeline is the **reverse direction** and uses a completely different provider:

```
┌─────────────────────────────────────────────────────────────────────┐
│  INBOUND (STT)                    OUTBOUND (TTS)                    │
│                                                                     │
│  User speaks                      AI text generated                 │
│       ↓                                ↓                            │
│  Azure Cognitive Services         User clicks Volume2               │
│  Speech SDK (browser)                  ↓                            │
│       ↓                           POST /api/tts                     │
│  Continuous recognition                ↓                            │
│  w/ auto language ID              Gemini 2.5 Flash TTS              │
│  (en-US, hi-IN, gu-IN, es-ES)         ↓                            │
│       ↓                           WAV audio (24kHz PCM)             │
│  Transcribed text                      ↓                            │
│       ↓                           AudioPlayer component             │
│  Populated in input field                                           │
│       ↓                                                             │
│  User sends message                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

| Aspect | STT (Inbound) | TTS (Outbound) |
|--------|--------------|----------------|
| **Provider** | Azure Cognitive Services Speech SDK | Google Gemini 2.5 Flash TTS |
| **Runs on** | Browser (client-side SDK) | Server (REST API call) |
| **Auth** | Azure Speech token from `/api/speech-token` | `GEMINI_API_KEY` on backend |
| **Trigger** | Microphone button hold | Volume2 icon click |
| **Languages** | en-US, hi-IN, gu-IN, es-ES (continuous ID) | 13 languages via instruction tag |
| **Streaming** | Yes (interim results shown live) | No (full audio returned at once) |

---

## 7. Architecture: File Map

```
easebot-backend/
├── src/
│   ├── routes/
│   │   └── tts.ts                    # POST /api/tts route registration
│   ├── controllers/
│   │   ├── ttsController.ts          # Request handler: validate, strip markdown, cap, respond
│   │   └── speechTokenController.ts  # GET /api/speech-token (Azure STT tokens)
│   ├── services/
│   │   └── geminiTTS.ts              # Gemini API call, PCM→WAV conversion, language injection
│   └── pipeline/
│       └── outbound.ts               # Post-AI processing (translation toggle, audioUrl: null)

Wedding-Ease-Viva-Chat/
├── src/
│   ├── services/
│   │   ├── ttsService.ts             # requestTTS() — fetch /api/tts → blob URL
│   │   └── voicePresets.ts           # 6 voice definitions, Gemini name mapping, SpeechSynthesis resolvers
│   ├── components/
│   │   ├── AudioPlayer.tsx           # Custom player: waveform, seek, speed, play/pause/stop/close
│   │   ├── chat/
│   │   │   └── ChatMessages.tsx      # Volume2 button per message, conditional AudioPlayer render
│   │   └── SettingsModal.tsx         # Voice selection UI with live preview
│   ├── pages/
│   │   └── Index.tsx                 # TTS state management: handleTtsPlay, handleTtsClose, blob cleanup
│   └── hooks/
│       └── useVoice.ts              # Microphone recording hook (STT, not TTS)
```

---

## 8. Configuration & Environment

| Variable | Location | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Backend `.env` | Authenticates Gemini TTS API calls |
| `AZURE_SPEECH_KEY` | Backend `.env` | Azure STT token generation (inbound only) |
| `AZURE_SPEECH_REGION` | Backend `.env` | Azure region for STT |
| `ENABLE_SPEECH_TRANSLATION` | Backend `.env` | Toggle: translate outbound text back to user language |
| `VITE_API_BASE_URL` | Frontend `.env` | Backend URL for TTS endpoint |

---

## 9. Current Limitations & Technical Debt

| # | Limitation | Impact | Potential Solution |
|---|-----------|--------|-------------------|
| 1 | **No server-side caching** | Same text re-synthesized on every click; increased API cost & latency | Redis/Firestore cache keyed by hash(text + voice + lang) |
| 2 | **No audio streaming** | User waits for full WAV generation before any playback | Chunked transfer encoding or WebSocket audio streaming |
| 3 | **5,000 char hard truncation** | Long responses silently cut off mid-sentence | Intelligent sentence-boundary splitting + multi-segment concatenation |
| 4 | **No auto-play option** | Every message requires manual click to listen | Optional auto-play toggle in settings (accessibility use case) |
| 5 | **Blob URLs in-memory only** | Audio lost on page refresh; no persistence | Cache audio in IndexedDB or store on server with URL in message doc |
| 6 | **No queued playback** | Can't "play all" messages sequentially | Message queue with auto-advance on `onEnded` |
| 7 | **Vendor URLs spoken verbatim** | "https colon slash slash" sounds unnatural | Strip/summarize URLs in TTS text preprocessing |
| 8 | **`Cache-Control: no-store`** | Browser can't HTTP-cache even identical requests | Use content-hash ETags for cache validation |
| 9 | **Voice rate/pitch unused** | VoicePreset defines rate/pitch/volume but Gemini doesn't accept these | Map to Gemini speech parameters if/when API supports them |
| 10 | **No SSML support** | Pronunciation hints, emphasis, pauses not controllable | Gemini TTS SSML support when available |
| 11 | **Single concurrent generation** | If user clicks TTS on multiple messages rapidly, earlier request is abandoned | Request queue with abort controller |
| 12 | **No offline/fallback TTS** | No audio if Gemini API is down or network unavailable | Browser-native SpeechSynthesis fallback (voice resolution already coded) |

---

## 10. Performance Characteristics

| Metric | Observed Behavior |
|--------|-------------------|
| **Latency (short text ~200 chars)** | ~1-2s (Gemini API round-trip + WAV encoding) |
| **Latency (max text ~5000 chars)** | ~3-5s |
| **Audio file size** | ~48KB/sec of audio (24kHz × 16-bit × mono) |
| **Typical response audio** | 30-90 seconds → 1.4-4.3 MB WAV |
| **Memory footprint** | One blob URL per cached message (~1-5 MB each) |
| **Concurrent requests** | No backend throttling; Gemini API rate limits apply |

---

## 11. Security Considerations

| Aspect | Current State |
|--------|--------------|
| **Authentication** | Firebase token required via `requireAuth` middleware |
| **Input sanitization** | Markdown stripped; no user-injected SSML possible |
| **API key protection** | `GEMINI_API_KEY` server-side only, never exposed to client |
| **Rate limiting** | Global rate limiter applies to `/api/tts` route |
| **Content safety** | Inherits Gemini's built-in content filtering |
| **Audio storage** | Ephemeral blob URLs; no persistent server storage of generated audio |

---

## 12. Sequence Diagram — Happy Path

```
User               Frontend              Backend              Gemini TTS
 │                    │                      │                     │
 │  Click Volume2     │                      │                     │
 │───────────────────>│                      │                     │
 │                    │                      │                     │
 │                    │  Check ttsAudioUrls  │                     │
 │                    │  (cache miss)        │                     │
 │                    │                      │                     │
 │                    │  POST /api/tts       │                     │
 │                    │  {text, voiceName,   │                     │
 │                    │   language}          │                     │
 │                    │─────────────────────>│                     │
 │                    │                      │                     │
 │                    │                      │  Strip markdown     │
 │                    │                      │  Cap at 5000 chars  │
 │                    │                      │                     │
 │                    │                      │  POST generateContent
 │                    │                      │  {text, voiceName,  │
 │                    │                      │   responseModalities│
 │                    │                      │   : ['AUDIO']}      │
 │                    │                      │────────────────────>│
 │                    │                      │                     │
 │                    │                      │  base64 PCM audio   │
 │                    │                      │<────────────────────│
 │                    │                      │                     │
 │                    │                      │  pcmToWav()         │
 │                    │                      │  Add 44-byte header │
 │                    │                      │                     │
 │                    │  audio/wav binary    │                     │
 │                    │<─────────────────────│                     │
 │                    │                      │                     │
 │                    │  blob = res.blob()   │                     │
 │                    │  URL.createObjectURL │                     │
 │                    │  Store in cache      │                     │
 │                    │                      │                     │
 │                    │  Render AudioPlayer  │                     │
 │                    │  Auto-play           │                     │
 │  Audio plays       │                      │                     │
 │<───────────────────│                      │                     │
 │                    │                      │                     │
 │  Audio ends        │                      │                     │
 │                    │  onEnded callback    │                     │
 │                    │  handleTtsClose()    │                     │
 │                    │  revokeObjectURL()   │                     │
```

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| **PCM** | Pulse-Code Modulation — raw uncompressed digital audio samples |
| **WAV** | Waveform Audio File Format — PCM with a RIFF header for metadata |
| **Blob URL** | `blob:https://...` — browser-local URL pointing to an in-memory binary object |
| **BCP-47** | Language tag standard (e.g. `en-US`, `hi-IN`, `gu-IN`) |
| **SSE** | Server-Sent Events — HTTP streaming for chat responses (separate from TTS) |
| **STT** | Speech-to-Text — the reverse pipeline (Azure Cognitive Services) |
| **Gemini Voice Name** | Internal identifier for Gemini TTS voices (e.g. `Kore`, `Charon`, `Puck`) |

---

*This document reflects the system as implemented on the `profile` branch as of 2026-04-17.*
