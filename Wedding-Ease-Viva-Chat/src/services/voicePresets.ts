export type VoiceGender = 'female' | 'male'

export interface VoicePreset {
  id: string
  name: string
  gender: VoiceGender
  description: string   // personality/vibe shown in the UI
  sampleText: string    // unique sample so each preview sounds distinct in character
  rate: number
  pitch: number
  volume: number
  // Ordered list of SpeechSynthesis voice names to try (most preferred first)
  voiceCandidates: string[]
  // Fallback locale if no candidate found
  fallbackLocale: string
  geminiVoiceName: string  // Gemini TTS voice name
}

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'aria',
    name: 'Aria',
    gender: 'female',
    description: 'Warm & nurturing',
    sampleText: "I'm so excited to help you plan your perfect day — let's make it magical together!",
    rate: 0.88,
    pitch: 1.18,
    volume: 0.80,
    voiceCandidates: [
      'Microsoft Aria Online (Natural) - English (United States)',
      'Microsoft Jenny Online (Natural) - English (United States)',
      'Google US English',
      'Samantha',
      'Karen',
    ],
    fallbackLocale: 'en-US',
    geminiVoiceName: 'Kore',
  },
  {
    id: 'echo',
    name: 'Echo',
    gender: 'male',
    description: 'Deep & confident',
    sampleText: "Let's get this planned properly. I'll walk you through every detail, step by step.",
    rate: 0.84,
    pitch: 0.85,
    volume: 0.82,
    voiceCandidates: [
      'Microsoft Guy Online (Natural) - English (United States)',
      'Microsoft Christopher Online (Natural) - English (United States)',
      'Google UK English Male',
      'Daniel',
      'Tom',
    ],
    fallbackLocale: 'en-US',
    geminiVoiceName: 'Charon',
  },
  {
    id: 'nova',
    name: 'Nova',
    gender: 'female',
    description: 'Bright & energetic',
    sampleText: "Oh, I love this! Your wedding is going to be absolutely stunning — let's dive in!",
    rate: 1.00,
    pitch: 1.28,
    volume: 0.82,
    voiceCandidates: [
      'Microsoft Sonia Online (Natural) - English (United Kingdom)',
      'Microsoft Natasha Online (Natural) - English (Australia)',
      'Google UK English Female',
      'Tessa',
      'Moira',
    ],
    fallbackLocale: 'en-GB',
    geminiVoiceName: 'Aoede',
  },
  {
    id: 'vale',
    name: 'Vale',
    gender: 'male',
    description: 'Calm & thoughtful',
    sampleText: "Take a breath — we have plenty of time. I'll help you think through each decision carefully.",
    rate: 0.78,
    pitch: 0.92,
    volume: 0.76,
    voiceCandidates: [
      'Microsoft Ryan Online (Natural) - English (United Kingdom)',
      'Microsoft Liam Online (Natural) - English (Australia)',
      'Google UK English Male',
      'Daniel',
      'Fred',
    ],
    fallbackLocale: 'en-GB',
    geminiVoiceName: 'Fenrir',
  },
  {
    id: 'luna',
    name: 'Luna',
    gender: 'female',
    description: 'Soft & dreamy',
    sampleText: "Close your eyes and picture it — the flowers, the lights, the dress. Let's bring that vision to life.",
    rate: 0.76,
    pitch: 1.22,
    volume: 0.68,
    voiceCandidates: [
      'Microsoft Ava Online (Natural) - English (United States)',
      'Microsoft Michelle Online (Natural) - English (United States)',
      'Samantha',
      'Victoria',
      'Fiona',
    ],
    fallbackLocale: 'en-US',
    geminiVoiceName: 'Leda',
  },
  {
    id: 'sol',
    name: 'Sol',
    gender: 'male',
    description: 'Friendly & clear',
    sampleText: "Great question! Here's what I'd suggest — and I think you're really going to like this idea.",
    rate: 0.92,
    pitch: 1.02,
    volume: 0.80,
    voiceCandidates: [
      'Microsoft Brian Online (Natural) - English (United States)',
      'Microsoft Eric Online (Natural) - English (United States)',
      'Microsoft Roger Online (Natural) - English (United States)',
      'Alex',
      'Tom',
    ],
    fallbackLocale: 'en-US',
    geminiVoiceName: 'Puck',
  },
]

export function getVoicePreset(id: string): VoicePreset | undefined {
  return VOICE_PRESETS.find(p => p.id === id)
}

/**
 * Finds the best available SpeechSynthesis voice for a given preset.
 * Tries each candidate name in order, then falls back to gender-based search,
 * then to any available voice.
 */
export function resolveVoiceForPreset(preset: VoicePreset): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  // 1. Try each named candidate in priority order
  for (const name of preset.voiceCandidates) {
    const match = voices.find(v => v.name === name)
    if (match) return match
  }

  // 2. Partial name match on candidates
  for (const name of preset.voiceCandidates) {
    const keyword = name.split(' ')[1]?.toLowerCase() // e.g. "Aria" from "Microsoft Aria..."
    if (!keyword) continue
    const match = voices.find(v => v.name.toLowerCase().includes(keyword))
    if (match) return match
  }

  // 3. Gender-based fallback
  if (preset.gender === 'female') {
    const female =
      voices.find(v => v.lang.startsWith('en') && /female|woman/i.test(v.name)) ||
      voices.find(v => v.lang.startsWith('en') && /aria|jenny|sonia|samantha|karen|moira|tessa|ava|victoria/i.test(v.name))
    if (female) return female
  } else {
    const male =
      voices.find(v => v.lang.startsWith('en') && /male|man/i.test(v.name)) ||
      voices.find(v => v.lang.startsWith('en') && /guy|daniel|tom|alex|fred|eric|brian|roger/i.test(v.name))
    if (male) return male
  }

  // 4. Any English voice
  return voices.find(v => v.lang.startsWith('en')) ?? null
}

/** Maps preferredLanguage codes → BCP-47 locale */
export const LANG_TO_LOCALE: Record<string, string> = {
  en: 'en-US', hi: 'hi-IN', gu: 'gu-IN', es: 'es-ES', fr: 'fr-FR',
  ar: 'ar-SA', pt: 'pt-BR', de: 'de-DE', zh: 'zh-CN', ja: 'ja-JP',
  ko: 'ko-KR', ru: 'ru-RU', it: 'it-IT',
}

/**
 * Finds the best voice for a given BCP-47 locale (e.g. 'gu-IN').
 * Falls back to any voice matching the language prefix.
 */
export function resolveVoiceForLocale(locale: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const langPrefix = locale.split('-')[0]
  return (
    voices.find(v => v.lang === locale) ||
    voices.find(v => v.lang.startsWith(langPrefix)) ||
    null
  )
}
