// sttPhraseList — Azure Speech "Phrase List" hints per locale.
//
// Phrase Lists bias the generic Azure STT model toward domain vocabulary
// without needing a full Custom Speech training job. Free, synchronous,
// and effective for 15-25% WER reduction on domain terms.
//
// Reference: https://learn.microsoft.com/azure/ai-services/speech-service/improve-accuracy-phrase-list
//
// Limits per Azure docs (v1.38 SDK):
//   - up to 1024 phrases per grammar instance
//   - each phrase ≤ 200 chars, ideally 2-5 words
//   - single words and multi-word phrases may be mixed
//
// We seed the EN_IN list from keywordDirectory.ts (already-curated wedding
// vocab used by stylist-mode Algolia routing) + common ritual / venue terms
// the stylist directory doesn't cover. HI_IN and GU_IN are hand-curated
// transliteration + native-script variants of the high-frequency ritual terms
// that Azure generic models misrecognize most often (haldi, mandap, sangeet,
// pheras, varmala, etc.).

import { KEYWORD_DIRECTORY } from './keywordDirectory'

// ── English (India locale) ──────────────────────────────────────────────────
// Harvested from KEYWORD_DIRECTORY + additional wedding-specific terms that
// don't appear there but are common in voice messages.
function buildEnPhrases(): string[] {
  const fromDirectory = new Set<string>()
  for (const entry of KEYWORD_DIRECTORY) {
    for (const t of entry.triggers) fromDirectory.add(t.toLowerCase())
  }

  // Ritual & ceremony terms (stylist directory is outfit-centric; these fill gaps)
  const rituals = [
    'haldi', 'mehndi', 'mehandi', 'mehendi', 'sangeet',
    'baraat', 'barat', 'bidaai', 'vidai',
    'pheras', 'saat pheras', 'saptapadi',
    'varmala', 'jai mala', 'mangalsutra', 'sindoor', 'kanyadaan',
    'roka', 'sagan', 'tilak', 'ashirvad',
    'reception', 'engagement', 'nikaah', 'nikah',
    'mandap', 'kalash', 'havan', 'agni',
  ]

  // Venues / vendors / logistics
  const venues = [
    'banquet hall', 'farmhouse', 'palace', 'heritage property',
    'destination wedding', 'beach wedding', 'hotel wedding',
    'pandit', 'priest', 'maulvi', 'caterer', 'mehendi artist',
    'bridal makeup artist', 'bridal mua',
  ]

  // Attire / fabric / style — high-freq speech terms
  const attire = [
    'lehenga choli', 'silk saree', 'banarasi saree', 'kanjeevaram',
    'sherwani', 'achkan', 'bandhgala', 'dhoti kurta',
    'anarkali', 'sharara', 'gharara', 'palazzo set',
    'salwar kameez', 'kurti', 'dupatta',
  ]

  // Food / sweets — often voice-dropped otherwise
  const food = [
    'mithai', 'ladoo', 'laddu', 'barfi', 'jalebi', 'gulab jamun',
    'chaat', 'thali', 'paneer', 'biryani',
    'vegetarian menu', 'jain menu',
  ]

  // Planning / logistics phrases
  const planning = [
    'guest list', 'save the date', 'invitation card', 'wedding card',
    'wedding planner', 'wedding budget',
    'muhurat', 'shubh muhurat', 'auspicious date',
    'sangeet night', 'cocktail night', 'reception night',
  ]

  return Array.from(
    new Set([...fromDirectory, ...rituals, ...venues, ...attire, ...food, ...planning])
  ).sort()
}

