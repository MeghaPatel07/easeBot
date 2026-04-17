import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { sendEmailNotification, buildNoteInviteEmail } from './emailService'

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

function notesCol() {
  return collection(db, 'notes')
}

function noteRef(noteId: string) {
  return doc(db, 'notes', noteId)
}

function commentsCol(noteId: string) {
  return collection(db, 'notes', noteId, 'comments')
}

function commentRef(noteId: string, commentId: string) {
  return doc(db, 'notes', noteId, 'comments', commentId)
}

function foldersCol() {
  return collection(db, 'noteFolders')
}

function folderRef(folderId: string) {
  return doc(db, 'noteFolders', folderId)
}

// ---------------------------------------------------------------------------
// Notes CRUD
// ---------------------------------------------------------------------------

export async function createNote(
  userId: string,
  userEmail: string,
  data?: any,
): Promise<any> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()
  const noteData: any = {
    id,
    title: data?.title ?? '',
    icon: data?.icon ?? null,
    coverImage: data?.coverImage ?? null,
    content: data?.content ?? '[]',
    folderId: data?.folderId ?? null,
    tags: data?.tags ?? [],
    category: data?.category ?? null,
    color: data?.color ?? null,
    favorited: false,
    ownerId: userId,
    ownerEmail: userEmail,
    collaborators: [],
    collaboratorEmails: [],
    publicAccess: { enabled: false, permission: 'view', shareId: null },
    publicShareId: null,
    createdAt: now,
    updatedAt: now,
    lastEditedBy: userEmail,
    wordCount: data?.wordCount ?? 0,
    isDeleted: false,
    deletedAt: null,
    sourceThreadId: data?.sourceThreadId ?? null,
    sourceType: data?.sourceType ?? null,
    templateId: data?.templateId ?? null,
  }
  await setDoc(noteRef(id), noteData)
  return { ...noteData, createdAt: null, updatedAt: null }
}

export async function getNote(noteId: string): Promise<any> {
  const snap = await getDoc(noteRef(noteId))
  if (!snap.exists()) throw new Error('Note not found')
  return snap.data()
}

export async function updateNote(noteId: string, updates: any): Promise<void> {
  await updateDoc(noteRef(noteId), { ...updates, updatedAt: serverTimestamp() })
}

