import { AzureOpenAI } from 'openai'
import type { ChatCompletionTool, ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions'
import type { HistoryMessage } from '../types'

export interface AIResult {
  text: string
  toolCalls: { id: string; name: string; args: Record<string, any> }[]
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
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

export interface ImageData {
  base64: string
  mimeType: string
}

export async function callAzureAI(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  tools?: ChatCompletionTool[],
  imageData?: ImageData
): Promise<AIResult> {
  const client = getClient()

  // Build user content — multimodal array when image is attached
  const userContent: string | ChatCompletionContentPart[] = imageData
    ? [
        { type: 'text' as const, text: userMessage || 'Describe this image.' },
        { type: 'image_url' as const, image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
      ]
    : userMessage

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ]

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 1200,
    temperature: 0.7,
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  })

  const message = completion.choices[0]?.message
  const toolCalls = (message?.tool_calls ?? []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}'),
  }))

  const usage = completion.usage ? {
    promptTokens: completion.usage.prompt_tokens,
    completionTokens: completion.usage.completion_tokens,
    totalTokens: completion.usage.total_tokens,
  } : null

  return { text: message?.content ?? '', toolCalls, usage }
}

// ── Streaming variants ────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; toolCalls: { id: string; name: string; args: Record<string, any> }[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null }

/**
 * Stream the first LLM call. Yields text chunks as they arrive.
 * On completion yields a 'done' event containing any tool calls the model requested.
 */
export async function* streamCallAzureAI(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  tools?: ChatCompletionTool[],
  imageData?: ImageData
): AsyncGenerator<StreamEvent> {
  const client = getClient()

  const userContent: string | ChatCompletionContentPart[] = imageData
    ? [
        { type: 'text' as const, text: userMessage || 'Describe this image.' },
        { type: 'image_url' as const, image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
      ]
    : userMessage

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ]

  const stream = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 1200,
    temperature: 0.7,
    stream: true,
    stream_options: { include_usage: true },
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  })

  const tcMap: Record<number, { id: string; name: string; arguments: string }> = {}
  let streamUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null

  for await (const raw of stream) {
    const delta = raw.choices[0]?.delta
    if (delta?.content) {
      yield { type: 'chunk', text: delta.content }
    }
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!tcMap[tc.index]) tcMap[tc.index] = { id: '', name: '', arguments: '' }
        if (tc.id) tcMap[tc.index].id = tc.id
        if (tc.function?.name) tcMap[tc.index].name += tc.function.name
        if (tc.function?.arguments) tcMap[tc.index].arguments += tc.function.arguments
      }
    }
    if (raw.usage) {
      streamUsage = {
        promptTokens: raw.usage.prompt_tokens,
        completionTokens: raw.usage.completion_tokens,
        totalTokens: raw.usage.total_tokens,
      }
    }
  }

  const toolCalls = Object.values(tcMap).map(tc => ({
    id: tc.id,
    name: tc.name,
    args: (() => { try { return JSON.parse(tc.arguments) } catch { return {} } })(),
  }))

  yield { type: 'done', toolCalls, usage: streamUsage }
}

/**
 * Stream the second-pass call (after tool execution). Yields text chunks only.
 */
export async function* streamCallAzureAIWithToolResults(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  assistantToolCalls: { id: string; name: string; args: Record<string, any> }[],
  toolResults: { id: string; result: string }[]
): AsyncGenerator<string> {
  const client = getClient()

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
    {
      role: 'assistant',
      content: null,
      tool_calls: assistantToolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    },
    ...toolResults.map(r => ({
      role: 'tool' as const,
      tool_call_id: r.id,
      content: r.result,
    })),
  ]

  const stream = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 1200,
    temperature: 0.7,
    stream: true,
  })

  for await (const raw of stream) {
    const delta = raw.choices[0]?.delta?.content
    if (delta) yield delta
  }
}

/**
 * Second-pass call: feeds tool results back to get the final user-facing reply.
 */
export async function callAzureAIWithToolResults(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  assistantToolCalls: { id: string; name: string; args: Record<string, any> }[],
  toolResults: { id: string; result: string }[]
): Promise<string> {
  const client = getClient()

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
    {
      role: 'assistant',
      content: null,
      tool_calls: assistantToolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    },
    ...toolResults.map(r => ({
      role: 'tool' as const,
      tool_call_id: r.id,
      content: r.result,
    })),
  ]

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 1200,
    temperature: 0.7,
  })

  return completion.choices[0]?.message?.content ?? ''
}
