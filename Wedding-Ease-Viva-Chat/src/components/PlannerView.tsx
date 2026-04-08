import { useState, useEffect } from 'react'
import { ArrowLeft, Calendar, Trash2, CheckSquare, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  subscribeToChecklists,
  deleteChecklist,
  computeStats,
} from '@/services/checklistService'
import type { Checklist } from '@/types'

interface PlannerViewProps {
  userId: string
  isPremium: boolean
  onBack: () => void
  selectedChecklistId: string | null
  onSelectChecklist: (id: string) => void
}

export default function PlannerView({
  userId,
  isPremium,
  onBack,
  selectedChecklistId,
  onSelectChecklist,
}: PlannerViewProps) {
  const [checklists, setChecklists] = useState<Checklist[]>([])

  useEffect(() => {
    const unsub = subscribeToChecklists(userId, setChecklists)
    return unsub
  }, [userId])

  const stats = computeStats(checklists)
  const atLimit = !isPremium && checklists.length >= 5

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-6 w-6 p-0 rounded-lg">
          <ArrowLeft className="h-3.5 w-3.5 text-white/50" />
        </Button>
        <h3 className="text-sm font-semibold text-white/85 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          My Planner
        </h3>
      </div>

      {/* Kanban stats */}
      {checklists.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 flex-shrink-0">
          {stats.overdue > 0 && (
            <div className="flex-1 min-w-0 rounded-xl bg-red-500/10 border border-red-200 px-2 py-1.5 text-center">
              <p className="text-base font-bold text-red-600">{stats.overdue}</p>
              <p className="text-3xs text-red-500 font-medium"><span aria-label="Warning">⚠</span> Overdue</p>
            </div>
          )}
          <div className="flex-1 min-w-0 rounded-xl bg-amber-500/10 border border-amber-100 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-amber-600">{stats.todo}</p>
            <p className="text-3xs text-amber-500 font-medium">📋 To-Do</p>
          </div>
          <div className="flex-1 min-w-0 rounded-xl bg-emerald-500/10 border border-emerald-100 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-emerald-600">{stats.completed}</p>
            <p className="text-3xs text-emerald-500 font-medium">✅ Done</p>
          </div>
        </div>
      )}

      {/* Free tier limit */}
      {atLimit && (
        <div className="mb-3 flex-shrink-0 rounded-xl bg-amber-500/10 border border-amber-200 px-3 py-2 flex items-start gap-2">
          <Lock className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-2xs text-amber-700 leading-snug">
            Free limit: 5 checklists. Upgrade for unlimited.
          </p>
        </div>
      )}

      {/* Checklist list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {checklists.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-6 px-2">
            No checklists yet.<br />
            Ask Viva in <span className="font-semibold text-primary">Planner mode</span> to save a list.
          </p>
        ) : (
          checklists.map(cl => {
            const done = cl.items.filter(i => i.completed).length
            const total = cl.items.length
            const isSelected = selectedChecklistId === cl.id

            return (
              <div
                key={cl.id}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-white/10 border border-transparent hover:border-border'
                }`}
                onClick={() => onSelectChecklist(cl.id)}
              >
                <CheckSquare className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-white/40'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-primary' : 'text-white/70'}`}>
                    {cl.title}
                  </p>
                  <p className="text-2xs text-white/40">{done}/{total} done</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); if (!window.confirm('Delete this checklist? This cannot be undone.')) return; deleteChecklist(userId, cl.id) }}
                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all flex-shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
