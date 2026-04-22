import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  query,
  updateDoc,
  getDocs,
  getDoc,
  setDoc,
  where,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import type { Note, NoteFolder } from '@/types/notes'

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB

// C1 cap: Firestore doc limit is ~1MB. Keep searchableText well under that so
// the rest of the note (content, cover URL, collaborators) has headroom.
// Overflow to `notes/{id}/searchChunks` is a deferred follow-up.
export const SEARCHABLE_TEXT_MAX_CHARS = 500 * 1024

/**
 * Flatten a Tiptap-JSON note body into a single plain-text blob suitable for
 * client-side `includes()` search. Whitespace is collapsed and the result is
 * capped at SEARCHABLE_TEXT_MAX_CHARS to protect the 1MB Firestore doc limit.
 */
export function deriveSearchableText(contentJson: string | undefined | null): string {
  if (!contentJson) return ''
  let doc: unknown
  try {
    doc = JSON.parse(contentJson)
  } catch {
    return ''
  }

  const collect = (node: any): string => {
    if (!node) return ''
    if (typeof node === 'string') return node
    if (node.type === 'text' && typeof node.text === 'string') return node.text
    if (Array.isArray(node.content)) return node.content.map(collect).join(' ')
    if (node.content) return collect(node.content)
    return ''
  }

  const text = collect(doc).replace(/\s+/g, ' ').trim()
  return text.length > SEARCHABLE_TEXT_MAX_CHARS
    ? text.slice(0, SEARCHABLE_TEXT_MAX_CHARS)
    : text
}

// ── Collection / doc helpers ─────────────────────────────────────────────────

function notesCol() {
  return collection(db, 'notes')
}

function noteDoc(noteId: string) {
  return doc(db, 'notes', noteId)
}

function foldersCol() {
  return collection(db, 'noteFolders')
}

function folderDoc(folderId: string) {
  return doc(db, 'noteFolders', folderId)
}

// ── Notes CRUD ──────────────────────────────────────────────────────────────

export async function createNote(
  userId: string,
  userEmail: string,
  data?: Partial<Note>
): Promise<Note> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()

  const content = data?.content ?? '{"type":"doc","content":[{"type":"paragraph"}]}'

  const note: Record<string, unknown> = {
    id,
    title: data?.title ?? 'Untitled',
    icon: data?.icon ?? null,
    coverImage: data?.coverImage ?? null,
    content,
    searchableText: deriveSearchableText(content),
    folderId: data?.folderId ?? null,
    tags: data?.tags ?? [],
    category: data?.category ?? 'general',
    color: data?.color ?? null,
    favorited: data?.favorited ?? false,
    ownerId: userId,
    ownerEmail: userEmail,
    collaborators: data?.collaborators ?? [],
    collaboratorEmails: data?.collaboratorEmails ?? [],
    publicAccess: data?.publicAccess ?? {
      enabled: false,
      permission: 'view',
      shareId: '',
      password: null,
      expiresAt: null,
      createdAt: now,
    },
    publicShareId: data?.publicShareId ?? null,
    createdAt: now,
    updatedAt: now,
    lastEditedBy: userId,
    wordCount: data?.wordCount ?? 0,
    isDeleted: false,
    deletedAt: null,
    sourceThreadId: data?.sourceThreadId ?? null,
    sourceType: data?.sourceType ?? 'manual',
    templateId: data?.templateId ?? null,
  }

  await setDoc(noteDoc(id), note)
  return note as unknown as Note
}

