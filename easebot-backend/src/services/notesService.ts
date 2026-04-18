import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { sendEmailNotification, buildNoteInviteEmail } from './emailService'
import { parseMarkdownBlocks } from '../utils/noteContent'

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

// Normalize for fuzzy note-title matching — lowercase, collapse whitespace.
function normNoteTitle(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Resolve a note the user owns (or collaborates on) by id OR by title.
 * Mirrors resolveChecklist: exact id → exact title → startsWith → contains →
 * fallback to the most recently updated note. Throws on ambiguity so the LLM
 * can self-correct.
 */
export async function resolveNote(
  userId: string,
  idOrTitle: string | null | undefined,
): Promise<{ id: string; data: any } | null> {
  const q = (idOrTitle || '').trim()
  if (q) {
    // Fast path — exact id lookup.
    const byId = await getDoc(noteRef(q))
    if (byId.exists()) {
      const d = byId.data() as any
      if (!d.isDeleted && d.ownerId === userId) return { id: byId.id, data: d }
    }
  }

  // Use an indexless lookup here (no orderBy) — we sort in-memory below
  // anyway. Avoids depending on the (ownerId ASC, updatedAt DESC) composite
  // index that the GET /api/notes list endpoint needs, so the tool works
  // even if the index is still building.
  const ownedSnap = await getDocs(query(notesCol(), where('ownerId', '==', userId)))
  const notes = ownedSnap.docs.map((d) => d.data())
  const live = notes.filter((n: any) => !n.isDeleted)
  if (live.length === 0) return null

  if (q) {
    const normQ = normNoteTitle(q)
    let exact: { id: string; data: any } | null = null
    const startsWith: { id: string; data: any }[] = []
    const contains: { id: string; data: any }[] = []
    for (const n of live) {
      const t = normNoteTitle(n.title || '')
      if (t === normQ) { exact = { id: n.id, data: n }; break }
      if (t.startsWith(normQ)) startsWith.push({ id: n.id, data: n })
      if (t.includes(normQ)) contains.push({ id: n.id, data: n })
    }
    if (exact) return exact
    if (startsWith.length === 1) return startsWith[0]
    if (startsWith.length > 1) {
      throw new Error(`Ambiguous note: multiple notes match '${q}'. Please specify by full title or id.`)
    }
    if (contains.length === 1) return contains[0]
    if (contains.length > 1) {
      throw new Error(`Ambiguous note: multiple notes match '${q}'. Please specify by full title or id.`)
    }
  }

  // Fallback — most recently updated note. Firestore serverTimestamps may be
  // absent on just-created docs, so compare defensively.
  let latest: { id: string; data: any; at: number } | null = null
  for (const n of live) {
    const ts = n.updatedAt?.toMillis?.() ?? n.createdAt?.toMillis?.() ?? 0
    if (!latest || ts > latest.at) latest = { id: n.id, data: n, at: ts }
  }
  return latest ? { id: latest.id, data: latest.data } : null
}

/**
 * Append prose and/or images to an existing note's Tiptap content. Parses
 * the stored content JSON, merges in new nodes, writes back via updateDoc.
 * Falls back to a fresh doc if the existing content isn't a parseable Tiptap
 * doc (should be rare — all create/update paths write the canonical shape).
 */
export async function appendToNote(
  userId: string,
  idOrTitle: string,
  append: { body?: string | null; imageUrls?: string[] | null },
): Promise<{ id: string; title: string; appendedImages: number }> {
  const resolved = await resolveNote(userId, idOrTitle)
  if (!resolved) throw new Error(`Note not found: "${idOrTitle}"`)

  const images = (append.imageUrls ?? []).filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  )
  const bodyText = (append.body ?? '').toString()
  if (!bodyText.trim() && images.length === 0) {
    throw new Error('Nothing to append — provide body text or image_urls.')
  }

  let doc: { type: string; content: any[] } = { type: 'doc', content: [] }
  try {
    const parsed = JSON.parse(resolved.data.content || '{}')
    if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
      doc = parsed
    }
  } catch {
    // Fall through — doc stays as blank { type: 'doc', content: [] }; we'll
    // still prepend the existing raw content as plain text so nothing is lost.
    const rawLegacy = (resolved.data.content ?? '').toString()
    if (rawLegacy.trim()) {
      doc.content.push({ type: 'paragraph', content: [{ type: 'text', text: rawLegacy }] })
    }
  }

  // Append blocks derived from the new body — markdown-aware so headings,
  // bold/italic, lists, etc. render as real Tiptap nodes rather than raw text.
  const trimmed = bodyText.trim()
  if (trimmed) {
    const blocks = parseMarkdownBlocks(bodyText)
    for (const b of blocks) doc.content.push(b)
  }

  for (const src of images) {
    doc.content.push({ type: 'image', attrs: { src } })
  }

  const serialized = JSON.stringify(doc)
  console.log('[notesService.appendToNote] writing', {
    noteId: resolved.id,
    title: resolved.data.title,
    nodesBefore: Array.isArray(JSON.parse(resolved.data.content || '{"content":[]}')?.content)
      ? JSON.parse(resolved.data.content).content.length
      : null,
    nodesAfter: doc.content.length,
    appendedImages: images.length,
    contentLen: serialized.length,
  })
  try {
    await updateDoc(noteRef(resolved.id), {
      content: serialized,
      updatedAt: serverTimestamp(),
      lastEditedBy: resolved.data.ownerEmail || null,
    })
  } catch (err) {
    console.error('[notesService.appendToNote] Firestore updateDoc FAILED', err)
    throw err
  }

  return { id: resolved.id, title: resolved.data.title || 'Note', appendedImages: images.length }
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
