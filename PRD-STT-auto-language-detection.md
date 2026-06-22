# PRD — Voice STT: Fix Auto Language Detection + ChatGPT-Grade Pipeline

| | |
|---|---|
| **Status** | Draft — for review |
| **Author** | Viva AI (Claude) |
| **Date** | 2026-06-12 |
| **Area** | `easebot-backend` (STT service) + `Wedding-Ease-Viva-Chat` (voice UI) |
| **Severity** | **P0** — voice input is broken in the default ("Auto-detect") mode |
| **Related** | [PRD-TTS-Pipeline.md](PRD-TTS-Pipeline.md) (the reverse path) |

---

## 1. TL;DR

Voice input is the **default-broken** path: a new user's language is `'auto'` out of the box, and in that
mode the Speech-to-Text (STT) pipeline frequently produces **no transcript and no chat response, with no
error shown**. The root causes are not one bug but a chain of five concrete defects (silent failure UX, a
hard-coded 4-language candidate set, no request timeout, a locale map that silently downgrades half the
offered languages to English, and a single-utterance recognizer). Underneath those is an architectural gap:
our STT is a **blocking, non-streaming, candidate-list-driven Azure "at-start" language-ID** flow, whereas
ChatGPT uses a **streaming Whisper / `gpt-4o-transcribe` engine with intrinsic 90+ language detection and
voice-activity auto-stop**.

This PRD (a) documents the confirmed root causes with file:line evidence, (b) compares us against ChatGPT,
and (c) proposes a **3-phase improvement plan**: P0 hotfixes to stop the bleeding this week, a P1 engine swap
to **Azure OpenAI `gpt-4o-transcribe`** (no new vendor — we already ship the `AzureOpenAI` SDK) that makes
"auto" *just work*, and a P2 streaming + VAD upgrade for ChatGPT-grade latency.

---

## 2. Problem statement

**Reported:** *"The STT is not working when the user has not selected any language and it is in auto mode;
further there is no response from the same situation."*

**Reproduces as two stacked symptoms:**

1. **No transcript** — user taps mic in Auto mode, speaks, taps stop → the textarea stays empty.
2. **No response** — because nothing landed in the textarea, there is nothing to send, so the chat never
   replies. The failure is **completely silent**: no toast, no spinner-error, no console-visible message to
   the user.

The current voice flow is **record → stop → upload full clip → ffmpeg transcode → Azure `recognizeOnceAsync`
with at-start Language-ID → return text** (`useVoice.ts` → `POST /api/transcribe` → `stt.ts`). The chat reply
itself *does* stream (SSE, `streamChatMessage`), but the **voice-input leg does not**, and it is where every
failure below occurs.

---

## 3. Root-cause analysis (confirmed, code-grounded)

Each item below was verified against the current code. File:line references are exact.

### RC-1 — Silent failure: errors and empty transcripts are swallowed by the UI  **[P0 — this is the "no response"]**
- `useVoice.stopRecording()` returns `null` on **any** transcription error (`useVoice.ts:230-258`) and returns
  `{ text: '', detectedLanguage: 'en' }` for short clips (`useVoice.ts:210-215`).
- The mic handler only acts on a *truthy* transcript and has **no `else`**:
  ```ts
  // Index.tsx:481-486
  const result = await stopRecording();
  if (result?.text) { setInputText(result.text); ... }
  // ← null or '' → nothing happens, no toast
  ```
- `voiceError` is read once to *clear* it (`Index.tsx:479`) and is **never rendered** anywhere. The hook even
  leaves a comment promising a toast the caller never shows (`useVoice.ts:256`).
- **Net effect:** every backend STT failure (incl. the auto-mode `NoMatch` below) is invisible. This single
  defect is what makes the bug feel like "nothing happens."

### RC-2 — Auto mode only ever considers **4** hard-coded languages  **[P0 — "auto doesn't work"]**
- With no preference, the recognizer is built from a fixed set:
  ```ts
  // stt.ts:20-25
  const DEFAULT_SUPPORTED_LANGUAGES = ['en-US', 'hi-IN', 'gu-IN', 'es-ES']
  ```
- But the picker offers **ten** languages including French, Arabic, Portuguese, German, Chinese
  (`constants.ts:9-20`). In Auto mode, anyone speaking outside `{en, hi, gu, es}` is matched against the wrong
  candidate set → Azure returns `NoMatch` or mis-transcribes → RC-1 hides it. Azure "at-start" LID is also
  capped at 4 candidates, so we cannot simply widen this list without changing the LID mode.

