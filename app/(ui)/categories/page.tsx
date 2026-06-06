'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { getAll as getCategories } from '@/lib/db/categories'
import { getAll as getProducts } from '@/lib/db/products'
import { seedIfEmpty, syncFromServer } from '@/lib/db/seed'
import { normalizeQuery } from '@/lib/normalize'
import CategoryModal from '@/components/CategoryModal'
import type { ProductCategory } from '@/lib/types'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [countMap, setCountMap] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<ProductCategory | null>(null)
  const [search, setSearch] = useState('')

  async function refreshLocal() {
    const [cats, prods] = await Promise.all([getCategories(), getProducts()])
    setCategories(cats)
    const counts: Record<string, number> = {}
    for (const p of prods) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1
    setCountMap(counts)
  }

  useEffect(() => {
    async function load() {
      const [cats, prods] = await Promise.all([getCategories(), getProducts()])
      if (prods.length > 0) {
        setCategories(cats)
        const counts: Record<string, number> = {}
        for (const p of prods) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1
        setCountMap(counts)
      } else {
        await seedIfEmpty()
        await refreshLocal()
      }
      const synced = await syncFromServer()
      if (synced) await refreshLocal()
    }
    load()
  }, [])

  const nq = normalizeQuery(search.trim())
  const visible = categories.filter((c) => !nq || normalizeQuery(c.name).includes(nq))

  return (
    <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Categories</h1>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories…"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          {search
            ? <>
                <p className="text-sm font-medium">No results for &ldquo;{search}&rdquo;</p>
                <button onClick={() => setSearch('')} className="mt-2 text-xs text-blue-600 hover:underline">Clear search</button>
              </>
            : <p className="text-sm">No categories yet — add a category when creating a product</p>
          }
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {visible.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelected(cat)}
              className="text-left border border-gray-200 rounded-xl p-5 hover:border-blue-400 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <p className="font-semibold text-gray-900">{cat.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {countMap[cat.id] ?? 0} product{(countMap[cat.id] ?? 0) !== 1 ? 's' : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <CategoryModal category={selected} onClose={() => setSelected(null)} />
      )}
    </div>
    </div>
  )
}
