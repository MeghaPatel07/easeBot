import { api } from './apiClient'
import type { Note, Collaborator, NotePermission } from '@/types/notes'

const topics = (noteId: string) => import('./apiClient').then((m) => m.invalidate('notes', 'notes:shared', `note:${noteId}`))

export async function addCollaborator(noteId: string, collaborator: Omit<Collaborator, 'addedAt'>): Promise<void> {
  await api(`/notes/${noteId}/share`, { json: { userId: collaborator.userId || collaborator.email, email: collaborator.email, name: collaborator.name, permission: collaborator.permission } })
  await topics(noteId)
}

export async function sendNoteInvites(noteId: string, emails: string[]): Promise<{ sent: string[]; skipped: string[] }> {
  return api(`/notes/${noteId}/share/notify`, { json: { emails } })
}

export async function removeCollaborator(noteId: string, userId: string): Promise<void> {
  await api(`/notes/${noteId}/share/${encodeURIComponent(userId)}`, { method: 'DELETE' })
  await topics(noteId)
}

export async function updateCollaboratorPermission(noteId: string, userId: string, permission: NotePermission): Promise<void> {
  await api(`/notes/${noteId}/share/${encodeURIComponent(userId)}`, { method: 'PATCH', json: { permission } })
  await topics(noteId)
}

export async function enablePublicLink(noteId: string, permission: 'view' | 'comment' | 'edit'): Promise<string> {
  const r = await api<{ shareId: string }>(`/notes/${noteId}/public-link`, { json: { permission } })
  await topics(noteId)
  return r.shareId
}

export async function disablePublicLink(noteId: string): Promise<void> {
  await api(`/notes/${noteId}/public-link`, { method: 'DELETE' })
  await topics(noteId)
}

/** Existing share id, else enables a view-only link (owner action). */
export async function ensurePublicShareId(noteId: string): Promise<string> {
  const note = await api<Note>(`/notes/${noteId}`)
  if (note.publicShareId) return note.publicShareId
  return enablePublicLink(noteId, 'view')
}

/** Public read of a shared note (enabled links only). */
export async function getNoteByShareId(shareId: string): Promise<Note | null> {
  try {
    const note = await api<Note>(`/notes/shared/${encodeURIComponent(shareId)}`)
    return note.publicAccess?.enabled ? note : null
  } catch {
    return null
  }
}

/** The server only serves notes whose link is enabled, so "any" and "enabled" coincide. */
export const getNoteByShareIdAny = getNoteByShareId

export function editRightFromCollaborator(
  permission: NotePermission
): 'edit' | 'comment' | 'view' {
  return permission === 'editor' ? 'edit' : permission === 'commenter' ? 'comment' : 'view'
}

export type EffectiveRole =
  | 'owner'
  | 'editor'
  | 'commenter'
  | 'viewer'
  | 'public-edit'
  | 'public-comment'
  | 'public-view'
  | 'none'

export interface EffectiveAccess {
  role: EffectiveRole
  /** Where the access came from — drives the dispatcher's routing decision. */
  source: 'owner' | 'collaborator' | 'public' | 'none'
  canEdit: boolean
  canComment: boolean
  canView: boolean
  /** The matched collaborator record, when source === 'collaborator'. */
  collaborator: Collaborator | null
}

/** Minimal shape of the signed-in user the resolver needs. */
export interface AccessUser {
  uid: string
  email: string | null
}

const NO_ACCESS: EffectiveAccess = {
  role: 'none',
  source: 'none',
  canEdit: false,
  canComment: false,
  canView: false,
  collaborator: null,
}

/**
 * Determine what `user` (possibly null/anonymous) may do with `note`.
 * Priority: owner → named collaborator (by email or backfilled uid) → public link.
 */
export function resolveEffectiveAccess(
  note: Note | null,
  user: AccessUser | null
): EffectiveAccess {
  if (!note) return NO_ACCESS

  // 1) Owner — full control.
  if (user && note.ownerId === user.uid) {
    return { role: 'owner', source: 'owner', canEdit: true, canComment: true, canView: true, collaborator: null }
  }

  // 2) Named collaborator — match by email (case-insensitive) so an invitee who
  //    was added before they had an account still resolves once they sign up
  //    with that email; also match the real uid once it's been backfilled.
  if (user) {
    const email = (user.email || '').trim().toLowerCase()
    const collab = (note.collaborators ?? []).find(
      // Require a non-empty email before email-matching so a user with no email
      // can't collide with a stray collaborator record whose email is '' (the
      // backend checkNoteAccess applies the same guard).
      (c) => c.userId === user.uid || (!!email && (c.email || '').trim().toLowerCase() === email)
    )
    if (collab) {
      const role = collab.permission
      return {
        role,
        source: 'collaborator',
        canEdit: role === 'editor',
        canComment: role === 'editor' || role === 'commenter',
        canView: true,
        collaborator: collab,
      }
    }
  }

  // 3) Public link — applies to anonymous visitors and to signed-in users who
  //    aren't named collaborators. The owner opted into this explicitly.
  if (note.publicAccess?.enabled) {
    const p = note.publicAccess.permission
    return {
      role: p === 'edit' ? 'public-edit' : p === 'comment' ? 'public-comment' : 'public-view',
      source: 'public',
      canEdit: p === 'edit',
      canComment: p === 'comment' || p === 'edit',
      canView: true,
      collaborator: null,
    }
  }

  return NO_ACCESS
}

/**
 * Backfill a collaborator's `userId` from the email placeholder to the real
 * Firebase uid the first time that person opens the note while signed in.
 * Invitees added before they had an account are stored with `userId === email`
 * (see backend addCollaborator); aligning it to the uid keeps uid-keyed checks
 * (backend checkNoteAccess, conflict-author display) consistent. Best-effort:
 * failures are swallowed so they never block opening the note.
 */

/** Collaborator access is matched by verified email on the server, so there is no uid to claim any more. */
export async function claimCollaboratorUid(_noteId: string, _email: string, _uid: string): Promise<void> {}
