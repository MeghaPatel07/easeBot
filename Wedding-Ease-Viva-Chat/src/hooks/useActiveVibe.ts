import { useEffect, useMemo, useState } from 'react'
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import type { ActiveVibe } from '@/types'

const MAX_DESCRIPTORS = 20

function normalizeActiveVibe(raw: unknown): ActiveVibe | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null

  const rawSetAt = r.setAt
  let setAt: Date
  if (rawSetAt instanceof Timestamp) {
    setAt = rawSetAt.toDate()
  } else if (rawSetAt instanceof Date) {
    setAt = rawSetAt
  } else if (
    rawSetAt &&
    typeof rawSetAt === 'object' &&
    typeof (rawSetAt as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      setAt = (rawSetAt as { toDate: () => Date }).toDate()
    } catch {
      setAt = new Date()
    }
  } else {
    setAt = new Date()
  }

  return {
    id: r.id,
    title: r.title,
    subtitle: typeof r.subtitle === 'string' ? r.subtitle : undefined,
    descriptors: Array.isArray(r.descriptors)
      ? (r.descriptors.filter((d) => typeof d === 'string') as string[])
      : [],
    presetId: typeof r.presetId === 'string' ? r.presetId : null,
    setAt,
  }
}

export function useActiveVibe(): {
  activeVibe: ActiveVibe | null
  loading: boolean
  setActiveVibe: (vibe: Omit<ActiveVibe, 'setAt'>) => Promise<void>
  addDescriptor: (descriptor: string) => Promise<void>
  removeDescriptor: (descriptor: string) => Promise<void>
  clearVibe: () => Promise<void>
} {
  const { user, profile, loading } = useAuth()

  // AuthContext uses a one-shot getDoc (no Firestore listener), so we can't
  // rely on profile.activeVibe to reflect writes. Seed from profile then keep
  // an optimistic local copy.
  const profileVibe = useMemo(
    () => normalizeActiveVibe(profile?.activeVibe ?? null),
    [profile?.activeVibe],
  )
  const [activeVibe, setLocalVibe] = useState<ActiveVibe | null>(profileVibe)

  useEffect(() => {
    setLocalVibe(profileVibe)
  }, [profileVibe])

  const writeVibe = async (next: Omit<ActiveVibe, 'setAt'> | null): Promise<void> => {
    if (!user) return
    // Optimistic local update so the UI re-renders without waiting for a
    // profile refetch (AuthContext does not listen to Firestore).
    setLocalVibe(next ? { ...next, setAt: new Date() } : null)
    const ref = doc(db, 'users', user.uid)
    try {
      if (next === null) {
        await updateDoc(ref, { activeVibe: null })
        return
      }
      await updateDoc(ref, {
        activeVibe: {
          id: next.id,
          title: next.title,
          subtitle: next.subtitle ?? null,
          descriptors: next.descriptors,
          presetId: next.presetId,
          setAt: serverTimestamp(),
        },
      })
    } catch (err) {
      setLocalVibe(profileVibe)
      throw err
    }
  }

  const setActiveVibe = async (vibe: Omit<ActiveVibe, 'setAt'>): Promise<void> => {
    if (!user) return
    await writeVibe(vibe)
  }

  const addDescriptor = async (descriptor: string): Promise<void> => {
    if (!user || !activeVibe) return
    const trimmed = descriptor.trim()
    if (!trimmed) return
    const lower = trimmed.toLowerCase()
    if (activeVibe.descriptors.some((d) => d.toLowerCase() === lower)) return
    if (activeVibe.descriptors.length >= MAX_DESCRIPTORS) return
    const nextDescriptors = [...activeVibe.descriptors, trimmed]
    await writeVibe({
      id: activeVibe.id,
      title: activeVibe.title,
      subtitle: activeVibe.subtitle,
      descriptors: nextDescriptors,
      presetId: activeVibe.presetId,
    })
  }

  const removeDescriptor = async (descriptor: string): Promise<void> => {
    if (!user || !activeVibe) return
    const lower = descriptor.trim().toLowerCase()
    const nextDescriptors = activeVibe.descriptors.filter(
      (d) => d.toLowerCase() !== lower,
    )
    if (nextDescriptors.length === activeVibe.descriptors.length) return
    await writeVibe({
      id: activeVibe.id,
      title: activeVibe.title,
      subtitle: activeVibe.subtitle,
      descriptors: nextDescriptors,
      presetId: activeVibe.presetId,
    })
  }

  const clearVibe = async (): Promise<void> => {
    if (!user) return
    await writeVibe(null)
  }

  return {
    activeVibe,
    loading,
    setActiveVibe,
    addDescriptor,
    removeDescriptor,
    clearVibe,
  }
}
