import { getRelevantProductsViaHybridSearch } from './hybridSearchProducts'
import { stashRemaining, popNextBatch, hasStash } from './productStash'
import type { ProductResult } from './products'
import type { Mode } from '../types'

// Explicit shopping verbs. Broadened to cover plural forms ("products ideas",
// "products suggestions") and "give me / show me options" patterns which users
// use to ask for concrete recommendations.
//
// NOTE: bare "ideas" and "choices" are deliberately EXCLUDED from the generic
// "(give|show) me …" branch — they over-match planning questions like "give
// me some ideas how to keep my guests entertained", which should route to
// text advice, not the product recommender. If the user actually wants
// product ideas, branch 3 ("products ideas/suggestions/recommendations") or
// the noun-based turn-2 gate handles it.
const PRODUCT_INTENT_VERB_RE = /\b(show me products?|recommend\s+(?:a |some )?products?|products?\s+(?:ideas?|suggestions?|recommendations?|options?)|(?:give|show)\s+me\s+(?:a\s+|some\s+|a\s+few\s+)?(?:product|options?|picks?)|shop(?:ping)?|buy|purchase|where (?:can i|to) (?:buy|get|find)|suggest\s+(?:a |some )?(?:bags?|clutch|purse|lehenga|dress|gown|saree|ring|jewelry|necklace|earring|outfit|sherwani|kurta))\b/i

// Concrete product nouns. Canonical spellings plus a few high-frequency typos
// ("earing", "sarre", "lehnga", "shervani") so a single missing/extra letter
// doesn't kill the recommender. Keep this list tight — every entry is a word
// whose presence should trigger a product fetch (on turn >= 2).
const PRODUCT_NOUN_RE = /\b(lehenga|lehngas?|lengha|lehanga|saree|sarees|sari|saris|sarre|saari|sareh|sharara|shararas?|anarkali|gharara|ghagra|sherwani|shervani|sherwanis?|kurta|kurti|kurtas|kurtis|achkan|nehru jacket|indo[- ]?western|gown|dress|outfit|attire|bridesmaid|groomsmen|blouse|dupatta|stole|veil|mangalsutra|mangalsootra|necklace|earring|earrings|earing|earings|jhumka|jhumkas|maang ?tikka|tikka|bangle|bangles|bracelet|chooda|kaleere|nath|ring|mandap|bouquet|centerpiece|garland|marigold|clutch|purse|potli|heels|footwear|juttis?|mojaris?)\b/i

// Soft product-shopping signals. Alone these are ambiguous ("I have ideas
// about color"), but combined with stylist/auto mode on turn >= 2 they're a
// reliable "user wants to see products" cue.
const SOFT_PRODUCT_SIGNAL_RE = /\b(options?|ideas?|suggestions?|recommendations?|picks?|choices?|shortlist|styles?)\b/i

// AI offered help with shopping in the previous turn. When the user then
// says "yes/sure/ok" alone, treat that as an accept-and-show-products.
const AI_PRODUCT_OFFER_RE = /\b(help\s+(?:you\s+)?(?:sourc\w*|find\w*|shortlist\w*|pick\w*)|source\s+(?:particular\s+)?items?|shortlist\s+(?:online\s+)?stores?|narrow\s+(?:them\s+)?down|help\s+with\s+sourcing|find\s+specific\s+(?:stores?|vendors?)|would\s+you\s+like\s+(?:me\s+)?(?:to\s+)?(?:help|suggest|match|find|shortlist|show|visualize|recommend))/i

const AFFIRMATIVE_ONLY_RE = /^(\s*(?:yes|yeah|yup|sure|ok|okay|please|pls|definitely|absolutely|go\s+ahead|sounds\s+good|do\s+it)\b[.,!?]*\s*)+$/i

const INSPIRATION_ONLY_RE = /\b(inspire me|mood ?board|palette|aesthetic|vibe|theme ideas?|color ideas?|colour ideas?|general ideas?)\b/i

const SHOW_MORE_RE = /^(?:yes|yeah|yup|sure|ok|okay|please|pls)?\s*(?:show\s+(?:me\s+)?)?(?:more|others?|other options?|next|more options?|see more)\b/i

export const PRODUCTS_PER_TURN = 3

export interface RecommendInput {
  userMessage: string
  mode: Mode
  requestedMode: Mode | undefined
  turnNumber: number
  threadId: string | undefined
  /** Last assistant message in the thread — used to detect product offers
   *  that the user is saying yes to ("Would you like me to help find…" →
   *  "yes" should fetch products). */
  previousAssistantText?: string
  /** The most recent user message prior to the current one — used to inherit
   *  product-noun context on affirmative-only turns. */
  previousUserText?: string
}

