// Azure AI Translator REST API v3
// Docs: https://learn.microsoft.com/azure/ai-services/translator/reference/v3-0-translate

const TRANSLATOR_BASE = 'https://api.cognitive.microsofttranslator.com'

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
    console.warn('[translation] detectLanguage failed:', res.status)
    return 'en'
  }

  const json = (await res.json()) as any
  return json?.[0]?.language ?? 'en'
}

// Translate text to target language — returns translated string
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text

  const cfg = getConfig()
  if (!cfg) return text   // graceful skip if not configured

  // Azure uses BCP-47 base codes for translation target (e.g. 'hi', 'gu', 'en')
  const target = targetLanguage.split('-')[0]
  if (target === 'en') return text

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
    console.warn('[translation] translateText failed:', res.status)
    return text
  }

  const json = (await res.json()) as any
  return json?.[0]?.translations?.[0]?.text ?? text
}
