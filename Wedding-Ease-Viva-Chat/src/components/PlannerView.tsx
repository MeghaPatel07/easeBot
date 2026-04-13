import { useState, useEffect } from 'react'
import { Trash2, CheckSquare, Lock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  subscribeToChecklists,
  deleteChecklist,
  createChecklist,
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
  onBack: _onBack,
  selectedChecklistId,
  onSelectChecklist,
}: PlannerViewProps) {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newItems, setNewItems] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const unsub = subscribeToChecklists(userId, setChecklists)
    return unsub
  }, [userId])

  const stats = computeStats(checklists)
  const atLimit = !isPremium && checklists.length >= 5

  const resetForm = () => {
    setNewTitle('')
    setNewItems('')
  }

  const handleCreate = async () => {
    const title = newTitle.trim()
    if (!title) {
      toast.error('Title is required')
      return
    }
    if (atLimit) {
      toast.error('Free plan limited to 5 checklists. Upgrade to add more.')
      return
    }
    const itemTexts = newItems
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)

    setCreating(true)
    try {
      const created = await createChecklist(userId, title, itemTexts)
      toast.success('Checklist created')
      setDialogOpen(false)
      resetForm()
      onSelectChecklist(created.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create checklist'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="mb-3 px-1 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => {
            if (atLimit) {
              toast.error('Free plan limited to 5 checklists. Upgrade to add more.')
              return
            }
            setDialogOpen(true)
          }}
          className="w-full h-9 rounded-xl gap-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          New Checklist
        </Button>
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
            Tap <span className="font-semibold text-primary">+ New Checklist</span> above, or ask Viva in <span className="font-semibold text-primary">Planner mode</span> to save a list.
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

      <Dialog
        open={dialogOpen}
        onOpenChange={o => {
          setDialogOpen(o)
          if (!o) resetForm()
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md glass-panel rounded-2xl p-6 border border-white/[0.1] shadow-2xl bg-[#1a1a1a]/95 backdrop-blur-md flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg text-white/90">
              New Checklist
            </DialogTitle>
            <DialogDescription className="text-white/40 text-xs">
              Give your checklist a name and optionally add starting items, one per line.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checklist-title" className="text-xs font-medium text-white/70">
                Title
              </label>
              <Input
                id="checklist-title"
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Venue shortlist"
                disabled={creating}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checklist-items" className="text-xs font-medium text-white/70">
                Starting items <span className="text-white/30">(optional)</span>
              </label>
              <Textarea
                id="checklist-items"
                value={newItems}
                onChange={e => setNewItems(e.target.value)}
                placeholder={'Book tasting\nConfirm florist\nSend invites'}
                rows={5}
                disabled={creating}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                resetForm()
              }}
              disabled={creating}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="rounded-xl"
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
