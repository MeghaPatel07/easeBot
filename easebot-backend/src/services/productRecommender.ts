import { getRelevantProductsViaHybridSearch } from './hybridSearchProducts'
import { stashRemaining, popNextBatch, hasStash, getStashQuery } from './productStash'
import { callAzureAI } from './azureAI'
import type { ProductResult } from './products'
import type { Mode, HistoryMessage } from '../types'

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
// Decor nouns like mandap, bouquet, centerpiece, garland, marigold are excluded.
// Gifting and wedding stationery nouns are included.
const PRODUCT_NOUN_RE = /\b(lehengas?|lehngas?|lengha|lehanga|saree|sarees|sari|saris|sarre|saari|sareh|sharara|shararas?|anarkali|gharara|ghagra|sherwani|shervani|sherwanis?|kurta|kurti|kurtas|kurtis|achkan|nehru jacket|indo[- ]?western|gowns?|dress(?:es)?|outfits?|attire|clothes|clothing|bridesmaid|groomsmen|blouses?|dupattas?|stole|veil|mangalsutra|mangalsootra|necklace|earring|earrings|earing|earings|jhumka|jhumkas|maang ?tikka|tikka|bangle|bangles|bracelet|chooda|kaleere|nath|ring|clutch|purse|potli|heels|footwear|juttis?|mojaris?|festive wear|accessor(?:y|ies)|gift|gifts|favor|favors|invitation|invitations|card|cards|stationery|stationeries|rsvp|signage)\b/i

// Soft product-shopping signals. Alone these are ambiguous ("I have ideas
// about color"), but combined with stylist/auto mode on turn >= 2 they're a
// reliable "user wants to see products" cue.
const SOFT_PRODUCT_SIGNAL_RE = /\b(options?|ideas?|suggestions?|recommendations?|picks?|choices?|shortlist|styles?)\b/i

// Generic words for "the product list" itself. Deliberately excludes bare
// "ideas"/"choices"/"suggestions"/"recommendations" — those over-match
// planning chatter ("give me some ideas for guest games") and are left to
// SOFT_PRODUCT_SIGNAL_RE + the normal stream gate instead.
const CATALOGUE_NOUN_RE = /\b(products?|catalogue|catalog|collections?|options?|items?|selection|range|designs?|picks?|events?|occasions?)\b/i

// Verbs that signal the user is upfront asking to be shown something right
// now, as opposed to chatting about style in the abstract. Includes "can/
// could I/we see" — a question-phrased request ("Can I see matching
// accessories?") that means exactly the same thing as "show me" — and
// "suggest", which combined with a product noun ("suggest accessories") is
// just as direct an ask as "show me accessories" (bare "suggest" with no
// product/catalogue noun, e.g. "suggest what colors would work", still
// requires the noun check in hasExplicitProductRequest, so it stays inert).
// NOTE: deliberately excludes "recommend" — "what do you recommend" is used
// in ordinary conversational questions ("what invitation cards do you
// recommend?") that should still go through the normal 3-consecutive-topic
// stream gate rather than bypassing it outright.
const REQUEST_VERB_RE = /\b(show|give|find|get|display|list|pull up|bring up|send|fetch|suggest|can\s+(?:i|we)\s+see|could\s+(?:i|we)\s+see)\b/i

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
  history?: HistoryMessage[]
}

