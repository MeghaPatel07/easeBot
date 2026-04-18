import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  vendorRef: string | null
}

export interface Checklist {
  id: string
  userId: string
  title: string
  items: ChecklistItem[]
  createdAt: any
  updatedAt: any
}

export interface ChecklistStats {
  todo: number
  completed: number
  total: number
}

function checklistsCol(userId: string) {
  return collection(db, 'users', userId, 'checklists')
}

function checklistRef(userId: string, checklistId: string) {
  return doc(db, 'users', userId, 'checklists', checklistId)
}

export async function createChecklist(
  userId: string,
  title: string,
  itemTexts: string[]
): Promise<Checklist> {
  const id = crypto.randomUUID()
  const items: ChecklistItem[] = itemTexts.map(text => ({
    id: crypto.randomUUID(),
    text,
    completed: false,
    vendorRef: null,
  }))
  const now = serverTimestamp()
  const data: any = { id, userId, title, items, createdAt: now, updatedAt: now }
  await setDoc(checklistRef(userId, id), data)
  return { ...data, createdAt: null, updatedAt: null } as Checklist
}

// Normalize for fuzzy title/item comparison — case-insensitive, collapses
// whitespace. Keeps unicode letters intact so "Haldi" / "Mehendi" etc. match.
function norm(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Resolve a checklist by id OR by title. Returns null if nothing matches.
 *
 * Why fuzzy-by-title: the LLM frequently loses tool-call context between
 * turns (getChatHistory strips the `tool` role messages), so it can't reliably
 * reference a checklist by its UUID. Accepting the title as a fallback lets
 * natural prompts like "edit Hire a caterer in the wedding to-do list" still
 * resolve. When both args are empty we return the most recently updated
 * checklist — useful for "edit this checklist" without any qualifier.
 */
async function resolveChecklist(
  userId: string,
  idOrTitle: string | null | undefined,
): Promise<{ id: string; data: Checklist } | null> {
  const q = (idOrTitle || '').trim()
  if (q) {
    // Fast path — exact id lookup first.
    const byId = await getDoc(checklistRef(userId, q))
    if (byId.exists()) return { id: byId.id, data: byId.data() as Checklist }
  }

  const all = await getDocs(checklistsCol(userId))
  if (all.empty) return null

  if (q) {
    const normQ = norm(q)
    let exact: { id: string; data: Checklist } | null = null
    const startsWith: { id: string; data: Checklist }[] = []
    const contains: { id: string; data: Checklist }[] = []
    for (const d of all.docs) {
      const data = d.data() as Checklist
      const t = norm(data.title || '')
      if (t === normQ) { exact = { id: d.id, data }; break }
      if (t.startsWith(normQ)) startsWith.push({ id: d.id, data })
      if (t.includes(normQ)) contains.push({ id: d.id, data })
    }
    if (exact) return exact
    if (startsWith.length === 1) return startsWith[0]
    if (startsWith.length > 1) {
      throw new Error(`Ambiguous item: multiple items match '${q}'. Please specify by full text or id.`)
    }
    if (contains.length === 1) return contains[0]
    if (contains.length > 1) {
      throw new Error(`Ambiguous item: multiple items match '${q}'. Please specify by full text or id.`)
    }
  }

  // Fallback: most recently updated checklist. Firestore serverTimestamps may
  // be absent on newly-created docs, so compare defensively.
  let latest: { id: string; data: Checklist; at: number } | null = null
  for (const d of all.docs) {
    const data = d.data() as Checklist
    const ts = data.updatedAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? 0
    if (!latest || ts > latest.at) latest = { id: d.id, data, at: ts }
  }
  return latest ? { id: latest.id, data: latest.data } : null
}

function resolveItem(items: ChecklistItem[], idOrText: string | null | undefined): ChecklistItem | null {
  const q = (idOrText || '').trim()
  if (!q) return null
  // Exact id
  const byId = items.find(i => i.id === q)
  if (byId) return byId
  // Exact text (normalized)
  const normQ = norm(q)
  const byText = items.find(i => norm(i.text) === normQ)
  if (byText) return byText
  const startsMatches = items.filter(i => norm(i.text).startsWith(normQ))
  if (startsMatches.length === 1) return startsMatches[0]
  if (startsMatches.length > 1) {
    throw new Error(`Ambiguous item: multiple items match '${q}'. Please specify by full text or id.`)
  }
  const containsMatches = items.filter(i => norm(i.text).includes(normQ))
  if (containsMatches.length === 1) return containsMatches[0]
  if (containsMatches.length > 1) {
    throw new Error(`Ambiguous item: multiple items match '${q}'. Please specify by full text or id.`)
  }
  return null
}

/**
 * Edit a checklist item. Accepts either IDs or natural-language identifiers
 * (title for the checklist, item text for the item) — the LLM often refers to
 * artifacts by text because tool-call context doesn't survive across turns.
 * Throws with a descriptive error naming what wasn't found so the model can
 * self-correct on retry.
 */
export async function editChecklistItem(
  userId: string,
  checklistIdOrTitle: string,
  itemIdOrText: string,
  newText: string,
): Promise<{ checklistId: string; itemId: string; checklistTitle: string }> {
  const resolved = await resolveChecklist(userId, checklistIdOrTitle)
  if (!resolved) throw new Error(`Checklist not found: "${checklistIdOrTitle}"`)
  const items = resolved.data.items || []
  const target = resolveItem(items, itemIdOrText)
  if (!target) throw new Error(`Item "${itemIdOrText}" not found in checklist "${resolved.data.title}"`)
  const nextItems = items.map(item =>
    item.id === target.id ? { ...item, text: newText } : item,
  )
  await updateDoc(checklistRef(userId, resolved.id), { items: nextItems, updatedAt: serverTimestamp() })
  return { checklistId: resolved.id, itemId: target.id, checklistTitle: resolved.data.title }
}

/**
 * Toggle completion. Accepts IDs or natural-language identifiers — see
 * editChecklistItem for rationale.
 */
export async function toggleItemDone(
  userId: string,
  checklistIdOrTitle: string,
  itemIdOrText: string,
): Promise<{ completed: boolean; checklistId: string; itemId: string; checklistTitle: string; itemText: string }> {
  const resolved = await resolveChecklist(userId, checklistIdOrTitle)
  if (!resolved) throw new Error(`Checklist not found: "${checklistIdOrTitle}"`)
  const items = resolved.data.items || []
  const target = resolveItem(items, itemIdOrText)
  if (!target) throw new Error(`Item "${itemIdOrText}" not found in checklist "${resolved.data.title}"`)
  let completed = false
  const nextItems = items.map(item => {
    if (item.id !== target.id) return item
    completed = !item.completed
    return { ...item, completed }
  })
  await updateDoc(checklistRef(userId, resolved.id), { items: nextItems, updatedAt: serverTimestamp() })
  return { completed, checklistId: resolved.id, itemId: target.id, checklistTitle: resolved.data.title, itemText: target.text }
}

export async function deleteChecklist(userId: string, checklistId: string): Promise<void> {
  await deleteDoc(checklistRef(userId, checklistId))
}

export async function getChecklistCount(userId: string): Promise<number> {
  const snap = await getDocs(checklistsCol(userId))
  return snap.size
}

export async function countChecklists(userId: string): Promise<number> {
  const snap = await getDocs(checklistsCol(userId))
  return snap.size
}

export async function getChecklistStats(userId: string): Promise<ChecklistStats> {
  const snap = await getDocs(checklistsCol(userId))
  let todo = 0
  let completed = 0
  snap.docs.forEach(d => {
    (d.data().items as ChecklistItem[]).forEach(item => {
      if (item.completed) completed++
      else todo++
    })
  })
  return { todo, completed, total: todo + completed }
}
