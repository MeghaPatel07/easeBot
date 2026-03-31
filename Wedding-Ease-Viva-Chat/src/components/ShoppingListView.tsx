import { useState, useEffect, useRef } from 'react'
import {
  ShoppingCart,
  Plus,
  Trash2,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Package,
  Store,
  ChevronLeft,
} from 'lucide-react'
import {
  subscribeToShoppingLists,
  createShoppingList,
  deleteShoppingList,
  addShoppingItem,
  deleteShoppingItem,
  toggleItemPurchased,
} from '@/services/shoppingService'
import type { ShoppingList, ShoppingItem } from '@/services/shoppingService'

interface ShoppingListViewProps {
  userId: string
}

interface VendorProduct {
  id: string
  vendorName: string
  productName: string
  price?: number | null
  link?: string | null
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return ''
  return `$${price.toFixed(2)}`
}

export default function ShoppingListView({ userId }: ShoppingListViewProps) {
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [expandedListId, setExpandedListId] = useState<string | null>(null)
  const [newListTitle, setNewListTitle] = useState('')
  const [showNewListInput, setShowNewListInput] = useState(false)
  const [addingItemToListId, setAddingItemToListId] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemLink, setNewItemLink] = useState('')
  const [showVendorTab, setShowVendorTab] = useState(false)
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([])
  const [newVendorName, setNewVendorName] = useState('')
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('')
  const [newProductLink, setNewProductLink] = useState('')
  const newListInputRef = useRef<HTMLInputElement>(null)
  const newItemNameRef = useRef<HTMLInputElement>(null)
  const vendorNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = subscribeToShoppingLists(userId, setLists)
    return unsub
  }, [userId])

  useEffect(() => {
    if (showNewListInput) newListInputRef.current?.focus()
  }, [showNewListInput])

  useEffect(() => {
    if (addingItemToListId) newItemNameRef.current?.focus()
  }, [addingItemToListId])

  useEffect(() => {
    if (showVendorTab) vendorNameRef.current?.focus()
  }, [showVendorTab])

  // ── Summary stats ────────────────────────────────────────────────────────

  const totalItems = lists.reduce((sum, l) => sum + l.items.length, 0)
  const totalPurchased = lists.reduce(
    (sum, l) => sum + l.items.filter(i => i.purchased).length,
    0
  )
  const totalEstimatedCost = lists.reduce(
    (sum, l) => sum + l.items.reduce((s, i) => s + (i.price ?? 0), 0),
    0
  )

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleCreateList() {
    const title = newListTitle.trim()
    if (!title) return
    setNewListTitle('')
    setShowNewListInput(false)
    const created = await createShoppingList(userId, title)
    setExpandedListId(created.id)
  }

  async function handleAddItem(listId: string) {
    const name = newItemName.trim()
    if (!name) return
    const price = newItemPrice.trim() ? parseFloat(newItemPrice) : null
    const link = newItemLink.trim() || null
    setNewItemName('')
    setNewItemPrice('')
    setNewItemLink('')
    setAddingItemToListId(null)
    await addShoppingItem(userId, listId, {
      name,
      price: price !== null && isNaN(price) ? null : price,
      link,
      purchased: false,
      category: null,
    })
  }

  function addVendorProduct() {
    const vendor = newVendorName.trim()
    const product = newProductName.trim()
    if (!vendor || !product) return

    const vendorProduct: VendorProduct = {
      id: Date.now().toString(),
      vendorName: vendor,
      productName: product,
      price: newProductPrice.trim() ? parseFloat(newProductPrice) : null,
      link: newProductLink.trim() || null,
    }

    setVendorProducts(prev => [vendorProduct, ...prev])
    setNewVendorName('')
    setNewProductName('')
    setNewProductPrice('')
    setNewProductLink('')
    vendorNameRef.current?.focus()
  }

  function addVendorProductToList(listId: string, vendorProduct: VendorProduct) {
    addShoppingItem(userId, listId, {
      name: `${vendorProduct.productName} (${vendorProduct.vendorName})`,
      price: vendorProduct.price ?? null,
      link: vendorProduct.link ?? null,
      purchased: false,
      category: null,
    })
  }

  function removeVendorProduct(id: string) {
    setVendorProducts(prev => prev.filter(p => p.id !== id))
  }

  function toggleExpanded(listId: string) {
    setExpandedListId(prev => (prev === listId ? null : listId))
    setAddingItemToListId(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Show vendor products tab
  if (showVendorTab) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-1 flex-shrink-0">
          <button
            onClick={() => setShowVendorTab(false)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-muted font-medium transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-primary" />
            Saved Products
          </h3>
          <div className="w-12" />
        </div>

        {/* Vendor product form */}
        <div className="mb-3 flex-shrink-0 space-y-1.5 bg-primary/5 border border-primary/10 rounded-xl p-2">
          <input
            ref={vendorNameRef}
            value={newVendorName}
            onChange={e => setNewVendorName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addVendorProduct()
              }
            }}
            placeholder="Vendor name *"
            className="w-full text-sm bg-white border border-primary/20 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-stone-300"
          />
          <input
            value={newProductName}
            onChange={e => setNewProductName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addVendorProduct()
              }
            }}
            placeholder="Product name *"
            className="w-full text-sm bg-white border border-primary/20 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-stone-300"
          />
          <div className="flex gap-1.5">
            <input
              value={newProductPrice}
              onChange={e => setNewProductPrice(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addVendorProduct()
                }
              }}
              placeholder="Price"
              type="number"
              step="0.01"
              min="0"
              className="w-20 text-xs bg-white border border-primary/20 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-stone-300"
            />
            <input
              value={newProductLink}
              onChange={e => setNewProductLink(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addVendorProduct()
                }
              }}
              placeholder="Product URL (optional)"
              className="flex-1 text-xs bg-white border border-primary/20 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-stone-300"
            />
          </div>
          <button
            onClick={addVendorProduct}
            disabled={!newVendorName.trim() || !newProductName.trim()}
            className="w-full flex items-center justify-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary-muted disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Vendor Product
          </button>
        </div>

        {/* Vendor products list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {vendorProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-stone-400">
              <Store className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm">No saved products yet.</p>
              <p className="text-xs mt-1 text-center max-w-[220px]">Save products you're interested in from vendors. You can add them to shopping lists later.</p>
            </div>
          ) : (
            vendorProducts.map(product => (
              <div
                key={product.id}
                className="rounded-xl border border-primary/15 bg-white/70 p-2.5 space-y-1.5 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-600 flex items-center gap-1">
                      <Store className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="truncate">{product.vendorName}</span>
                    </p>
                    <p className="text-sm font-semibold text-stone-800 mt-0.5">
                      {product.productName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {product.price !== null && product.price !== undefined && (
                        <span className="text-2xs font-medium text-amber-500">
                          {formatPrice(product.price)}
                        </span>
                      )}
                      {product.link && (
                        <a
                          href={product.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-2xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          Link
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeVendorProduct(product.id)}
                    className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Add to list button */}
                {lists.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-primary/10">
                    {lists.map(list => (
                      <button
                        key={list.id}
                        onClick={() => addVendorProductToList(list.id, product)}
                        className="text-3xs font-medium text-white bg-primary hover:bg-primary-muted rounded-lg px-2 py-1 transition-colors"
                      >
                        + {list.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1 flex-shrink-0">
        <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5 text-primary" />
          Shopping Lists
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowVendorTab(true)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-muted bg-primary/10 hover:bg-primary/20 rounded-lg px-2.5 py-1.5 transition-colors font-medium"
            title="Vendor products"
          >
            <Store className="h-3.5 w-3.5" />
            Vendors
          </button>
          <button
            onClick={() => setShowNewListInput(v => !v)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-muted bg-primary/10 hover:bg-primary/20 rounded-lg px-2.5 py-1.5 transition-colors font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            New List
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {lists.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 sm:flex sm:gap-2 flex-shrink-0">
          <div className="min-w-0 rounded-xl bg-primary/10 border border-primary/20 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-primary">{totalItems}</p>
            <p className="text-3xs text-primary-muted font-medium">Total Items</p>
          </div>
          <div className="min-w-0 rounded-xl bg-amber-50 border border-amber-100 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-amber-600">
              ${totalEstimatedCost.toFixed(2)}
            </p>
            <p className="text-3xs text-amber-500 font-medium">Est. Cost</p>
          </div>
          <div className="min-w-0 rounded-xl bg-emerald-50 border border-emerald-100 px-2 py-1.5 text-center">
            <p className="text-base font-bold text-emerald-600">{totalPurchased}</p>
            <p className="text-3xs text-emerald-500 font-medium">Purchased</p>
          </div>
        </div>
      )}

      {/* New list input */}
      {showNewListInput && (
        <div className="mb-3 flex-shrink-0 flex items-center gap-2 px-1">
          <input
            ref={newListInputRef}
            value={newListTitle}
            onChange={e => setNewListTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateList()
              if (e.key === 'Escape') {
                setShowNewListInput(false)
                setNewListTitle('')
              }
            }}
            placeholder="List title, e.g. Wedding Decor"
            className="flex-1 text-sm bg-white border border-primary/30 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-stone-300"
          />
          <button
            onClick={handleCreateList}
            disabled={!newListTitle.trim()}
            className="h-8 w-8 flex items-center justify-center rounded-xl bg-primary hover:bg-primary-muted disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setShowNewListInput(false)
              setNewListTitle('')
            }}
            className="h-8 w-8 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Lists */}
      <div className="flex-1 overflow-y-auto space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400">
            <Package className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No shopping lists yet.</p>
            <button
              onClick={() => setShowNewListInput(true)}
              className="mt-3 text-xs text-primary hover:underline"
            >
              + Create your first list
            </button>
          </div>
        ) : (
          lists.map(list => {
            const isExpanded = expandedListId === list.id
            const listTotal = list.items.reduce((s, i) => s + (i.price ?? 0), 0)
            const purchasedCount = list.items.filter(i => i.purchased).length

            // Sort: unpurchased first, then purchased
            const sortedItems = [...list.items].sort((a, b) => {
              if (a.purchased !== b.purchased) return a.purchased ? 1 : -1
              return 0
            })

            return (
              <div
                key={list.id}
                className="rounded-2xl border border-primary/15 bg-white/70 overflow-hidden transition-all"
              >
                {/* List card header */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-primary/5 transition-colors group"
                  onClick={() => toggleExpanded(list.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-stone-400 flex-shrink-0" />
                  )}
                  <ShoppingCart
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      isExpanded ? 'text-primary' : 'text-stone-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${
                        isExpanded ? 'text-primary-muted' : 'text-stone-700'
                      }`}
                    >
                      {list.title}
                    </p>
                    <p className="text-2xs text-stone-400">
                      {list.items.length} item{list.items.length !== 1 ? 's' : ''} &middot;{' '}
                      {purchasedCount} purchased &middot; {formatPrice(listTotal) || '$0.00'} est.
                    </p>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      deleteShoppingList(userId, list.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-all flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Expanded list detail */}
                {isExpanded && (
                  <div className="border-t border-primary/10 px-3 py-2 space-y-1.5">
                    {/* Add item button / form */}
                    {addingItemToListId === list.id ? (
                      <div className="space-y-1.5 p-2 rounded-xl bg-primary/5 border border-primary/10">
                        <input
                          ref={newItemNameRef}
                          value={newItemName}
                          onChange={e => setNewItemName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddItem(list.id)
                            if (e.key === 'Escape') {
                              setAddingItemToListId(null)
                              setNewItemName('')
                              setNewItemPrice('')
                              setNewItemLink('')
                            }
                          }}
                          placeholder="Item name *"
                          className="w-full text-sm bg-white border border-primary/20 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-stone-300"
                        />
                        <div className="flex gap-1.5">
                          <input
                            value={newItemPrice}
                            onChange={e => setNewItemPrice(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddItem(list.id)
                            }}
                            placeholder="Price"
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-20 text-xs bg-white border border-primary/20 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-stone-300"
                          />
                          <input
                            value={newItemLink}
                            onChange={e => setNewItemLink(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddItem(list.id)
                            }}
                            placeholder="Product URL (optional)"
                            className="flex-1 text-xs bg-white border border-primary/20 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-stone-300"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleAddItem(list.id)}
                            disabled={!newItemName.trim()}
                            className="flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary-muted disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            <Check className="h-3 w-3" />
                            Add
                          </button>
                          <button
                            onClick={() => {
                              setAddingItemToListId(null)
                              setNewItemName('')
                              setNewItemPrice('')
                              setNewItemLink('')
                            }}
                            className="text-xs text-stone-400 hover:text-stone-600 rounded-lg px-2 py-1.5 hover:bg-stone-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingItemToListId(list.id)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-muted font-medium py-1 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Add item
                      </button>
                    )}

                    {/* Items */}
                    {sortedItems.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-3">
                        No items yet. Add your first item above.
                      </p>
                    ) : (
                      sortedItems.map(item => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-2 p-2 rounded-xl border transition-all group/item ${
                            item.purchased
                              ? 'bg-emerald-50/50 border-emerald-100'
                              : 'bg-white/70 border-stone-100 hover:border-primary/20'
                          }`}
                        >
                          {/* Purchased checkbox */}
                          <input
                            type="checkbox"
                            checked={item.purchased}
                            onChange={() =>
                              toggleItemPurchased(userId, list.id, item.id)
                            }
                            className="h-3.5 w-3.5 rounded accent-emerald-500 flex-shrink-0 mt-0.5 cursor-pointer"
                          />

                          {/* Item info */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm leading-snug ${
                                item.purchased
                                  ? 'line-through text-stone-400'
                                  : 'text-stone-700'
                              }`}
                            >
                              {item.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.price !== null && item.price !== undefined && (
                                <span
                                  className={`text-2xs font-medium ${
                                    item.purchased
                                      ? 'text-emerald-400'
                                      : 'text-amber-500'
                                  }`}
                                >
                                  {formatPrice(item.price)}
                                </span>
                              )}
                              {item.link && (
                                <a
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="flex items-center gap-0.5 text-2xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                  Link
                                </a>
                              )}
                              {item.category && (
                                <span className="text-2xs text-stone-400">
                                  {item.category}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Delete button */}
                          <button
                            onClick={() =>
                              deleteShoppingItem(userId, list.id, item.id)
                            }
                            className="opacity-0 group-hover/item:opacity-100 text-stone-300 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
