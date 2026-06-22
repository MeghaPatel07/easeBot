import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { emit } from '../lib/observability'
import { getPhrasesForLocales } from './sttPhraseList'

// Point fluent-ffmpeg to the bundled static binary
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic)

export interface STTResult {
  text: string
  detectedLanguageCode: string  // BCP-47 e.g. 'en-US', 'hi-IN', 'gu-IN'
}

// Azure DetectAudioAtStart mode supports max 4 languages; used only when the
// caller has NO language preference (auto-detect fallback).
const DEFAULT_SUPPORTED_LANGUAGES = [
  'en-US',
  'hi-IN',   // Hindi
  'gu-IN',   // Gujarati
  'es-ES',   // Spanish
]

// App-level ceiling for the Azure recognize call. The SDK's internal timeouts
// don't cover every stall (TLS/connect hangs, multi-language LID indecision),
// so without this a hung recognize would never resolve and the request hangs.
const AZURE_RECOGNIZE_TIMEOUT_MS = Number(process.env.STT_RECOGNIZE_TIMEOUT_MS) || 12_000

// Resolve the no-preference auto-detect candidate set. Azure "at-start" LID
// supports at most 4 candidates. Override the default via
// STT_AUTODETECT_LANGUAGES (comma-separated BCP-47), capped to 4. NOTE: true
// universal auto-detect (90+ languages) lands in Phase 1 when STT moves to
// Azure OpenAI gpt-4o-transcribe — see PRD-STT-auto-language-detection.md.
function resolveAutodetectLanguages(): string[] {
  const raw = process.env.STT_AUTODETECT_LANGUAGES
  if (!raw) return DEFAULT_SUPPORTED_LANGUAGES
  const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4)
  return parsed.length > 0 ? parsed : DEFAULT_SUPPORTED_LANGUAGES
}

// Map loose BCP-47 codes (e.g. 'en', 'en-US', 'hi') to Azure-preferred locales.
// Auto-detect misidentifies Indian-English speech as Gujarati/Hindi when given
// no preference, so callers who know the language should pass it for strict mode.
const LOCALE_ALIASES: Record<string, string> = {
  en: 'en-US',
  hi: 'hi-IN',
  gu: 'gu-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  ar: 'ar-SA',   // Arabic — picker offered it but mapped to en-US before (silent downgrade)
  pt: 'pt-BR',   // Portuguese — ditto
  zh: 'zh-CN',   // Chinese — ditto
  ta: 'ta-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
}

function toAzureLocale(code: string): string {
  if (!code) return 'en-US'
  const trimmed = code.trim()
  const lower = trimmed.toLowerCase()
  if (LOCALE_ALIASES[lower]) return LOCALE_ALIASES[lower]
  const m = trimmed.match(/^([a-z]{2,3})-([a-z]{2,3})$/i)
  if (m) return `${m[1].toLowerCase()}-${m[2].toUpperCase()}`
  const base = lower.split('-')[0]
  return LOCALE_ALIASES[base] ?? 'en-US'
}

function getConfig() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not configured')
  return { key, region }
}

type FfmpegCommand = ReturnType<typeof ffmpeg>

// Convert any audio format (WebM, OGG, etc.) to WAV PCM 16-bit 16kHz mono.
// Returns both the promise and the command handle so callers can kill the
// child process on timeout (otherwise ffmpeg keeps running after we bail).
function convertToWav(
  inputPath: string,
  outputPath: string,
): { promise: Promise<void>; command: FfmpegCommand } {
  let command!: FfmpegCommand
  const promise = new Promise<void>((resolve, reject) => {
    command = ffmpeg(inputPath)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`Audio conversion failed: ${err.message}`)))
    command.save(outputPath)
  })
  return { promise, command }
}

function timeoutPromise(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
}

