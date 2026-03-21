import { useState, useEffect, useRef } from 'react'
import { CheckSquare, X, Pencil, Trash2, Plus, Check, Calendar, AlertTriangle } from 'lucide-react'
import {
  subscribeToChecklists,
  toggleItemDone,
  updateChecklistItem,
  addChecklistItem,
  deleteChecklistItem,
  updateItemDueDate,
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
      return <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{vendorName}</a>
    }
    return (
      <span key={i} className="font-medium text-gray-700">
        {vendorName}
        <button className="ml-1 text-[10px] text-primary hover:underline" onClick={() => window.open(`/search?q=${encodeURIComponent(vendorName)}`, '_blank')}>
          Save vendor?
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
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
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

  async function handleDueDateChange(itemId: string, date: string) {
    await updateItemDueDate(userId, checklist!.id, itemId, date || null)
    setEditingDueDateId(null)
  }

  return (
    <div className="flex flex-col h-full bg-white/60 backdrop-blur-sm rounded-2xl border border-blue-100 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-blue-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <CheckSquare className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">{checklist.title}</h2>
            <p className="text-xs text-gray-400">
              {done} of {total} completed
              {overdue > 0 && <span className="ml-1.5 text-red-500 font-medium">· {overdue} overdue</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddInput(v => !v)}
            className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-2.5 py-1.5 transition-colors font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors ml-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 py-3 flex-shrink-0 border-b border-blue-50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400 font-medium">Progress</span>
          <span className="text-[10px] font-semibold text-blue-500">{pct}%</span>
        </div>
        <div className="h-1.5 bg-blue-50 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Add item input */}
      {showAddInput && (
        <div className="px-6 py-3 border-b border-blue-50 flex-shrink-0 flex items-center gap-2">
          <input
            ref={addInputRef}
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddItem()
              if (e.key === 'Escape') { setShowAddInput(false); setNewItemText('') }
            }}
            placeholder="Type a new task and press Enter…"
            className="flex-1 text-sm bg-white border border-blue-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300"
          />
          <button
            onClick={handleAddItem}
            disabled={!newItemText.trim()}
            className="h-8 w-8 flex items-center justify-center rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setShowAddInput(false); setNewItemText('') }}
            className="h-8 w-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <CheckSquare className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No items yet.</p>
            <button
              onClick={() => setShowAddInput(true)}
              className="mt-3 text-xs text-blue-500 hover:underline"
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
                className={`flex flex-col gap-1 p-3 rounded-xl border transition-all duration-200 group ${
                  isOverdue
                    ? 'bg-red-50/50 border-red-200'
                    : item.completed
                    ? 'bg-emerald-50/50 border-emerald-100'
                    : 'bg-white/70 border-gray-100 hover:border-blue-100 hover:bg-white/90'
                } ${justToggled ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {/* Number badge */}
                  <span className={`flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isOverdue ? 'bg-red-100 text-red-600' : item.completed ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-400'
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
                      className="flex-1 text-sm bg-white border border-blue-200 rounded-lg px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-300"
                    />
                  ) : (
                    <span
                      className={`flex-1 text-sm leading-snug ${
                        item.completed ? 'line-through text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {renderItemText(item.text, favourites)}
                    </span>
                  )}

                  {/* Action buttons — always visible on mobile, hover on desktop */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => setEditingDueDateId(editingDueDateId === item.id ? null : item.id)}
                        className={`h-7 w-7 flex items-center justify-center rounded-lg transition-colors ${
                          item.dueDate ? 'text-blue-400 hover:text-blue-700 hover:bg-blue-70' : 'text-gray-500 hover:text-blue-500 hover:bg-blue-50'
                        }`}
                        title="Set due date"
                      >
                        <Calendar className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { setEditingItemId(item.id); setEditText(item.text) }}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* Confirm / cancel while editing */}
                  {isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => submitEdit(item.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { setEditingItemId(null); setEditText('') }}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
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
                      className="text-xs border border-blue-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                    />
                    {item.dueDate && (
                      <button
                        onClick={() => handleDueDateChange(item.id, '')}
                        className="text-[10px] text-gray-400 hover:text-red-400 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
                {item.dueDate && editingDueDateId !== item.id && (
                  <div className={`ml-12 text-[10px] font-medium flex items-center gap-1 ${
                    isOverdue ? 'text-red-500' : 'text-gray-400'
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
      <div className="px-6 py-3 border-t border-blue-50 flex-shrink-0 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {done === total && total > 0
            ? '🎉 All tasks complete!'
            : `${total - done} task${total - done !== 1 ? 's' : ''} remaining`}
        </p>
        <div className="flex gap-3 text-[10px] font-medium">
          {overdue > 0 && <span className="text-red-500">⚠ {overdue} Overdue</span>}
          <span className="text-amber-500">📋 {total - done} To-Do</span>
          <span className="text-emerald-500">✅ {done} Done</span>
        </div>
      </div>
    </div>
  )
}
