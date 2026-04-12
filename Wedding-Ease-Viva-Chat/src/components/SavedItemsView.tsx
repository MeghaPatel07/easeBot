import { useState, useEffect, useRef } from 'react'
import { Bookmark, Plus, Trash2, Search, Edit3, X, Tag, MessageSquare } from 'lucide-react'
import {
  subscribeToSavedItems,
  addSavedItem,
  updateSavedItemNote,
  updateSavedItemCategory,
  deleteSavedItem,
} from '@/services/savedItemsService'
import type { SavedItem } from '@/services/savedItemsService'

const CATEGORIES = ['All', 'Vendor', 'Decor', 'Tip', 'Recipe', 'Other'] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Vendor: { bg: 'bg-primary/10', text: 'text-primary' },
  Decor:  { bg: 'bg-pink-100', text: 'text-pink-700' },
  Tip:    { bg: 'bg-amber-100', text: 'text-amber-700' },
  Recipe: { bg: 'bg-green-100', text: 'text-green-700' },
  Other:  { bg: 'bg-white/[0.06]', text: 'text-white/70' },
}

function categoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Other
}

function formatDate(ts: any): string {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface SavedItemsViewProps {
  userId: string
}

export default function SavedItemsView({ userId }: SavedItemsViewProps) {
  const [items, setItems] = useState<SavedItem[]>([])
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newText, setNewText] = useState('')
  const [newCategory, setNewCategory] = useState<string>('Other')
  const [newNote, setNewNote] = useState('')
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const unsub = subscribeToSavedItems(userId, setItems)
    return unsub
  }, [userId])

  useEffect(() => {
    if (showAddForm) textInputRef.current?.focus()
  }, [showAddForm])

  // Filtering
  const filtered = items.filter(item => {
    if (activeCategory !== 'All' && item.category !== activeCategory) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (
        !item.text.toLowerCase().includes(q) &&
        !(item.note ?? '').toLowerCase().includes(q) &&
        !(item.sourceThreadTitle ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  async function handleAdd() {
    const text = newText.trim()
    if (!text) return
    await addSavedItem(userId, {
      text,
      category: newCategory,
      sourceThreadId: null,
      sourceThreadTitle: null,
      note: newNote.trim() || null,
    })
    setNewText('')
    setNewCategory('Other')
    setNewNote('')
    setShowAddForm(false)
  }

  async function handleSaveNote(itemId: string) {
    await updateSavedItemNote(userId, itemId, noteText.trim())
    setEditingNoteId(null)
    setNoteText('')
  }

  async function handleDelete(itemId: string) {
    await deleteSavedItem(userId, itemId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category filter pills */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap flex-shrink-0">
        {CATEGORIES.map(cat => {
          const active = activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{ touchAction: 'manipulation' }}
              className={`px-2.5 py-1 h-9 sm:h-8 rounded-full text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-white/[0.06] text-white/50 border border-white/10 hover:border-blue-200 hover:text-blue-600'
              }`}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* Search bar + add button */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search saved items..."
            className="w-full text-sm bg-white/[0.06] border border-white/10 rounded-xl pl-8 pr-3 py-2 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 placeholder:text-white/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors flex-shrink-0"
          title="Add item manually"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="mb-3 flex-shrink-0 bg-white/[0.06] border border-blue-200 rounded-2xl p-4 space-y-3">
          <textarea
            ref={textInputRef}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Paste or type the snippet to save..."
            rows={3}
            className="w-full text-sm bg-white border border-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200 resize-none placeholder:text-white/30"
          />
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.filter(c => c !== 'All').map(cat => {
                const style = categoryStyle(cat)
                const selected = newCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setNewCategory(cat)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? `${style.bg} ${style.text} ring-2 ring-offset-1 ring-blue-300`
                        : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.06]'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>
          <input
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Optional note..."
            className="w-full text-sm bg-white border border-white/10 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-white/30"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setShowAddForm(false); setNewText(''); setNewNote('') }}
              className="text-xs text-white/40 hover:text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40">
            <Bookmark className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">No saved items yet</p>
            <p className="text-xs text-white/30 mt-1 text-center max-w-[220px]">
              Bookmark snippets from your chats or add them manually with the + button above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filtered.map(item => {
              const style = categoryStyle(item.category)
              const isEditingNote = editingNoteId === item.id
              
              // Check if this is a product card
              let isProduct = false;
              let productData: any = null;
              try {
                if (item.note) {
                  productData = JSON.parse(item.note);
                  isProduct = productData?.type === 'product' && productData?.image && productData?.url;
                }
              } catch (e) {
                // Not JSON, render as normal
              }

              if (isProduct && productData) {
                return (
                  <a
                    key={item.id}
                    href={productData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex flex-col bg-white/[0.06] border border-border hover:border-blue-200 rounded-2xl overflow-hidden transition-all hover:shadow-md"
                  >
                    <div className="relative overflow-hidden bg-white/[0.06] flex-shrink-0 h-32 sm:h-40">
                      <img
                        src={productData.image}
                        alt={item.text}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-lg bg-white/90 text-white/40 hover:text-red-500 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <div className="mb-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-2xs font-medium ${style.bg} ${style.text}`}>
                          {item.category}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white/85 line-clamp-2 flex-1">{item.text}</p>
                      {item.sourceThreadTitle && (
                        <p className="text-2xs text-white/40 mt-auto pt-1.5">{item.sourceThreadTitle}</p>
                      )}
                    </div>
                  </a>
                );
              }

              // Regular item rendering
              return (
                <div
                  key={item.id}
                  className="group relative bg-white/[0.06] border border-border hover:border-border rounded-2xl p-4 transition-all hover:shadow-sm"
                >
                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-50 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>

                  {/* Category badge (click to change) */}
                  <div className="mb-2 relative">
                    <button
                      onClick={() => setEditingCategoryId(editingCategoryId === item.id ? null : item.id)}
                      className={`inline-block px-2 py-0.5 rounded-full text-2xs font-medium ${style.bg} ${style.text} hover:ring-1 hover:ring-offset-1 transition-all cursor-pointer`}
                      title="Click to change category"
                    >
                      {item.category}
                    </button>
                    {editingCategoryId === item.id && (
                      <div className="flex flex-wrap gap-1 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        {CATEGORIES.filter(c => c !== 'All').map(cat => {
                          const cs = categoryStyle(cat)
                          return (
                            <button
                              key={cat}
                              onClick={() => {
                                updateSavedItemCategory(userId, item.id, cat)
                                setEditingCategoryId(null)
                              }}
                              className={`text-3xs px-1.5 py-0.5 rounded-full font-medium transition-all ${
                                item.category === cat
                                  ? `${cs.bg} ${cs.text} ring-1 ring-offset-1`
                                  : 'bg-white/[0.05] text-white/40 border border-white/10 hover:bg-white'
                              }`}
                            >{cat}</button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Text snippet */}
                  <p className="text-sm text-white/70 leading-snug line-clamp-4 mb-2 pr-6">
                    {item.text}
                  </p>

                  {/* Source thread */}
                  {item.sourceThreadTitle && (
                    <div className="flex items-center gap-1 mb-2">
                      <MessageSquare className="h-2.5 w-2.5 text-white/30 flex-shrink-0" />
                      <span className="text-2xs text-white/40 truncate">
                        {item.sourceThreadTitle}
                      </span>
                    </div>
                  )}

                  {/* Note */}
                  {isEditingNote ? (
                    <div className="flex items-center gap-1.5 mb-2">
                      <input
                        autoFocus
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveNote(item.id)
                          if (e.key === 'Escape') { setEditingNoteId(null); setNoteText('') }
                        }}
                        placeholder="Add a note..."
                        className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-300 placeholder:text-white/30"
                      />
                      <button
                        onClick={() => handleSaveNote(item.id)}
                        className="text-2xs text-blue-500 hover:text-blue-700 font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingNoteId(null); setNoteText('') }}
                        className="text-white/30 hover:text-white/50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : item.note ? (
                    <div
                      className="flex items-start gap-1.5 mb-2 cursor-pointer group/note"
                      onClick={() => { setEditingNoteId(item.id); setNoteText(item.note ?? '') }}
                    >
                      <Edit3 className="h-2.5 w-2.5 text-white/30 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-white/40 italic leading-snug group-hover/note:text-white/60 transition-colors">
                        {item.note}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingNoteId(item.id); setNoteText('') }}
                      className="flex items-center gap-1 text-2xs text-white/30 hover:text-blue-500 transition-colors mb-2"
                    >
                      <Edit3 className="h-2.5 w-2.5" />
                      Add note
                    </button>
                  )}

                  {/* Date */}
                  <p className="text-2xs text-white/30">
                    {formatDate(item.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  )
}
