import {
  doc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
  collection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Note, Collaborator, NotePermission } from '@/types/notes'

// ── Helpers ─────────────────────────────────────────────────────────────────

function noteDoc(noteId: string) {
  return doc(db, 'notes', noteId)
}

function notesCol() {
  return collection(db, 'notes')
}

// ── Collaborator management ─────────────────────────────────────────────────

export async function addCollaborator(
  noteId: string,
  collaborator: Omit<Collaborator, 'addedAt'>
): Promise<void> {
  const ref = noteDoc(noteId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const note = snap.data() as Note
  const existing = note.collaborators ?? []
  const alreadyAdded = existing.some(c => c.userId === collaborator.userId)
  if (alreadyAdded) {
    throw new Error('This person already has access')
  }

  const newCollaborator = {
    ...collaborator,
    addedAt: serverTimestamp(),
  }

  await updateDoc(ref, {
    collaborators: [...existing, newCollaborator],
    collaboratorEmails: arrayUnion(collaborator.email),
    updatedAt: serverTimestamp(),
  })
}

export async function removeCollaborator(
  noteId: string,
  userId: string
): Promise<void> {
  const ref = noteDoc(noteId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const note = snap.data() as Note
  const existing = note.collaborators ?? []
  const toRemove = existing.find(c => c.userId === userId)
  if (!toRemove) return

  const updated = existing.filter(c => c.userId !== userId)

  await updateDoc(ref, {
    collaborators: updated,
    collaboratorEmails: arrayRemove(toRemove.email),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCollaboratorPermission(
  noteId: string,
  userId: string,
  permission: NotePermission
): Promise<void> {
  const ref = noteDoc(noteId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const note = snap.data() as Note
  const updated = (note.collaborators ?? []).map(c =>
    c.userId === userId ? { ...c, permission } : c
  )

  await updateDoc(ref, {
    collaborators: updated,
    updatedAt: serverTimestamp(),
  })
}

// ── Public link management ──────────────────────────────────────────────────

export async function enablePublicLink(
  noteId: string,
  permission: 'view' | 'comment' | 'edit'
): Promise<string> {
  const shareId = crypto.randomUUID()

  await updateDoc(noteDoc(noteId), {
    publicAccess: {
      enabled: true,
      permission,
      shareId,
      password: null,
      expiresAt: null,
      createdAt: serverTimestamp(),
    },
    publicShareId: shareId,
    updatedAt: serverTimestamp(),
  })

  return shareId
}

export async function disablePublicLink(noteId: string): Promise<void> {
  await updateDoc(noteDoc(noteId), {
    publicAccess: {
      enabled: false,
      permission: 'view',
      shareId: '',
      password: null,
      expiresAt: null,
      createdAt: serverTimestamp(),
    },
    publicShareId: null,
    updatedAt: serverTimestamp(),
  })
}

export async function getNoteByShareId(shareId: string): Promise<Note | null> {
  try {
    const q = query(
      notesCol(),
      where('publicShareId', '==', shareId),
      where('publicAccess.enabled', '==', true)
    )
    const snapshot = await getDocs(q)
    if (snapshot.empty) return null

    const d = snapshot.docs[0]
    const note = { ...d.data(), id: d.id } as Note

    // Double-check publicAccess.enabled in case the compound query didn't filter correctly
    if (!note.publicAccess?.enabled) return null

    return note
  } catch (err) {
    console.error('[notesSharingService] getNoteByShareId failed:', err)
    return null
  }
}
