# Phase 3 — Streaming STT Gateway Design

Status: DRAFT — research + design, no code changes
Owner: (unassigned)
Target: replace HTTP batch STT (`POST /api/transcribe`) with a WebSocket gateway to Azure Speech Continuous Recognition, cutting mic-stop → text from 3–5s to ~300ms partials.

---

## 1. Current State (Baseline)

```
Browser (MediaRecorder webm/opus)
   |  full blob, base64-encoded JSON
   v
POST /api/transcribe  ──► requireAuth ──► quotaCheck('stt') ──► handleTranscribe
                                                                   |
                                                                   v
                                                            stt.transcribeAudio
                                                                   |  ffmpeg (webm→wav 16k mono)
                                                                   v
                                                            Azure recognizeOnceAsync
                                                                   |
                                                                   v
                                                            { text, detectedLanguage }
```

Critical files already mapped:
- `easebot-backend/src/controllers/transcribeController.ts` — orchestrates quotaReconcile
- `easebot-backend/src/services/stt.ts` — ffmpeg + Azure `recognizeOnceAsync`
- `easebot-backend/src/middleware/quotaMiddleware.ts` — attaches `req.quotaContext`
- `easebot-backend/src/middleware/auth.ts` — Firebase ID-token verifier (anonymous pass-through)
- `easebot-backend/src/controllers/speechTokenController.ts` — issues short-lived Azure STS tokens (already exists; unused today by browser path)
- `easebot-backend/src/app.ts` / `server.ts` — Express mounted on `http.createServer(app)` — perfect for attaching a `ws` server
- `Wedding-Ease-Viva-Chat/src/services/audioRecorder.ts` — MediaRecorder wrapper
- `Wedding-Ease-Viva-Chat/src/hooks/useVoice.ts` — state machine: idle → recording → transcribing → idle

Observed latency dominance: ffmpeg (≈400–900ms) + `recognizeOnceAsync` (≈1.5–3s on 5–10s clips) + base64 upload (≈200–1500ms on 4G). Streaming eliminates all three.

---

## 2. WebSocket Frame Protocol

Endpoint: `wss://<host>/api/stt/stream` (also `/api/v1/stt/stream` for version parity)

Mixed-mode: binary frames = PCM audio; text frames = control JSON. Each text frame has a required `type` discriminator.

### 2.1 Client → Server

**Audio (binary):** raw PCM16LE, mono, 16000 Hz, 20ms frames = 640 bytes. No framing header — timing inferred from arrival order. Empty binary frames are ignored.

**Control (text JSON):**

```ts
// Must be the first message after the WS opens. Sent once.
interface StartFrame {
  type: 'start'
  sessionId: string                 // uuid; echoed back in all server events
  preferredLocale?: string          // BCP-47; same precedence as HTTP path
  candidateLocales?: string[]       // up to 4; overrides server default set
  sampleRate: 16000                 // hard-coded for v1; field exists for future
  encoding: 'pcm16'                 // hard-coded for v1
  clientVersion: string             // e.g. "viva-web@0.42.1"
  /**
   * Optional soft-hint from client: maximum wall-clock seconds the client is
   * willing to keep the socket open. Server rejects > 120. No hint → 60s.
   */
  maxDurationSec?: number
}

// Optional: flush a tentative utterance boundary mid-stream (not used in v1).
interface PingFrame { type: 'ping'; ts: number }

// Graceful close. Server will drain Azure, emit remaining finals, then 'done'.
interface EndFrame { type: 'end'; reason: 'user-stop' | 'silence' | 'max-duration' }
```

### 2.2 Server → Client

```ts
interface Ready     { type: 'ready';     sessionId: string; azureRegion: string }
interface Partial   { type: 'partial';   sessionId: string; text: string; offsetMs: number }
interface Final     { type: 'final';     sessionId: string; text: string; offsetMs: number; durationMs: number; detectedLocale: string }
interface LangDet   { type: 'lang';      sessionId: string; locale: string; confidence?: number }
interface Pong      { type: 'pong';      sessionId: string; ts: number }
interface ErrorFrame {
  type: 'error'
  sessionId: string
  code: number              // see §3.4
  message: string
  recoverable: boolean      // if false, server will close after this frame
}
interface Done      {
  type: 'done'
  sessionId: string
  reason: 'client-end' | 'max-duration' | 'silence-timeout' | 'azure-cancelled' | 'error'
  totalAudioMs: number      // needed for quota reconcile on the client UI side
  finalText: string         // concatenation of all 'final' segments
}
```

