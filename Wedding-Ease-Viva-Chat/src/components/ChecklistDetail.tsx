import { useState, useEffect, useRef } from 'react'
import { CheckSquare, X, Pencil, Trash2, Plus, Check, Calendar, AlertTriangle, Copy, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  subscribeToChecklists,
  toggleItemDone,
  updateChecklistItem,
  addChecklistItem,
  deleteChecklistItem,
  updateItemDueDate,
  reorderChecklistItems,
} from '@/services/checklistService'
import type { Checklist, ChecklistItem } from '@/types'

function renderItemText(text: string, favourites: string[]): React.ReactNode {
  const parts = text.split(/(\[\[Vendor:[^\]]+\]\])/g)
  return parts.map((part, i) => {
    const match = part.match(/\[\[Vendor:([^\]]+)\]\]/)
    if (!match) return <span key={i}>{part}</span>
    const vendorName = match[1].trim()
    const link = favourites.find(f => f.toLowerCase().includes(vendorName.toLowerCase()))
    if (link) {
      return <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">{vendorName}</a>
    }
    return (
      <span key={i} className="font-medium text-white/70">
        {vendorName}
        <button className="ml-1 text-2xs text-primary hover:underline" onClick={() => window.open(`/search?q=${encodeURIComponent(vendorName)}`, '_blank')}>
          Find vendor
        </button>
      </span>
    )
  })
}

interface ChecklistDetailProps {
  userId: string
  checklistId: string
  favourites: string[]
  recentlyToggledItemIds?: string[]
  onClose: () => void
}