// ── Hindi (India locale) — Devanagari + Roman transliteration ───────────────
// Azure HI-IN model misrecognizes Hindi wedding terms with high frequency
// because it's trained on Bollywood/news corpora. Feeding both script forms
// catches code-switched speech where the user says "haldi" in Roman inside an
// otherwise-Devanagari sentence.
const HI_IN_PHRASES: string[] = [
  // Rituals — Devanagari
  'हल्दी', 'मेहंदी', 'संगीत', 'बारात', 'विदाई',
  'फेरे', 'सात फेरे', 'सप्तपदी',
  'वरमाला', 'जयमाला', 'मंगलसूत्र', 'सिंदूर', 'कन्यादान',
  'रोका', 'सगाई', 'तिलक', 'आशीर्वाद',
  'मंडप', 'कलश', 'हवन', 'अग्नि',
  'पंडित', 'पुजारी',
  // Rituals — Roman transliteration
  'haldi', 'mehndi', 'mehendi', 'sangeet', 'baraat', 'vidai', 'bidaai',
  'pheras', 'saat pheras', 'saptapadi',
  'varmala', 'jai mala', 'mangalsutra', 'sindoor', 'kanyadaan',
  'roka', 'sagai', 'tilak', 'ashirvad',
  'mandap', 'kalash', 'havan',
  // Attire — Devanagari
  'लहंगा', 'साड़ी', 'शेरवानी', 'कुर्ता', 'दुपट्टा', 'चूड़ा',
  // Attire — Roman
  'lehenga', 'saree', 'sherwani', 'kurta', 'dupatta', 'chura', 'chooda',
  // Food — Devanagari
  'मिठाई', 'लड्डू', 'बर्फी', 'जलेबी', 'पनीर', 'बिरयानी',
  'mithai', 'laddu', 'barfi', 'jalebi',
  // Planning
  'मुहूर्त', 'शुभ मुहूर्त', 'शादी', 'विवाह',
  'muhurat', 'shaadi', 'vivah',
]

// ── Gujarati (India locale) — Gujarati script + Roman ──────────────────────
// Much of wedding vocab overlaps Hindi; the Gujarati model also benefits from
// explicit phrase hints because the training corpus is smaller.
const GU_IN_PHRASES: string[] = [
  // Rituals — Gujarati script
  'હળદી', 'મહેંદી', 'સંગીત', 'લગ્ન', 'વિદાઈ',
  'ફેરા', 'સપ્તપદી',
  'મંગળસૂત્ર', 'કન્યાદાન',
  'મંડપ',
  // Roman transliteration — Gujarati-flavored
  'haldi', 'mehndi', 'sangeet', 'lagan', 'lagan gathiya',
  'pheras', 'saptapadi',
  'mangalsutra', 'kanyadaan',
  'mandap', 'ponkhvu', 'chandlo', 'chandlo matli',
  // Gujarati-specific pre-wedding rituals
  'gol dhana', 'ganesh sthapana',
  // Attire
  'lehenga', 'chaniya choli', 'ghagra', 'kediyu', 'sherwani',
  'ચણિયા ચોલી', 'લહેંગા',
  // Food
  'mithai', 'fafda', 'jalebi', 'dhokla', 'khandvi',
]

// Lazily computed so tests / downstream code can import without side effects
// beyond the keywordDirectory read.
let EN_IN_PHRASES_CACHED: readonly string[] | null = null

function getEnPhrases(): readonly string[] {
  if (EN_IN_PHRASES_CACHED) return EN_IN_PHRASES_CACHED
  EN_IN_PHRASES_CACHED = Object.freeze(buildEnPhrases())
  return EN_IN_PHRASES_CACHED
}

/**
 * Returns the curated phrase list for an Azure BCP-47 locale.
 * Returns an empty array for locales we don't have a list for — caller
 * should just skip phrase-list attachment in that case (no-op).
 *
 * Accepts either full BCP-47 (`en-IN`, `hi-IN`, `gu-IN`) or the language
 * stem (`en`, `hi`, `gu`). English variants outside India still get the
 * en-IN list because the wedding vocabulary is identical.
 */
export function getPhrasesForLocale(locale: string | undefined): readonly string[] {
  if (!locale) return []
  const stem = locale.toLowerCase().split('-')[0]
  switch (stem) {
    case 'en': return getEnPhrases()
    case 'hi': return HI_IN_PHRASES
    case 'gu': return GU_IN_PHRASES
    default: return []
  }
}

/**
 * Deduplicated union of phrases for multiple locales. Used when Azure is
 * running auto-detect across [preferred, en-US] — we give it both lists so
 * the model sees domain hints regardless of which locale it picks.
 */
export function getPhrasesForLocales(locales: readonly string[]): readonly string[] {
  const union = new Set<string>()
  for (const loc of locales) {
    for (const p of getPhrasesForLocale(loc)) union.add(p)
  }
  return Array.from(union)
}

// Exposed for tests only.
export function __getRawCounts(): { en: number; hi: number; gu: number } {
  return {
    en: getEnPhrases().length,
    hi: HI_IN_PHRASES.length,
    gu: GU_IN_PHRASES.length,
  }
}
