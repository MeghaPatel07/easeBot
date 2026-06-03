// Plain-language glossary for the specialist / cultural vocabulary used in
// vibe-preset titles, subtitles and descriptors (see src/data/vibePresets.ts).
//
// Ruling (WE-20260528-1098 + WE-20260528-1057): keep the cultural vocabulary —
// it is intentional and meaningful — but surface a concise, plain-language
// definition inline wherever a specialist term renders, so cognitively-impaired,
// ESL and culturally-distant users can understand it (WCAG 3.1.3 Unusual Words).
//
// Definitions are deliberately short and written at roughly a grade-8 reading
// level. Keys are lower-cased; matching is case-insensitive and whole-word only
// (see findGlossaryTerms below), so plurals like "jaalis" match "jaali".

export interface GlossaryEntry {
  /** The canonical term, used as the visible word. */
  term: string
  /** A concise, plain-language definition (grade-8 reading level). */
  definition: string
}

// The map is keyed by the lower-cased singular form. The matcher also accepts a
// trailing "s" so "jaalis" → "jaali", "jharokhas" → "jharokha", etc.
export const VIBE_GLOSSARY: Record<string, GlossaryEntry> = {
  jaali: {
    term: 'jaali',
    definition: 'A carved stone or wood screen with a lattice of small holes, common in Mughal architecture.',
  },
  jharokha: {
    term: 'jharokha',
    definition: 'A stone balcony that juts out from an upper wall, often seen on Rajasthani palaces.',
  },
  filigree: {
    term: 'filigree',
    definition: 'Delicate, lace-like metalwork made from fine twisted threads of gold or silver.',
  },
  damask: {
    term: 'damask',
    definition: 'A rich, reversible fabric woven with a raised pattern, often floral.',
  },
  brocade: {
    term: 'brocade',
    definition: 'A heavy fabric woven with raised gold or silver patterns.',
  },
  zari: {
    term: 'zari',
    definition: 'Fine gold or silver thread used for embroidery on Indian clothing.',
  },
  chiaroscuro: {
    term: 'chiaroscuro',
    definition: 'A dramatic mix of bright light and deep shadow in a picture.',
  },
  monstera: {
    term: 'monstera',
    definition: 'A tropical plant with large, glossy leaves full of natural holes.',
  },
  heliconia: {
    term: 'heliconia',
    definition: 'A bright tropical flower with bold red, orange or yellow claw-shaped blooms.',
  },
  macrame: {
    term: 'macrame',
    definition: 'Decorative knotted rope or cord, often used for wall hangings.',
  },
  pampas: {
    term: 'pampas',
    definition: 'A tall, feathery, cream-coloured grass used in dried bouquets.',
  },
  lehenga: {
    term: 'lehenga',
    definition: 'A long, full skirt worn with a fitted top and scarf, popular at Indian weddings.',
  },
  sherwani: {
    term: 'sherwani',
    definition: 'A long, fitted coat worn by men at South-Asian weddings.',
  },
  dupatta: {
    term: 'dupatta',
    definition: 'A long scarf draped over the shoulders or head with Indian outfits.',
  },
  kundan: {
    term: 'kundan',
    definition: 'Traditional Indian jewellery that sets gemstones in highly refined gold.',
  },
  safa: {
    term: 'safa',
    definition: 'A wrapped turban worn by the groom at North-Indian weddings.',
  },
  jutti: {
    term: 'jutti',
    definition: 'A flat, closed leather shoe with a rounded toe, often embroidered.',
  },
  banarasi: {
    term: 'Banarasi',
    definition: 'A fine silk made in Varanasi (Banaras), woven with gold or silver patterns.',
  },
  kanjivaram: {
    term: 'Kanjivaram',
    definition: 'A heavy, durable South-Indian silk saree with wide woven borders.',
  },
  gajra: {
    term: 'gajra',
    definition: 'A garland of fresh flowers, usually jasmine, worn in the hair.',
  },
  mandap: {
    term: 'mandap',
    definition: 'A decorated canopy where a Hindu wedding ceremony takes place.',
  },
  mehendi: {
    term: 'mehendi',
    definition: 'A pre-wedding event where henna designs are painted on the hands and feet.',
  },
  haldi: {
    term: 'haldi',
    definition: 'A pre-wedding ritual where turmeric paste is applied for blessings and glow.',
  },
  rattan: {
    term: 'rattan',
    definition: 'A natural wicker-like material woven from palm stems, used for furniture.',
  },
}

/**
 * The set of accepted lower-cased keys, precomputed once.
 */
const GLOSSARY_KEYS = Object.keys(VIBE_GLOSSARY)

/**
 * Normalise a single word for lookup: lower-case, strip surrounding punctuation,
 * and fold a simple trailing plural "s" so "jaalis" → "jaali".
 */
function normalizeWord(raw: string): string {
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (VIBE_GLOSSARY[lower]) return lower
  if (lower.endsWith('s') && VIBE_GLOSSARY[lower.slice(0, -1)]) {
    return lower.slice(0, -1)
  }
  return lower
}

/**
 * Pure helper: given a free-text string, return the glossary entries whose term
 * appears in it (whole-word, case-insensitive, plural-tolerant), in first-seen
 * order with no duplicates. Used by GlossaryText to decide which words to wrap
 * in a definition tooltip. Kept dependency-free so it is unit-testable under
 * `node --test`.
 */
export function findGlossaryTerms(text: string): GlossaryEntry[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: GlossaryEntry[] = []
  for (const word of text.split(/\s+/)) {
    const key = normalizeWord(word)
    if (key && VIBE_GLOSSARY[key] && !seen.has(key)) {
      seen.add(key)
      out.push(VIBE_GLOSSARY[key])
    }
  }
  return out
}

/**
 * Pure helper: look up a single token (a descriptor chip or a word) and return
 * its glossary entry, or null. Plural- and punctuation-tolerant.
 */
export function lookupGlossaryTerm(token: string): GlossaryEntry | null {
  const key = normalizeWord(token)
  return (key && VIBE_GLOSSARY[key]) || null
}

export { GLOSSARY_KEYS }
