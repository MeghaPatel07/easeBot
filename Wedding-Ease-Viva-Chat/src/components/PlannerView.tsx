import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, CheckSquare, Lock, Plus, MoreVertical, Copy, MessageSquarePlus } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  subscribeToChecklists,
  deleteChecklist,
  createChecklist,
  computeStats,
} from '@/services/checklistService'
import { useChatAttachments } from '@/contexts/ChatAttachmentsContext'
import { useAuth } from '@/contexts/AuthContext'
import ExportMenu from '@/components/ExportMenu'
import type { Checklist } from '@/types'
import { track } from '@/lib/analytics'
import { resolveTier, getLimits } from '@/config/tierConfig'
import { ChecklistLimitError } from '@/services/checklistLimits'

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
  const navigate = useNavigate()
  const { addAttachment } = useChatAttachments()
  const { profile } = useAuth()

  useEffect(() => {
    const unsub = subscribeToChecklists(userId, setChecklists)
    return unsub
  }, [userId])

  // Fire planner_view_opened once per mount. Planner currently renders a
  // single list view (no month/week/day toggle), so we report 'list'.
  useEffect(() => {
    track('planner_view_opened', { view: 'list' })
  }, [])

  const stats = computeStats(checklists)
  // Resolve the cap from the actual tier (tierConfig is the single source of
  // truth) rather than the raw isPremium boolean, so pro/promax users whose
  // isPremium flag is unset are not wrongly limited (WE-20260601-103).
  const maxChecklists = getLimits(resolveTier(profile)).maxChecklists
  const atLimit = maxChecklists != null && checklists.length >= maxChecklists
  const limitCopy = `Plan limited to ${maxChecklists} checklists. Upgrade to add more.`

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
      toast.error(limitCopy)
      return
    }
    const itemTexts = newItems
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)

    setCreating(true)
    try {
      const created = await createChecklist(userId, title, itemTexts, profile)
      track('checklist_created', { checklist_id: created.id, item_count: itemTexts.length, source: 'planner' })
      toast.success('Checklist created')
      setDialogOpen(false)
      resetForm()
      // onSnapshot subscription will push the new checklist into state
      // automatically — we still call onSelectChecklist to navigate into it.
      onSelectChecklist(created.id)
    } catch (err: unknown) {
      // Cap hit at the service layer (the authoritative, server-counted gate) —
      // surface the upgrade message instead of a generic failure toast.
      const msg = err instanceof ChecklistLimitError
        ? err.message
        : err instanceof Error ? err.message : 'Failed to create checklist'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleAttachToChat = (cl: Checklist) => {
    const total = cl.items.length
    const completed = cl.items.filter(i => i.completed).length
    const firstFive = cl.items.slice(0, 5).map(i => i.text).filter(Boolean)
    const preview = total === 0
      ? `${completed}/${total} done — (empty checklist)`
      : `${completed}/${total} done — first ${firstFive.length} items: ${firstFive.join(', ')}`
    // Convert Firestore Timestamp to ISO string so the payload stays
    // JSON-serializable (backend chatController serializes this over the wire).
    let createdAtIso: string | null = null
    try {
      createdAtIso = cl.createdAt?.toDate?.().toISOString() ?? null
    } catch {
      createdAtIso = null
    }
    addAttachment({
      kind: 'checklist',
      id: cl.id,
      title: cl.title,
      preview,
      payload: {
        checklistId: cl.id,
        title: cl.title,
        items: cl.items.map(i => ({ label: i.text, done: i.completed })),
        createdAt: createdAtIso,
      },
    })
    toast.success('Checklist attached — ask Viva about it in chat')
    navigate('/')
  }

  const handleCopy = async (cl: Checklist) => {
    const text = `${cl.title}\n${cl.items
      .map(i => `${i.completed ? '✅' : '☐'} ${i.text}`)
      .join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      track('checklist_shared', { checklist_id: cl.id, channel: 'copy' })
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleDelete = (cl: Checklist) => {
    if (!window.confirm('Delete this checklist? This cannot be undone.')) return
    deleteChecklist(userId, cl.id)
      .then(() => track('checklist_deleted', { checklist_id: cl.id }))
      .catch(() => toast.error('Failed to delete'))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="mb-3 px-1 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => {
            if (atLimit) {
              toast.error(limitCopy)
              return
            }
            setDialogOpen(true)
          }}
          className="w-full h-11 sm:h-9 rounded-xl gap-1.5 text-xs font-medium touch-manipulation"
        >
          <Plus className="h-3.5 w-3.5" />
          New Checklist
        </Button>
      </div>

      {/* Kanban stats */}
      {checklists.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 flex-shrink-0">
          {stats.overdue > 0 && (
            <div className="flex-1 min-w-0 rounded-xl bg-destructive/10 border border-destructive/20 px-2 py-1.5 text-center">
              <p className="text-base font-bold text-destructive">{stats.overdue}</p>
              <p className="text-3xs text-destructive font-medium"><span aria-label="Warning">⚠</span> Overdue</p>
            </div>
          )}
          <div className="flex-1 min-w-0 rounded-xl bg-cat-budget/10 border border-cat-budget/20 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-cat-budget-deep">{stats.todo}</p>
            <p className="text-3xs text-cat-budget font-medium">📋 To-Do</p>
          </div>
          <div className="flex-1 min-w-0 rounded-xl bg-success/10 border border-success/20 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-success">{stats.completed}</p>
            <p className="text-3xs text-success font-medium">✅ Done</p>
          </div>
        </div>
      )}

      {/* Free tier limit */}
      {atLimit && (
        <div className="mb-3 flex-shrink-0 rounded-xl bg-cat-budget/10 border border-cat-budget/25 px-3 py-2 flex items-start gap-2">
          <Lock className="h-3 w-3 text-cat-budget flex-shrink-0 mt-0.5" />
          <p className="text-2xs text-cat-budget-darker leading-snug">
            Limit: {maxChecklists} checklists. Upgrade for unlimited.
          </p>
        </div>
      )}

      {/* Checklist list */}
      <div className="flex-1 overflow-y-auto space-y-1" style={{ touchAction: 'pan-y' }}>
        {checklists.length === 0 ? (
          <p className="text-xs text-foreground/40 text-center py-6 px-2">
            No checklists yet.<br />
            Tap <span className="font-semibold text-primary">+ New Checklist</span> above, or ask TheWeddingBot in <span className="font-semibold text-primary">Planner mode</span> to save a list.
          </p>
        ) : (
          checklists.map(cl => {
            const done = cl.items.filter(i => i.completed).length
            const total = cl.items.length
            const isSelected = selectedChecklistId === cl.id

            return (
              <div
                key={cl.id}
                role="button"
                tabIndex={0}
                aria-label={`Open checklist ${cl.title}`}
                aria-pressed={isSelected}
                onClick={() => onSelectChecklist(cl.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectChecklist(cl.id)
                  }
                }}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 min-h-[44px] cursor-pointer transition-all touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  isSelected
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-foreground/10 border border-transparent hover:border-border'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <CheckSquare className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-foreground/40'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground/70'}`}>
                    {cl.title}
                  </p>
                  <p className="text-2xs text-foreground/40">{done}/{total} done</p>
                </div>
                <div
                  className="flex-shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`More actions for ${cl.title}`}
                        className="inline-flex items-center justify-center h-9 w-9 sm:h-7 sm:w-7 rounded-lg text-foreground/40 hover:text-foreground/80 hover:bg-foreground/10 active:bg-foreground/15 sm:opacity-60 sm:group-hover:opacity-100 data-[state=open]:opacity-100 transition-all touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <MoreVertical className="h-4 w-4 sm:h-3 sm:w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4} className="min-w-[160px]">
                      <DropdownMenuItem
                        onSelect={() => handleAttachToChat(cl)}
                        className="text-xs text-primary focus:text-primary focus:bg-primary/10 gap-2 py-2 cursor-pointer"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" /> Attach to chat
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleCopy(cl)}
                        className="text-xs gap-2 py-2 cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </DropdownMenuItem>
                      <ExportMenu
                        profile={profile}
                        source="checklist"
                        sourceId={cl.id}
                        filenameBase={cl.title?.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase() || 'checklist'}
                        data={[{
                          title: cl.title || 'Checklist',
                          items: cl.items.map(i => ({ text: i.text, completed: i.completed })),
                        }]}
                      />
                      <DropdownMenuItem
                        onSelect={() => handleDelete(cl)}
                        className="text-xs text-destructive focus:text-destructive focus:bg-destructive/10 gap-2 py-2 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
        <DialogContent className="w-[calc(100%-2rem)] max-w-md glass-panel rounded-2xl p-6 border border-foreground/[0.08] shadow-modal bg-card-elevated/90 backdrop-blur-2xl flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg text-foreground/90">
              New Checklist
            </DialogTitle>
            <DialogDescription className="text-foreground/40 text-xs">
              Give your checklist a name and optionally add starting items, one per line.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checklist-title" className="text-xs font-medium text-foreground/70">
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
              <label htmlFor="checklist-items" className="text-xs font-medium text-foreground/70">
                Starting items <span className="text-foreground/30">(optional)</span>
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
              className="rounded-xl touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="rounded-xl touch-manipulation"
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