export interface RecommendResult {
  products: ProductResult[]
  hasMore: boolean
  algoliaQueried: boolean
  source: 'stash' | 'fresh'
}

function isShowMoreRequest(msg: string): boolean {
  return SHOW_MORE_RE.test(msg.trim())
}

function hasExplicitIntent(msg: string): boolean {
  return PRODUCT_INTENT_VERB_RE.test(msg)
}

function mentionsProductNoun(msg: string): boolean {
  return PRODUCT_NOUN_RE.test(msg)
}

function isInspirationOnly(msg: string): boolean {
  return INSPIRATION_ONLY_RE.test(msg)
}

function isAffirmativeOnly(msg: string): boolean {
  return AFFIRMATIVE_ONLY_RE.test(msg)
}

function aiOfferedProductHelp(msg: string | undefined): boolean {
  if (!msg) return false
  return AI_PRODUCT_OFFER_RE.test(msg)
}

function hasSoftProductSignal(msg: string): boolean {
  return SOFT_PRODUCT_SIGNAL_RE.test(msg)
}

// Decide whether this turn should show products, and return them if so.
// Returns null when the gate is closed.
export async function maybeRecommendProducts(
  input: RecommendInput
): Promise<RecommendResult | null> {
  const { userMessage, mode, requestedMode, turnNumber, threadId, previousAssistantText, previousUserText } = input

  // User explicitly opted into a non-product mode → respect that.
  if (requestedMode === 'planner' || requestedMode === 'knowledge') return null

  // Inspirational prompts — never show products.
  if (isInspirationOnly(userMessage)) return null

  // Show-more follow-up: pop next batch from stash, skip Algolia.
  if (threadId && hasStash(threadId) && isShowMoreRequest(userMessage)) {
    const batch = popNextBatch(threadId, PRODUCTS_PER_TURN)
    if (batch.length > 0) {
      return {
        products: batch,
        hasMore: hasStash(threadId),
        algoliaQueried: false,
        source: 'stash',
      }
    }
  }

  const stylistContext = mode === 'stylist' || requestedMode === undefined || requestedMode === 'stylist'
  const explicit = hasExplicitIntent(userMessage)
  const hasNoun = mentionsProductNoun(userMessage)
  const softSignal = hasSoftProductSignal(userMessage)
  const affirmativeOnly = isAffirmativeOnly(userMessage)

  // Build a search query. When the user sent just "yes"/"more"/"options"/etc.
  // with no concrete noun, inherit the last user message that DID carry a
  // noun so the Algolia query is still targeted (e.g. "earrings for white
  // saree" instead of a bare "yes").
  let searchQuery = userMessage
  const previousUserHasNoun = previousUserText ? mentionsProductNoun(previousUserText) : false
  if (previousUserHasNoun && (affirmativeOnly || !hasNoun)) {
    searchQuery = previousUserText as string
  }

  let shouldFetch = false
  if (explicit) {
    // Any turn, any mode (except planner/knowledge already gated out).
    shouldFetch = true
  } else if (hasNoun && turnNumber >= 2 && stylistContext) {
    // Concrete item on turn 2+ in stylist/auto context.
    shouldFetch = true
  } else if (softSignal && previousUserHasNoun && turnNumber >= 2 && stylistContext) {
    // User says "give me ideas/options/suggestions" and the context already
    // established a concrete item. Fetch using the inherited query.
    shouldFetch = true
  } else if (affirmativeOnly && aiOfferedProductHelp(previousAssistantText) && previousUserHasNoun) {
    // AI offered to help find/source products → user said "yes" → fetch.
    shouldFetch = true
  }

  if (!shouldFetch) return null

  try {
    // Fetch a pool via hybridSearch (lexical + vector), slice 3 for this
    // turn, stash the rest for the "show more" follow-up.
    const products = await getRelevantProductsViaHybridSearch(searchQuery)
    if (products.length === 0) return null

    const firstBatch = products.slice(0, PRODUCTS_PER_TURN)
    const remaining = products.slice(PRODUCTS_PER_TURN)
    if (threadId) stashRemaining(threadId, remaining)

    return {
      products: firstBatch,
      hasMore: remaining.length > 0,
      algoliaQueried: true,
      source: 'fresh',
    }
  } catch (err) {
    console.error('[productRecommender] hybridSearch fetch failed:', err)
    return null
  }
}