### RC-3 — No application-level timeout on the Azure recognize call  **[P0 — indefinite hang]**
- ffmpeg conversion is bounded (`Promise.race([..., timeoutPromise(15_000)])`, `stt.ts:149-152`), but the Azure
  call is **not**:
  ```ts
  // stt.ts:241-250 — withRetry only, no Promise.race timeout
  result = await withRetry(azureCall, 1, retryCounter)
  ```
- The client `post()` has **no timeout either** — only an `AbortSignal` fired on user *cancel*
  (`functionsService.ts:40-68`). A stalled connection or an indecisive multi-language LID can therefore hang
  far past any acceptable budget, presenting as a permanent "no response." Auto mode (4-way LID) is the most
  likely to stall.

### RC-4 — Locale map silently downgrades half the offered languages to English  **[P1]**
- When a user *does* pick a language, it is mapped through `toAzureLocale()`, whose alias table omits
  `ar`, `pt`, `zh` (`stt.ts:30-51`). The fall-through returns `'en-US'`:
  ```ts
  // stt.ts:50
  return LOCALE_ALIASES[base] ?? 'en-US'
  ```
- **Result:** selecting **Arabic, Portuguese, or Chinese** forces *strict English* recognition — the user's
  speech is transcribed as (garbage) English or fails. The picker advertises capabilities the engine lacks.

### RC-5 — `recognizeOnceAsync` truncates at the first pause  **[P1]**
- STT uses single-utterance recognition (`stt.ts:219`). It stops at the first significant silence, so
  multi-sentence dictation is cut off mid-thought. ChatGPT handles arbitrarily long turns.

### RC-6 — Auto-mode mislabels Indian-English as Gujarati/Hindi  **[P1]**
- Acknowledged in-code (`stt.ts:28-29`): with no preference, at-start LID frequently tags English speech as
  `gu`/`hi`, producing wrong-script transcripts. This is *why* RC-2's "narrow to a fixed 4" band-aid exists,
  and it is inherent to candidate-list LID.

### Secondary / contributing
- **RC-7 — No VAD / silence auto-stop.** Only a 60s hard cap and manual stop (`useVoice.ts:42,137-139`); no
  voice-activity detection. The recorder already computes amplitude (`pcmAudioRecorder.ts:233`) but never uses
  it to end a turn. **[P2]**
- **RC-8 — STT is fully blocking & non-streaming** end to end, while the chat reply streams. High perceived
  latency. **[P1-perf]**
- **RC-9 — Chat pipeline also swallows STT failures.** `inbound.ts:31-33` catches and falls back to
  (possibly empty) typed text → empty LLM input → no answer. Secondary to the `/api/transcribe` path but the
  same failure shape. **[P1]**
- **RC-10 — `NoMatch` is excluded from retry** (`stt.ts:90-93,106`); a transient auto-mode LID miss never gets
  a second attempt. **[P2]**
- **RC-11 — Two divergent STT code paths** (`transcribeController` for the voice UI; `inbound.ts` for chat
  audio) with different language logic — maintenance hazard. **[P2]**

---

## 4. How ChatGPT does STT (the bar we're comparing to)

| Dimension | ChatGPT (Whisper / `gpt-4o-transcribe` / Realtime API) | easeBot today |
|---|---|---|
| **Language detection** | **Intrinsic**, ~90+ languages, from the audio itself. No candidate list, no "auto" toggle — it just detects. `language` is an *optional* accuracy hint. | Azure **at-start LID** over a **hard-coded 4-language** candidate set (RC-2); picker languages beyond that silently fail (RC-4). |
| **Latency** | Realtime API ≈ 300 ms; standard transcribe streams partial text in ~1–2 s. | Blocking: record → upload whole clip → ffmpeg → `recognizeOnce` → return. No partials (RC-8). |
| **Streaming** | Yes — partial transcripts stream; speech-to-speech in Realtime. | None for the voice-input leg. |
| **End-of-turn** | Server/client **VAD** (incl. semantic VAD) auto-stops on silence. | Manual stop or 60 s cap; no VAD (RC-7). |
| **Long-form** | Handles long turns without truncation. | Truncates at first pause (RC-5). |
| **Error feedback** | Clear, visible. | Silent (RC-1). |
| **Engine plumbing** | Send audio → get `{ text, language }`. | ffmpeg transcode + RIFF fast-path + locale-alias maps + candidate-set juggling. |