export async function updateNote(
  noteId: string,
  updates: Partial<Note>
): Promise<void> {
  // Derive searchableText whenever content changes so body search (C1) stays
  // in sync without every caller having to remember to compute it.
  const derived: Partial<Note> =
    updates.content !== undefined
      ? { ...updates, searchableText: deriveSearchableText(updates.content) }
      : updates

  await updateDoc(noteDoc(noteId), {
    ...derived,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteNote(noteId: string): Promise<void> {
  // Soft-delete the note document
  await updateDoc(noteDoc(noteId), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  // Clean up Firebase Storage images in the background
  deleteStorageFolder(`notes/${noteId}/images`).catch(() => {
    // Non-critical: storage cleanup is best-effort
  })
}

/** Delete all documents in a subcollection */
async function deleteSubcollection(parentPath: string, subcollectionName: string): Promise<void> {
  const subCol = collection(db, parentPath, subcollectionName)
  const snapshot = await getDocs(subCol)
  const deletes = snapshot.docs.map(d => deleteDoc(d.ref))
  await Promise.all(deletes)
}

/** Delete all files in a Firebase Storage folder */
async function deleteStorageFolder(folderPath: string): Promise<void> {
  try {
    const folderRef = ref(storage, folderPath)
    const result = await listAll(folderRef)
    const deletes = result.items.map(item => deleteObject(item))
    await Promise.all(deletes)
  } catch (err) {
    // Folder may not exist — that's fine
    console.error('[notesService] deleteStorageFolder failed:', err)
  }
}

export async function permanentDeleteNote(noteId: string): Promise<void> {
  // Clean up subcollections and storage before deleting the document
  await Promise.all([
    deleteSubcollection(`notes/${noteId}`, 'comments'),
    deleteStorageFolder(`notes/${noteId}/images`),
  ])
  await deleteDoc(noteDoc(noteId))
}

export async function restoreNote(noteId: string): Promise<void> {
  await updateDoc(noteDoc(noteId), {
    isDeleted: false,
    deletedAt: null,
    updatedAt: serverTimestamp(),
  })
}

export async function getNote(noteId: string): Promise<Note | null> {
  const snap = await getDoc(noteDoc(noteId))
  if (!snap.exists()) return null
  return snap.data() as Note
}

// ── Real-time listeners ─────────────────────────────────────────────────────

export function subscribeToNotes(
  userId: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  // Single where clause to avoid composite index requirement; filter + sort client-side
  const q = query(
    notesCol(),
    where('ownerId', '==', userId)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const notes = snapshot.docs
        .map(d => ({ ...d.data(), id: d.id } as Note))
        .filter(n => !n.isDeleted)
        .sort((a, b) => {
          const aMs = (a.updatedAt as any)?.toMillis?.() ?? 0
          const bMs = (b.updatedAt as any)?.toMillis?.() ?? 0
          return bMs - aMs
        })
      callback(notes)
    },
    (err) => {
      console.error('[subscribeToNotes] Firestore listener error:', err.message, err.code)
    }
  )
}

export function subscribeToTrashedNotes(
  userId: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  const q = query(
    notesCol(),
    where('ownerId', '==', userId)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const notes = snapshot.docs
        .map(d => ({ ...d.data(), id: d.id } as Note))
        .filter(n => n.isDeleted)
        .sort((a, b) => {
          const aMs = (a.deletedAt as any)?.toMillis?.() ?? 0
          const bMs = (b.deletedAt as any)?.toMillis?.() ?? 0
          return bMs - aMs
        })
      callback(notes)
    },
    (err) => {
      console.error('[subscribeToTrashedNotes] Firestore listener error:', err.message, err.code)
    }
  )
}

export function subscribeToSharedNotes(
  userEmail: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  const q = query(
    notesCol(),
    where('collaboratorEmails', 'array-contains', userEmail.trim().toLowerCase())
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const notes = snapshot.docs
        .map(d => ({ ...d.data(), id: d.id } as Note))
        .filter(n => !n.isDeleted)
      callback(notes)
    },
    (err) => console.error('[subscribeToSharedNotes] Firestore listener error:', err.message, err.code)
  )
}

export function subscribeToNote(
  noteId: string,
  callback: (note: Note | null) => void
): Unsubscribe {
  return onSnapshot(
    noteDoc(noteId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null)
        return
      }
      callback({ ...snapshot.data(), id: snapshot.id } as Note)
    },
    (err) => console.error('[subscribeToNote] Firestore listener error:', err.message, err.code)
  )
}

// ── Folders ─────────────────────────────────────────────────────────────────

export async function createFolder(
  userId: string,
  name: string,
  icon?: string
): Promise<NoteFolder> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()

  const folder: Record<string, unknown> = {
    id,
    name,
    icon: icon ?? null,
    ownerId: userId,
    order: Date.now(),
    createdAt: now,
    updatedAt: now,
  }

  await setDoc(folderDoc(id), folder)
  return folder as unknown as NoteFolder
}

export async function updateFolder(
  folderId: string,
  updates: Partial<NoteFolder>
): Promise<void> {
  await updateDoc(folderDoc(folderId), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteFolder(folderId: string): Promise<void> {
  await deleteDoc(folderDoc(folderId))
}

export function subscribeToFolders(
  userId: string,
  callback: (folders: NoteFolder[]) => void
): Unsubscribe {
  const q = query(
    foldersCol(),
    where('ownerId', '==', userId)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const folders = snapshot.docs
        .map(d => ({ ...d.data(), id: d.id } as NoteFolder))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      callback(folders)
    },
    (err) => console.error('[subscribeToFolders]', err.message)
  )
}

// ── Move note ───────────────────────────────────────────────────────────────

export async function moveNoteToFolder(
  noteId: string,
  folderId: string | null
): Promise<void> {
  await updateDoc(noteDoc(noteId), {
    folderId,
    updatedAt: serverTimestamp(),
  })
}

// ── Image upload ────────────────────────────────────────────────────────────

export async function uploadNoteImage(
  noteId: string,
  file: File
): Promise<string> {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed')
  }

  // Validate file size
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Image must be smaller than 10 MB')
  }

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `notes/${noteId}/images/${crypto.randomUUID()}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export async function deleteNoteImage(imageUrl: string): Promise<void> {
  try {
    // Extract the storage path from the download URL
    // Firebase Storage URLs contain the path encoded after '/o/'
    const url = new URL(imageUrl)
    const pathMatch = url.pathname.match(/\/o\/(.+)/)
    if (pathMatch) {
      const storagePath = decodeURIComponent(pathMatch[1])
      const storageRef = ref(storage, storagePath)
      await deleteObject(storageRef)
    }
  } catch (err) {
    console.error('[notesService] deleteNoteImage failed:', err)
  }
}
