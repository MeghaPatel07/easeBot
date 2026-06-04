import { Request, Response } from 'express'
import {
  createNote, getNote, updateNote, softDeleteNote, restoreNote,
  permanentDeleteNote, getUserNotes,
  addCollaborator, removeCollaborator, updateCollaboratorPermission,
  sendCollaboratorInvites,
  enablePublicLink, disablePublicLink, getNoteByShareId,
  addComment, getComments, updateComment, deleteComment, resolveComment,
  createFolder, getUserFolders, updateFolder, deleteFolder, moveNoteToFolder,
  checkNoteAccess,
} from '../services/notesService'

// ---------------------------------------------------------------------------
// Notes CRUD
// ---------------------------------------------------------------------------

// Permission predicates bridging the two vocabularies checkNoteAccess can
// return: collaborator perms ('owner'|'editor'|'commenter'|'viewer') and
// public-link perms ('view'|'comment'|'edit'). The old guards compared against
// the bare string 'view', which never matched the collaborator value 'viewer',
// so view-only collaborators could write. Use explicit allow-lists instead.
const canEditNote = (p: string) => p === 'owner' || p === 'editor' || p === 'edit'
const canCommentOnNote = (p: string) => canEditNote(p) || p === 'commenter' || p === 'comment'

export async function handleCreateNote(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  const email = req.user?.email
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const note = await createNote(uid, email || '', req.body)
    res.status(201).json(note)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleGetNote(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess) { res.status(403).json({ error: 'Forbidden' }); return }
    const note = await getNote(noteId)
    res.status(200).json(note)
  } catch (err: any) {
    res.status(err.message === 'Note not found' ? 404 : 500).json({ error: err.message })
  }
}

export async function handleUpdateNote(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || !canEditNote(access.permission)) {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await updateNote(noteId, { ...req.body, lastEditedBy: req.user?.email || uid })
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleDeleteNote(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await softDeleteNote(noteId)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleRestoreNote(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await restoreNote(noteId)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handlePermanentDelete(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await permanentDeleteNote(noteId)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleGetUserNotes(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const notes = await getUserNotes(uid)
    res.status(200).json(notes)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export async function handleAddCollaborator(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  const { userId, email, name, permission } = req.body
  if (!email || !permission) {
    res.status(400).json({ error: 'email and permission are required' }); return
  }
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await addCollaborator(
      noteId,
      { userId: userId || email, email, name, permission },
    )
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleSendInvites(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  const { emails } = req.body
  if (!Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: 'emails array is required' }); return
  }
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    const result = await sendCollaboratorInvites(noteId, emails, {
      email: req.user?.email || '',
      name: (req.user as any)?.name,
    })
    res.status(200).json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleRemoveCollaborator(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId, userId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await removeCollaborator(noteId, userId)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleUpdateCollaboratorPermission(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId, userId } = req.params
  const { permission } = req.body
  if (!permission) { res.status(400).json({ error: 'permission is required' }); return }
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await updateCollaboratorPermission(noteId, userId, permission)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleEnablePublicLink(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  const { permission } = req.body
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    const shareId = await enablePublicLink(noteId, permission || 'view')
    res.status(200).json({ shareId })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleDisablePublicLink(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || access.permission !== 'owner') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await disablePublicLink(noteId)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleGetSharedNote(req: Request, res: Response): Promise<void> {
  const { shareId } = req.params
  try {
    const note = await getNoteByShareId(shareId)
    if (!note.publicAccess?.enabled) {
      res.status(404).json({ error: 'Shared note not found' }); return
    }
    res.status(200).json(note)
  } catch (err: any) {
    res.status(err.message === 'Shared note not found' ? 404 : 500).json({ error: err.message })
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function handleAddComment(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  const { content, blockId } = req.body
  if (!content) { res.status(400).json({ error: 'content is required' }); return }
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || !canCommentOnNote(access.permission)) { res.status(403).json({ error: 'Forbidden' }); return }
    const commentId = await addComment(noteId, {
      content,
      authorId: uid,
      authorEmail: req.user?.email || '',
      blockId,
    })
    res.status(201).json({ id: commentId })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleGetComments(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess) { res.status(403).json({ error: 'Forbidden' }); return }
    const comments = await getComments(noteId)
    res.status(200).json(comments)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleUpdateComment(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId, commentId } = req.params
  const { content } = req.body
  if (!content) { res.status(400).json({ error: 'content is required' }); return }
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || !canCommentOnNote(access.permission)) { res.status(403).json({ error: 'Forbidden' }); return }
    await updateComment(noteId, commentId, content)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleDeleteComment(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId, commentId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || !canCommentOnNote(access.permission)) { res.status(403).json({ error: 'Forbidden' }); return }
    await deleteComment(noteId, commentId)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleResolveComment(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId, commentId } = req.params
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || !canCommentOnNote(access.permission)) { res.status(403).json({ error: 'Forbidden' }); return }
    await resolveComment(noteId, commentId, uid)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function handleCreateFolder(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { name, icon } = req.body
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  try {
    const folder = await createFolder(uid, name, icon)
    res.status(201).json(folder)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleGetFolders(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const folders = await getUserFolders(uid)
    res.status(200).json(folders)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleUpdateFolder(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { folderId } = req.params
  try {
    await updateFolder(folderId, req.body)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleDeleteFolder(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { folderId } = req.params
  try {
    await deleteFolder(folderId)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleMoveNote(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { noteId } = req.params
  const { folderId } = req.body
  try {
    const access = await checkNoteAccess(noteId, uid, req.user?.email, req.user?.emailVerified)
    if (!access.hasAccess || !canEditNote(access.permission)) {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    await moveNoteToFolder(noteId, folderId ?? null)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
