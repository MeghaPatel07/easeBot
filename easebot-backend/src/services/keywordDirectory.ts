/**
 * Keyword directory for stylist-mode product fetching.
 *
 * Each entry maps a set of user-typed keywords/phrases (including alternate
 * spellings and Hinglish variants) to a canonical Algolia search query.
 *
 * Resolution order:
 *  1. Phrase match  – multi-word phrases checked first (most specific)
 *  2. Keyword match – single-word tokens checked next
 *  3. Fallback      – pass the raw user message directly to Algolia
 */

export interface KeywordEntry {
  /** Terms the user might type (lowercase). Phrases before single words. */
  triggers: string[]
  /** Canonical query sent to Algolia */
  algoliaQuery: string
  /** Broad category label (informational / for logging) */
  category: string
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTORY
// ─────────────────────────────────────────────────────────────────────────────

export const KEYWORD_DIRECTORY: KeywordEntry[] = [

  // ── MEHNDI / HALDI ──────────────────────────────────────────────────────
  {
    triggers: ['mehndi outfit', 'mehandi outfit', 'mehendi outfit',
               'mehndi dress', 'mehandi dress', 'mehendi dress',
               'mehndi look', 'mehandi look', 'mehendi look',
               'mehndi lehenga', 'mehandi lehenga', 'mehendi lehenga'],
    algoliaQuery: 'mehndi lehenga outfit',
    category: 'occasion-mehndi',
  },
  {
    triggers: ['mehndi', 'mehandi', 'mehendi', 'mehandi ceremony', 'mehndi ceremony'],
    algoliaQuery: 'mehndi outfit',
    category: 'occasion-mehndi',
  },
  {
    triggers: ['haldi outfit', 'haldi dress', 'haldi look', 'haldi lehenga', 'haldi ceremony'],
    algoliaQuery: 'haldi yellow outfit',
    category: 'occasion-haldi',
  },

  // ── SANGEET ──────────────────────────────────────────────────────────────
  {
    triggers: ['sangeet outfit', 'sangeet dress', 'sangeet lehenga',
               'sangeet look', 'sangeet night', 'sangeet ceremony'],
    algoliaQuery: 'sangeet lehenga outfit',
    category: 'occasion-sangeet',
  },
  {
    triggers: ['sangeet'],
    algoliaQuery: 'sangeet outfit',
    category: 'occasion-sangeet',
  },

  // ── BRIDAL LEHENGA ───────────────────────────────────────────────────────
  {
    triggers: ['bridal lehenga', 'wedding lehenga', 'bridal outfit',
               'bridal look', 'bridal dress', 'bridal wear'],
    algoliaQuery: 'bridal lehenga',
    category: 'bridal',
  },
  {
    triggers: ['lehenga choli', 'lehenga'],
    algoliaQuery: 'lehenga',
    category: 'lehenga',
  },
  {
    triggers: ['red lengha', 'red lehenga', 'red bridal lehenga'],
    algoliaQuery: 'red lehenga women bridal',
    category: 'bridal',
  },
  {
    triggers: ['lengha', 'lenga'], // Common misspellings
    algoliaQuery: 'lehenga women',
    category: 'lehenga',
  },
  {
    triggers: ['women lengha', 'women lehenga', 'bridal lengha'],
    algoliaQuery: 'women lehenga bridal',
    category: 'bridal',
  },

  // ── SAREE / SARI ─────────────────────────────────────────────────────────
  {
    triggers: ['bridal saree', 'wedding saree', 'reception saree', 'silk saree',
               'banarasi saree', 'kanjeevaram saree', 'kanjivaram saree'],
    algoliaQuery: 'bridal saree',
    category: 'saree',
  },
  {
    triggers: ['saree', 'sari'],
    algoliaQuery: 'saree',
    category: 'saree',
  },

  // ── RECEPTION ────────────────────────────────────────────────────────────
  {
    triggers: ['reception outfit', 'reception dress', 'reception gown',
               'reception lehenga', 'reception look'],
    algoliaQuery: 'reception outfit gown',
    category: 'occasion-reception',
  },
  {
    triggers: ['reception'],
    algoliaQuery: 'reception outfit',
    category: 'occasion-reception',
  },

  // ── GOWN / WESTERN ───────────────────────────────────────────────────────
  {
    triggers: ['bridal gown', 'wedding gown', 'white gown', 'christian wedding gown'],
    algoliaQuery: 'bridal gown',
    category: 'gown',
  },
  {
    triggers: ['gown', 'evening gown', 'ball gown'],
    algoliaQuery: 'gown',
    category: 'gown',
  },
  {
    triggers: ['western dress', 'western outfit', 'indo western'],
    algoliaQuery: 'indo western dress',
    category: 'western',
  },

  // ── SHARARA / ANARKALI ───────────────────────────────────────────────────
  {
    triggers: ['sharara set', 'sharara suit', 'sharara'],
    algoliaQuery: 'sharara',
    category: 'sharara',
  },
  {
    triggers: ['anarkali suit', 'anarkali gown', 'anarkali'],
    algoliaQuery: 'anarkali',
    category: 'anarkali',
  },

  // ── SHERWANI / GROOM ─────────────────────────────────────────────────────
  {
    triggers: ['groom sherwani', 'wedding sherwani', 'sherwani for groom',
               'men sherwani', 'groom outfit', 'groom wear'],
    algoliaQuery: 'men sherwani groom',
    category: 'groom',
  },
  {
    triggers: ['sherwani'],
    algoliaQuery: 'men sherwani',
    category: 'sherwani',
  },
  {
    triggers: ['kurta pajama', 'kurta set', 'men kurta', 'groom kurta'],
    algoliaQuery: 'kurta pajama',
    category: 'kurta',
  },
  {
    triggers: ['kurta'],
    algoliaQuery: 'kurta',
    category: 'kurta',
  },
  {
    triggers: ['suit', 'tuxedo', 'tux', 'blazer'],
    algoliaQuery: 'men wedding suit',
    category: 'groom-suit',
  },

  // ── DUPATTA / ACCESSORIES ────────────────────────────────────────────────
  {
    triggers: ['bridal dupatta', 'wedding dupatta'],
    algoliaQuery: 'bridal dupatta',
    category: 'dupatta',
  },
  {
    triggers: ['dupatta'],
    algoliaQuery: 'dupatta',
    category: 'dupatta',
  },
  {
    triggers: ['blouse design', 'bridal blouse'],
    algoliaQuery: 'bridal blouse',
    category: 'blouse',
  },

  // ── BRIDESMAID / BRIDAL PARTY ────────────────────────────────────────────
  {
    triggers: ['bridesmaid dress', 'bridesmaid outfit', 'bridesmaid lehenga',
               'bridesmaid saree', 'bridesmaid look', 'bridesmaids'],
    algoliaQuery: 'bridesmaid outfit',
    category: 'bridesmaid',
  },
  {
    triggers: ['groomsmen outfit', 'groomsmen attire', 'groomsmen kurta', 'groomsmen'],
    algoliaQuery: 'groomsmen kurta sherwani',
    category: 'groomsmen',
  },

  // ── JEWELRY ──────────────────────────────────────────────────────────────
  {
    triggers: ['bridal jewelry', 'bridal jewellery', 'wedding jewelry', 'wedding jewellery',
               'bridal necklace set', 'bridal jewellery set'],
    algoliaQuery: 'bridal jewelry set',
    category: 'jewelry',
  },
  {
    triggers: ['engagement ring', 'diamond ring', 'solitaire ring'],
    algoliaQuery: 'engagement ring',
    category: 'rings',
  },
  {
    triggers: ['ring', 'rings', 'band'],
    algoliaQuery: 'wedding ring',
    category: 'rings',
  },
  {
    triggers: ['mangalsutra'],
    algoliaQuery: 'mangalsutra',
    category: 'mangalsutra',
  },
  {
    triggers: ['maang tikka', 'mang tikka'],
    algoliaQuery: 'maang tikka',
    category: 'maang-tikka',
  },
  {
    triggers: ['choker necklace', 'choker'],
    algoliaQuery: 'choker necklace',
    category: 'necklace',
  },
  {
    triggers: ['necklace', 'necklaces'],
    algoliaQuery: 'necklace',
    category: 'necklace',
  },
  {
    triggers: ['earring', 'earrings', 'jhumka', 'jhumki'],
    algoliaQuery: 'earrings jhumka',
    category: 'earrings',
  },
  {
    triggers: ['bangles', 'bangle', 'chura', 'chooda'],
    algoliaQuery: 'bangles',
    category: 'bangles',
  },
  {
    triggers: ['jewelry', 'jewellery'],
    algoliaQuery: 'bridal jewelry',
    category: 'jewelry',
  },

  // ── DECOR / FLORALS ──────────────────────────────────────────────────────
  {
    triggers: ['mandap decoration', 'mandap decor', 'wedding mandap'],
    algoliaQuery: 'mandap decoration floral',
    category: 'mandap',
  },
  {
    triggers: ['mandap'],
    algoliaQuery: 'mandap',
    category: 'mandap',
  },
  {
    triggers: ['bridal bouquet', 'wedding bouquet'],
    algoliaQuery: 'bridal bouquet',
    category: 'bouquet',
  },
  {
    triggers: ['bouquet', 'flower bouquet'],
    algoliaQuery: 'bouquet',
    category: 'bouquet',
  },
  {
    triggers: ['centerpiece', 'table centerpiece', 'floral centerpiece'],
    algoliaQuery: 'floral centerpiece',
    category: 'centerpiece',
  },
  {
    triggers: ['floral decor', 'floral decoration', 'flower decoration', 'flower decor'],
    algoliaQuery: 'floral wedding decoration',
    category: 'florals',
  },
  {
    triggers: ['marigold decoration', 'marigold garland', 'marigold'],
    algoliaQuery: 'marigold garland decoration',
    category: 'marigold',
  },
  {
    triggers: ['garland', 'varmala', 'jai mala'],
    algoliaQuery: 'varmala garland',
    category: 'garland',
  },
  {
    triggers: ['decor', 'decoration', 'decorations'],
    algoliaQuery: 'wedding decoration',
    category: 'decor',
  },

  // ── VENUE ────────────────────────────────────────────────────────────────
  {
    triggers: ['outdoor venue', 'garden venue', 'farmhouse venue', 'destination wedding'],
    algoliaQuery: 'outdoor garden wedding venue',
    category: 'venue-outdoor',
  },
  {
    triggers: ['palace venue', 'heritage venue', 'royal venue'],
    algoliaQuery: 'palace heritage wedding venue',
    category: 'venue-heritage',
  },
  {
    triggers: ['banquet hall', 'banquet', 'convention hall'],
    algoliaQuery: 'banquet hall wedding',
    category: 'venue-banquet',
  },
  {
    triggers: ['venue', 'hall', 'location', 'place'],
    algoliaQuery: 'wedding venue',
    category: 'venue',
  },

  // ── CAKE / SWEETS ────────────────────────────────────────────────────────
  {
    triggers: ['wedding cake', 'bridal cake', 'multi tier cake'],
    algoliaQuery: 'wedding cake',
    category: 'cake',
  },
  {
    triggers: ['cake'],
    algoliaQuery: 'cake',
    category: 'cake',
  },
  {
    triggers: ['mithai', 'ladoo', 'barfi', 'sweets'],
    algoliaQuery: 'wedding sweets mithai',
    category: 'sweets',
  },

  // ── PHOTOGRAPHY ──────────────────────────────────────────────────────────
  {
    triggers: ['wedding photographer', 'bridal photography', 'candid photographer'],
    algoliaQuery: 'wedding photographer',
    category: 'photography',
  },
  {
    triggers: ['videographer', 'wedding video', 'cinematographer', 'wedding film'],
    algoliaQuery: 'wedding videographer',
    category: 'videography',
  },
  {
    triggers: ['photo', 'photograph', 'photography'],
    algoliaQuery: 'wedding photography',
    category: 'photography',
  },

  // ── COLOR / THEME ────────────────────────────────────────────────────────
  {
    triggers: ['red bridal', 'red wedding dress'],
    algoliaQuery: 'red bridal lehenga',
    category: 'color-red',
  },
  {
    triggers: ['pink lehenga', 'pink outfit', 'blush pink'],
    algoliaQuery: 'pink lehenga outfit',
    category: 'color-pink',
  },
  {
    triggers: ['golden outfit', 'golden lehenga', 'gold outfit'],
    algoliaQuery: 'gold golden lehenga outfit',
    category: 'color-gold',
  },
  {
    triggers: ['green lehenga', 'green outfit', 'sage green', 'emerald'],
    algoliaQuery: 'green lehenga outfit',
    category: 'color-green',
  },
  {
    triggers: ['pastel outfit', 'pastel lehenga', 'pastel look'],
    algoliaQuery: 'pastel outfit lehenga',
    category: 'color-pastel',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a user message, returns the best Algolia search query.
 *
 * Checks phrase triggers before single-word triggers to prefer specificity.
 * If no match is found, returns the original message (raw Algolia fallback).
 */
export function resolveAlgoliaQuery(userMessage: string): string {
  const lower = userMessage.toLowerCase()

  // Sort entries so that longer triggers are checked first (phrase > keyword)
  const sorted = [...KEYWORD_DIRECTORY].sort(
    (a, b) => Math.max(...b.triggers.map(t => t.length)) - Math.max(...a.triggers.map(t => t.length))
  )

  for (const entry of sorted) {
    if (entry.triggers.some(trigger => lower.includes(trigger))) {
      return entry.algoliaQuery
    }
  }

  // No match — pass the raw message; Algolia's typo tolerance handles it
  return userMessage
}

/**
 * Returns all matching entries for a message (useful for multi-category responses).
 */
export function resolveAllMatches(userMessage: string): KeywordEntry[] {
  const lower = userMessage.toLowerCase()
  return KEYWORD_DIRECTORY.filter(entry =>
    entry.triggers.some(trigger => lower.includes(trigger))
  )
}
