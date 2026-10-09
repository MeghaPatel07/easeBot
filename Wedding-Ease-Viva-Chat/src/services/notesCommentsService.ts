import { api, apiAll, invalidate, liveQuery } from './apiClient'
import type { NoteComment } from '@/types/notes'

type Unsubscribe = () => void
const touch = (noteId: string) => invalidate(`comments:${noteId}`)

export async function addComment(
  comment: Omit<NoteComment, 'id' | 'createdAt' | 'updatedAt' | 'isEdited' | 'isDeleted'>
): Promise<string> {
  const r = await api<{ id: string }>(`/notes/${comment.noteId}/comments`, {
    json: { content: comment.content, blockId: comment.blockId ?? null, anchorText: comment.anchorText ?? null, parentCommentId: comment.parentCommentId ?? null },
  })
  touch(comment.noteId)
  return r.id
}

export async function updateComment(noteId: string, commentId: string, content: string): Promise<void> {
  await api(`/notes/${noteId}/comments/${commentId}`, { method: 'PATCH', json: { content } })
  touch(noteId)
}

export const editComment = updateComment

export async function deleteComment(noteId: string, commentId: string): Promise<void> {
  await api(`/notes/${noteId}/comments/${commentId}`, { method: 'DELETE' })
  touch(noteId)
}

export async function resolveComment(noteId: string, commentId: string, _resolvedBy?: string): Promise<void> {
  await api(`/notes/${noteId}/comments/${commentId}/resolve`, { method: 'POST' })
  touch(noteId)
}

export async function unresolveComment(noteId: string, commentId: string): Promise<void> {
  await api(`/notes/${noteId}/comments/${commentId}/resolve`, { method: 'DELETE' })
  touch(noteId)
}

export async function addReaction(noteId: string, commentId: string, emoji: string, _userId?: string): Promise<void> {
  await api(`/notes/${noteId}/comments/${commentId}/reactions`, { json: { emoji } })
  touch(noteId)
}

export async function removeReaction(noteId: string, commentId: string, emoji: string, _userId?: string): Promise<void> {
  await api(`/notes/${noteId}/comments/${commentId}/reactions?emoji=${encodeURIComponent(emoji)}`, { method: 'DELETE' })
  touch(noteId)
}

/** Oldest first; refetched on local changes and every 8 s while the sidebar is open. */
export function subscribeToComments(noteId: string, callback: (comments: NoteComment[]) => void): Unsubscribe {
  return liveQuery(`comments:${noteId}`, () => apiAll<NoteComment>(`/notes/${noteId}/comments`, 10), callback, { intervalMs: 8_000 })
}