const RECOMMENDATION_CLASSIFIER_PROMPT = `You are a strict classifier that determines if the user is asking for:
1. A styling tip
2. A product tip
3. A tip or question related specifically to one of these 4 categories of Wedding-Ease:
   - Attire (e.g., clothing, dresses, outfits, sarees, lehengas, sherwanis, suits, sherwani, kurta, etc.)
   - Jewelry and Accessories (e.g., jewellery, ornaments, necklaces, earrings, bangles, rings, footwear, shoes, juttis, clutches, bags, etc.)
   - Gifting and Favors (e.g., wedding favors, guest gifts, return gifts, bridesmaid gifts, etc.)
   - Wedding Stationery (e.g., wedding invitations, cards, RSVP cards, menu cards, wedding signage, etc.)

We ONLY recommend products from the catalogue for these topics.
Crucially, do NOT match if the user is asking about or talking about:
- Decor (e.g., mandap, stage, flowers, centerpieces, ceiling decor, lighting, balloons, table settings, room decor, floral setups, decoration ideas, themes, etc.)
- Planning, catering, photography, venues, timelines, music, budget, etc.
- Any other topic not directly related to styling tips, product tips, or the 4 categories above.

STREAM GATING RULE:
We should NOT recommend products on the first or second query of a topic stream. We only recommend products on or after the THIRD consecutive user message about the allowed categories/tips.
Look at the user's current message and the previous user messages in the history:
1. Count how many consecutive user messages (including the current one) have been about the allowed categories or styling/product tips, without any interruptions by other topics (like decor, venue, budget, or planning).
2. If this count is at least 3 (meaning this is the 3rd or later consecutive user message on these allowed topics), and the current message is about an allowed category:
   - Output "MATCH: YES"
   - Generate a highly relevant search query of 4-5 words maximum to search for matching products in the catalog. The search query must be specific, contextual, and optimized for search (e.g. "bridal red lehenga", "groomsmen return gifts", "gold necklace set", "wedding invitation card"). Do not include filler words like "find", "search", "show me", "please". Keep it to 4-5 words max.
3. Otherwise (if the count is less than 3, or if the current message is not about an allowed category, or if the stream was broken by a non-allowed topic like decor or venue):
   - Output "MATCH: NO"

Your response must strictly follow this format:
MATCH: <YES or NO>
QUERY: <4-5 words search query if MATCH is YES, otherwise leave empty>`

