import { AzureOpenAI } from 'openai'
import type { ChatCompletionTool, ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions'
import type { HistoryMessage } from '../types'

// ── Mode-specific temperature map ──────────────────────────────────────────────
export const MODE_TEMPERATURES: Record<string, number> = {
  planner: 0.3,
  stylist: 0.8,
  knowledge: 0.2,
}

export interface AIResult {
  text: string
  toolCalls: { id: string; name: string; args: Record<string, any> }[]
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
}

export function getClient(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT_THEWEDDINGBOT
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
  imageData?: ImageData,
  temperature: number = 0.7
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
    max_tokens: 4096,
    temperature,
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
  imageData?: ImageData,
  temperature: number = 0.7
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
    max_tokens: 4096,
    temperature,
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
 * One pass in the assistant→tools→assistant loop. Replays the prior assistant
 * tool_calls + tool results, then optionally allows the LLM to issue another
 * round of tool calls. Yields chunk events as they arrive and a final 'done'
 * event with any new tool calls + usage.
 */
export async function* streamCallAzureAIWithToolResults(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  priorRounds: { toolCalls: { id: string; name: string; args: Record<string, any> }[]; toolResults: { id: string; result: string }[] }[],
  tools?: ChatCompletionTool[],
  temperature: number = 0.7
): AsyncGenerator<StreamEvent> {
  const client = getClient()

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ]

  for (const round of priorRounds) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: round.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    })
    for (const r of round.toolResults) {
      messages.push({ role: 'tool' as const, tool_call_id: r.id, content: r.result })
    }
  }

  const stream = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 4096,
    temperature,
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
 * Non-streaming variant of the second-pass call. Allows continued tool calls.
 */
export async function callAzureAIWithToolResults(
  history: HistoryMessage[],
  userMessage: string,
  systemPrompt: string,
  priorRounds: { toolCalls: { id: string; name: string; args: Record<string, any> }[]; toolResults: { id: string; result: string }[] }[],
  tools?: ChatCompletionTool[],
  temperature: number = 0.7
): Promise<AIResult> {
  const client = getClient()

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ]

  for (const round of priorRounds) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: round.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    })
    for (const r of round.toolResults) {
      messages.push({ role: 'tool' as const, tool_call_id: r.id, content: r.result })
    }
  }

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 4096,
    temperature,
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  })

  const message = completion.choices[0]?.message
  const toolCalls = (message?.tool_calls ?? []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    args: (() => { try { return JSON.parse(tc.function.arguments || '{}') } catch { return {} } })(),
  }))

  const usage = completion.usage ? {
    promptTokens: completion.usage.prompt_tokens,
    completionTokens: completion.usage.completion_tokens,
    totalTokens: completion.usage.total_tokens,
  } : null

  return { text: message?.content ?? '', toolCalls, usage }
}
