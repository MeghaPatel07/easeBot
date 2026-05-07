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

  // Comprehensive token estimation and context management
  const estimateTokens = (text: string): number => {
    if (!text) return 0
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4)
  }

  const estimateMessageTokens = (msg: ChatCompletionMessageParam): number => {
    let tokens = 10 // Base tokens per message structure
    if (msg.content) {
      if (typeof msg.content === 'string') {
        tokens += estimateTokens(msg.content)
      } else {
        // Handle array content (ChatCompletionContentPart[])
        tokens += estimateTokens(JSON.stringify(msg.content))
      }
    }
    if ('tool_calls' in msg && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        tokens += 20 // Base tokens per tool call
        tokens += estimateTokens(tc.function.name)
        tokens += estimateTokens(JSON.stringify(tc.function.arguments))
      }
    }
    if ('tool_call_id' in msg) {
      tokens += 5 // Tool call ID
      if (msg.content) {
        if (typeof msg.content === 'string') {
          tokens += estimateTokens(msg.content)
        } else {
          tokens += estimateTokens(JSON.stringify(msg.content))
        }
      }
    }
    return tokens
  }

  const estimateToolsTokens = (tools?: ChatCompletionTool[]): number => {
    if (!tools) return 0
    return tools.reduce((total, tool) => {
      let tokens = 50 // Base tokens per tool definition
      if (tool.function.description) tokens += estimateTokens(tool.function.description)
      if (tool.function.parameters) tokens += estimateTokens(JSON.stringify(tool.function.parameters))
      return total + tokens
    }, 0)
  }

  // Calculate total estimated tokens
  const messagesTokens = messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0)
  const toolsTokens = estimateToolsTokens(tools)
  const totalEstimatedTokens = messagesTokens + toolsTokens + 1000 // Buffer for completion

  const CONTEXT_LIMIT = 128000
  const SAFETY_THRESHOLD = CONTEXT_LIMIT * 0.8 // 80% to be more conservative

  console.log(`[azureAI] Context estimation: ${totalEstimatedTokens} tokens (messages: ${messagesTokens}, tools: ${toolsTokens})`)

  // If we're over the threshold, apply aggressive context reduction
  if (totalEstimatedTokens > SAFETY_THRESHOLD) {
    console.warn(`[azureAI] Context too large (${totalEstimatedTokens} > ${SAFETY_THRESHOLD}), applying truncation`)
    
    // First, filter and truncate tool results that are too large
    const filteredMessages = messages.map(msg => {
      if (msg.role === 'tool' && msg.content && typeof msg.content === 'string') {
        // Limit tool results to max 2000 characters
        if (msg.content.length > 2000) {
          console.log(`[azureAI] Truncating large tool result from ${msg.content.length} to 2000 characters`)
          return {
            ...msg,
            content: msg.content.substring(0, 2000) + '... [truncated due to length]'
          }
        }
      }
      return msg
    })
    
    // Re-calculate tokens after filtering tool results
    const filteredTokens = filteredMessages.reduce((total, msg) => total + estimateMessageTokens(msg), 0) + toolsTokens + 1000
    
    if (filteredTokens > SAFETY_THRESHOLD) {
      console.warn(`[azureAI] Still over limit after tool result filtering (${filteredTokens} tokens), applying aggressive truncation`)
      
      // Keep only system prompt, current user message, and absolute minimum recent messages
      const systemMsg = filteredMessages.find(m => m.role === 'system')
      const userMsg = filteredMessages.find(m => m.role === 'user')
      
      const truncatedMessages: ChatCompletionMessageParam[] = []
      if (systemMsg) truncatedMessages.push(systemMsg)
      
      // Add a summary placeholder if we truncated significant history
      truncatedMessages.push({
        role: 'assistant',
        content: '[Note: Previous conversation history and tool results were truncated to fit context limits]'
      })
      
      // Add only the most recent messages (last 2)
      const recentMsgs = filteredMessages.slice(-2)
      truncatedMessages.push(...recentMsgs.filter(m => m.role !== 'system'))
      
      if (userMsg && !truncatedMessages.some(m => m.role === 'user' && m.content === userMsg.content)) {
        truncatedMessages.push(userMsg)
      }
      
      // Replace messages array with truncated version
      messages.length = 0
      messages.push(...truncatedMessages)
      
      const newTotal = messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0) + toolsTokens + 1000
      console.log(`[azureAI] After aggressive truncation: ${messages.length} messages, ~${newTotal} tokens`)
      
      // If still too large, apply emergency truncation
      if (newTotal > CONTEXT_LIMIT * 0.9) {
        console.warn(`[azureAI] Emergency truncation: still too large (${newTotal} tokens), keeping only essentials`)
        
        const emergencyMessages: ChatCompletionMessageParam[] = []
        if (systemMsg) emergencyMessages.push(systemMsg)
        
        // Check if user message is extremely large and truncate it
        let emergencyUserMsg = userMsg
        if (userMsg && userMsg.content) {
          const userMsgTokens = estimateMessageTokens(userMsg)
          console.log(`[azureAI] User message tokens: ${userMsgTokens}`)
          
          if (userMsgTokens > CONTEXT_LIMIT * 0.5) {
            console.warn(`[azureAI] User message too large (${userMsgTokens} tokens), truncating`)
            if (typeof userMsg.content === 'string') {
              emergencyUserMsg = {
                ...userMsg,
                content: userMsg.content.substring(0, 1000) + '... [message truncated due to extreme length]'
              }
            }
          }
        }
        
        emergencyMessages.push({
          role: 'assistant', 
          content: 'Context was too large. Please continue with a shorter conversation.'
        })
        if (emergencyUserMsg) emergencyMessages.push(emergencyUserMsg)
        
        messages.length = 0
        messages.push(...emergencyMessages)
        
        const emergencyTotal = messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0) + toolsTokens + 1000
        console.log(`[azureAI] Emergency truncation complete: ${messages.length} messages, ~${emergencyTotal} tokens`)
        
        // If still too large after emergency truncation, use absolute minimal context
        if (emergencyTotal > CONTEXT_LIMIT * 0.8) {
          console.warn(`[azureAI] Absolute emergency: still too large (${emergencyTotal} tokens), using minimal context`)
          
          const minimalMessages: ChatCompletionMessageParam[] = []
          if (systemMsg) minimalMessages.push(systemMsg)
          minimalMessages.push({
            role: 'assistant', 
            content: 'Conversation context was too large. Please start fresh.'
          })
          
          messages.length = 0
          messages.push(...minimalMessages)
          
          const minimalTotal = messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0) + toolsTokens + 1000
          console.log(`[azureAI] Minimal context: ${messages.length} messages, ~${minimalTotal} tokens`)
        }
      }
    } else {
      // Tool result filtering was enough
      messages.length = 0
      messages.push(...filteredMessages)
      console.log(`[azureAI] Tool result filtering sufficient: ${messages.length} messages, ~${filteredTokens} tokens`)
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
