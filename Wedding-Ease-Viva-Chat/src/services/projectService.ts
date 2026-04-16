// ─────────────────────────────────────────────────────────────────────────────
// Wedding Projects — PRICING_PRD §4: Free=1, Pro=2, ProMax=5.
// Each project groups checklists, timelines, reminders, and chat threads
// under one wedding context. Deletion frees a slot.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { resolveTier, getLimits, tierLabel, type PlanTier } from '@/config/tierConfig'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WeddingProject {
  id: string
  ownerId: string
  name: string
  partnerNames: string
  weddingDate: string | null  // ISO date
  budget: number | null
  isDefault: boolean          // the first project is always default
  createdAt: Date
  updatedAt: Date
}

export interface ProjectInput {
  name: string
  partnerNames: string
  weddingDate?: string | null
  budget?: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function projectsCol(userId: string) {
  return collection(db, 'users', userId, 'projects')
}

function projectDocRef(userId: string, projectId: string) {
  return doc(db, 'users', userId, 'projects', projectId)
}

function mapProject(id: string, data: any): WeddingProject {
  return {
    id,
    ownerId: data.ownerId ?? '',
    name: data.name ?? 'My Wedding',
    partnerNames: data.partnerNames ?? '',
    weddingDate: data.weddingDate ?? null,
    budget: data.budget ?? null,
    isDefault: data.isDefault ?? false,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  }
}

// ── Quota check ─────────────────────────────────────────────────────────────

export interface ProjectQuota {
  current: number
  max: number
  canCreate: boolean
  tier: PlanTier
}

export async function getProjectQuota(
  userId: string,
  profile: { plan?: string; tierMirror?: string; isPremium?: boolean } | null,
): Promise<ProjectQuota> {
  const tier = resolveTier(profile)
  const limits = getLimits(tier)
  const snap = await getDocs(projectsCol(userId))
  return {
    current: snap.size,
    max: limits.maxProjects,
    canCreate: snap.size < limits.maxProjects,
    tier,
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createProject(
  userId: string,
  profile: { plan?: string; tierMirror?: string; isPremium?: boolean } | null,
  input: ProjectInput,
): Promise<WeddingProject> {
  const quota = await getProjectQuota(userId, profile)
  if (!quota.canCreate) {
    throw new Error(
      `Project limit reached (${quota.current}/${quota.max}). ` +
      `Your ${tierLabel(quota.tier)} plan allows ${quota.max} project${quota.max !== 1 ? 's' : ''}. ` +
      (quota.tier !== 'promax'
        ? 'Upgrade your plan for more projects, or delete an existing one.'
        : 'Delete an existing project to create a new one.'),
    )
  }

  const isFirst = quota.current === 0

  const payload = {
    ownerId: userId,
    name: input.name.trim() || 'My Wedding',
    partnerNames: input.partnerNames.trim(),
    weddingDate: input.weddingDate ?? null,
    budget: input.budget ?? null,
    isDefault: isFirst,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const ref = await addDoc(projectsCol(userId), payload)
  await updateDoc(ref, { id: ref.id })

  return {
    id: ref.id,
    ownerId: userId,
    name: payload.name,
    partnerNames: payload.partnerNames,
    weddingDate: payload.weddingDate,
    budget: payload.budget,
    isDefault: isFirst,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await deleteDoc(projectDocRef(userId, projectId))
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: Partial<ProjectInput>,
): Promise<void> {
  await updateDoc(projectDocRef(userId, projectId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function listProjects(userId: string): Promise<WeddingProject[]> {
  const snap = await getDocs(query(projectsCol(userId), orderBy('createdAt', 'asc')))
  return snap.docs.map(d => mapProject(d.id, d.data()))
}

export function subscribeToProjects(
  userId: string,
  callback: (projects: WeddingProject[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(projectsCol(userId), orderBy('createdAt', 'asc')),
    (snapshot) => {
      callback(snapshot.docs.map(d => mapProject(d.id, d.data())))
    },
    (err) => console.error('[subscribeToProjects]', err.message),
  )
}
