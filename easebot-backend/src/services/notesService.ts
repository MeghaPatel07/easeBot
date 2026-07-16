import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin'
import { sendEmailNotification, buildNoteInviteEmail } from './emailService'
import { parseMarkdownBlocks, plainTextToEditorContent } from '../utils/noteContent'

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

function notesCol() {
  return adminDb.collection('notes')
}

function noteRef(noteId: string) {
  return adminDb.doc(`notes/${noteId}`)
}

function commentsCol(noteId: string) {
  return adminDb.collection(`notes/${noteId}/comments`)
}

function commentRef(noteId: string, commentId: string) {
  return adminDb.doc(`notes/${noteId}/comments/${commentId}`)
}

function foldersCol() {
  return adminDb.collection('noteFolders')
}

function folderRef(folderId: string) {
  return adminDb.doc(`noteFolders/${folderId}`)
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
  const now = FieldValue.serverTimestamp()
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
  await noteRef(id).set(noteData)
  return { ...noteData, createdAt: null, updatedAt: null }
}

export async function getNote(noteId: string): Promise<any> {
  const snap = await noteRef(noteId).get()
  if (!snap.exists) throw new Error('Note not found')
  return snap.data()
}

export async function updateNote(noteId: string, updates: any): Promise<void> {
  await noteRef(noteId).update({ ...updates, updatedAt: FieldValue.serverTimestamp() })
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
    const byId = await noteRef(q).get()
    if (byId.exists) {
      const d = byId.data() as any
      if (!d.isDeleted && d.ownerId === userId) return { id: byId.id, data: d }
    }
  }

  // Use an indexless lookup here (no orderBy) — we sort in-memory below
  // anyway. Avoids depending on the (ownerId ASC, updatedAt DESC) composite
  // index that the GET /api/notes list endpoint needs, so the tool works
  // even if the index is still building.
  const ownedSnap = await notesCol().where('ownerId', '==', userId).get()
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
    await noteRef(resolved.id).update({
      content: serialized,
      updatedAt: FieldValue.serverTimestamp(),
      lastEditedBy: resolved.data.ownerEmail || null,
    })
  } catch (err) {
    console.error('[notesService.appendToNote] Firestore updateDoc FAILED', err)
    throw err
  }

  return { id: resolved.id, title: resolved.data.title || 'Note', appendedImages: images.length }
}

/**
 * Replace an existing note's title and/or body content. Distinct from
 * appendToNote, which only ever grows the content array — this is for
 * correcting/rewriting content that's already there (e.g. "fix the third
 * point", "reword this note"). Whichever of title/body is omitted is left
 * untouched; at least one must be provided.
 */
export async function replaceNoteContent(
  userId: string,
  idOrTitle: string,
  updates: { title?: string | null; body?: string | null; imageUrls?: string[] | null },
): Promise<{ id: string; title: string }> {
  const resolved = await resolveNote(userId, idOrTitle)
  if (!resolved) throw new Error(`Note not found: "${idOrTitle}"`)

  const hasTitle = typeof updates.title === 'string' && updates.title.trim().length > 0
  const hasBody = typeof updates.body === 'string'
  const images = (updates.imageUrls ?? []).filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  )
  if (!hasTitle && !hasBody && images.length === 0) {
    throw new Error('Nothing to update — provide a new title and/or body.')
  }

  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    lastEditedBy: resolved.data.ownerEmail || null,
  }
  if (hasTitle) patch.title = updates.title!.trim()
  if (hasBody || images.length > 0) {
    patch.content = plainTextToEditorContent(updates.body ?? '', images)
  }

  await noteRef(resolved.id).update(patch)
  return { id: resolved.id, title: hasTitle ? (patch.title as string) : (resolved.data.title || 'Note') }
}

