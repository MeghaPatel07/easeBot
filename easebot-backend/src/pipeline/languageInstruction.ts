/**
 * Pipeline stage: determine the target response language and build
 * a system-prompt instruction that forces the AI to respond in it.
 *
 * Priority:
 *   1. preferredLanguage from payload (user's saved setting, e.g. 'gu')
 *   2. detectedLanguage from inbound processing (what the user typed in)
 *   3. English — no instruction needed
 */

const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  gu: 'Gujarati',
  es: 'Spanish',
  fr: 'French',
  ar: 'Arabic',
  pt: 'Portuguese',
  de: 'German',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  it: 'Italian',
}

/**
 * Returns the target response language code ('en', 'gu', 'hi', …).
 *
 * Priority:
 *   1. An explicit non-'auto' payloadLanguage (the user's session choice)
 *      wins over Azure's language detection. This includes 'en' — previously
 *      the 'en' case fell through to detection, which caused replies to flip
 *      to French / Spanish etc. when Azure mis-detected typo-heavy English
 *      messages as another language.
 *   2. If payload is 'auto' or missing, honor detectedLanguage.
 *   3. Otherwise fall back to English.
 */
export function determineTargetLanguage(
  payloadLanguage: string | undefined,
  detectedLanguage: string
): string {
  if (payloadLanguage && payloadLanguage !== 'auto') {
    return payloadLanguage
  }
  if (detectedLanguage && detectedLanguage !== 'en') {
    return detectedLanguage
  }
  return 'en'
}

/**
 * Builds the system-prompt suffix that instructs the AI to respond
 * in the target language. Returns empty string for English.
 */
export function buildLanguageInstruction(targetLanguage: string): string {
  if (targetLanguage === 'en') return ''
  const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage.toUpperCase()
  return (
    `\n\n---\n**Language Instruction:** You MUST write your entire response in ${langName}. ` +
    `Do not switch to English at any point. If you need to use technical terms, ` +
    `transliterate them naturally into ${langName} script where possible.`
  )
}
