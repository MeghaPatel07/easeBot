import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Checklist, ChecklistItem } from '@/types'
import {
  checkChecklistLimit,
  ChecklistLimitError,
  type TierProfile,
} from './checklistLimits'

function checklistsCol(userId: string) {
  return collection(db, 'users', userId, 'checklists')
}

function checklistDoc(userId: string, checklistId: string) {
  return doc(db, 'users', userId, 'checklists', checklistId)
}

// ── Count (server-side) ────────────────────────────────────────────────────
// Used by the tier-cap gate so the manual creation paths enforce the same
// free-tier "max 5 checklists" limit as the AI planner tool (WE-20260601-103).
// Uses Firestore's aggregation count so we don't pull every doc just to count.
export async function countChecklists(userId: string): Promise<number> {
  const snap = await getCountFromServer(checklistsCol(userId))
  return snap.data().count
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Create a checklist, enforcing the resolved tier's checklist cap. `profile` is
 * required so every call site (manual UI + duplicate) goes through the same gate
 * the AI tool path uses — preventing the free-tier bypass in WE-20260601-103.
 * Throws {@link ChecklistLimitError} (with an upgrade message) when capped.
 */
export async function createChecklist(
  userId: string,
  title: string,
  itemTexts: string[],
  profile: TierProfile
): Promise<Checklist> {
  // Tier-cap gate — consistent with the backend AI-tool path. Only counts when
  // the tier is actually capped (free), so pro/promax skip the extra read.
  const precheck = checkChecklistLimit(profile, 0)
  if (precheck.max != null) {
    const existingCount = await countChecklists(userId)
    const verdict = checkChecklistLimit(profile, existingCount)
    if (!verdict.allowed) {
      throw new ChecklistLimitError(verdict)
    }
  }

  const id = crypto.randomUUID()
  const now = serverTimestamp()
  const items: ChecklistItem[] = itemTexts.map(text => ({
    id: crypto.randomUUID(),
    text,
    completed: false,
    vendorRef: null,
    dueDate: null,
  }))

  const checklist = { id, userId, title, items, createdAt: now, updatedAt: now }
  await setDoc(checklistDoc(userId, id), checklist)
  return checklist as unknown as Checklist
}

export async function duplicateChecklist(
  userId: string,
  source: Checklist,
  profile: TierProfile
): Promise<void> {
  const title = `${source.title} (Copy)`
  const itemTexts = source.items.map(i => i.text)
  await createChecklist(userId, title, itemTexts, profile)
}

export async function updateChecklistItem(
  userId: string,
  checklistId: string,
  itemId: string,
  newText: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).map(item =>
    item.id === itemId ? { ...item, text: newText } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function toggleItemDone(
  userId: string,
  checklistId: string,
  itemId: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).map(item =>
    item.id === itemId ? { ...item, completed: !item.completed } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function addChecklistItem(
  userId: string,
  checklistId: string,
  text: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = snap.data().items as ChecklistItem[]
  items.push({ id: crypto.randomUUID(), text, completed: false, vendorRef: null, dueDate: null })
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function deleteChecklistItem(
  userId: string,
  checklistId: string,
  itemId: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).filter(i => i.id !== itemId)
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function updateItemDueDate(
  userId: string,
  checklistId: string,
  itemId: string,
  dueDate: string | null
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).map(item =>
    item.id === itemId ? { ...item, dueDate } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function reorderChecklistItems(
  userId: string,
  checklistId: string,
  orderedItemIds: string[]
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const currentItems = snap.data().items as ChecklistItem[]
  const itemMap = new Map(currentItems.map(i => [i.id, i]))
  const reordered = orderedItemIds
    .map(id => itemMap.get(id))
    .filter((i): i is ChecklistItem => !!i)
  // Append any items not in the ordered list (safety net)
  for (const item of currentItems) {
    if (!orderedItemIds.includes(item.id)) reordered.push(item)
  }
  await updateDoc(ref, { items: reordered, updatedAt: serverTimestamp() })
}

export async function deleteChecklist(userId: string, checklistId: string): Promise<void> {
  await deleteDoc(checklistDoc(userId, checklistId))
}

// ── Real-time listener ────────────────────────────────────────────────────────

export function subscribeToChecklists(
  userId: string,
  callback: (checklists: Checklist[]) => void
): Unsubscribe {
  return onSnapshot(
    checklistsCol(userId),
    (snapshot) => {
      const checklists = snapshot.docs
        .map(d => ({ ...d.data() } as Checklist))
        .sort((a, b) => {
          const aMs = (a.createdAt as any)?.toMillis?.() ?? 0
          const bMs = (b.createdAt as any)?.toMillis?.() ?? 0
          return bMs - aMs
        })
      callback(checklists)
    },
    (err) => console.error('[subscribeToChecklists]', err.message)
  )
}

// ── Stats (client-side) ───────────────────────────────────────────────────────

export function computeStats(checklists: Checklist[]): { total: number; todo: number; completed: number; overdue: number } {
  let todo = 0
  let completed = 0
  let overdue = 0
  const today = new Date().toISOString().slice(0, 10)
  checklists.forEach(cl => {
    cl.items.forEach(item => {
      if (item.completed) completed++
      else {
        todo++
        if (item.dueDate && item.dueDate < today) overdue++
      }
    })
  })
  return { total: todo + completed, todo, completed, overdue }
}
