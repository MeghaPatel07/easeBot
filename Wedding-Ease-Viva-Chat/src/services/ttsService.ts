import { apiFetch } from './apiClient'

export interface TTSRequest {
  text: string
  voiceName?: string   // Gemini voice name e.g. 'Kore'
  language?: string    // language code e.g. 'gu', 'hi', 'en'
}

/**
 * Calls the backend /tts endpoint and returns a blob URL
 * pointing to the WAV audio. Caller is responsible for calling
 * URL.revokeObjectURL() when done.
 */
export async function requestTTS(req: TTSRequest): Promise<string> {
  const res = await apiFetch('/tts', { method: 'POST', body: JSON.stringify(req) })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error ?? `TTS request failed: ${res.status}`)
  }

  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
