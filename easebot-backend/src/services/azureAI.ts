import { AzureOpenAI } from 'openai'
import type { ChatCompletionTool, ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions'
import type { HistoryMessage } from '../types'
import { azureHttpAgent } from '../lib/azureHttpAgent'

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

// ── Transient network resilience ────────────────────────────────────────────
// Azure OpenAI calls occasionally get cut mid-flight — most commonly a pooled
// keep-alive socket that went idle between conversation turns and was
// silently closed by the far end, surfacing as "Premature close" the moment
// it's reused. A single retry on a fresh connection clears this without the
// user ever seeing it.
const TRANSIENT_ERROR_PATTERNS = ['premature close', 'socket hang up', 'fetch failed', 'other side closed', 'terminated']
const TRANSIENT_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE'])

function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const cause = (err as { cause?: unknown }).cause
  const messages = [err.message, cause instanceof Error ? cause.message : undefined].filter(
    (m): m is string => typeof m === 'string',
  )
  if (messages.some(m => TRANSIENT_ERROR_PATTERNS.some(p => m.toLowerCase().includes(p)))) return true
  const codes = [(err as { code?: string }).code, (cause as { code?: string } | undefined)?.code]
  return codes.some(c => c !== undefined && TRANSIENT_ERROR_CODES.has(c))
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err
    console.warn('[azureAI] transient network error, retrying once:', err instanceof Error ? err.message : err)
    return await fn()
  }
}

export function getClient(): AzureOpenAI {
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
    httpAgent: azureHttpAgent,
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

  const completion = await withRetry(() => client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 4096,
    temperature,
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  }))

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
 * Opens the completion stream and consumes it, yielding chunk/done events.
 * If the connection drops before any content has reached the caller (a stale
 * pooled connection reused after an idle gap between turns is the common
 * case — see isTransientNetworkError), retries once on a fresh request.
 * Once a chunk has already been yielded we can't safely retry — the
 * completion can't be resumed from where it left off — so later failures are
 * rethrown as-is and surface to the user like before.
 */
async function* consumeAzureStream(
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
  temperature: number,
): AsyncGenerator<StreamEvent> {
  const client = getClient()
  const createStream = () => client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 4096,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  })

  let stream = await withRetry(createStream)

  const tcMap: Record<number, { id: string; name: string; arguments: string }> = {}
  let streamUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null
  let yieldedAnyChunk = false
  let retriedMidStream = false

  while (true) {
    try {
      for await (const raw of stream) {
        const delta = raw.choices[0]?.delta
        if (delta?.content) {
          yieldedAnyChunk = true
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
      break
    } catch (err) {
      if (!yieldedAnyChunk && !retriedMidStream && isTransientNetworkError(err)) {
        retriedMidStream = true
        console.warn('[azureAI] stream dropped before any output, retrying once:', err instanceof Error ? err.message : err)
        stream = await createStream()
        continue
      }
      throw err
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

  yield* consumeAzureStream(messages, tools, temperature)
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

  yield* consumeAzureStream(messages, tools, temperature)
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

  const completion = await withRetry(() => client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages,
    max_tokens: 4096,
    temperature,
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
  }))

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
