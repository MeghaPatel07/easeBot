import { api, invalidate, liveQuery } from './apiClient'
import type { Timestamp } from '@/lib/timestamp'
import type { PlanTier } from '@/config/tierConfig'

type Unsubscribe = () => void
const TOPIC = 'projects'

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

export interface ProjectQuota {
  current: number
  max: number
  canCreate: boolean
  tier: PlanTier
}

interface RawProject extends Omit<WeddingProject, 'createdAt' | 'updatedAt'> {
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}
const map = (p: RawProject): WeddingProject => ({ ...p, createdAt: p.createdAt?.toDate() ?? new Date(), updatedAt: p.updatedAt?.toDate() ?? new Date() })

/** The profile argument is kept for call-site compatibility; the tier is read server-side. */
export async function getProjectQuota(_userId: string, _profile?: unknown): Promise<ProjectQuota> {
  return api<ProjectQuota>('/projects/quota')
}

export async function createProject(_userId: string, _profile: unknown, input: ProjectInput): Promise<WeddingProject> {
  const p = map(await api<RawProject>('/projects', { json: input }))
  invalidate(TOPIC)
  return p
}

export async function deleteProject(_userId: string, projectId: string): Promise<void> {
  await api(`/projects/${projectId}`, { method: 'DELETE' })
  invalidate(TOPIC)
}

export async function updateProject(_userId: string, projectId: string, patch: Partial<ProjectInput>): Promise<void> {
  await api(`/projects/${projectId}`, { method: 'PATCH', json: patch })
  invalidate(TOPIC)
}

export async function listProjects(_userId: string): Promise<WeddingProject[]> {
  return (await api<{ items: RawProject[] }>('/projects')).items.map(map)
}

export function subscribeToProjects(userId: string, callback: (projects: WeddingProject[]) => void): Unsubscribe {
  return liveQuery(TOPIC, () => listProjects(userId), callback)
}