export interface RecommendResult {
  products: ProductResult[]
  hasMore: boolean
  algoliaQueried: boolean
  source: 'stash' | 'fresh'
  /** The resolved search query behind this batch — surfaced to the frontend
   *  so "See more options" can deep-link into the WeddingEase catalogue with
   *  the same search context instead of a generic/empty search. */
  query: string
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

// An explicit, upfront ask — "show me sarees", "give me the catalogue",
// "find me a lehenga" — always bypasses the 3-turn stream gate. The gate
// exists to stop the assistant from pushing products during ordinary
// styling chat; a direct request should never be blocked by it, regardless
// of which turn of the conversation it lands on.
function hasExplicitProductRequest(msg: string): boolean {
  if (!REQUEST_VERB_RE.test(msg)) return false
  return CATALOGUE_NOUN_RE.test(msg) || PRODUCT_NOUN_RE.test(msg)
}

// Generic, catch-all product words that are too broad to search alone — the
// catalogue tags all sorts of unrelated items under these ("accessories"
// matches a USB-cable organizer, bare "outfit" surfaced a wall-decor mirror
// panel for "suggest outfit ideas for my wedding functions"). Anchor these to
// a specific garment when one is known, or an occasion/style qualifier
// otherwise, instead of searching the bare generic word.
const GENERIC_ATTIRE_RE = /\b(accessor(?:y|ies)|outfits?|dress(?:es)?|attire|clothes|clothing)\b/i

// Core garment nouns used purely to anchor a generic term ("accessories",
// "outfit") to the specific piece in play — deliberately excludes "dress"/
// "outfit" themselves (those ARE the generic terms being anchored) and
// jewelry/footwear/gift nouns already covered elsewhere in PRODUCT_NOUN_RE.
const GARMENT_ANCHOR_RE = /\b(lehengas?|lehngas?|lengha|lehanga|saree|sarees|sari|saris|sarre|saari|sareh|sharara|shararas?|anarkali|gharara|ghagra|sherwani|shervani|sherwanis?|kurta|kurti|kurtas|kurtis|achkan|nehru jacket|indo[- ]?western|gowns?|blouses?|dupattas?)\b/i

// Occasion/style qualifiers used to anchor a generic term when no specific
// garment is mentioned anywhere in context — "suggest outfit ideas for my
// wedding functions" has no garment to anchor to, but does have "wedding",
// so it resolves to "wedding outfit" instead of a bare, noisy "outfit".
const OCCASION_QUALIFIER_RE = /\b(wedding|reception|sangeet|mehndi|mehandi|mehendi|haldi|engagement|sagai|cocktail|pre-?wedding|bridal|groom|festive|regal)\b/i

// Looks for a garment mention, checking the current message first, then the
// last user message, then the last assistant message — covers "matching
// accessories for THIS", where "this" only resolves via recent conversation
// (e.g. the assistant's own previous reply describing "the ivory sherwani").
function findGarmentAnchor(...texts: (string | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue
    const m = text.match(GARMENT_ANCHOR_RE)
    if (m) return m[0].toLowerCase()
  }
  return null
}

function findOccasionQualifier(...texts: (string | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue
    const m = text.match(OCCASION_QUALIFIER_RE)
    if (m) return m[0].toLowerCase()
  }
  return null
}

// Resolves the best product noun to search for out of a message, anchoring
// bare generic terms ("accessories", "outfit") to a nearby garment or, failing
// that, an occasion/style qualifier — so the search stays specific instead of
// falling back to a single vague word. Shared by the explicit-request path,
// the regex-classifier fallback, and the final "ensure searchQuery has
// something" safety net further below.
function resolveProductNoun(
  msg: string,
  previousUserText?: string,
  previousAssistantText?: string,
): string | null {
  const nounMatch = msg.match(PRODUCT_NOUN_RE)
  if (!nounMatch) return null
  if (!GENERIC_ATTIRE_RE.test(nounMatch[0])) return nounMatch[0]

  const generic = nounMatch[0].toLowerCase()
  const garment = findGarmentAnchor(msg, previousUserText, previousAssistantText)
  if (garment) return `${garment} ${generic}`

  const occasion = findOccasionQualifier(msg, previousUserText, previousAssistantText)
  if (occasion) return `${occasion} ${generic}`

  return nounMatch[0]
}

// Search query for an explicit request: prefer the concrete (garment-anchored)
// product noun so it maps cleanly through the keyword directory; otherwise
// fall back to the trimmed raw message so Algolia's typo tolerance can help.
function buildExplicitSearchQuery(
  msg: string,
  previousUserText?: string,
  previousAssistantText?: string,
): string {
  const resolved = resolveProductNoun(msg, previousUserText, previousAssistantText)
  if (resolved) return resolved
  return msg.split(/\s+/).filter(Boolean).slice(0, 5).join(' ')
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
    const stashedQuery = getStashQuery(threadId)
    const batch = popNextBatch(threadId, PRODUCTS_PER_TURN)
    if (batch.length > 0) {
      return {
        products: batch,
        hasMore: hasStash(threadId),
        algoliaQueried: false,
        source: 'stash',
        query: stashedQuery ?? userMessage,
      }
    }
  }

  // An explicit, upfront ask ("show me sarees", "give me the catalogue")
  // always bypasses the stream gate below — see hasExplicitProductRequest.
  const explicitRequest = hasExplicitProductRequest(userMessage)

  // Stream gating: for ordinary styling chat (no direct ask), only show
  // recommendations on or after the 3rd user message.
  if (!explicitRequest && turnNumber < 3) return null

  let isMatch = false
  let searchQuery = ''

