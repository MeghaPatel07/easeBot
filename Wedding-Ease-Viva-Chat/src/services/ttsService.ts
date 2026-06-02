import { auth } from '@/lib/firebase'
import { buildAuthHeaders } from '@/lib/guestSession'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://easebot-production.up.railway.app'

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
  // Authenticated → Authorization; anonymous → X-Guest-Id (valid guest session).
  // The backend now rejects fully-anonymous callers on /api/tts (WE-20260527-202).
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...buildAuthHeaders(token) }

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
