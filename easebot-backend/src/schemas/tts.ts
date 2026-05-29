import { z } from 'zod'

// ---------------------------------------------------------------------------
// Voice allowlist
//
// Two accepted shapes for `voiceName`:
//   1. Legacy Gemini preset IDs the frontend has always sent (e.g. 'Kore').
//      These map to Azure Neural voices in azureTTS.ts (GEMINI_TO_AZURE_VOICE).
//   2. Fully-qualified Azure Neural voice IDs (e.g. 'en-US-AriaNeural') —
//      passed through verbatim by resolveAzureVoice. We must whitelist these
//      explicitly: WE-20260528-002 showed that any string ending in "Neural"
//      was accepted, letting an attacker break out of the SSML attribute and
//      inject arbitrary <voice>/<prosody> elements.
//
// Keep this list in sync with the maps in azureTTS.ts (GEMINI_TO_AZURE_VOICE,
// LANG_VOICE_MAP). Adding a new voice anywhere else requires adding it here.
// ---------------------------------------------------------------------------

const GEMINI_VOICE_IDS = ['Kore', 'Charon', 'Aoede', 'Fenrir', 'Leda', 'Puck'] as const

const AZURE_NEURAL_VOICE_IDS = [
  // English voices used by the Gemini preset map
  'en-US-AriaNeural',
  'en-US-GuyNeural',
  'en-GB-SoniaNeural',
  'en-GB-RyanNeural',
  'en-US-AvaNeural',
  'en-US-BrianNeural',
  // Locale-specific voices used when the detected language is non-English
  'hi-IN-SwaraNeural', 'hi-IN-MadhurNeural',
  'gu-IN-DhwaniNeural', 'gu-IN-NiranjanNeural',
  'es-ES-ElviraNeural', 'es-ES-AlvaroNeural',
  'fr-FR-DeniseNeural', 'fr-FR-HenriNeural',
  'ar-SA-ZariyahNeural', 'ar-SA-HamedNeural',
  'pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural',
  'de-DE-KatjaNeural', 'de-DE-ConradNeural',
  'zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural',
  'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural',
  'ko-KR-SunHiNeural', 'ko-KR-InJoonNeural',
  'ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural',
  'it-IT-ElsaNeural', 'it-IT-DiegoNeural',
] as const

export const ALLOWED_VOICE_NAMES = [...GEMINI_VOICE_IDS, ...AZURE_NEURAL_VOICE_IDS] as const

export const TTSRequestSchema = z.object({
  text: z.string().min(1, 'text is required').max(5000),
  voiceName: z.enum(ALLOWED_VOICE_NAMES as unknown as [string, ...string[]]).optional(),
  language: z.string().trim().max(10).optional(),
})

export type TTSRequest = z.infer<typeof TTSRequestSchema>
