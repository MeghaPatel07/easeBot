import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  query,
  orderBy,
  updateDoc,
  getDoc,
  setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { NoteComment } from '@/types/notes'

// ── Collection / doc helpers ─────────────────────────────────────────────────

function commentsCol(noteId: string) {
  return collection(db, 'notes', noteId, 'comments')
}

function commentDoc(noteId: string, commentId: string) {
  return doc(db, 'notes', noteId, 'comments', commentId)
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function addComment(
  comment: Omit<NoteComment, 'id' | 'createdAt' | 'updatedAt' | 'isEdited' | 'isDeleted'>
): Promise<string> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()

  const data: Record<string, unknown> = {
    id,
    noteId: comment.noteId,
    blockId: comment.blockId,
    anchorText: comment.anchorText,
    authorId: comment.authorId,
    authorName: comment.authorName,
    authorEmail: comment.authorEmail,
    content: comment.content,
    parentCommentId: comment.parentCommentId,
    resolved: comment.resolved,
    resolvedBy: comment.resolvedBy,
    resolvedAt: comment.resolvedAt,
    reactions: comment.reactions,
    createdAt: now,
    updatedAt: now,
    isEdited: false,
    isDeleted: false,
  }

  await setDoc(commentDoc(comment.noteId, id), data)
  return id
}

export async function updateComment(
  noteId: string,
  commentId: string,
  content: string
): Promise<void> {
  await updateDoc(commentDoc(noteId, commentId), {
    content,
    isEdited: true,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteComment(
  noteId: string,
  commentId: string
): Promise<void> {
  await updateDoc(commentDoc(noteId, commentId), {
    isDeleted: true,
    updatedAt: serverTimestamp(),
  })
}

export async function resolveComment(
  noteId: string,
  commentId: string,
  resolvedBy: string
): Promise<void> {
  await updateDoc(commentDoc(noteId, commentId), {
    resolved: true,
    resolvedBy,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function unresolveComment(
  noteId: string,
  commentId: string
): Promise<void> {
  await updateDoc(commentDoc(noteId, commentId), {
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    updatedAt: serverTimestamp(),
  })
}

export async function addReaction(
  noteId: string,
  commentId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const ref = commentDoc(noteId, commentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data() as NoteComment
  const reactions = { ...data.reactions }
  const users = reactions[emoji] ?? []
  if (!users.includes(userId)) {
    reactions[emoji] = [...users, userId]
  }

  await updateDoc(ref, {
    reactions,
    updatedAt: serverTimestamp(),
  })
}

export async function removeReaction(
  noteId: string,
  commentId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const ref = commentDoc(noteId, commentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data() as NoteComment
  const reactions = { ...data.reactions }
  const users = reactions[emoji] ?? []
  reactions[emoji] = users.filter(u => u !== userId)
  if (reactions[emoji].length === 0) {
    delete reactions[emoji]
  }

  await updateDoc(ref, {
    reactions,
    updatedAt: serverTimestamp(),
  })
}

// ── Edit comment (alias for updateComment with explicit semantics) ──────────

export async function editComment(
  noteId: string,
  commentId: string,
  content: string
): Promise<void> {
  await updateDoc(commentDoc(noteId, commentId), {
    content,
    isEdited: true,
    updatedAt: serverTimestamp(),
  })
}

// ── Real-time listener ──────────────────────────────────────────────────────

export function subscribeToComments(
  noteId: string,
  callback: (comments: NoteComment[]) => void
): Unsubscribe {
  const q = query(commentsCol(noteId), orderBy('createdAt', 'asc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const comments = snapshot.docs.map(d => ({
        ...d.data(),
        id: d.id,
      } as NoteComment))
      callback(comments)
    },
    (err) => console.error('[subscribeToComments]', err.message)
  )
}
