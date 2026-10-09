import { api, apiAll, apiFetch, invalidate, liveQuery } from './apiClient'
import type { Note, NoteFolder } from '@/types/notes'

type Unsubscribe = () => void
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

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

const CREATE_FIELDS = ['title', 'icon', 'coverImage', 'content', 'folderId', 'tags', 'category', 'color', 'favorited', 'wordCount', 'sourceThreadId', 'sourceType', 'templateId'] as const
const UPDATE_FIELDS = ['title', 'icon', 'coverImage', 'content', 'folderId', 'tags', 'category', 'color', 'favorited', 'wordCount'] as const
const pick = (src: Record<string, unknown> | undefined, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => src && src[k] !== undefined).map((k) => [k, src![k]]))
const touch = () => invalidate('notes', 'notes:trash', 'notes:shared')

/** Ownership fields, search text and timestamps are set server-side; only content/metadata is sent. */
export async function createNote(_userId: string, _userEmail: string, data?: Partial<Note>): Promise<Note> {
  const defaults = { title: 'Untitled', category: 'general', sourceType: 'manual', content: '{"type":"doc","content":[{"type":"paragraph"}]}' }
  const note = await api<Note>('/notes', { json: { ...defaults, ...pick(data as Record<string, unknown>, CREATE_FIELDS) } })
  touch()
  return note
}

export async function updateNote(noteId: string, updates: Partial<Note>): Promise<void> {
  await api(`/notes/${noteId}`, { method: 'PATCH', json: pick(updates as Record<string, unknown>, UPDATE_FIELDS) })
  invalidate(`note:${noteId}`, 'notes', 'notes:shared')
}

export async function deleteNote(noteId: string): Promise<void> {
  await api(`/notes/${noteId}`, { method: 'DELETE' })
  touch(); invalidate(`note:${noteId}`)
}

export async function permanentDeleteNote(noteId: string): Promise<void> {
  await api(`/notes/${noteId}/permanent`, { method: 'DELETE' })
  touch()
}

export async function restoreNote(noteId: string): Promise<void> {
  await api(`/notes/${noteId}/restore`, { method: 'POST' })
  touch(); invalidate(`note:${noteId}`)
}

export async function getNote(noteId: string): Promise<Note | null> {
  try {
    return await api<Note>(`/notes/${noteId}`)
  } catch {
    return null
  }
}

const list = (scope: 'owned' | 'trash' | 'shared') => () => apiAll<Note>(`/notes?scope=${scope}`, 10)

export function subscribeToNotes(_userId: string, callback: (notes: Note[]) => void): Unsubscribe {
  return liveQuery('notes', list('owned'), callback)
}

export function subscribeToTrashedNotes(_userId: string, callback: (notes: Note[]) => void): Unsubscribe {
  return liveQuery('notes:trash', list('trash'), callback)
}

/** Notes other people shared with the signed-in user (the server matches on the session's own email). */
export function subscribeToSharedNotes(_userEmail: string, callback: (notes: Note[]) => void): Unsubscribe {
  return liveQuery('notes:shared', list('shared'), callback)
}

/** The open note: refetched on local edits and every 6 s while visible, which is how collaborators see each other's changes. */
export function subscribeToNote(noteId: string, callback: (note: Note | null) => void): Unsubscribe {
  return liveQuery(`note:${noteId}`, () => getNote(noteId), callback, { intervalMs: 6_000 })
}

// ── Folders ─────────────────────────────────────────────────────────────────

export async function createFolder(_userId: string, name: string, icon?: string): Promise<NoteFolder> {
  const f = await api<NoteFolder>('/notes/folders', { json: { name, icon: icon ?? null } })
  invalidate('folders')
  return f
}

export async function updateFolder(folderId: string, updates: Partial<NoteFolder>): Promise<void> {
  await api(`/notes/folders/${folderId}`, { method: 'PATCH', json: pick(updates as Record<string, unknown>, ['name', 'icon', 'order']) })
  invalidate('folders')
}

export async function deleteFolder(folderId: string): Promise<void> {
  await api(`/notes/folders/${folderId}`, { method: 'DELETE' })
  invalidate('folders')
}

export function subscribeToFolders(_userId: string, callback: (folders: NoteFolder[]) => void): Unsubscribe {
  return liveQuery('folders', async () => (await api<NoteFolder[]>('/notes/folders')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), callback)
}

// ── Move note ───────────────────────────────────────────────────────────────

export async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
  await api(`/notes/${noteId}/move`, { method: 'PATCH', json: { folderId } })
  invalidate('notes', `note:${noteId}`)
}

// ── Image upload ────────────────────────────────────────────────────────────

export async function uploadNoteImage(noteId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed')
  if (file.size > MAX_IMAGE_SIZE) throw new Error('Image must be smaller than 10 MB')
  const form = new FormData()
  form.set('file', file)
  return (await api<{ url: string }>(`/notes/${noteId}/images`, { method: 'POST', body: form })).url
}

/** Orphaned uploads are removed when the note is permanently deleted (server-side); nothing calls this directly. */
export async function deleteNoteImage(_imageUrl: string): Promise<void> {
  void apiFetch
}
