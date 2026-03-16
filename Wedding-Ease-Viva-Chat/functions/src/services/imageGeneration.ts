/**
 * Image generation using Google Gemini Imagen 3.
 *
 * Env vars required:
 *   GEMINI_API_KEY  – from aistudio.google.com/app/apikey
 *
 * Returns a base64 data URL (data:image/png;base64,...) so no storage bucket needed.
 */

// Keywords that signal the user wants an image generated
// Allows descriptive words between the verb and the image noun (e.g. "create me a bridal image")
const IMAGE_INTENT_RE =
  /\b(generate|create|make|show|draw|design|visualize|render)\b.{0,60}\b(images?|pictures?|photos?|visuals?|illustrations?|mockups?|renders?|sketches?)\b/i

export function isImageRequest(message: string): boolean {
  return IMAGE_INTENT_RE.test(message)
}

export async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[imageGeneration] GEMINI_API_KEY not set — skipping image generation')
    return null
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1 },
        }),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      console.error(`[imageGeneration] Gemini API error ${res.status}: ${body}`)
      return null
    }

    const data = await res.json()
    const b64 = data?.predictions?.[0]?.bytesBase64Encoded
    if (!b64) {
      console.warn('[imageGeneration] No image data in Gemini response')
      return null
    }

    return `data:image/png;base64,${b64}`
  } catch (err) {
    console.error('[imageGeneration] fetch error:', err)
    return null
  }
}
