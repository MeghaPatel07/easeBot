import { useEffect, useState } from 'react'
import { subscribeToNotes } from '@/services/notesService'
import { subscribeToChecklists } from '@/services/checklistService'
import { subscribeToTimelineEvents } from '@/services/timelineEventsService'
import { subscribeToReminders } from '@/services/reminderService'
import { getUserImages } from '@/services/galleryService'
import type { KnownArtifactIds } from '@/components/chat/MessageAttachmentChips'

// ─────────────────────────────────────────────────────────────────────────────
// useKnownArtifactIds — returns live Sets of ids the user currently owns for
// each artifact kind (notes, checklists, timeline events, gallery images).
// Used by ChatMessages to decide whether an attachment chip in the message
// history should route to the source artifact or show "Deleted artifact".
//
// Notes / checklists / timeline events come from Firestore live listeners so
// deletions are reflected immediately. Gallery images are fetched once on
// mount (galleryService has no subscribe helper); the set is refreshed when
// the userId changes. Stale reads are acceptable for this UX — worst case,
// a chip briefly shows as active for an image deleted in the current session.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_IDS: KnownArtifactIds = {
  notes: new Set<string>(),
  checklists: new Set<string>(),
  timelines: new Set<string>(),
  images: new Set<string>(),
  reminders: new Set<string>(),
}

export function useKnownArtifactIds(userId: string | null | undefined): KnownArtifactIds {
  const [notes, setNotes] = useState<Set<string>>(new Set())
  const [checklists, setChecklists] = useState<Set<string>>(new Set())
  const [timelines, setTimelines] = useState<Set<string>>(new Set())
  const [images, setImages] = useState<Set<string>>(new Set())
  const [reminders, setReminders] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) { setNotes(new Set()); return }
    const unsub = subscribeToNotes(userId, (arr) => {
      setNotes(new Set(arr.map((n) => n.id)))
    })
    return () => { try { unsub?.() } catch { /* noop */ } }
  }, [userId])

  useEffect(() => {
    if (!userId) { setChecklists(new Set()); return }
    const unsub = subscribeToChecklists(userId, (arr) => {
      setChecklists(new Set(arr.map((c) => c.id)))
    })
    return () => { try { unsub?.() } catch { /* noop */ } }
  }, [userId])

  useEffect(() => {
    if (!userId) { setTimelines(new Set()); return }
    const unsub = subscribeToTimelineEvents(userId, (arr) => {
      setTimelines(new Set(arr.map((e) => e.id)))
    })
    return () => { try { unsub?.() } catch { /* noop */ } }
  }, [userId])

  useEffect(() => {
    if (!userId) { setImages(new Set()); return }
    let cancelled = false
    getUserImages(userId, { maxResults: 500 })
      .then((arr) => { if (!cancelled) setImages(new Set(arr.map((i) => i.id))) })
      .catch(() => { /* noop — leave empty, chips will render as deleted */ })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!userId) { setReminders(new Set()); return }
    const unsub = subscribeToReminders(userId, (arr) => {
      setReminders(new Set(arr.map((r) => r.id)))
    })
    return () => { try { unsub?.() } catch { /* noop */ } }
  }, [userId])

  if (!userId) return EMPTY_IDS
  return { notes, checklists, timelines, images, reminders }
}
