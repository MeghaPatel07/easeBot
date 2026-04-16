import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { UserPersonalization } from '@/types'

export async function savePersonalization(uid: string, settings: UserPersonalization): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...(settings.nickname !== undefined && { nickname: settings.nickname }),
    ...(settings.voiceId !== undefined && { voiceId: settings.voiceId }),
    ...(settings.toneSettings !== undefined && { toneSettings: settings.toneSettings }),
  })
}

// Guest voice preference — persisted in localStorage so unauthenticated users
// keep their selected TTS voice across sessions. Logged-in users mirror their
// Firestore voiceId here too, so playback can fall back to it without waiting
// on the profile refetch.
const GUEST_VOICE_KEY = 'easebot:voiceId'

export function getLocalVoiceId(): string | null {
  try {
    return localStorage.getItem(GUEST_VOICE_KEY)
  } catch {
    return null
  }
}

export function setLocalVoiceId(voiceId: string | null): void {
  try {
    if (voiceId) localStorage.setItem(GUEST_VOICE_KEY, voiceId)
    else localStorage.removeItem(GUEST_VOICE_KEY)
  } catch {
    /* storage disabled — silent no-op */
  }
}
