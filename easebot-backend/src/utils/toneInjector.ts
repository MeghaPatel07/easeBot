export interface ToneSettings {
  warm?: number
  analytical?: number
  friendly?: number
  professional?: number
  enthusiastic?: number
  concise?: number
  quirky?: number
  candid?: number
  emojis?: number
  headers?: number
}

export interface UserPersonalization {
  nickname?: string
  voiceId?: string
  toneSettings?: ToneSettings
}

/**
 * Converts tone slider values (0–100) into concrete LLM instructions
 * that are appended to the system prompt.
 */
export function buildPersonalizationSuffix(p?: UserPersonalization): string {
  if (!p) return ''
  const parts: string[] = []

  // Nickname
  if (p.nickname) {
    parts.push(`The user's preferred name is "${p.nickname}". Use this name naturally in greetings and sign-offs.`)
  }

  const t = p.toneSettings
  if (!t) {
    if (parts.length === 0) return ''
    return '\n\n---\n**Response Style Instructions:**\n' + parts.map(part => `- ${part}`).join('\n')
  }

  // Warm
  if ((t.warm ?? 0) > 70)
    parts.push('Be warm and nurturing in your responses — use empathetic phrasing and affirm the user\'s feelings.')
  else if ((t.warm ?? 0) < 30)
    parts.push('Keep a neutral, composed tone — avoid overly sentimental language.')

  // Analytical
  if ((t.analytical ?? 0) > 70)
    parts.push('Prioritize data-driven reasoning. Use Markdown tables where relevant. Avoid exclamation marks.')
  else if ((t.analytical ?? 0) < 30)
    parts.push('Favour intuitive, conversational reasoning over structured analysis.')

  // Friendly
  if ((t.friendly ?? 0) > 70)
    parts.push('Use conversational fillers like "I see," "That makes sense," and inclusive pronouns (we, us).')
  else if ((t.friendly ?? 0) < 30)
    parts.push('Maintain a formal register — avoid casual language.')

  // Professional
  if ((t.professional ?? 0) > 70)
    parts.push('Adopt a polished, professional tone. Use complete sentences and precise vocabulary.')
  else if ((t.professional ?? 0) < 30)
    parts.push('Be relaxed and informal — contractions and casual phrasing are fine.')

  // Enthusiastic
  if ((t.enthusiastic ?? 0) > 70)
    parts.push('Express genuine excitement! Use energetic language and positive reinforcement.')
  else if ((t.enthusiastic ?? 0) < 30)
    parts.push('Keep enthusiasm measured — be calm and steady in tone.')

  // Concise (message length)
  if ((t.concise ?? 50) > 70)
    parts.push('Be very concise. Answer in 1–3 sentences unless more detail is truly necessary.')
  else if ((t.concise ?? 50) < 30)
    parts.push('Be thorough and detailed. Provide comprehensive answers with full context.')

  // Quirky
  if ((t.quirky ?? 0) > 70)
    parts.push('Feel free to use light humour, unexpected angles, and playful observations.')
  else if ((t.quirky ?? 0) < 30)
    parts.push('Keep responses straightforward — avoid humour or unexpected tangents.')

  // Candid
  if ((t.candid ?? 0) > 70)
    parts.push('Be direct and candid — give honest opinions even if they challenge the user\'s assumptions.')
  else if ((t.candid ?? 0) < 30)
    parts.push('Be diplomatic and gentle when sharing opinions or suggestions.')

  // Emojis
  if ((t.emojis ?? 0) > 70)
    parts.push('Use relevant emojis throughout your responses to add warmth and visual appeal. 💕')
  else if ((t.emojis ?? 0) < 30)
    parts.push('Do not use emojis in responses.')

  // Headers/Lists
  if ((t.headers ?? 0) > 70)
    parts.push('Structure responses with Markdown headers (##) and bullet lists for clarity.')
  else if ((t.headers ?? 0) < 30)
    parts.push('Write in flowing prose — avoid headers and bullet points unless absolutely necessary.')

  if (parts.length === 0) return ''
  return '\n\n---\n**Response Style Instructions:**\n' + parts.map(part => `- ${part}`).join('\n')
}
