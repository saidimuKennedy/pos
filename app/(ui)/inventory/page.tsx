'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Camera, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { create, getAll as getTransactions } from '@/lib/db/transactions'
import { push, drain } from '@/lib/db/syncQueue'
import { getAll as getProducts } from '@/lib/db/products'
import { getAll as getCategories } from '@/lib/db/categories'
import { seedIfEmpty, syncFromServer } from '@/lib/db/seed'
import { computeStock, LOW_STOCK_THRESHOLD } from '@/lib/stock'
import { normalizeQuery } from '@/lib/normalize'
import type { InventoryTransaction, Product, ProductCategory } from '@/lib/types'

export default function InventoryPage() {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all')
  const [search, setSearch] = useState('')
  // per-product inline restock
  const [restockQtys, setRestockQtys] = useState<Record<string, string>>({})
  const [restocking, setRestocking] = useState<Record<string, boolean>>({})

  async function refreshLocal() {
    const [cats, prods, txs] = await Promise.all([getCategories(), getProducts(), getTransactions()])
    setCategories(cats)
    setProducts(prods)
    setTransactions(txs)
  }

  useEffect(() => {
    async function load() {
      const [cats, prods, txs] = await Promise.all([getCategories(), getProducts(), getTransactions()])
      if (prods.length > 0) {
        setCategories(cats); setProducts(prods); setTransactions(txs)
      } else {
        await seedIfEmpty()
        await refreshLocal()
      }
      const synced = await syncFromServer()
      if (synced) await refreshLocal()
    }
    load()
  }, [])

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  async function addStock(product: Product, quantity: number) {
    const tx: InventoryTransaction = {
      id: crypto.randomUUID(),
      type: 'STOCK_IN',
      productId: product.id,
      quantity,
      createdAt: new Date().toISOString(),
    }
    await create(tx)
    await push(tx)
    drain().catch(() => {})
    setTransactions((prev) => [tx, ...prev])
  }

  async function handleRestock(product: Product) {
    const q = parseInt(restockQtys[product.id] ?? '', 10)
    if (!q || q < 1) { toast.error('Enter a valid quantity'); return }
    setRestocking((r) => ({ ...r, [product.id]: true }))
    await addStock(product, q)
    toast.success(`Restocked — ${product.name}`, { description: `+${q} ${product.stockUnit ?? 'units'} added` })
    setRestockQtys((r) => ({ ...r, [product.id]: '' }))
    setRestocking((r) => ({ ...r, [product.id]: false }))
  }

  const nq = normalizeQuery(search.trim())
  const visibleProducts = products
    .filter((p) => filterCategoryId === 'all' || p.categoryId === filterCategoryId)
    .filter((p) => !nq || normalizeQuery(p.name).includes(nq) || normalizeQuery(p.sku).includes(nq))
    .map((p) => ({ product: p, stock: computeStock(p.id, transactions, p.initialStock ?? 0) }))
    .sort((a, b) => {
      // Low/out-of-stock float to the top
      if (a.stock < LOW_STOCK_THRESHOLD && b.stock >= LOW_STOCK_THRESHOLD) return -1
      if (b.stock < LOW_STOCK_THRESHOLD && a.stock >= LOW_STOCK_THRESHOLD) return 1
      return a.product.name.localeCompare(b.product.name)
    })

  const lowCount = visibleProducts.filter((r) => r.stock < LOW_STOCK_THRESHOLD).length

  return (
    <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Add stock directly from each product row. Opening stock is set when adding a new product.
          </p>
        </div>
        {lowCount > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-800 text-xs px-3 py-1.5 rounded-full">
            <AlertTriangle size={13} />
            {lowCount} item{lowCount !== 1 ? 's' : ''} low
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name or SKU…"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setFilterCategoryId('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCategoryId === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilterCategoryId(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCategoryId === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {visibleProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          <p className="text-sm">{search ? `No results for "${search}"` : 'No products yet'}</p>
          {search && <button onClick={() => setSearch('')} className="mt-2 text-xs text-blue-600 hover:underline">Clear search</button>}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-10"></th>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">In stock</th>
                <th className="px-4 py-3 text-right">Add stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleProducts.map(({ product: p, stock }) => {
                const isLow = stock < LOW_STOCK_THRESHOLD
                const isOut = stock <= 0
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${isLow ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt={p.name} className="w-9 h-9 rounded-md object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center">
                          <Camera size={13} className="text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.name}</p>
                      {p.specification && <p className="text-xs text-gray-400">{p.specification}{p.stockUnit ? ` · ${p.stockUnit}` : ''}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.sku}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{categoryMap[p.categoryId] ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-xs ${
                        isOut  ? 'bg-red-100 text-red-700' :
                        isLow  ? 'bg-amber-100 text-amber-700' :
                                 'bg-green-100 text-green-700'
                      }`}>
                        {isOut ? '⚠ Out' : stock} {!isOut && (p.stockUnit ?? 'units')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={restockQtys[p.id] ?? ''}
                          onChange={(e) => setRestockQtys((r) => ({ ...r, [p.id]: e.target.value }))}
                          className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onKeyDown={(e) => e.key === 'Enter' && handleRestock(p)}
                        />
                        <button
                          onClick={() => handleRestock(p)}
                          disabled={restocking[p.id] || !restockQtys[p.id]}
                          className="px-2.5 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                        >
                          {restocking[p.id] ? '…' : '+ Add'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  )
}