export default function ChecklistDetail({
  userId,
  checklistId,
  favourites,
  recentlyToggledItemIds = [],
  onClose,
}: ChecklistDetailProps) {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [newItemText, setNewItemText] = useState('')
  const [showAddInput, setShowAddInput] = useState(false)
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragItemRef = useRef<string | null>(null)
  const dragOverItemRef = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const unsub = subscribeToChecklists(userId, setChecklists)
    return unsub
  }, [userId])

  useEffect(() => {
    if (showAddInput) addInputRef.current?.focus()
  }, [showAddInput])

  const checklist = checklists.find(cl => cl.id === checklistId)

  if (!checklist) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/40">
        <CheckSquare className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Loading checklist…</p>
      </div>
    )
  }

  // Sort: overdue first, then by due date, then items without due dates
  const sortedItems = [...checklist.items].sort((a, b) => {
    // Completed items go last
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    // Overdue items first
    const aOverdue = !a.completed && a.dueDate && a.dueDate < today
    const bOverdue = !b.completed && b.dueDate && b.dueDate < today
    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1
    // Then by due date (earliest first)
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate && !b.dueDate) return -1
    if (!a.dueDate && b.dueDate) return 1
    return 0
  })

  const done = checklist.items.filter(i => i.completed).length
  const total = checklist.items.length
  const overdue = checklist.items.filter(i => !i.completed && i.dueDate && i.dueDate < today).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  async function handleToggle(itemId: string) {
    await toggleItemDone(userId, checklist!.id, itemId)
  }

  async function submitEdit(itemId: string) {
    if (editText.trim()) {
      await updateChecklistItem(userId, checklist!.id, itemId, editText.trim())
    }
    setEditingItemId(null)
    setEditText('')
  }

  async function handleAddItem() {
    const text = newItemText.trim()
    if (!text) return
    setNewItemText('')
    setShowAddInput(false)
    await addChecklistItem(userId, checklist!.id, text)
  }

  async function handleDeleteItem(itemId: string) {
    await deleteChecklistItem(userId, checklist!.id, itemId)
  }

  async function handleCopyItem(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  function handleDragStart(itemId: string) {
    dragItemRef.current = itemId
  }

  function handleDragOver(e: React.DragEvent, itemId: string) {
    e.preventDefault()
    dragOverItemRef.current = itemId
    setDragOverId(itemId)
  }

  function handleDragEnd() {
    setDragOverId(null)
    if (!dragItemRef.current || !dragOverItemRef.current || dragItemRef.current === dragOverItemRef.current) {
      dragItemRef.current = null
      dragOverItemRef.current = null
      return
    }
    const items = [...sortedItems]
    const dragIdx = items.findIndex(i => i.id === dragItemRef.current)
    const overIdx = items.findIndex(i => i.id === dragOverItemRef.current)
    if (dragIdx === -1 || overIdx === -1) return
    const [dragged] = items.splice(dragIdx, 1)
    items.splice(overIdx, 0, dragged)
    const orderedIds = items.map(i => i.id)
    reorderChecklistItems(userId, checklist!.id, orderedIds).catch(() =>
      toast.error('Failed to reorder items')
    )
    dragItemRef.current = null
    dragOverItemRef.current = null
  }

  async function handleDueDateChange(itemId: string, date: string) {
    await updateItemDueDate(userId, checklist!.id, itemId, date || null)
    setEditingDueDateId(null)
  }

  async function handleCopyAsMarkdown() {
    if (!checklist) return
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const lines = [`# ${checklist.title}`, '']
    for (const item of checklist.items) {
      lines.push(`- [${item.completed ? 'x' : ' '}] ${item.text}`)
    }
    const markdown = lines.join('\n')

    const taskItems = checklist.items
      .map(
        (item) =>
          `<li data-type="taskItem" data-checked="${item.completed ? 'true' : 'false'}"><p>${escapeHtml(item.text)}</p></li>`
      )
      .join('')
    const html =
      `<h1>${escapeHtml(checklist.title)}</h1>` +
      `<ul data-type="taskList">${taskItems}</ul>`

    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([markdown], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(markdown)
      }
      toast.success('Copied! Paste it into the Notes tab.')
    } catch {
      try {
        await navigator.clipboard.writeText(markdown)
        toast.success('Copied! Paste it into the Notes tab.')
      } catch {
        toast.error("Couldn't copy to clipboard.")
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-white/[0.05] backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <CheckSquare className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white/85">{checklist.title}</h2>
            <p className="text-xs text-white/40">
              {done} of {total} completed
              {overdue > 0 && <span className="ml-1.5 text-red-500 font-medium">· {overdue} overdue</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAsMarkdown}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/70 bg-primary/10 hover:bg-primary/15 rounded-lg px-2.5 py-1.5 transition-colors font-medium"
            title="Copy as markdown"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          <button
            onClick={() => setShowAddInput(v => !v)}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/70 bg-primary/10 hover:bg-primary/15 rounded-lg px-2.5 py-1.5 transition-colors font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
          <button onClick={onClose} className="text-white/30 hover:text-white/50 transition-colors ml-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 py-3 flex-shrink-0 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-2xs text-white/40 font-medium">Progress</span>
          <span className="text-2xs font-semibold text-primary">{pct}%</span>
        </div>
        <div className="h-1.5 bg-primary/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Add item input */}
      {showAddInput && (
        <div className="px-6 py-3 border-b flex-shrink-0 flex items-center gap-2">
          <input
            ref={addInputRef}
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddItem()
              if (e.key === 'Escape') { setShowAddInput(false); setNewItemText('') }
            }}
            placeholder="Type a new task and press Enter…"
            className="flex-1 text-sm bg-white/[0.04] border border-white/10 text-white/90 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-white/30"
          />
          <button
            onClick={handleAddItem}
            disabled={!newItemText.trim()}
            className="h-8 w-8 flex items-center justify-center rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setShowAddInput(false); setNewItemText('') }}
            className="h-8 w-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white/60 hover:bg-white/[0.08] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/40">
            <CheckSquare className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">No items yet.</p>
            <button
              onClick={() => setShowAddInput(true)}
              className="mt-3 text-xs text-primary hover:underline"
            >
              + Add the first item
            </button>
          </div>
        ) : (
          sortedItems.map((item, idx) => {
            const justToggled = recentlyToggledItemIds.includes(item.id)
            const isEditing = editingItemId === item.id
            const isOverdue = !item.completed && item.dueDate && item.dueDate < today

            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragEnd={handleDragEnd}
                className={`flex flex-col gap-1 p-3 rounded-xl border transition-all duration-200 group cursor-grab active:cursor-grabbing ${
                  isOverdue
                    ? 'bg-red-500/10/50 border-red-200'
                    : item.completed
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-white/[0.06] border-white/[0.06] hover:hover:bg-white/[0.08]'
                } ${justToggled ? 'ring-2 ring-blue-300 ring-offset-1' : ''} ${dragOverId === item.id ? 'border-primary/50 bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {/* Number badge */}
                  <span className={`flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-2xs font-bold ${
                    isOverdue ? 'bg-red-500/15 text-red-300' : item.completed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-primary/10 text-primary'
                  }`}>
                    {isOverdue ? '!' : item.completed ? '✓' : idx + 1}
                  </span>

                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggle(item.id)}
                    className="h-4 w-4 rounded accent-blue-500 flex-shrink-0 cursor-pointer"
                  />

                  {/* Text / edit input */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') submitEdit(item.id)
                        if (e.key === 'Escape') { setEditingItemId(null); setEditText('') }
                      }}
                      onBlur={() => submitEdit(item.id)}
                      className="flex-1 text-sm bg-white/[0.04] border border-white/10 text-white/90 rounded-lg px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  ) : (
                    <span
                      className={`flex-1 text-sm leading-snug ${
                        item.completed ? 'line-through text-white/40' : 'text-white/70'
                      }`}
                    >
                      {renderItemText(item.text, favourites)}
                    </span>
                  )}

                  {/* 3-dot menu — always visible on mobile, hover on desktop */}
                  {!isEditing && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0"
                          title="More actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[140px]">
                        <DropdownMenuItem onClick={() => { setEditingItemId(item.id); setEditText(item.text) }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopyItem(item.text)}>
                          <Copy className="h-3.5 w-3.5 mr-2" />
                          Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingDueDateId(editingDueDateId === item.id ? null : item.id)}>
                          <Calendar className="h-3.5 w-3.5 mr-2" />
                          {item.dueDate ? 'Change due date' : 'Set due date'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteItem(item.id)} className="text-red-400 focus:text-red-400">
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {/* Confirm / cancel while editing */}
                  {isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => submitEdit(item.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { setEditingItemId(null); setEditText('') }}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.08] transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Due date row */}
                {editingDueDateId === item.id && (
                  <div className="flex items-center gap-2 ml-12 animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                      type="date"
                      value={item.dueDate ?? ''}
                      onChange={e => handleDueDateChange(item.id, e.target.value)}
                      className="text-xs border border-white/10 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30 bg-white/[0.04] text-white/90"
                    />
                    {item.dueDate && (
                      <button
                        onClick={() => handleDueDateChange(item.id, '')}
                        className="text-2xs text-white/40 hover:text-red-400 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
                {item.dueDate && editingDueDateId !== item.id && (
                  <div className={`ml-12 text-2xs font-medium flex items-center gap-1 ${
                    isOverdue ? 'text-red-500' : 'text-white/40'
                  }`}>
                    {isOverdue && <AlertTriangle className="h-2.5 w-2.5" />}
                    Due {new Date(item.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {isOverdue && ' — Overdue'}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t flex-shrink-0 flex items-center justify-between">
        <p className="text-xs text-white/40">
          {done === total && total > 0
            ? '🎉 All tasks complete!'
            : `${total - done} task${total - done !== 1 ? 's' : ''} remaining`}
        </p>
        <div className="flex gap-3 text-2xs font-medium">
          {overdue > 0 && <span className="text-red-500">⚠ {overdue} Overdue</span>}
          <span className="text-amber-500">📋 {total - done} To-Do</span>
          <span className="text-emerald-500">✅ {done} Done</span>
        </div>
      </div>
    </div>
  )
}
