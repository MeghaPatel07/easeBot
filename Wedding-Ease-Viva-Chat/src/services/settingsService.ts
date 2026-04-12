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
