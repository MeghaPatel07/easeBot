import { AzureOpenAI } from 'openai'
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { HistoryMessage } from '../types'

export interface AIResult {
  text: string
  toolCalls: { name: string; args: Record<string, any> }[]
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

function getClient(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_DEPLOYMENT_NAME

  if (!endpoint || !apiKey || !deployment) {
    throw new Error('Azure OpenAI environment variables are not configured.')
  }

  return new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion: '2024-08-01-preview',
  })
}

export async function callAzureAI(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  maxTokens = 800,
  tools?: ChatCompletionTool[]
): Promise<AIResult> {
  const client = getClient()

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ]

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  })

  const message = completion.choices[0]?.message
  const toolCalls = (message?.tool_calls ?? []).map(tc => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}'),
    id: tc.id,
  }))

  return {
    text: message?.content ?? '',
    toolCalls,
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    },
  }
}

/**
 * Second-pass call after tool results are available.
 * Feeds tool results back to the LLM to produce the final user-facing reply.
 */
export async function callAzureAIWithToolResults(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  toolCallResults: { id: string; name: string; result: string }[],
  assistantToolCallsRaw: any[],
  maxTokens = 800
): Promise<AIResult> {
  const client = getClient()

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
    {
      role: 'assistant',
      content: null,
      tool_calls: assistantToolCallsRaw,
    },
    ...toolCallResults.map(r => ({
      role: 'tool' as const,
      tool_call_id: r.id,
      content: r.result,
    })),
  ]

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  })

  return {
    text: completion.choices[0]?.message?.content ?? '',
    toolCalls: [],
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    },
  }
}