  if (explicitRequest) {
    isMatch = true
    searchQuery = buildExplicitSearchQuery(userMessage, previousUserText, previousAssistantText)
  } else {
    // Build a local history context if none is provided.
    const chatHistory: HistoryMessage[] = input.history || []
    if (chatHistory.length === 0) {
      if (previousUserText) {
        chatHistory.push({ role: 'user', content: previousUserText })
      }
      if (previousAssistantText) {
        chatHistory.push({ role: 'assistant', content: previousAssistantText })
      }
    }

    try {
      // Call the LLM classifier to determine match & query
      const classifierResult = await callAzureAI(
        chatHistory,
        userMessage,
        RECOMMENDATION_CLASSIFIER_PROMPT,
        [],
        undefined,
        0.1 // Use low temperature for high determinism
      )

      const text = classifierResult.text.trim()
      const matchLine = text.match(/MATCH:\s*(YES|NO)/i)
      const queryLine = text.match(/QUERY:\s*(.*)/i)

      if (matchLine && matchLine[1].toUpperCase() === 'YES') {
        isMatch = true
        searchQuery = queryLine ? queryLine[1].trim() : ''
      }
    } catch (err) {
      console.error('[productRecommender] LLM classification failed, falling back to regex rules:', err)

      const stylistContext = mode === 'stylist' || requestedMode === undefined || requestedMode === 'stylist'
      const explicit = hasExplicitIntent(userMessage)
      const hasNoun = mentionsProductNoun(userMessage)
      const softSignal = hasSoftProductSignal(userMessage)
      const affirmativeOnly = isAffirmativeOnly(userMessage)

      // Check consecutive user messages in the history to ensure at least 3 consecutive allowed queries.
      let consecutiveCount = 1 // count the current userMessage
      const userHistory = chatHistory.filter((m) => m.role === 'user')
      for (let i = userHistory.length - 1; i >= 0; i--) {
        const msg = userHistory[i].content
        if (mentionsProductNoun(msg) || hasExplicitIntent(msg) || hasSoftProductSignal(msg)) {
          consecutiveCount++
        } else {
          break
        }
      }

      let shouldFetchFallback = false
      if (consecutiveCount >= 3) {
        let fallbackQuery = userMessage
        const previousUserHasNoun = previousUserText ? mentionsProductNoun(previousUserText) : false
        if (previousUserHasNoun && (affirmativeOnly || !hasNoun)) {
          fallbackQuery = previousUserText as string
        }

        if (explicit) {
          shouldFetchFallback = true
        } else if (hasNoun && stylistContext) {
          shouldFetchFallback = true
        } else if (softSignal && previousUserHasNoun && stylistContext) {
          shouldFetchFallback = true
        } else if (affirmativeOnly && aiOfferedProductHelp(previousAssistantText) && previousUserHasNoun) {
          shouldFetchFallback = true
        }

        if (shouldFetchFallback) {
          isMatch = true
          const resolved = resolveProductNoun(fallbackQuery, previousUserText, previousAssistantText)
          searchQuery = resolved ?? fallbackQuery
        }
      }
    }
  }

  if (!isMatch) return null

  // Ensure searchQuery has at least something if LLM returned YES but no query
  if (!searchQuery) {
    const resolved = resolveProductNoun(userMessage, previousUserText, previousAssistantText)
    searchQuery = resolved ?? userMessage.split(/\s+/).slice(0, 5).join(' ')
  }

  // Ensure search query is optimized and does not exceed 5 words max.
  const words = searchQuery.split(/\s+/).filter(Boolean)
  if (words.length > 5) {
    searchQuery = words.slice(0, 5).join(' ')
  }

  try {
    // Fetch a pool via hybridSearch (lexical + vector), slice 3 for this
    // turn, stash the rest for the "show more" follow-up.
    const products = await getRelevantProductsViaHybridSearch(searchQuery)
    if (products.length === 0) return null

    const firstBatch = products.slice(0, PRODUCTS_PER_TURN)
    const remaining = products.slice(PRODUCTS_PER_TURN)
    if (threadId) stashRemaining(threadId, remaining, searchQuery)

    return {
      products: firstBatch,
      hasMore: remaining.length > 0,
      algoliaQueried: true,
      source: 'fresh',
      query: searchQuery,
    }
  } catch (err) {
    console.error('[productRecommender] hybridSearch fetch failed:', err)
    return null
  }
}
