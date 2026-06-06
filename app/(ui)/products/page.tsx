'use client'

import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Label from '@radix-ui/react-label'
import * as Select from '@radix-ui/react-select'
import { Camera, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { getAll as getProducts, upsertMany } from '@/lib/db/products'
import { getAll as getCategories, upsertMany as upsertCategories } from '@/lib/db/categories'
import { create as createTx, getAll as getTransactions } from '@/lib/db/transactions'
import { push as pushTx, drain } from '@/lib/db/syncQueue'
import { seedIfEmpty, syncFromServer } from '@/lib/db/seed'
import { cleanProductName, normalizeQuery, skuFromName } from '@/lib/normalize'
import { computeStock } from '@/lib/stock'
import type { Product, ProductCategory, InventoryTransaction } from '@/lib/types'

const emptyForm = {
  name: '', sku: '', specification: '', stockUnit: 'pcs',
  sellingPrice: '', costPrice: '', lowestPrice: '',
  openingStock: '', addStock: '', categoryId: '', newCategory: '', imageUrl: '',
}
const PAGE_SIZE = 20

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [open, setOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dupWarning, setDupWarning] = useState<string[]>([])
  const skuTouched = useRef(false)
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  function setFilter(id: string) {
    setFilterCategoryId(id)
    setPage(1)
  }

  function handleSearch(q: string) {
    setSearch(q)
    setPage(1)
  }

  useEffect(() => {
    async function load() {
      const [cats, prods, txs] = await Promise.all([getCategories(), getProducts(), getTransactions()])
      if (prods.length > 0) {
        setCategories(cats); setProducts(prods); setTransactions(txs)
      } else {
        await seedIfEmpty()
        const [c, p, t] = await Promise.all([getCategories(), getProducts(), getTransactions()])
        setCategories(c); setProducts(p); setTransactions(t)
      }
      const synced = await syncFromServer()
      if (synced) {
        const [c, p, t] = await Promise.all([getCategories(), getProducts(), getTransactions()])
        setCategories(c); setProducts(p); setTransactions(t)
      }
    }
    load()
  }, [])

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body })
    if (res.ok) {
      const { data } = await res.json()
      setForm((f) => ({ ...f, imageUrl: data?.url ?? '' }))
    }
    setUploading(false)
  }

  function field(key: keyof typeof emptyForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function checkDuplicates(name: string) {
    if (!name.trim() || editingProduct) { setDupWarning([]); return }
    const nq = normalizeQuery(name)
    const matches = products
      .filter((p) => normalizeQuery(p.name).includes(nq) || nq.includes(normalizeQuery(p.name)))
      .map((p) => p.name)
    setDupWarning(matches.slice(0, 3))
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    setForm((f) => ({
      ...f,
      name,
      ...(!skuTouched.current && { sku: skuFromName(name, f.specification) }),
    }))
    checkDuplicates(name)
  }

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const cleaned = cleanProductName(e.target.value)
    setForm((f) => ({
      ...f,
      name: cleaned,
      ...(!skuTouched.current && { sku: skuFromName(cleaned, f.specification) }),
    }))
    checkDuplicates(cleaned)
  }

  function handleSpecChange(e: React.ChangeEvent<HTMLInputElement>) {
    const specification = e.target.value
    setForm((f) => ({
      ...f,
      specification,
      ...(!skuTouched.current && { sku: skuFromName(f.name, specification) }),
    }))
  }

  function handleSkuChange(e: React.ChangeEvent<HTMLInputElement>) {
    skuTouched.current = true
    setForm((f) => ({ ...f, sku: e.target.value }))
  }

  function openAdd() {
    skuTouched.current = false
    setEditingProduct(null)
    setForm(emptyForm)
    setDupWarning([])
    setOpen(true)
  }

  function openEdit(p: Product) {
    skuTouched.current = true
    setEditingProduct(p)
    setDupWarning([])
    setForm({
      name: p.name,
      sku: p.sku,
      specification: p.specification ?? '',
      stockUnit: p.stockUnit ?? 'pcs',
      sellingPrice: String(p.sellingPrice),
      costPrice: String(p.costPrice),
      lowestPrice: p.lowestPrice != null ? String(p.lowestPrice) : '',
      openingStock: '',
      addStock: '',
      categoryId: p.categoryId ?? '',
      newCategory: '',
      imageUrl: p.imageUrl ?? '',
    })
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      let categoryId = form.categoryId
      if (!categoryId && form.newCategory.trim()) {
        const newCat: ProductCategory = { id: crypto.randomUUID(), name: form.newCategory.trim() }
        await upsertCategories([newCat])
        setCategories((prev) => [...prev, newCat])
        categoryId = newCat.id
      }

      const categoryName = categories.find((c) => c.id === categoryId)?.name ?? null
      const sellingPrice = parseFloat(form.sellingPrice) || 0
      const costPrice = parseFloat(form.costPrice) || 0
      const lowestPrice = form.lowestPrice.trim() ? parseFloat(form.lowestPrice) : undefined

      if (lowestPrice !== undefined && lowestPrice > sellingPrice) {
        toast.error('Lowest price cannot exceed selling price')
        return
      }

      if (editingProduct) {
        const updated: Product = {
          ...editingProduct,
          name: form.name,
          sku: form.sku,
          specification: form.specification || undefined,
          stockUnit: form.stockUnit || undefined,
          sellingPrice,
          costPrice,
          lowestPrice,
          categoryId,
          ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
        }
        await upsertMany([updated])
        await fetch(`/api/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: updated.name,
            sku: updated.sku,
            specification: updated.specification ?? null,
            stockUnit: updated.stockUnit ?? null,
            sellingPrice: updated.sellingPrice,
            costPrice: updated.costPrice,
            lowestPrice: updated.lowestPrice ?? null,
            category: categoryName,
            imageUrl: updated.imageUrl ?? null,
          }),
        })
        setProducts((prev) => prev.map((p) => p.id === updated.id ? updated : p))

        // Restock if requested
        const addQty = parseInt(form.addStock, 10)
        if (addQty > 0) {
          const tx: InventoryTransaction = {
            id: crypto.randomUUID(),
            type: 'STOCK_IN',
            productId: updated.id,
            quantity: addQty,
            createdAt: new Date().toISOString(),
          }
          await createTx(tx)
          await pushTx(tx)
          drain().catch(() => {})
          setTransactions((prev) => [tx, ...prev])
          toast.success(`Product updated — +${addQty} ${updated.stockUnit ?? 'units'} added to stock`)
        } else {
          toast.success('Product updated')
        }
      } else {
        // Check for SKU collision in IDB before attempting insert
        const existing = products.find((p) => p.sku === form.sku)
        if (existing) {
          toast.error(`SKU "${form.sku}" is already used by "${existing.name}"`)
          return
        }

        const product: Product = {
          id: crypto.randomUUID(),
          name: form.name,
          sku: form.sku,
          specification: form.specification || undefined,
          stockUnit: form.stockUnit || undefined,
          sellingPrice,
          costPrice,
          lowestPrice,
          categoryId,
          ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
        }
        await upsertMany([product])

        // Record opening stock as a STOCK_IN transaction
        const openingQty = parseInt(form.openingStock, 10)
        if (openingQty > 0) {
          const tx: InventoryTransaction = {
            id: crypto.randomUUID(),
            type: 'STOCK_IN',
            productId: product.id,
            quantity: openingQty,
            createdAt: new Date().toISOString(),
          }
          await createTx(tx)
          await pushTx(tx)
          drain().catch(() => {})
          setTransactions((prev) => [tx, ...prev])
        }

        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: product.id,
            name: product.name,
            sku: product.sku,
            specification: product.specification ?? null,
            stockUnit: product.stockUnit ?? null,
            sellingPrice: product.sellingPrice,
            costPrice: product.costPrice,
            lowestPrice: product.lowestPrice ?? null,
            category: categoryName,
            imageUrl: product.imageUrl ?? null,
          }),
        })
        setProducts((prev) => [...prev, product])
        toast.success('Product saved')
      }

      setForm(emptyForm)
      setEditingProduct(null)
      setDupWarning([])
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))
  const nq = normalizeQuery(search.trim())
  const visible = products
    .filter((p) => filterCategoryId === 'all' || p.categoryId === filterCategoryId)
    .filter((p) =>
      !nq ||
      normalizeQuery(p.name).includes(nq) ||
      normalizeQuery(p.sku).includes(nq) ||
      normalizeQuery(p.specification ?? '').includes(nq)
    )
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const paginated = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function pageNumbers(): (number | '…')[] {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', pageCount]
    if (page >= pageCount - 3) return [1, '…', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
    return [1, '…', page - 1, page, page + 1, '…', pageCount]
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              <Plus size={16} />
              Add product
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-6 w-full max-w-md z-50 focus:outline-none max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <Dialog.Title className="text-lg font-semibold">{editingProduct ? 'Edit product' : 'Add product'}</Dialog.Title>
                <Dialog.Close asChild>
                  <button className="text-gray-500 hover:text-gray-600 rounded-md p-1"><X size={18} /></button>
                </Dialog.Close>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Image upload */}
                <div className="space-y-1.5">
                  <Label.Root className="text-sm font-medium text-gray-700">Image</Label.Root>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                      {form.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <Camera size={20} className="text-gray-400" />
                      )}
                    </div>
                    <span className="text-sm text-gray-600">
                      {uploading ? 'Uploading…' : 'Click to upload an image'}
                    </span>
                    <input type="file" accept="image/*" className="sr-only" onChange={handleImageChange} disabled={uploading} />
                  </label>
                </div>

                <div className="space-y-1.5">
                  <Label.Root htmlFor="p-name" className="text-sm font-medium text-gray-700">Name</Label.Root>
                  <input id="p-name" required value={form.name} onChange={handleNameChange} onBlur={handleNameBlur}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {dupWarning.length > 0 && (
                    <p className="text-xs text-amber-600">
                      Similar product already exists: {dupWarning.join(', ')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label.Root htmlFor="p-sku" className="text-sm font-medium text-gray-700">SKU</Label.Root>
                  <input id="p-sku" required value={form.sku} onChange={handleSkuChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label.Root htmlFor="p-spec" className="text-sm font-medium text-gray-700">Specification / Size <span className="text-gray-400 font-normal">(optional)</span></Label.Root>
                    <input id="p-spec" value={form.specification} onChange={handleSpecChange}
                      placeholder="e.g. 250ml, 32mm, 3/4&quot;"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label.Root htmlFor="p-unit" className="text-sm font-medium text-gray-700">Stock Unit</Label.Root>
                    <input id="p-unit" value={form.stockUnit} onChange={field('stockUnit')}
                      placeholder="e.g. pcs, box, pkt, roll"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label.Root htmlFor="p-sell" className="text-sm font-medium text-gray-700">Selling price</Label.Root>
                    <input id="p-sell" required type="number" min="0" step="0.01" value={form.sellingPrice} onChange={field('sellingPrice')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label.Root htmlFor="p-cost" className="text-sm font-medium text-gray-700">Cost price</Label.Root>
                    <input id="p-cost" required type="number" min="0" step="0.01" value={form.costPrice} onChange={field('costPrice')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label.Root htmlFor="p-lowest" className="text-sm font-medium text-gray-700">
                    Lowest price <span className="text-gray-400 font-normal">(minimum negotiable price — optional)</span>
                  </Label.Root>
                  <input id="p-lowest" type="number" min="0" step="0.01" value={form.lowestPrice} onChange={field('lowestPrice')}
                    placeholder="Leave blank to disable discounts"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {!editingProduct ? (
                  <div className="space-y-1.5">
                    <Label.Root htmlFor="p-stock" className="text-sm font-medium text-gray-700">
                      Opening stock <span className="text-gray-400 font-normal">(units you have right now)</span>
                    </Label.Root>
                    <input id="p-stock" type="number" min="0" step="1" value={form.openingStock} onChange={field('openingStock')}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(() => {
                      const currentStock = computeStock(editingProduct.id, transactions, editingProduct.initialStock ?? 0)
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <Label.Root htmlFor="p-addstock" className="text-sm font-medium text-gray-700">Add stock</Label.Root>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${currentStock <= 0 ? 'bg-red-100 text-red-700' : currentStock < 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              Currently: {currentStock} {editingProduct.stockUnit ?? 'units'}
                            </span>
                          </div>
                          <input id="p-addstock" type="number" min="1" step="1" value={form.addStock} onChange={field('addStock')}
                            placeholder="Enter qty to add (optional)"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </>
                      )
                    })()}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label.Root className="text-sm font-medium text-gray-700">Category</Label.Root>
                  {categories.length > 0 ? (
                    <Select.Root value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v, newCategory: '' }))}>
                      <Select.Trigger className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <Select.Value placeholder="Select or type a new one below" />
                        <Select.Icon><ChevronDown size={16} className="text-gray-500" /></Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg z-[60] overflow-hidden">
                          <Select.Viewport className="p-1">
                            {categories.map((c) => (
                              <Select.Item key={c.id} value={c.id}
                                className="flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">
                                <Select.ItemText>{c.name}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  ) : null}
                  {!form.categoryId && (
                    <input
                      placeholder="Or type a new category name"
                      value={form.newCategory}
                      onChange={field('newCategory')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>

                <div className="flex gap-2 pt-1 justify-end">
                  <Dialog.Close asChild>
                    <button type="button" className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                  </Dialog.Close>
                  <button type="submit" disabled={saving}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {saving ? 'Saving…' : editingProduct ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, SKU or specification…"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
        />
        {search && (
          <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category filter tabs */}
      {categories.length > 0 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCategoryId === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCategoryId === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          {search ? (
            <>
              <p className="text-sm font-medium">No results for &ldquo;{search}&rdquo;</p>
              <button onClick={() => handleSearch('')} className="mt-2 text-xs text-blue-600 hover:underline">Clear search</button>
            </>
          ) : (
            <p className="text-sm">No products yet — add your first one</p>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-12"></th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Spec / Size</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">In stock</th>
                <th className="text-right px-4 py-3">Selling price</th>
                <th className="text-right px-4 py-3">Lowest price</th>
                <th className="text-right px-4 py-3">Cost price</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded-md object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center">
                        <Camera size={14} className="text-gray-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.specification && <span className="font-medium text-gray-700">{p.specification}</span>}
                    {p.specification && p.stockUnit && <span className="text-gray-400"> · </span>}
                    {p.stockUnit && <span className="text-gray-400">{p.stockUnit}</span>}
                    {!p.specification && !p.stockUnit && <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku}</td>
                  <td className="px-4 py-3 text-gray-500">{categoryMap[p.categoryId] ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const s = computeStock(p.id, transactions, p.initialStock ?? 0)
                      return (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s <= 0 ? 'bg-red-100 text-red-700' : s < 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {s <= 0 ? '⚠ Out' : `${s} ${p.stockUnit ?? ''}`}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">{p.sellingPrice.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-amber-600 text-xs">
                    {p.lowestPrice != null ? p.lowestPrice.toLocaleString() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{p.costPrice.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {visible.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visible.length)} of {visible.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} />
            </button>

            {pageNumbers().map((n, i) =>
              n === '…' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm select-none">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`min-w-[32px] h-8 rounded-lg text-xs font-medium transition-colors ${
                    page === n
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              )
            )}

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === pageCount}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
