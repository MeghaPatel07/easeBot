import { AzureOpenAI } from 'openai'
import type { HistoryMessage } from '../types'

export interface AIResult {
  text: string
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
  maxTokens = 800
): Promise<AIResult> {
  const client = getClient()

  const completion = await client.chat.completions.create({
    model: process.env.AZURE_DEPLOYMENT_NAME!,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  })

  return {
    text: completion.choices[0]?.message?.content ?? '',
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    },
  }
}