export async function softDeleteNote(noteId: string): Promise<void> {
  await updateDoc(noteRef(noteId), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function restoreNote(noteId: string): Promise<void> {
  await updateDoc(noteRef(noteId), {
    isDeleted: false,
    deletedAt: null,
    updatedAt: serverTimestamp(),
  })
}

export async function permanentDeleteNote(noteId: string): Promise<void> {
  // Delete comments subcollection first
  const commentsSnap = await getDocs(commentsCol(noteId))
  const deletePromises = commentsSnap.docs.map(d => deleteDoc(d.ref))
  await Promise.all(deletePromises)
  await deleteDoc(noteRef(noteId))
}

export async function getUserNotes(userId: string): Promise<any[]> {
  const q = query(
    notesCol(),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc'),
  )
  const snap = await getDocs(q)
  const owned = snap.docs.map(d => d.data())

  // Also fetch notes where user is a collaborator
  const collabQ = query(
    notesCol(),
    where('collaboratorEmails', 'array-contains', userId),
  )
  const collabSnap = await getDocs(collabQ)
  const collaborated = collabSnap.docs.map(d => d.data())

  // Merge and deduplicate
  const noteMap = new Map<string, any>()
  for (const n of owned) noteMap.set(n.id, n)
  for (const n of collaborated) {
    if (!noteMap.has(n.id)) noteMap.set(n.id, n)
  }
  return Array.from(noteMap.values())
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export async function addCollaborator(
  noteId: string,
  collaborator: { userId: string; email: string; name?: string; permission: string },
  inviter?: { email: string; name?: string },
): Promise<void> {
  const note = await getNote(noteId)
  const collaborators = note.collaborators || []
  const collaboratorEmails = note.collaboratorEmails || []

  // Avoid duplicates (match by email — userId is often the email itself for invitees without an account)
  const normalizedEmail = collaborator.email.trim().toLowerCase()
  const exists = collaborators.find(
    (c: any) =>
      c.userId === collaborator.userId ||
      (c.email && c.email.toLowerCase() === normalizedEmail),
  )
  if (exists) throw new Error('This person already has access')

  collaborators.push({
    userId: collaborator.userId,
    email: normalizedEmail,
    name: collaborator.name || normalizedEmail.split('@')[0],
    permission: collaborator.permission,
    addedAt: new Date().toISOString(),
  })
  if (!collaboratorEmails.includes(normalizedEmail)) {
    collaboratorEmails.push(normalizedEmail)
  }

  await updateDoc(noteRef(noteId), {
    collaborators,
    collaboratorEmails,
    updatedAt: serverTimestamp(),
  })
}

export async function sendCollaboratorInvites(
  noteId: string,
  emails: string[],
  inviter: { email: string; name?: string },
): Promise<{ sent: string[]; skipped: string[] }> {
  const note = await getNote(noteId)
  const collaborators = (note.collaborators || []) as Array<{
    email: string
    name?: string
    permission: string
  }>

  // Ensure a public share link exists so the email contains a direct note link
  let shareId: string | null = note.publicShareId || null
  if (!shareId) {
    shareId = await enablePublicLink(noteId, 'view')
  }

  const sent: string[] = []
  const skipped: string[] = []

  for (const rawEmail of emails) {
    const email = rawEmail.trim().toLowerCase()
    const collab = collaborators.find(c => c.email?.toLowerCase() === email)
    if (!collab) {
      skipped.push(rawEmail)
      continue
    }
    try {
      const { subject, html, text } = buildNoteInviteEmail({
        inviterName: inviter.name || inviter.email || note.ownerEmail || 'Someone',
        inviterEmail: inviter.email || note.ownerEmail || '',
        recipientName: collab.name || collab.email.split('@')[0],
        noteTitle: note.title || 'Untitled note',
        permission: collab.permission,
        shareId,
      })
      await sendEmailNotification({ to: collab.email, subject, html, text })
      sent.push(collab.email)
    } catch (err) {
      console.error('[notesService] sendCollaboratorInvites: failed for', collab.email, err)
      skipped.push(collab.email)
    }
  }

  return { sent, skipped }
}

export async function removeCollaborator(noteId: string, userId: string): Promise<void> {
  const note = await getNote(noteId)
  const collaborators = (note.collaborators || []).filter((c: any) => c.userId !== userId)
  const removed = (note.collaborators || []).find((c: any) => c.userId === userId)
  const collaboratorEmails = (note.collaboratorEmails || []).filter(
    (e: string) => e !== removed?.email,
  )

  await updateDoc(noteRef(noteId), {
    collaborators,
    collaboratorEmails,
    updatedAt: serverTimestamp(),
  })
}

export async function updateCollaboratorPermission(
  noteId: string,
  userId: string,
  permission: string,
): Promise<void> {
  const note = await getNote(noteId)
  const collaborators = (note.collaborators || []).map((c: any) =>
    c.userId === userId ? { ...c, permission } : c,
  )
  await updateDoc(noteRef(noteId), { collaborators, updatedAt: serverTimestamp() })
}

export async function enablePublicLink(noteId: string, permission: string): Promise<string> {
  const shareId = crypto.randomUUID()
  await updateDoc(noteRef(noteId), {
    publicAccess: { enabled: true, permission, shareId },
    publicShareId: shareId,
    updatedAt: serverTimestamp(),
  })
  return shareId
}

export async function disablePublicLink(noteId: string): Promise<void> {
  await updateDoc(noteRef(noteId), {
    publicAccess: { enabled: false, permission: 'view', shareId: null },
    publicShareId: null,
    updatedAt: serverTimestamp(),
  })
}

export async function getNoteByShareId(shareId: string): Promise<any> {
  const q = query(notesCol(), where('publicShareId', '==', shareId))
  const snap = await getDocs(q)
  if (snap.empty) throw new Error('Shared note not found')
  return snap.docs[0].data()
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(noteId: string, comment: any): Promise<string> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()
  const commentData = {
    id,
    noteId,
    content: comment.content,
    authorId: comment.authorId,
    authorEmail: comment.authorEmail,
    authorName: comment.authorName || comment.authorEmail,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    blockId: comment.blockId || null,
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(commentRef(noteId, id), commentData)
  return id
}

export async function getComments(noteId: string): Promise<any[]> {
  const snap = await getDocs(commentsCol(noteId))
  return snap.docs.map(d => d.data())
}

export async function updateComment(
  noteId: string,
  commentId: string,
  content: string,
): Promise<void> {
  await updateDoc(commentRef(noteId, commentId), {
    content,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteComment(noteId: string, commentId: string): Promise<void> {
  await deleteDoc(commentRef(noteId, commentId))
}

export async function resolveComment(
  noteId: string,
  commentId: string,
  resolvedBy: string,
): Promise<void> {
  await updateDoc(commentRef(noteId, commentId), {
    resolved: true,
    resolvedBy,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolder(
  userId: string,
  name: string,
  icon?: string,
): Promise<any> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()
  const folderData: any = {
    id,
    name,
    icon: icon || null,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(folderRef(id), folderData)
  return { ...folderData, createdAt: null, updatedAt: null }
}

export async function getUserFolders(userId: string): Promise<any[]> {
  const q = query(foldersCol(), where('ownerId', '==', userId))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data())
}

export async function updateFolder(folderId: string, updates: any): Promise<void> {
  await updateDoc(folderRef(folderId), { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteFolder(folderId: string): Promise<void> {
  await deleteDoc(folderRef(folderId))
}

export async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
  await updateDoc(noteRef(noteId), { folderId, updatedAt: serverTimestamp() })
}

// ---------------------------------------------------------------------------
// Access check
// ---------------------------------------------------------------------------

export async function checkNoteAccess(
  noteId: string,
  userId: string,
): Promise<{ hasAccess: boolean; permission: string }> {
  const note = await getNote(noteId)

  // Owner has full access
  if (note.ownerId === userId) {
    return { hasAccess: true, permission: 'owner' }
  }

  // Check collaborators
  const collab = (note.collaborators || []).find((c: any) => c.userId === userId)
  if (collab) {
    return { hasAccess: true, permission: collab.permission }
  }

  // Check public access
  if (note.publicAccess?.enabled) {
    return { hasAccess: true, permission: note.publicAccess.permission }
  }

  return { hasAccess: false, permission: 'none' }
}
