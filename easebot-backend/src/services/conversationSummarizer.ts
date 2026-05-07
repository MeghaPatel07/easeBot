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

  // Context length management for summarizer
  const estimateTokens = (text: string): number => {
    if (!text) return 0
    return Math.ceil(text.length / 4)
  }

  const systemPromptTokens = estimateTokens(systemPrompt)
  const conversationTokens = estimateTokens(conversationText)
  const totalTokens = systemPromptTokens + conversationTokens + 500 // Buffer for response
  
  const SUMMARIZER_LIMIT = 100000 // Conservative limit for summarizer
  
  let finalConversationText = conversationText
  
  if (totalTokens > SUMMARIZER_LIMIT) {
    console.warn(`[conversationSummarizer] Input too large (${totalTokens} tokens), applying truncation`)
    
    // Truncate conversation to fit within limit
    const availableTokens = SUMMARIZER_LIMIT - systemPromptTokens - 500
    const maxTextLength = availableTokens * 4 // Convert back to characters
    
    if (maxTextLength > 0) {
      // Keep the end of the conversation (most recent)
      finalConversationText = conversationText.slice(-maxTextLength)
      console.log(`[conversationSummarizer] Truncated conversation from ${conversationText.length} to ${finalConversationText.length} characters`)
    } else {
      // Fallback: very short summary
      finalConversationText = 'Conversation is too long to summarize effectively. Please start a new conversation.'
      console.warn(`[conversationSummarizer] Using fallback summary due to extreme length`)
    }
  }

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: finalConversationText },
    ],
    max_tokens: 300,
    temperature: 0.3,
  })

  return completion.choices[0]?.message?.content ?? ''
}
