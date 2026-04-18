import { useEffect, useRef, useState } from 'react'
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
import { toast } from 'sonner'
import {
  subscribeToChecklists,
  deleteChecklist,
  createChecklist,
  computeStats,
} from '@/services/checklistService'
import { useChatAttachments } from '@/contexts/ChatAttachmentsContext'
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const { addAttachment } = useChatAttachments()

  useEffect(() => {
    const unsub = subscribeToChecklists(userId, setChecklists)
    return unsub
  }, [userId])

  // Dismiss the more-menu on outside tap/click
  useEffect(() => {
    if (!openMenuId) return
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (menuContainerRef.current && !menuContainerRef.current.contains(target)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [openMenuId])

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
      toast.error('Plan limited to 5 checklists. Upgrade to add more.')
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
      // onSnapshot subscription will push the new checklist into state
      // automatically — we still call onSelectChecklist to navigate into it.
      onSelectChecklist(created.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create checklist'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleAttachToChat = (cl: Checklist) => {
    setOpenMenuId(null)
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
    setOpenMenuId(null)
    const text = `${cl.title}\n${cl.items
      .map(i => `${i.completed ? '✅' : '☐'} ${i.text}`)
      .join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleDelete = (cl: Checklist) => {
    setOpenMenuId(null)
    if (!window.confirm('Delete this checklist? This cannot be undone.')) return
    deleteChecklist(userId, cl.id).catch(() => toast.error('Failed to delete'))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="mb-3 px-1 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => {
            if (atLimit) {
              toast.error('Plan limited to 5 checklists. Upgrade to add more.')
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
            <div className="flex-1 min-w-0 rounded-xl bg-red-500/10 border border-red-200 px-2 py-1.5 text-center">
              <p className="text-base font-bold text-red-600">{stats.overdue}</p>
              <p className="text-3xs text-red-500 font-medium"><span aria-label="Warning">⚠</span> Overdue</p>
            </div>
          )}
          <div className="flex-1 min-w-0 rounded-xl bg-amber-500/10 border border-amber-500/20 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-amber-600">{stats.todo}</p>
            <p className="text-3xs text-amber-500 font-medium">📋 To-Do</p>
          </div>
          <div className="flex-1 min-w-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-emerald-600">{stats.completed}</p>
            <p className="text-3xs text-emerald-500 font-medium">✅ Done</p>
          </div>
        </div>
      )}

      {/* Free tier limit */}
      {atLimit && (
        <div className="mb-3 flex-shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 flex items-start gap-2">
          <Lock className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-2xs text-amber-700 leading-snug">
            Limit: 5 checklists. Upgrade for unlimited.
          </p>
        </div>
      )}

      {/* Checklist list */}
      <div className="flex-1 overflow-y-auto space-y-1" style={{ touchAction: 'pan-y' }}>
        {checklists.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-6 px-2">
            No checklists yet.<br />
            Tap <span className="font-semibold text-primary">+ New Checklist</span> above, or ask TheWeddingBot in <span className="font-semibold text-primary">Planner mode</span> to save a list.
          </p>
        ) : (
          checklists.map(cl => {
            const done = cl.items.filter(i => i.completed).length
            const total = cl.items.length
            const isSelected = selectedChecklistId === cl.id
            const menuOpen = openMenuId === cl.id

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
                    : 'hover:bg-white/10 border border-transparent hover:border-border'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <CheckSquare className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-white/40'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-primary' : 'text-white/70'}`}>
                    {cl.title}
                  </p>
                  <p className="text-2xs text-white/40">{done}/{total} done</p>
                </div>
                <div
                  className="relative flex-shrink-0"
                  ref={menuOpen ? menuContainerRef : undefined}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label={`More actions for ${cl.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={e => {
                      e.stopPropagation()
                      setOpenMenuId(menuOpen ? null : cl.id)
                    }}
                    className="inline-flex items-center justify-center h-9 w-9 sm:h-7 sm:w-7 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 active:bg-white/15 sm:opacity-60 sm:group-hover:opacity-100 transition-all touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <MoreVertical className="h-4 w-4 sm:h-3 sm:w-3" />
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-1 z-50 bg-black/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAttachToChat(cl)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-primary hover:bg-primary/10 active:bg-primary/15 transition-colors min-h-[40px] touch-manipulation"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" /> Attach to chat
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopy(cl)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-white/80 hover:bg-white/10 active:bg-white/15 hover:text-white transition-colors min-h-[40px] touch-manipulation"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(cl)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors min-h-[40px] touch-manipulation"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  )}
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
        <DialogContent className="w-[calc(100%-2rem)] max-w-md glass-panel rounded-2xl p-6 border border-white/[0.08] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] bg-[#0F0D0C]/90 backdrop-blur-2xl flex flex-col gap-4">
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
