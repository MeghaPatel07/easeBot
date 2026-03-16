/**
 * Image generation using Azure OpenAI DALL-E 3.
 * Reuses existing AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY.
 * Requires a DALL-E 3 deployment in your Azure OpenAI resource.
 * Env var: AZURE_DALLE_DEPLOYMENT (default: "dall-e-3")
 */

const IMAGE_INTENT_RE =
  /\b(generate|create|make|show|draw|design|visualize|render)\b.{0,60}\b(images?|pictures?|photos?|visuals?|illustrations?|mockups?|renders?|sketches?)\b/i

export function isImageRequest(message: string): boolean {
  return IMAGE_INTENT_RE.test(message)
}

export async function generateImage(prompt: string): Promise<string | null> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_DALLE_DEPLOYMENT ?? 'dall-e-3'

  if (!endpoint || !apiKey) {
    console.warn('[imageGeneration] Azure credentials not set — skipping')
    return null
  }

  try {
    const url = `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=2024-02-01`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'url',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[imageGeneration] Azure DALL-E error ${res.status}: ${body}`)
      return null
    }

    const data = await res.json()
    const imageUrl = data?.data?.[0]?.url ?? null
    if (!imageUrl) console.warn('[imageGeneration] No URL in DALL-E response')
    return imageUrl
  } catch (err) {
    console.error('[imageGeneration] fetch error:', err)
    return null
  }
}
