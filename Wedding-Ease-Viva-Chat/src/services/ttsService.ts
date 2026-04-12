import { auth } from '@/lib/firebase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}

export interface TTSRequest {
  text: string
  voiceName?: string   // Gemini voice name e.g. 'Kore'
  language?: string    // language code e.g. 'gu', 'hi', 'en'
}

/**
 * Calls the backend /api/tts endpoint and returns a blob URL
 * pointing to the WAV audio. Caller is responsible for calling
 * URL.revokeObjectURL() when done.
 */
export async function requestTTS(req: TTSRequest): Promise<string> {
  const token = await getAuthToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/api/tts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error ?? `TTS request failed: ${res.status}`)
  }

  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
