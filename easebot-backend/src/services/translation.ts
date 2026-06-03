// Azure AI Translator REST API v3
// Docs: https://learn.microsoft.com/azure/ai-services/translator/reference/v3-0-translate

import { withRetry, type RetryOptions } from '../utils/retry'
import { translatorCircuitBreaker, CircuitBreakerError } from './circuitBreaker'

const TRANSLATOR_BASE = 'https://api.cognitive.microsofttranslator.com'

// Tight retry envelope for translator calls (WE-20260528-1530).
//
// Translation sits on the chat critical path: every non-English turn runs BOTH inbound
// (user → en) and outbound (en → user) translations, so retry cost is paid twice per
// message. Translator also already sits behind translatorCircuitBreaker — sustained
// failures roll up to the breaker rather than compounding into multi-second tail
// latency at the request level.
//
// Worst-case wait per call with these settings ≈ 1.5s (vs ~8.5s under the previous
// {maxRetries: 2, baseDelayMs: 500, maxDelayMs: 4000} envelope). Azure 429 tokens
// replenish per-second, so a single ~200ms retry recovers transient blips.
const TRANSLATOR_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 1,
  baseDelayMs: 200,
  maxDelayMs: 800,
}

interface TranslatorConfig {
  key: string
  endpoint: string
  region: string
}

function getConfig(): TranslatorConfig | null {
  const key = process.env.AZURE_TRANSLATOR_KEY
  const region = process.env.AZURE_TRANSLATOR_REGION
  if (!key || !region) return null   // graceful skip if not configured
  return {
    key,
    region,
    endpoint: process.env.AZURE_TRANSLATOR_ENDPOINT ?? TRANSLATOR_BASE,
  }
}

// Detect language of a given text — returns BCP-47 base code e.g. 'en', 'hi', 'gu'
export async function detectLanguage(text: string): Promise<string> {
  const cfg = getConfig()
  if (!cfg) return 'en'   // default to English if not configured

  try {
    return await translatorCircuitBreaker.execute(() =>
      withRetry(async () => {
        const res = await fetch(`${cfg.endpoint}/detect?api-version=3.0`, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': cfg.key,
            'Ocp-Apim-Subscription-Region': cfg.region,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{ text }]),
        })

        if (!res.ok) {
          const err: any = new Error(`[translation] detectLanguage failed: ${res.status}`)
          err.status = res.status
          throw err
        }

        const json = (await res.json()) as any
        return json?.[0]?.language ?? 'en'
      }, TRANSLATOR_RETRY_OPTIONS)
    )
  } catch (err) {
    if (err instanceof CircuitBreakerError) {
      console.warn(`[translation] ${err.message} — defaulting to English`)
      return 'en'
    }
    console.warn('[translation] detectLanguage failed:', err)
    return 'en'
  }
}

// Translate text to target language — returns translated string
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text

  const cfg = getConfig()
  if (!cfg) return text   // graceful skip if not configured

  // Azure uses BCP-47 base codes for translation target (e.g. 'hi', 'gu', 'en')
  const target = targetLanguage.split('-')[0]
  if (target === 'en') return text

  try {
    return await translatorCircuitBreaker.execute(() =>
      withRetry(async () => {
        const res = await fetch(`${cfg.endpoint}/translate?api-version=3.0&to=${target}`, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': cfg.key,
            'Ocp-Apim-Subscription-Region': cfg.region,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{ text }]),
        })

        if (!res.ok) {
          const err: any = new Error(`[translation] translateText failed: ${res.status}`)
          err.status = res.status
          throw err
        }

        const json = (await res.json()) as any
        return json?.[0]?.translations?.[0]?.text ?? text
      }, TRANSLATOR_RETRY_OPTIONS)
    )
  } catch (err) {
    if (err instanceof CircuitBreakerError) {
      console.warn(`[translation] ${err.message} — returning original text`)
      return `${text}\n\n[Translation temporarily unavailable]`
    }
    console.warn('[translation] translateText failed:', err)
    return text
  }
}
