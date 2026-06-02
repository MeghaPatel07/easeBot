import type { Mode } from './types'

// Keyword-based intent classifier. Runs inside the Cloud Function — no API cost.
// Returns the best-matching mode or 'assistant' as default.

const MODE_PATTERNS: Array<{ mode: Mode; patterns: RegExp[] }> = [
  // {
  //   mode: 'therapist',
  //   patterns: [
  //     /\b(stress|stressed|overwhelm|overwhelmed|anxious|anxiety|nervous|scared|afraid|panic|crying|upset|frustrated|exhausted|burnout|difficult|hard time|can't cope|breaking down|fight|argument|drama|in-law|mother.in.law|family conflict|disagree|pressure)\b/i,
  //   ],
  // },
  // {
  //   mode: 'consultant',
  //   patterns: [
  //     /\b(budget|cost|price|expensive|cheap|afford|money|spend|spending|save|saving|quote|negotiate|negotiating|worth it|value|tip|gratuity|payment|deposit|invoice|compare|breakdown|allocate)\b/i,
  //   ],
  // },
  {
    mode: 'planner',
    patterns: [
      /\b(timeline|checklist|schedule|plan|planning|when|deadline|months? (before|away)|book|booking|vendor|coordinator|organiz|to.?do|task|step|milestone|countdown|sequence|order of)\b/i,
      // Transliterated Hindi/Gujarati planning terms
      /\b(checklist|suchi|yadi|taiyari|banao|banavo|karo|likho|list bana|plan karo|kya karna|kab karna|reminder)\b/i,
    ],
  },
  {
    mode: 'stylist',
    patterns: [
      /\b(dress|gown|suit|tux|tuxedo|veil|flowers|floral|bouquet|centerpiece|décor|decor|color|colour|palette|aesthetic|theme|style|mood.?board|inspiration|look|vibe|bohemian|rustic|modern|romantic|vintage|glamour|bridesmaid|groomsmen|attire|outfit|fashion)\b/i,
      // Indian/wedding-specific attire, jewellery, and décor nouns.
      /\b(lehenga|saree|sari|sharara|anarkali|gharara|ghagra|sherwani|kurta|kurti|achkan|nehru jacket|indo[- ]?western|blouse|dupatta|stole|mangalsutra|necklace|earring|earrings|jhumka|jhumkas|maang ?tikka|tikka|bangle|bangles|bracelet|chooda|kaleere|nath|ring|mandap|garland|marigold|clutch|purse|potli|heels|footwear|juttis?|mojaris?)\b/i,
    ],
  },
  {
    mode: 'knowledge',
    patterns: [
      /\b(what is|what are|how does|why do|origin|history|tradition|meaning|etiquette|custom|culture|rule|protocol|supposed to|acceptable|appropriate|differ|explain|define|tell me about)\b/i,
      // WE-20260527-352: Cultural/ceremonial wedding items + ritual names that
      // commonly appear in "what is the meaning of …" / "tell me about …" queries.
      // These are cultural concepts first, fashion items second — when a user
      // asks about them, they almost always want significance, not styling.
      // (Some terms also appear in `stylist` above; the "what is"/intent boost
      // in detectMode() resolves the tie toward knowledge for query stems.)
      /\b(mangalsutra|mangni|varmala|jaimala|sindoor|sindur|kumkum|mehndi|mehendi|henna|haldi|sangeet|baraat|baraati|vidaai|bidaai|kanyadaan|kanyadan|saptapadi|saat phere|pheras?|phera|gathbandhan|gath bandhan|sehra|kalash|aarti|pooja|puja|mandap|mangal phera|chooda|chuda|kaleere|kaleera|sindoor daan|sindur daan|nath|bichiya|ganesh pujan|hast melap|mangal sutra|ring ceremony|engagement ceremony|tilak|roka)\b/i,
    ],
  },
]

// WE-20260527-360: Knowledge-intent query stems. When any of these appear, we
// add a strong boost to the knowledge score so that "what is the mangni
// ceremony schedule?" classifies as knowledge even though "schedule" is a
// planner keyword. These are explicit user signals that the request is for
// meaning/origin/explanation, not for action items.
const KNOWLEDGE_INTENT_BOOST_PATTERNS: RegExp[] = [
  /\bwhat\s+is\b/i,
  /\bwhat\s+are\b/i,
  /\btell\s+me\s+about\b/i,
  /\bmeaning\s+of\b/i,
  /\bsignificance\s+of\b/i,
  /\bwhy\s+(do|is|are)\b/i,
  /\bexplain\b/i,
  /\bdefine\b/i,
  /\b(history|tradition|origin|cultural)\s+(of|behind)\b/i,
]

const KNOWLEDGE_INTENT_WEIGHT = 3

export function detectMode(text: string): Mode {
  const scores: Record<Mode, number> = {
    // therapist: 0,  // disabled
    // consultant: 0, // disabled
    planner: 0,
    stylist: 0,
    knowledge: 0,
    assistant: 0,
  }

  for (const { mode, patterns } of MODE_PATTERNS) {
    for (const pattern of patterns) {
      const matches = text.match(pattern)
      if (matches) scores[mode] += matches.length
    }
  }

  // WE-20260527-360: Apply knowledge-intent boost. Each matching intent stem
  // adds KNOWLEDGE_INTENT_WEIGHT so that a query like "what is the mangni
  // schedule" (1 knowledge keyword + 1 planner keyword) clearly resolves to
  // knowledge instead of tying or losing to planner.
  for (const pattern of KNOWLEDGE_INTENT_BOOST_PATTERNS) {
    if (pattern.test(text)) {
      scores.knowledge += KNOWLEDGE_INTENT_WEIGHT
    }
  }

  const best = (Object.entries(scores) as [Mode, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))
  return best[1] > 0 ? best[0] : 'assistant'
}