Close codes follow RFC 6455 + extension: `1000` clean, `4001` bad protocol, `4401` unauthenticated, `4402` quota, `4429` rate limit, `1011` internal error.

---

## 3. Server-Side Gateway

### 3.1 Recommendation: in-process `ws` on the existing Express `http.Server`

Rationale:
- `server.ts` already creates `http.createServer(app)` — attaching `new WebSocketServer({ noServer: true })` and handling `server.on('upgrade', …)` is <30 LOC.
- Keeps Firebase auth, `quotaMiddleware`-style logic, observability, and deploy pipeline unchanged.
- Azure Speech SDK (Node) is already a dep via `stt.ts`; reusing it means one audit surface for STT.
- Container App hosts one process today; splitting to a second service doubles cold-starts and bills, for zero benefit at current scale.

Consider splitting to a separate Container App only if: (a) WS sessions cause EventLoop lag on HTTP routes (>100ms p99 regression), or (b) we need independent horizontal scaling. Revisit at >50 concurrent streams/instance.

### 3.2 Azure Speech Continuous Recognition Lifecycle

Per session:
```
new PushAudioInputStream()
new AudioConfig.fromStreamInput(pushStream)
new SpeechRecognizer(speechConfig, audioConfig)
  or SpeechRecognizer.FromConfig(speechConfig, autoDetectCfg, audioConfig)

recognizer.recognizing  → Partial
recognizer.recognized   → Final
recognizer.canceled     → error path
recognizer.sessionStopped → Done

recognizer.startContinuousRecognitionAsync()
// stream frames via pushStream.write(buffer)
recognizer.stopContinuousRecognitionAsync()
pushStream.close()
recognizer.close()
```

Lifecycle is bound 1:1 to the WS connection. On any error, call `stopContinuousRecognitionAsync` → `close()` in that order (SDK leaks native handles otherwise).

### 3.3 Back-Pressure

Azure's `PushAudioInputStream` is synchronous and buffers internally. The real risk is the **other direction** — server → client partials arriving faster than the client can render. Policy:

- Soft cap: if `ws.bufferedAmount > 1MB` (shouldn't happen with text frames, but defense in depth), drop all but the most recent `partial`. Finals are never dropped.
- Ingress: if the client sends >40 audio frames in a 100ms tick (>2× real-time), treat as malicious and close with 4001. Legitimate clients pace at wall-clock.
- Hard cap: session duration 120s. Server auto-emits `done` with reason `max-duration`.
- Silence timeout: no audio frames for 15s → auto-close. Azure often fires `sessionStopped` first anyway.

### 3.4 Error Taxonomy

| Code | Meaning                          | Recoverable | Notes                                                   |
|------|----------------------------------|-------------|---------------------------------------------------------|
| 4001 | Bad protocol / frame             | no          | malformed JSON, binary before `start`, wrong sample rate |
| 4002 | Audio too short / silent         | no          | <500ms PCM received before `end`                        |
| 4401 | Unauthenticated                  | no          | token missing/expired (see §4)                          |
| 4402 | Quota exceeded                   | no          | pre-reserve failed; includes `resetAt` in message       |
| 4429 | Rate limited                     | no          | per-uid concurrent session cap (default 2)              |
| 5001 | Azure Speech unavailable         | yes         | retry after `retryAfterMs` in message                   |
| 5002 | Azure cancelled mid-stream       | yes         | `CancellationDetails` surface; client may reconnect     |
| 5003 | Internal gateway error           | no          | unhandled exception                                     |

---

## 4. Auth Model

Three options evaluated:

| Approach                          | Pros                                      | Cons                                                          |
|-----------------------------------|-------------------------------------------|---------------------------------------------------------------|
| Bearer in `?token=` query         | Simple; works with browser `WebSocket()`  | **Logged by proxies / access logs / referer headers — bad**   |
| `Sec-WebSocket-Protocol` subproto | Not logged; native WS feature             | Browser `WebSocket` ctor passes it; server must echo protocol |
| Post-connect `auth` message       | Cleanest; no upgrade-handshake coupling   | Adds one RTT; server must hold unauth sockets briefly         |

**Recommendation: Sec-WebSocket-Protocol subprotocol** — encode Firebase ID token as a second subprotocol value, e.g. `['viva.stt.v1', 'bearer.<jwt>']`. Server validates during `upgrade`, rejects with 401 before the socket opens. Matches how Kubernetes and Azure Signalling do auth.

Fallback: if subprotocol approach is rejected by a corp proxy (rare but real — see Risk 7.7), allow a **post-connect** `auth` control frame behind a feature flag. Never accept tokens in query params.

Guest/anonymous users: follow same pattern as HTTP — if no bearer, principal is `guest` with `X-Guest-Id` carried in `clientVersion`-style field of the `start` frame. Guest quota already caps voice at 3 uses (see `billing.ts` → `guestCounters.voiceCount`).

Token expiry mid-session: Firebase ID tokens last 1h, sessions cap at 120s — no reverification needed. Revocation check remains opt-in (env `FIREBASE_CHECK_REVOKED`).

---

## 5. Quota Accounting

Current model reserves pessimistically (`seconds = body.durationSeconds ?? 60`), then reconciles in the controller. For long-lived WS we adapt:

1. **Pre-reserve at upgrade time.** On receiving `start`, synthesize `RawCost = { kind: 'stt', seconds: hintedMax ?? 60 }`, call the same `estimateCost` path used by `quotaMiddleware`. On `wouldExceedDaily/Monthly/Guest`, close with 4402 before `ready`.

2. **Mid-session enforcement.** Track `elapsedAudioMs` in a running counter. Every 15s, call `estimateCost` again with the elapsed + 15s lookahead. If it would exceed, emit `error 4402` + close.

3. **Post-reconcile on close.** In the WS `close` handler (covers client drop, server error, `done`), call `chargeTokens(subject, { kind: 'stt', seconds: ceil(elapsedAudioMs/1000) })`. Idempotent via the existing `_reconciled` guard pattern — refactor `QuotaContext.reconcile` to a standalone helper so both Express middleware and the WS handler can call it.

4. **Concurrent session cap.** In addition to daily/monthly quota, enforce *concurrent* sessions/uid in a Redis (or in-process Map, since single-container today) set. Default: 2. Prevents tab-spam. Close code 4429.

5. **Per-minute cap.** Not needed for v1 — the 120s session cap + daily cap bound abuse. Revisit if a user can spin up serial sessions faster than reconcile.

Implementation note: the existing `quotaContext.reconcile(actual)` signature accepts `RawCost | { skip: true }`. We can reuse it verbatim inside a small WS-scoped wrapper; no type churn.

---

## 6. Browser-Side Changes

### 6.1 New architecture

```
getUserMedia
  └─ MediaStreamAudioSourceNode
       └─ AudioWorkletNode('pcm16-downsampler')
             └─ port.onmessage → Float32Array frames (browser ctx, usually 48k)
                   └─ downsample + dither → Int16Array @ 16k, 20ms chunks
                         └─ ws.send(buffer)
```

### 6.2 Files affected

- `Wedding-Ease-Viva-Chat/src/services/audioRecorder.ts` — add a second class `StreamingRecorder` (do not break `AudioRecorder`; fallback still uses it). Keep the existing `getAmplitudeLevel()` API so the waveform UI renders identically.
- `Wedding-Ease-Viva-Chat/src/services/sttStreamClient.ts` — NEW. Owns WS lifecycle, reconnect, frame encoding.
- `Wedding-Ease-Viva-Chat/public/worklets/pcm16-downsampler.js` — NEW. AudioWorkletProcessor; must be a separate file (cannot be inlined per Worklet spec).
- `Wedding-Ease-Viva-Chat/src/hooks/useVoice.ts` — add new states: `connecting`, `streaming`, `finalizing`. Maintain the existing `interimText` field (previously always `''`) now carrying live partials. The hook selects HTTP vs WS path behind a runtime capability check + feature flag.

### 6.3 Fallback policy

```
if (featureFlag.streamingStt
    && 'AudioWorkletNode' in window
    && typeof WebSocket !== 'undefined'
    && !isSafariPre16()) {
  use StreamingRecorder + sttStreamClient
} else {
  use existing AudioRecorder + POST /api/transcribe
}
```

`isSafariPre16()` sniffs UA; AudioWorklet shipped in Safari 14.1 but iOS has real bugs until 16.4 (audioWorklet in background tabs, AudioContext resume gestures). Fall back is the safe default.

### 6.4 Browser support matrix

| Browser                  | Strategy            |
|--------------------------|---------------------|
| Chrome/Edge ≥ 90 desktop | streaming           |
| Chrome Android ≥ 90      | streaming           |
| Firefox ≥ 76             | streaming           |
| Safari 16.4+ desktop     | streaming           |
| Safari iOS < 16.4        | MediaRecorder HTTP  |
| Safari iOS 16.4+         | streaming w/ guard  |
| Samsung Internet         | streaming           |
| Any browser w/o `AudioWorkletNode` or w/o `WebSocket`, or behind HTTP proxy that strips `Upgrade` | HTTP fallback |

UI must never expose "streaming is broken" — the flag silently routes down the HTTP path.

---

## 7. Risk Register

| # | Risk                                                | Mitigation                                                           |
|---|-----------------------------------------------------|----------------------------------------------------------------------|
| 1 | Mobile network drops mid-utterance                  | Emit best-effort `final` on WS close with partial text; client surfaces "(incomplete)"; auto-retry once |
| 2 | Background-tab throttling (Chrome timer clamp 1Hz)  | Worklet runs on audio thread (not throttled); buffer in worklet; detect via `document.visibilityState`, emit explicit `end` on `visibilitychange` |
| 3 | iOS audio interruption (phone call, Siri)           | Listen for `AudioContext.statechange → interrupted`; send `end` with `reason: 'silence'`; surface toast |
| 4 | Autoplay / gesture policy                           | Recording is already gesture-initiated (mic button); AudioContext resumes cleanly in same tick |
| 5 | Battery drain on long sessions                      | Hard 120s session cap; UI auto-stops at 60s same as today            |
| 6 | Corp proxies strip `Upgrade` header                 | Detect WS open timeout (2s) → fall back to HTTP path for remainder of session |
| 7 | Corp proxies buffer WS frames (kill streaming UX)   | Send small PONG every 3s; if RTT > 2s for 3 pongs, downgrade flag for that UA for 24h (localStorage) |
| 8 | Azure region outage                                 | Circuit breaker (we already have `services/circuitBreaker.ts`) → HTTP path stays; UI falls back transparently |
| 9 | Token expiry during deploy push                     | n/a at 120s; but: don't cache the adminAuth verifier result across reloads |
| 10 | Two sessions per user (tab duplication)            | Concurrent cap 2, close older on 3rd connect |
| 11 | Azure SDK native leak on crash                     | Wrap lifecycle in try/finally with both `stopContinuousRecognitionAsync` and `close()` |
| 12 | PCM downsample aliasing (48k→16k)                  | Include low-pass filter in worklet before decimation; test with bilingual audio (gu-IN tonal cues) |

---

## 8. Migration Plan

Feature flag: `streamingStt` (Firebase Remote Config, boolean). Client and server both read it.

**Phase 3.0 — Shadow** (week 1)
- Ship WS gateway in prod, flag OFF for all users. Smoke with internal accounts.
- QA gate: 100 internal sessions, 0 memory growth over 1h soak, p95 partial latency <500ms.

**Phase 3.1 — Canary** (week 2)
- Flag ON for `internal_testers` segment (≈10 users).
- QA gate: recognition accuracy (CER) within 2% of HTTP path on bilingual test set; crash-free sessions ≥99.5%.

**Phase 3.2 — 5% rollout** (week 3)
- Flag ON for 5% of signed-in users (hashed uid buckets); guests stay on HTTP.
- QA gate: no regression in `stt.error` rate in observability; no quota accounting drift (reconcile deltas <1%).

**Phase 3.3 — 50% rollout** (week 4)

**Phase 3.4 — 100% + deprecate** (week 6)
- Keep HTTP `/api/transcribe` route alive for 90 days as fallback. Remove in Phase 4.

Rollback: flip flag OFF — client code paths diverge at hook level, no redeploy needed.

---

## 9. Observability

New events emitted via existing `lib/observability.ts`:
- `stt.stream.open` — sessionId, uid, tier, ua
- `stt.stream.partial` — sessionId, partialIdx, textLen, offsetMs
- `stt.stream.final` — sessionId, finalIdx, textLen, detectedLocale, azureMs
- `stt.stream.close` — sessionId, reason, totalAudioMs, frames, tokensCharged
- `stt.stream.error` — sessionId, code, message, stage

Metrics targets for dashboards: p50/p95 first-partial latency, session duration distribution, error-code histogram.

---

## Executive Summary

Phase 3 replaces the current HTTP batch STT pipeline — MediaRecorder → base64 POST → ffmpeg → Azure `recognizeOnceAsync` — with an in-process WebSocket gateway attached to the existing Express `http.Server`, forwarding 16kHz PCM16 20ms frames to Azure Speech's Continuous Recognition API. Target: ~300ms first-partial latency versus today's 3–5s full-clip latency. Protocol is mixed-mode WebSocket (binary audio, text JSON control), with a strict frame grammar (`start`, audio binary, `end` → `ready`, `partial*`, `final*`, `done`) and numeric error codes mapped to close codes. Browser capture moves to AudioWorklet with server-side downsampling; Safari <16.4 and any browser lacking WebSocket/Worklet silently falls back to today's HTTP path. Auth uses the `Sec-WebSocket-Protocol` subprotocol to avoid logging Firebase ID tokens in URLs; query-param tokens are rejected. Quota accounting pre-reserves at `start`, enforces every 15s against `estimateCost`, and reconciles via the existing `chargeTokens` path on close — reusing `quotaMiddleware`'s idempotent reconcile pattern. Rollout is flag-gated (`streamingStt`) across four phases with per-phase QA gates on latency, accuracy, and reconcile drift. HTTP route stays alive for 90 days as a rollback surface.

---

## Three Biggest Open Questions

1. **Separate service vs. in-process?** Recommendation is in-process `ws` on the existing Express `http.Server`, but this couples WS session lifetime to the same process that serves stateless HTTP. If a single rogue session leaks a native Azure SDK handle, it affects all HTTP traffic. **Need a product decision: are we willing to accept this blast-radius for Phase 3, or should we fork to a dedicated Container App now (doubling deploy surface)?**

2. **Subprotocol auth vs. post-connect auth?** Subprotocol tokens are cleanest but some corporate proxies strip non-standard subprotocol values during the WS handshake, failing 100% of connects for affected users. **Do we have telemetry on what % of current users are behind such proxies, or should we ship both auth paths and A/B which succeeds?**

3. **Mid-session quota denial UX.** When `estimateCost` trips at the 60s mark mid-utterance, do we (a) truncate the user's sentence and emit the finals we have, or (b) reject the remaining audio silently? Option (a) is honest but leaks "you hit your limit" mid-speech; option (b) looks like a bug. **Product/design call needed before wiring mid-session enforcement.**

---

### Critical Files for Implementation
- D:\weddingease\easeBot\easebot-backend\src\app.ts
- D:\weddingease\easeBot\easebot-backend\src\server.ts
- D:\weddingease\easeBot\easebot-backend\src\services\stt.ts
- D:\weddingease\easeBot\easebot-backend\src\middleware\quotaMiddleware.ts
- D:\weddingease\easeBot\Wedding-Ease-Viva-Chat\src\hooks\useVoice.ts