// Errors that should NOT trigger a retry: user/input problems (bad audio,
// nothing recognized) and hard timeouts (retrying a stalled connection only
// burns the latency budget). Checks an explicit `code` first, then message.
function isNonRetryableError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code === 'no_speech' || code === 'timeout') return true
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /Audio conversion failed|NoMatch|could not be recognized|bad audio|invalid audio/i.test(msg)
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  counter?: { retries: number },
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (isNonRetryableError(err) || attempt === retries) throw err
      if (counter) counter.retries += 1
      console.warn('[stt] transient error, retrying once:', err instanceof Error ? err.message : err)
    }
  }
  throw lastErr
}

export async function transcribeAudio(
  audioBase64: string,
  // BCP-47 code (e.g. 'en-US', 'hi-IN', or loose 'en'). When provided, Azure
  // auto-detect is NARROWED to [preferredLanguage, en-US] so the model still
  // listens to the audio (priority: what the user is actually speaking) but
  // the candidate set is constrained by the user's saved preference — which
  // prevents the "English speech transcribed in Gujarati script" misfire.
  // When preferredLanguage == 'en' (or omitted mapping to English) we go
  // strict English. Pass undefined for the legacy 4-language auto-detect.
  preferredLanguage?: string,
): Promise<STTResult> {
  const { key, region } = getConfig()
  const totalStart = Date.now()
  let ffmpegMs = 0
  let azureMs = 0
  let phraseListApplied = 0
  const retryCounter = { retries: 0 }

  const buffer = Buffer.from(audioBase64, 'base64')
  const ts = Date.now()
  const wavPath = path.join(os.tmpdir(), `viva-audio-${ts}.wav`)

  // Fast-path: if the client already sent a RIFF/WAV payload, skip ffmpeg entirely.
  const isWav = buffer.length >= 4 && buffer.slice(0, 4).toString() === 'RIFF'
  let inputPath: string | null = null

  if (isWav) {
    fs.writeFileSync(wavPath, buffer)
  } else {
    inputPath = path.join(os.tmpdir(), `viva-input-${ts}.webm`)
    fs.writeFileSync(inputPath, buffer)
    console.time('stt.ffmpeg')
    const ffmpegStart = Date.now()
    const { promise: convPromise, command: ffmpegCmd } = convertToWav(inputPath, wavPath)
    try {
      await Promise.race([
        convPromise,
        timeoutPromise(15_000, 'ffmpeg conversion'),
      ])
    } catch (err) {
      // On timeout (or any failure) kill the child process so it doesn't
      // keep running after we've abandoned the request.
      try { ffmpegCmd.kill('SIGKILL') } catch { /* already exited */ }
      ffmpegMs = Date.now() - ffmpegStart
      console.timeEnd('stt.ffmpeg')
      emit('stt.error', {
        stage: 'ffmpeg',
        ffmpeg_ms: ffmpegMs,
        error: err instanceof Error ? err.message : String(err),
        payload_bytes: buffer.length,
      })
      throw err
    }
    ffmpegMs = Date.now() - ffmpegStart
    console.timeEnd('stt.ffmpeg')
  }

  // Resolve candidate set:
  //   - preferred 'en' or English variant → strict English (single)
  //   - preferred any other lang (e.g. 'hi', 'gu') → [preferred, en-US] (Azure
  //     auto-detects which of the two the user is actually speaking)
  //   - preferred undefined → legacy 4-lang default set
  let candidateLocales: string[]
  if (preferredLanguage) {
    const preferredLocale = toAzureLocale(preferredLanguage)
    candidateLocales = preferredLocale === 'en-US'
      ? ['en-US']
      : [preferredLocale, 'en-US']
  } else {
    candidateLocales = resolveAutodetectLanguages()
  }

  const azureCall = (): Promise<STTResult> =>
    new Promise((resolve, reject) => {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(wavPath))

      let recognizer: sdk.SpeechRecognizer
      if (candidateLocales.length === 1) {
        // Single candidate → strict mode (Azure rejects auto-detect with 1 lang).
        speechConfig.speechRecognitionLanguage = candidateLocales[0]
        recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
      } else {
        const autoDetect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(candidateLocales)
        recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetect, audioConfig)
      }

      // Single-settle guard + hard timeout. Whichever of {success, NoMatch,
      // cancel, error, timeout} fires first wins; the rest are ignored and the
      // recognizer is closed exactly once. Without the timeout a stalled
      // recognize (common in multi-language auto-detect) would hang forever.
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        if (timer) { clearTimeout(timer); timer = null }
        try { recognizer.close() } catch { /* already closed */ }
        fn()
      }
      timer = setTimeout(() => {
        finish(() => {
          const e = new Error(`STT recognize timed out after ${AZURE_RECOGNIZE_TIMEOUT_MS}ms`) as Error & { code?: string }
          e.code = 'timeout'
          reject(e)
        })
      }, AZURE_RECOGNIZE_TIMEOUT_MS)

      // Attach domain Phrase List (wedding vocabulary). Free, synchronous.
      // Azure caps at 1024 phrases/grammar; we stay well under.
      const phrases = getPhrasesForLocales(candidateLocales)
      if (phrases.length > 0) {
        try {
          const grammar = sdk.PhraseListGrammar.fromRecognizer(recognizer)
          for (const p of phrases) grammar.addPhrase(p)
          phraseListApplied = phrases.length
        } catch (grammarErr) {
          // Non-fatal: recognition still proceeds without hints.
          emit('stt.error', {
            stage: 'phrase_list_attach',
            error: grammarErr instanceof Error ? grammarErr.message : String(grammarErr),
            candidate_count: candidateLocales.length,
          })
        }
      }

      recognizer.recognizeOnceAsync(
        (result) => {
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            const detectedLanguageCode = candidateLocales.length === 1
              ? candidateLocales[0]
              : sdk.AutoDetectSourceLanguageResult.fromResult(result).language ?? 'en-US'
            finish(() => resolve({ text: result.text, detectedLanguageCode }))
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            // Audio captured but nothing intelligible — a soft, retryable state,
            // NOT a service error. Tagged so the controller returns a gentle
            // "didn't catch that" instead of a hard 500 (and skips billing).
            finish(() => {
              const e = new Error('Speech could not be recognized') as Error & { code?: string }
              e.code = 'no_speech'
              reject(e)
            })
          } else {
            const details = sdk.CancellationDetails.fromResult(result)
            finish(() => reject(new Error(`STT cancelled: ${details.errorDetails}`)))
          }
        },
        (err) => {
          finish(() => reject(new Error(`STT error: ${err}`)))
        },
      )
    })

  try {
    console.time('stt.azure')
    const azureStart = Date.now()
    let result: STTResult
    try {
      result = await withRetry(azureCall, 1, retryCounter)
    } finally {
      azureMs = Date.now() - azureStart
      console.timeEnd('stt.azure')
    }
    emit('stt.timing', {
      ffmpeg_ms: ffmpegMs,
      azure_ms: azureMs,
      total_ms: Date.now() - totalStart,
      is_wav_fast_path: isWav,
      payload_bytes: buffer.length,
      candidate_count: candidateLocales.length,
      candidates: candidateLocales,
      preferred_locale: preferredLanguage ?? null,
      detected_locale: result.detectedLanguageCode,
      text_length: result.text?.length ?? 0,
      retries_used: retryCounter.retries,
      phrase_list_size: phraseListApplied,
    })
    return result
  } catch (err) {
    emit('stt.error', {
      stage: 'azure',
      ffmpeg_ms: ffmpegMs,
      azure_ms: azureMs,
      total_ms: Date.now() - totalStart,
      is_wav_fast_path: isWav,
      payload_bytes: buffer.length,
      candidate_count: candidateLocales.length,
      preferred_locale: preferredLanguage ?? null,
      retries_used: retryCounter.retries,
      phrase_list_size: phraseListApplied,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  } finally {
    // Fire-and-forget cleanup; don't block the caller on unlinks.
    const toUnlink: string[] = [wavPath]
    if (inputPath) toUnlink.push(inputPath)
    void Promise.allSettled(toUnlink.map((p) => fs.promises.unlink(p)))
  }
}
