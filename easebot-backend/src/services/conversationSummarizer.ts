/**
 * Conversation Summarizer Service
 * Summarizes older messages to reduce context window usage while preserving key info.
 */
import type { AzureOpenAI } from 'openai'

const SUMMARIZER_SYSTEM_PROMPT =
  'Summarize this wedding planning conversation, preserving key decisions, dates, budgets, preferences, and action items. Be concise.'

/**
 * Summarize a conversation when message count exceeds a threshold.
 * Produces a ~200 token summary of the provided messages using a cheap/fast LLM call.
 *
 * @param messages - Array of conversation messages to summarize
 * @param client   - An initialized AzureOpenAI client instance
 * @returns The summary text
 */
export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
  client: AzureOpenAI,
  targetLanguage?: string,
): Promise<string> {
  if (messages.length === 0) {
    return ''
  }

  // Format messages into a single block for the summarizer
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n')

  // Preserve the thread's language in the summary so downstream turns don't
  // regress to English when the summary replaces trimmed history.
  let systemPrompt = SUMMARIZER_SYSTEM_PROMPT
  if (targetLanguage && targetLanguage !== 'en') {
    systemPrompt += ` Respond to this summarization task in ${targetLanguage} (BCP-47). Preserve all proper nouns and numbers exactly.`
  }

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: conversationText },
    ],
    max_tokens: 300,
    temperature: 0.3,
  })

  return completion.choices[0]?.message?.content ?? ''
}