**Key insight:** ChatGPT has no concept of a "broken auto mode" because detection is a property of the
*model*, not of a configured candidate list. The single highest-leverage move for us is to adopt an engine
with the same property.

---

## 5. Goals & non-goals

**Goals**
- G1. Auto mode (the default) reliably transcribes **any** language the picker offers, with **zero silent
  failures**.
- G2. Voice-input latency and feel approach ChatGPT: p50 time-to-transcript **< 1.5 s** for a ~5 s clip;
  streaming/partial feedback where feasible.
- G3. Every failure is **visible and actionable** to the user (and observable in PostHog).
- G4. No regression to TTS, chat streaming, quotas, or the warm-mic UX already built (`pcmAudioRecorder.ts`).

**Non-goals (this cycle)**
- Full speech-to-speech / Realtime duplex "Advanced Voice" mode (future).
- Re-enabling the commented-out therapist/consultant modes.
- Any Firebase rules / deploy change (out of scope; follows the repo's strict no-deploy rule).

---

## 6. Proposed solution

### 6.1 Option analysis

| Option | What | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Patch Azure LID** | Keep Azure Speech; switch to **continuous** LID, widen candidates, fix locale map, add timeout + error surfacing. | Smallest infra change; keeps one vendor. | Continuous LID still candidate-list-bound and accuracy-limited; RC-6 persists; no streaming. | Do the *safe subset* as **Phase 0** hotfixes; not the end state. |
| **B. Swap engine → Azure OpenAI `gpt-4o-transcribe` / Whisper** ✅ | Replace the recognizer with `client.audio.transcriptions.create()` on our **existing `AzureOpenAI` SDK** (`openai ^4.47.1`, already in `package.json`). | **Intrinsic 90+ lang auto-detect** → deletes RC-2, RC-4, RC-6 outright; no new vendor; reuses Azure footprint + key; optional streaming on `gpt-4o-transcribe`. | Needs a model deployment in the Azure OpenAI resource; per-minute cost; SDK bump for streaming. | **Recommended core.** |
| **C. Hybrid** | Option B primary, Azure Speech as fallback; add client VAD + streaming. | Best reliability + lowest-risk migration. | Slightly more code (two engines behind one interface). | **Target end state** (Phases 1–2). |

> **Why B is low-friction:** the backend already instantiates `AzureOpenAI` for chat, summarization, and images
> (`azureAI.ts:1`, `imageGeneration.ts:20`, `promptArchitect.ts:1`). Transcription is the *same client*,
> a different deployment. We keep Azure AI Speech for **TTS** and as an STT **fallback**.

### 6.2 Phased plan

#### Phase 0 — Stop the bleeding (P0, ~1–2 days, ships independently)
Fixes the reported bug without changing engines.
1. **Surface every failure** (RC-1): on `stopRecording()` returning `null`/empty, show the existing toast
   pattern (`Index.tsx:489-494`) with `voiceError`; render `voiceError` in `ChatInput`. Differentiate
   "didn't catch that — try again" (NoMatch/short) from "voice service error."
2. **Add timeouts** (RC-3): wrap `azureCall` in `Promise.race` with a ~12 s budget in `stt.ts`; add an
   `AbortController` timeout (~15 s) to the client `post()` for `/api/transcribe`.
3. **Repair the candidate/locale maps** (RC-2, RC-4): align `DEFAULT_SUPPORTED_LANGUAGES` and `LOCALE_ALIASES`
   with the picker; add `ar→ar-SA/ar-EG`, `pt→pt-BR`, `zh→zh-CN`; switch the no-preference path to Azure
   **continuous** LID (`SpeechServiceConnection_LanguageIdMode = Continuous`) so >4 candidates are legal, OR
   gate the picker to only the languages we truly support until Phase 1 lands.
4. **Never emit a silent empty success** for non-trivial clips: treat `NoMatch` as a visible, retryable state.

#### Phase 1 — True auto language detection (P1, ~3–5 days)
5. **Introduce a `gpt-4o-transcribe` (or `whisper`) transcriber** behind a `STT_ENGINE` flag
   (`azure_speech` | `azure_openai`), implementing the existing `transcribeAudio()` contract
   (`{ text, detectedLanguageCode }`). Intrinsic detection means the candidate-set logic disappears for this
   engine; pass the user's picked language (when not `auto`) as an optional hint only.
6. **Fallback chain** (RC-9, RC-11): primary engine fails/times out → fall back to Azure Speech → then surface
   error. Consolidate the `inbound.ts` audio path onto the same transcriber so chat-audio and voice-UI share
   one code path.
7. **Roll out behind the flag**, default `azure_openai` once eval (see §8) passes; keep `azure_speech`
   one toggle away.

#### Phase 2 — ChatGPT-grade latency (P1/P2, ~1–2 weeks)
8. **Client-side VAD auto-stop** (RC-7): use the existing amplitude signal to end a turn after ~700–900 ms of
   trailing silence (configurable), with a barge-in-safe floor. Removes the manual "tap stop."
9. **Streaming transcription** (RC-8): adopt `gpt-4o-transcribe` streaming (`stream: true`) and surface
   partial text in the textarea as it arrives, matching ChatGPT's feel. Requires an `openai` SDK bump.
10. **Warm path:** reuse the already-warm mic (`pcmAudioRecorder` keeps the stream alive) + a pre-opened
    transcription connection to shave cold-start latency.

#### Phase 3 — Polish & hardening (P2/P3)
11. Long-form handling (RC-5) is inherent once on Whisper/`gpt-4o-transcribe`; verify >60 s and chunking.
12. Retry tuning (RC-10); per-language accuracy tuning via prompt/hint; domain vocabulary (reuse the wedding
    phrase list concept where the engine supports biasing).
13. Observability: a small **eval harness** of labeled multi-language clips run in CI (extends the existing
    `test:phase2` STT tests).

---

## 7. Improvement backlog (the prioritized list)

> Ordered for execution. "Sev" = user impact; "Eff" = rough effort (S/M/L). Each item is independently
> shippable unless noted.

| # | Improvement | Sev | Eff | Phase | Primary files | Acceptance criteria |
|---|---|---|---|---|---|---|
| **I-1** | Surface STT failures + empty results in the UI (toast + `voiceError` render); distinguish "try again" vs "service error" | **P0** | S | 0 | `Index.tsx:478-497`, `ChatInput.tsx`, `useVoice.ts:230-258` | No path where stop→empty/null shows nothing. Manual: kill backend mid-record → user sees a clear toast. |
| **I-2** | App-level timeout on Azure recognize + client `/api/transcribe` fetch | **P0** | S | 0 | `stt.ts:241-250`, `functionsService.ts:40-83` | Recognize bounded ≤12 s server / ≤15 s client; on timeout → visible, retryable error; never hangs. |
| **I-3** | Align auto candidate set + locale aliases with the picker (or gate picker); enable Azure **continuous** LID for >4 candidates | **P0** | M | 0 | `stt.ts:20-51,186-199`, `constants.ts:9-20` | Every picker language either transcribes or is not offered. ar/pt/zh no longer downgrade to English. |
| **I-4** | Treat `NoMatch` as a visible, retryable state (not a silent empty success) | **P0** | S | 0 | `stt.ts:219-238`, `useVoice.ts:210-215`, `Index.tsx:482` | Speaking gibberish/silence yields a "didn't catch that" prompt, not dead air. |
| **I-5** | Add `gpt-4o-transcribe`/Whisper transcriber via existing `AzureOpenAI` SDK behind `STT_ENGINE` flag | **P1** | M | 1 | new `services/openaiStt.ts`, `transcribeController.ts:41`, `.env.example` | With `STT_ENGINE=azure_openai`, Auto mode transcribes en/hi/gu/es/fr/ar/pt/de/zh correctly with **no candidate list**. |
| **I-6** | Fallback chain (OpenAI → Azure Speech → visible error) + consolidate `inbound.ts` onto one transcriber | **P1** | M | 1 | `stt.ts`, `pipeline/inbound.ts:25-34` | Primary-engine outage degrades gracefully; one shared STT path; no swallowed failure (RC-9). |
| **I-7** | Client-side VAD silence auto-stop | **P2** | M | 2 | `useVoice.ts`, `pcmAudioRecorder.ts:233` | Turn ends ~800 ms after the user stops speaking; configurable; no premature cut on short pauses. |
| **I-8** | Streaming/partial transcription surfaced in the textarea | **P1** | L | 2 | `openaiStt.ts`, `functionsService.ts`, `useVoice.ts`, `Index.tsx` | Partial text appears <800 ms after speech starts; final reconciles cleanly. SDK bumped. |
| **I-9** | Long-form (>60 s) verification + chunking | **P2** | S | 3 | transcriber, `useVoice.ts:42` | A 90 s dictation transcribes fully without first-pause truncation. |
| **I-10** | Retry tuning incl. transient `NoMatch`; remove dead candidate juggling once on OpenAI | **P2** | S | 3 | `stt.ts:90-112` | Transient failures retried once; no needless retries on real user-input errors. |
| **I-11** | STT eval harness: labeled multi-lang clips in CI | **P2** | M | 3 | `services/__tests__/`, `package.json` test scripts | CI asserts ≥95% language-ID accuracy + WER threshold on the fixture set. |
| **I-12** | Just-changed language reflects immediately for STT (cache TTL vs fresh pick) | **P3** | S | 1 | `userPrefsCache.ts`, `Index.tsx:499-502` | Changing language then speaking uses the new value without waiting on the 5-min cache TTL. |

---

## 8. Success metrics & acceptance

- **Reliability:** Auto-mode transcription success ≥ **98%** for in-vocabulary languages; **0** silent
  failures (every non-success produces visible feedback). Measured via PostHog `transcription_failed` /
  `voice_input_used` ratio.
- **Coverage:** 100% of picker-offered languages transcribe in Auto mode (eval fixture, I-11).
- **Latency:** p50 time-to-final-transcript **< 1.5 s** and p95 **< 3 s** for a ~5 s clip (Phase 1);
  first partial token **< 800 ms** (Phase 2).
- **Language-ID accuracy:** ≥ **95%** correct primary-language tag on the eval set (kills RC-6 regressions).
- **No regressions:** TTS, chat SSE streaming, quota metering, and warm-mic UX unaffected
  (`npm run test:all` green, `tsc --noEmit` clean).

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Azure OpenAI transcribe deployment/cost not yet provisioned | Phase 0 ships value with **zero** infra change; Phase 1 is flag-gated and reversible to `azure_speech`. |
| `gpt-4o-transcribe` streaming needs an `openai` SDK bump | Bump isolated to Phase 2; Phase 1 works on the non-streaming `audio.transcriptions.create`. |
| New engine regresses on Indic languages vs Azure | Fallback chain (I-6) + eval gate (I-11) before flipping the default; keep Azure one toggle away. |
| VAD cuts users off mid-thought | Conservative trailing-silence threshold + manual-stop retained as override (I-7). |
| Two STT paths drift again | I-6 consolidates `inbound.ts` and `transcribeController` onto one transcriber. |

---

## 10. Test plan

- **Unit:** locale/candidate mapping (I-3), timeout behavior (I-2), engine-selection + fallback (I-5/I-6).
  Extend `transcribeController.test.ts` and `sttPhraseList.test.ts`.
- **Integration:** `POST /api/transcribe` with fixture clips per language; assert `{ text, detectedLanguage }`
  and that failures return a sanitized, classifiable error.
- **E2E (Playwright):** mic → speak (per language) → transcript appears → send → reply. Negative: backend down
  → visible toast, no dead air. (Reuse `easebot-sweep.mjs` harness.)
- **Eval (I-11):** labeled multi-language corpus, WER + language-ID accuracy thresholds, run in CI.
- **Pre-merge:** `npx tsc --noEmit` (both repos) + `npm run test:all` (backend) green; curl smoke on
  `/api/health` and `/api/transcribe`.

---

## 11. Rollout & flags

- `STT_ENGINE` env (`azure_speech` default → `azure_openai` after eval).
- Phase 0 ships behind no flag (pure bug-fix). Phase 1/2 behind `STT_ENGINE` + a client `VITE_STT_STREAMING`
  toggle.
- Any Azure OpenAI **model deployment** or env change is **surfaced to Krish to run** — this PRD performs no
  deploys, per the repo's strict no-Firebase/no-deploy rule.

---

## 12. Open questions

1. Provision an Azure OpenAI **`gpt-4o-transcribe`** deployment, or start with **`whisper`** (broader region
   availability, non-streaming)?
2. Should Auto remain the default, or default new users to a detected browser/locale language with Auto as an
   explicit opt-in?
3. Trim the picker to currently-supported languages immediately (Phase 0 safety) vs. wait for Phase 1 to make
   all ten real?
4. Latency budget vs. cost ceiling for the streaming Realtime path (future Advanced-Voice consideration)?
