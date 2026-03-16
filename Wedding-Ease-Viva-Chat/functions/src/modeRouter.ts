import type { Mode } from './types'

// Keyword-based intent classifier. Runs inside the Cloud Function — no API cost.
// Returns the best-matching mode or 'assistant' as default.

const MODE_PATTERNS: Array<{ mode: Mode; patterns: RegExp[] }> = [
  {
    mode: 'therapist',
    patterns: [
      /\b(stress|stressed|overwhelm|overwhelmed|anxious|anxiety|nervous|scared|afraid|panic|crying|upset|frustrated|exhausted|burnout|difficult|hard time|can't cope|breaking down|fight|argument|drama|in-law|mother.in.law|family conflict|disagree|pressure)\b/i,
    ],
  },
  {
    mode: 'consultant',
    patterns: [
      /\b(budget|cost|price|expensive|cheap|afford|money|spend|spending|save|saving|quote|negotiate|negotiating|worth it|value|tip|gratuity|payment|deposit|invoice|compare|breakdown|allocate)\b/i,
    ],
  },
  {
    mode: 'planner',
    patterns: [
      /\b(timeline|checklist|schedule|plan|planning|when|deadline|months? (before|away)|book|booking|vendor|coordinator|organiz|to.?do|task|step|milestone|countdown|sequence|order of)\b/i,
    ],
  },
  {
    mode: 'stylist',
    patterns: [
      /\b(dress|gown|suit|tux|tuxedo|veil|flowers|floral|bouquet|centerpiece|décor|decor|color|colour|palette|aesthetic|theme|style|mood.?board|inspiration|look|vibe|bohemian|rustic|modern|romantic|vintage|glamour|bridesmaid|groomsmen|attire|outfit|fashion)\b/i,
    ],
  },
  {
    mode: 'knowledge',
    patterns: [
      /\b(what is|what are|how does|why do|origin|history|tradition|meaning|etiquette|custom|culture|rule|protocol|supposed to|acceptable|appropriate|differ|explain|define|tell me about)\b/i,
    ],
  },
]

export function detectMode(text: string): Mode {
  const scores: Record<Mode, number> = {
    therapist: 0,
    consultant: 0,
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

  const best = (Object.entries(scores) as [Mode, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))
  return best[1] > 0 ? best[0] : 'assistant'
}
