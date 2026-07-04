/**
 * Follow-up Suggestion Service
 *
 * Generates a small set of catchy, context-specific follow-up questions the user
 * is likely to want to ask next, based on the user's message and the assistant's
 * reply. Written in the user's first-person voice so they read as taps the user
 * would make ("How do I…", "What about…").
 *
 * Best-effort + cheap: a single short LLM call, bounded by a timeout, run in
 * parallel with TTS/product recommendation so it adds little to no latency. Any
 * failure resolves to [] so the chat stream is never blocked or broken.
 *
 * These suggestions are EPHEMERAL — emitted on the `d` stream event and held in
 * client memory only. They are never persisted to Firestore.
 */
import { getClient } from './azureAI'

const SYSTEM_PROMPT = `You generate follow-up question chips for a wedding-planning assistant called TheWeddingBot.

You are given the user's last message and the assistant's reply. Produce EXACTLY 4 follow-up questions the USER is most likely to want to tap next, written in the user's own first-person voice (e.g. "How do I…", "Can you…", "What about…").

Make them:
- Specific to the assistant's reply — reference the actual topics, options, numbers, or names it mentioned. Never generic.
- Catchy and curiosity-driven, so the user genuinely wants to tap them.
- Action-oriented — each should move the wedding planning forward (go deeper, decide between options, take the next step, or surface something they hadn't considered).
- Short: under 8 words each, so they fit on a small chip.
- Distinct from one another in angle.

Do not number them, add quotes, emojis, or any preamble. Write them in {LANGUAGE}.

Respond with ONLY a JSON object of this exact shape: {"questions": ["q1", "q2", "q3", "q4"]}`

const MAX_SUGGESTIONS = 4
const MAX_QUESTION_LENGTH = 80
const REPLY_MIN_LENGTH = 40        // too short to suggest anything meaningful from
const GENERATION_TIMEOUT_MS = 5000 // never let this hold up the `d` event

interface GenerateArgs {
  userMessage: string
  assistantReply: string
  /** BCP-47 language the assistant replied in; suggestions match it. */
  language?: string
  signal?: AbortSignal
}

/**
 * Parse the model output leniently. Accepts {"questions":[...]}, a bare JSON
 * array, or newline/bullet-separated lines as a last resort. Returns up to 4
 * cleaned, de-duplicated questions.
 */
function parseQuestions(raw: string): string[] {
  if (!raw) return []

  let arr: unknown[] = []
  const jsonMatch = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) arr = parsed
      else if (parsed && Array.isArray((parsed as { questions?: unknown[] }).questions)) {
        arr = (parsed as { questions: unknown[] }).questions
      }
    } catch {
      /* fall through to line parsing */
    }
  }
  if (arr.length === 0) arr = raw.split('\n')

  const seen = new Set<string>()
  const out: string[] = []
  for (const item of arr) {
    const cleaned = String(item)
      .trim()
      .replace(/^[-*\d.)\s"'`]+/, '') // strip leading bullet / numbering / quote
      .replace(/["'`]+$/, '')         // strip trailing quote
      .trim()
    if (!cleaned || cleaned.length > MAX_QUESTION_LENGTH) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
    if (out.length >= MAX_SUGGESTIONS) break
  }
  return out
}

export async function generateFollowUpSuggestions(args: GenerateArgs): Promise<string[]> {
  const reply = (args.assistantReply || '').trim()
  if (reply.length < REPLY_MIN_LENGTH) return []

  const language = args.language && args.language !== 'en' ? args.language : 'English'
  const userMessage = (args.userMessage || '').trim().slice(0, 800) || '(voice or image message)'
  const replyForPrompt = reply.slice(0, 2000)

  try {
    const client = getClient()
    const apiCall = client.chat.completions.create(
      {
        model: process.env.AZURE_DEPLOYMENT_NAME!,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT.replace('{LANGUAGE}', language) },
          {
            role: 'user',
            content: `User asked:\n"""${userMessage}"""\n\nAssistant replied:\n"""${replyForPrompt}"""`,
          },
        ],
        max_tokens: 200,
        temperature: 0.8,
      },
      { signal: args.signal },
    )

    // Bound the wait so a slow/hung call can't delay the final `d` event.
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), GENERATION_TIMEOUT_MS),
    )
    const completion = await Promise.race([apiCall, timeout])
    if (!completion) return [] // timed out

    return parseQuestions(completion.choices[0]?.message?.content ?? '')
  } catch (err) {
    console.warn('[followUpSuggestions] generation failed (swallowed):', (err as Error)?.message)
    return []
  }
}