export async function softDeleteNote(noteId: string): Promise<void> {
  await noteRef(noteId).update({
    isDeleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function restoreNote(noteId: string): Promise<void> {
  await noteRef(noteId).update({
    isDeleted: false,
    deletedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function permanentDeleteNote(noteId: string): Promise<void> {
  // Delete comments subcollection first
  const commentsSnap = await commentsCol(noteId).get()
  const deletePromises = commentsSnap.docs.map(d => d.ref.delete())
  await Promise.all(deletePromises)
  await noteRef(noteId).delete()
}

export async function getUserNotes(userId: string): Promise<any[]> {
  const snap = await notesCol()
    .where('ownerId', '==', userId)
    .orderBy('updatedAt', 'desc')
    .get()
  const owned = snap.docs.map(d => d.data())

  // Also fetch notes where user is a collaborator
  const collabSnap = await notesCol()
    .where('collaboratorEmails', 'array-contains', userId)
    .get()
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

  await noteRef(noteId).update({
    collaborators,
    collaboratorEmails,
    updatedAt: FieldValue.serverTimestamp(),
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

  await noteRef(noteId).update({
    collaborators,
    collaboratorEmails,
    updatedAt: FieldValue.serverTimestamp(),
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
  await noteRef(noteId).update({ collaborators, updatedAt: FieldValue.serverTimestamp() })
}

export async function enablePublicLink(noteId: string, permission: string): Promise<string> {
  const shareId = crypto.randomUUID()
  await noteRef(noteId).update({
    publicAccess: { enabled: true, permission, shareId },
    publicShareId: shareId,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return shareId
}

export async function disablePublicLink(noteId: string): Promise<void> {
  await noteRef(noteId).update({
    publicAccess: { enabled: false, permission: 'view', shareId: null },
    publicShareId: null,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function getNoteByShareId(shareId: string): Promise<any> {
  const snap = await notesCol().where('publicShareId', '==', shareId).get()
  if (snap.empty) throw new Error('Shared note not found')
  return snap.docs[0].data()
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(noteId: string, comment: any): Promise<string> {
  const id = crypto.randomUUID()
  const now = FieldValue.serverTimestamp()
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
  await commentRef(noteId, id).set(commentData)
  return id
}

export async function getComments(noteId: string): Promise<any[]> {
  const snap = await commentsCol(noteId).get()
  return snap.docs.map(d => d.data())
}

export async function updateComment(
  noteId: string,
  commentId: string,
  content: string,
): Promise<void> {
  await commentRef(noteId, commentId).update({
    content,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function deleteComment(noteId: string, commentId: string): Promise<void> {
  await commentRef(noteId, commentId).delete()
}

export async function resolveComment(
  noteId: string,
  commentId: string,
  resolvedBy: string,
): Promise<void> {
  await commentRef(noteId, commentId).update({
    resolved: true,
    resolvedBy,
    resolvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
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
  const now = FieldValue.serverTimestamp()
  const folderData: any = {
    id,
    name,
    icon: icon || null,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  }
  await folderRef(id).set(folderData)
  return { ...folderData, createdAt: null, updatedAt: null }
}

export async function getUserFolders(userId: string): Promise<any[]> {
  const snap = await foldersCol().where('ownerId', '==', userId).get()
  return snap.docs.map(d => d.data())
}

export async function updateFolder(folderId: string, updates: any): Promise<void> {
  await folderRef(folderId).update({ ...updates, updatedAt: FieldValue.serverTimestamp() })
}

export async function deleteFolder(folderId: string): Promise<void> {
  await folderRef(folderId).delete()
}

export async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
  await noteRef(noteId).update({ folderId, updatedAt: FieldValue.serverTimestamp() })
}

// ---------------------------------------------------------------------------
// Access check
// ---------------------------------------------------------------------------

export async function checkNoteAccess(
  noteId: string,
  userId: string,
  userEmail?: string | null,
  emailVerified?: boolean,
): Promise<{ hasAccess: boolean; permission: string }> {
  const note = await getNote(noteId)

  // Owner has full access
  if (note.ownerId === userId) {
    return { hasAccess: true, permission: 'owner' }
  }

  // Check collaborators. Match by uid OR by email (case-insensitive): invitees
  // added before they had an account are stored with `userId === email`, so a
  // uid-only match would drop their grant the moment they sign up with a real
  // Firebase uid. Matching on the token email makes the access survive the
  // unregistered -> registered transition.
  //
  // SECURITY: only honour the email match when the token's email is VERIFIED.
  // Firebase lets anyone register an account with an arbitrary email
  // (email_verified=false until they prove ownership), so matching on an
  // unverified email would let an attacker claim a note shared to someone
  // else's address (authorization bypass). Unverified/absent email → no email
  // match; the uid path still works and it fails closed.
  // See PRD-SECURITY-cross-user-access-control.md.
  const normalizedEmail = emailVerified ? (userEmail || '').trim().toLowerCase() : ''
  const collab = (note.collaborators || []).find(
    (c: any) =>
      c.userId === userId ||
      (!!normalizedEmail && (c.email || '').trim().toLowerCase() === normalizedEmail),
  )
  if (collab) {
    return { hasAccess: true, permission: collab.permission }
  }

  // Check public access
  if (note.publicAccess?.enabled) {
    return { hasAccess: true, permission: note.publicAccess.permission }
  }

  return { hasAccess: false, permission: 'none' }
}
