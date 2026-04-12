import { useState, useEffect } from 'react'
import { DollarSign, Plus, Trash2, Check, X, ChevronDown, ChevronRight, Edit3 } from 'lucide-react'
import {
  subscribeToBudget,
  setBudgetTotal,
  addBudgetCategory,
  updateBudgetCategory,
  deleteBudgetCategory,
  addLineItem,
  deleteLineItem,
  toggleLineItemPaid,
} from '@/services/budgetService'
import type { BudgetData, BudgetCategory, BudgetLineItem } from '@/services/budgetService'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })

function budgetStatus(spent: number, allocated: number): 'green' | 'amber' | 'red' {
  if (allocated <= 0) return 'green'
  const ratio = spent / allocated
  if (ratio > 1) return 'red'
  if (ratio > 0.8) return 'amber'
  return 'green'
}

const statusColors = {
  green: { bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-600' },
  red: { bg: 'bg-red-500/10', border: 'border-red-200', bar: 'bg-red-400', dot: 'bg-red-400', text: 'text-red-600' },
}

interface BudgetDashboardProps {
  userId: string
}

export default function BudgetDashboard({ userId }: BudgetDashboardProps) {
  const [budget, setBudget] = useState<BudgetData | null | undefined>(undefined)
  const [setupAmount, setSetupAmount] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatAllocated, setNewCatAllocated] = useState('')
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatAllocated, setEditCatAllocated] = useState('')

  // Per-category new line item state
  const [newItemDesc, setNewItemDesc] = useState('')
  const [newItemAmount, setNewItemAmount] = useState('')
  const [newItemVendor, setNewItemVendor] = useState('')
  const [showAddItem, setShowAddItem] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeToBudget(userId, (data) => setBudget(data))
    return unsub
  }, [userId])

  // Loading state
  if (budget === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/40">
        <DollarSign className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Loading budget...</p>
      </div>
    )
  }

  // Setup form
  if (budget === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="w-full max-w-sm bg-white/[0.06] backdrop-blur-sm rounded-2xl border border-border shadow-sm p-8 text-center">
          <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <DollarSign className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-white/85 mb-1">Set Your Wedding Budget</h2>
          <p className="text-xs text-white/40 mb-6">Enter your total budget to get started tracking expenses.</p>
          <input
            type="number"
            min="0"
            value={setupAmount}
            onChange={(e) => setSetupAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && setupAmount.trim() && Number(setupAmount) > 0) {
                setBudgetTotal(userId, Number(setupAmount))
              }
            }}
            placeholder="e.g. 25000"
            className="w-full text-sm bg-white border border-primary/20 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-white/30 mb-4 text-center"
          />
          <button
            onClick={() => {
              if (setupAmount.trim() && Number(setupAmount) > 0) {
                setBudgetTotal(userId, Number(setupAmount))
              }
            }}
            disabled={!setupAmount.trim() || Number(setupAmount) <= 0}
            className="w-full text-sm font-medium bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    )
  }

  // Dashboard
  const totalSpent = budget.categories.reduce((sum, cat) => sum + cat.spent, 0)
  const remaining = budget.totalBudget - totalSpent
  const overallPct = budget.totalBudget > 0 ? Math.min(100, Math.round((totalSpent / budget.totalBudget) * 100)) : 0
  const overallStatus = budgetStatus(totalSpent, budget.totalBudget)

  async function handleAddCategory() {
    const name = newCatName.trim()
    const allocated = Number(newCatAllocated)
    if (!name || allocated <= 0) return
    setNewCatName('')
    setNewCatAllocated('')
    await addBudgetCategory(userId, name, allocated)
  }

  async function handleSaveCategoryEdit(catId: string) {
    const name = editCatName.trim()
    const allocated = Number(editCatAllocated)
    if (!name || allocated <= 0) return
    setEditingCatId(null)
    await updateBudgetCategory(userId, catId, { name, allocated })
  }

  async function handleAddLineItem(categoryId: string) {
    const description = newItemDesc.trim()
    const amount = Number(newItemAmount)
    if (!description || amount <= 0) return
    const vendor = newItemVendor.trim() || null
    setNewItemDesc('')
    setNewItemAmount('')
    setNewItemVendor('')
    setShowAddItem(null)
    await addLineItem(userId, categoryId, { description, amount, vendor, paid: false, date: new Date().toISOString().slice(0, 10) })
  }

  return (
    <div className="flex flex-col h-full bg-white/[0.05] backdrop-blur-sm rounded-2xl border border-border shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white/85">Budget Tracker</h2>
            <p className="text-xs text-white/40">{budget.categories.length} categories</p>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-4">
            <div>
              <span className="text-2xs text-white/40 font-medium block">Total Budget</span>
              <span className="text-sm font-semibold text-white/85">{fmt.format(budget.totalBudget)}</span>
            </div>
            <div>
              <span className="text-2xs text-white/40 font-medium block">Spent</span>
              <span className={`text-sm font-semibold ${statusColors[overallStatus].text}`}>{fmt.format(totalSpent)}</span>
            </div>
            <div>
              <span className="text-2xs text-white/40 font-medium block">Remaining</span>
              <span className={`text-sm font-semibold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt.format(remaining)}</span>
            </div>
          </div>
          <span className={`text-2xs font-semibold ${statusColors[overallStatus].text}`}>{overallPct}%</span>
        </div>
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full ${statusColors[overallStatus].bar} rounded-full transition-all duration-500`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

        {/* Category cards */}
        {budget.categories.map((cat) => {
          const status = budgetStatus(cat.spent, cat.allocated)
          const colors = statusColors[status]
          const catPct = cat.allocated > 0 ? Math.min(100, Math.round((cat.spent / cat.allocated) * 100)) : 0
          const isExpanded = expandedCat === cat.id
          const isEditing = editingCatId === cat.id

          return (
            <div key={cat.id} className={`rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden transition-all duration-200`}>
              {/* Category header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
              >
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
                }
                <div className={`h-2 w-2 rounded-full ${colors.dot} flex-shrink-0`} />

                {isEditing ? (
                  <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCategoryEdit(cat.id); if (e.key === 'Escape') setEditingCatId(null) }}
                      className="flex-1 text-sm bg-white border border-primary/20 rounded-lg px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary/20"
                    />
                    <input
                      type="number"
                      min="0"
                      value={editCatAllocated}
                      onChange={(e) => setEditCatAllocated(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCategoryEdit(cat.id); if (e.key === 'Escape') setEditingCatId(null) }}
                      className="w-20 sm:w-24 text-sm bg-white border border-primary/20 rounded-lg px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary/20"
                    />
                    <button onClick={() => handleSaveCategoryEdit(cat.id)} className="h-6 w-6 flex items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => setEditingCatId(null)} className="h-6 w-6 flex items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.08] transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white/85 truncate">{cat.name}</span>
                        <span className={`text-xs font-semibold ${colors.text}`}>{fmt.format(cat.spent)} / {fmt.format(cat.allocated)}</span>
                      </div>
                      <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                          style={{ width: `${catPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => { setEditingCatId(cat.id); setEditCatName(cat.name); setEditCatAllocated(String(cat.allocated)) }}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-white/30 hover:text-primary hover:bg-white/80 transition-colors"
                        title="Edit category"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { if (!window.confirm('Delete this budget category? This cannot be undone.')) return; deleteBudgetCategory(userId, cat.id) }}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-white/80 transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Expanded: line items */}
              {isExpanded && !isEditing && (
                <div className="px-4 pb-3 space-y-1.5">
                  {cat.items.length === 0 && (
                    <p className="text-xs text-white/40 py-2 text-center">No expenses yet.</p>
                  )}
                  {cat.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.06] border border-border"
                    >
                      <button
                        onClick={() => toggleLineItemPaid(userId, cat.id, item.id)}
                        className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors ${
                          item.paid
                            ? 'bg-emerald-400 border-emerald-400 text-white'
                            : 'border-white/30 text-transparent hover:border-emerald-300'
                        }`}
                        title={item.paid ? 'Mark unpaid' : 'Mark paid'}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm block truncate ${item.paid ? 'line-through text-white/40' : 'text-white/70'}`}>
                          {item.description}
                        </span>
                        <div className="flex items-center gap-2 text-2xs text-white/40">
                          {item.vendor && <span>{item.vendor}</span>}
                          {item.date && <span>{new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-white/60 flex-shrink-0">{fmt.format(item.amount)}</span>
                      <button
                        onClick={() => deleteLineItem(userId, cat.id, item.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                        title="Delete item"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add line item form */}
                  {showAddItem === cat.id ? (
                    <div className="flex flex-col gap-2 p-2 rounded-xl bg-white/[0.06] border border-border">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={newItemDesc}
                          onChange={(e) => setNewItemDesc(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLineItem(cat.id); if (e.key === 'Escape') { setShowAddItem(null); setNewItemDesc(''); setNewItemAmount(''); setNewItemVendor('') } }}
                          placeholder="Description"
                          className="flex-1 text-sm bg-white border border-primary/20 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-white/30"
                        />
                        <input
                          type="number"
                          min="0"
                          value={newItemAmount}
                          onChange={(e) => setNewItemAmount(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLineItem(cat.id) }}
                          placeholder="Amount"
                          className="w-20 text-sm bg-white border border-primary/20 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-white/30"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={newItemVendor}
                          onChange={(e) => setNewItemVendor(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLineItem(cat.id) }}
                          placeholder="Vendor (optional)"
                          className="flex-1 text-sm bg-white border border-primary/20 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-white/30"
                        />
                        <button
                          onClick={() => handleAddLineItem(cat.id)}
                          disabled={!newItemDesc.trim() || !newItemAmount.trim() || Number(newItemAmount) <= 0}
                          className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setShowAddItem(null); setNewItemDesc(''); setNewItemAmount(''); setNewItemVendor('') }}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.08] transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddItem(cat.id)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-blue-700 font-medium py-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add expense
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add category form */}
        <div className="rounded-2xl border border-dashed border-primary/20 bg-white/[0.04] p-4">
          <p className="text-xs text-white/40 font-medium mb-2">Add Category</p>
          <div className="flex items-center gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }}
              placeholder="Category name"
              className="flex-1 text-sm bg-white border border-primary/20 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-white/30"
            />
            <input
              type="number"
              min="0"
              value={newCatAllocated}
              onChange={(e) => setNewCatAllocated(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }}
              placeholder="Budget"
              className="w-24 text-sm bg-white border border-primary/20 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-white/30"
            />
            <button
              onClick={handleAddCategory}
              disabled={!newCatName.trim() || !newCatAllocated.trim() || Number(newCatAllocated) <= 0}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-border flex-shrink-0 flex items-center justify-between">
        <p className="text-xs text-white/40">
          {budget.categories.length === 0
            ? 'Add categories to start tracking'
            : `${budget.categories.length} categor${budget.categories.length === 1 ? 'y' : 'ies'} tracked`}
        </p>
        <div className="flex gap-3 text-2xs font-medium">
          <span className={statusColors[overallStatus].text}>{overallPct}% used</span>
          <span className={remaining >= 0 ? 'text-emerald-500' : 'text-red-500'}>{fmt.format(Math.abs(remaining))} {remaining >= 0 ? 'left' : 'over'}</span>
        </div>
      </div>
    </div>
  )
}
