import {
  doc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
  collection,
  serverTimestamp,
  arrayRemove,
  runTransaction,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, auth, functions } from '@/lib/firebase'
import type { Note, Collaborator, NotePermission } from '@/types/notes'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://backend.theweddingbot.ai'

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

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
  const res = await authedFetch(`/api/notes/${noteId}/share`, {
    method: 'POST',
    body: JSON.stringify({
      userId: collaborator.userId || collaborator.email,
      email: collaborator.email,
      name: collaborator.name,
      permission: collaborator.permission,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `Failed to add collaborator (${res.status})`)
  }
}

export async function sendNoteInvites(
  noteId: string,
  emails: string[],
): Promise<{ sent: string[]; skipped: string[] }> {
  // Sends via the Firebase Cloud Function `notesShareNotify` (admin functions,
  // same wedding-ease-dc99a project) which mails through the platform's own
  // SMTP/SendGrid pipe — replacing the Railway/Resend backend endpoint.
  // httpsCallable attaches the caller's Firebase ID token automatically.
  const notifyInvites = httpsCallable<
    { noteId: string; emails: string[] },
    { sent: string[]; skipped: string[] }
  >(functions, 'notesShareNotify')
  const { data } = await notifyInvites({ noteId, emails })
  return data
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

/**
 * Ensure a note has a `publicShareId` and return it, creating a 'view' public
 * link if absent — mirrors what the `notesShareNotify` Cloud Function does, but
 * client-side. Lets the share link be generated/tested WITHOUT the invite-email
 * service. The link itself is role-agnostic (`/shared/note/<shareId>`); the
 * dispatcher resolves the signed-in viewer's real edit/comment/view right from
 * collaborators[], so this 'view' public link is only the anonymous fallback.
 */
export async function ensurePublicShareId(noteId: string): Promise<string> {
  const ref = noteDoc(noteId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Note not found')

  const note = snap.data() as Note
  if (note.publicShareId) return note.publicShareId

  const shareId = crypto.randomUUID()
  await updateDoc(ref, {
    publicAccess: {
      enabled: true,
      permission: 'view',
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

/**
 * Resolve a note from its `publicShareId` REGARDLESS of whether the public link
 * is currently enabled. The collaborator-invite email links to
 * `/shared/note/<publicShareId>`, and a named collaborator must still be able to
 * open the note even if the owner never enabled (or later disabled) the public
 * link. The shared-note dispatcher then decides what the *specific* signed-in
 * viewer is allowed to do via {@link resolveEffectiveAccess} — the public link's
 * own permission no longer gates a collaborator's editor/commenter/viewer grant.
 */
export async function getNoteByShareIdAny(shareId: string): Promise<Note | null> {
  try {
    // Single where-clause → no composite index required.
    const q = query(notesCol(), where('publicShareId', '==', shareId))
    const snapshot = await getDocs(q)
    if (snapshot.empty) return null
    const d = snapshot.docs[0]
    return { ...d.data(), id: d.id } as Note
  } catch (err) {
    console.error('[notesSharingService] getNoteByShareIdAny failed:', err)
    return null
  }
}

// ── Effective access resolution ──────────────────────────────────────────────
// Bridges the TWO permission systems that exist on a note:
//   • collaborators[]  → NotePermission   'editor' | 'commenter' | 'viewer'
//   • publicAccess     → 'view' | 'comment' | 'edit'
// A note shared with a person by email stores their grant in collaborators[];
// the emailed link points at the public shareId. Historically the shared page
// read ONLY publicAccess.permission (hardcoded to 'view' by the invite mailer),
// so an editor invitee always landed read-only. resolveEffectiveAccess fixes
// that by checking, in priority order: owner → named collaborator (matched by
// EMAIL, which survives the unregistered→registered signup transition) → public
// link → none.

/** Map a collaborator's NotePermission onto the public-style right vocabulary. */
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
export async function claimCollaboratorUid(
  noteId: string,
  email: string,
  uid: string
): Promise<void> {
  const lower = email.trim().toLowerCase()
  if (!lower) return // never match an empty-email record

  try {
    // Read-modify-write in a transaction so a concurrent owner edit to
    // collaborators[] (e.g. adding another person at the same moment) isn't
    // clobbered by a stale full-array overwrite.
    await runTransaction(db, async (tx) => {
      const ref = noteDoc(noteId)
      const snap = await tx.get(ref)
      if (!snap.exists()) return

      const note = snap.data() as Note
      const collaborators = note.collaborators ?? []

      let changed = false
      const updated = collaborators.map((c) => {
        if ((c.email || '').trim().toLowerCase() === lower && c.userId !== uid) {
          changed = true
          return { ...c, userId: uid }
        }
        return c
      })

      if (changed) {
        tx.update(ref, { collaborators: updated })
      }
    })
  } catch (err) {
    console.error('[notesSharingService] claimCollaboratorUid failed:', err)
  }
}
