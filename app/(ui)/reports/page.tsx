'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Download, FileText, Package, Search, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { getAll as getTransactions } from '@/lib/db/transactions'
import { getAll as getProducts } from '@/lib/db/products'
import { getAll as getCategories } from '@/lib/db/categories'
import { getAll as getIncidents } from '@/lib/db/incidents'
import { seedIfEmpty, syncFromServer } from '@/lib/db/seed'
import { computeStock, getLowStockItems, LOW_STOCK_THRESHOLD } from '@/lib/stock'
import { normalizeQuery } from '@/lib/normalize'
import { INCIDENT_REASON_LABELS } from '@/lib/types'
import type { InventoryTransaction, Product, ProductCategory, Incident } from '@/lib/types'

type Range = 'today' | 'week' | 'month' | 'all'

const RANGES: { label: string; value: Range }[] = [
  { label: 'Today',      value: 'today' },
  { label: 'This week',  value: 'week'  },
  { label: 'This month', value: 'month' },
  { label: 'All time',   value: 'all'   },
]

function rangeStart(range: Range): Date {
  const d = new Date()
  if (range === 'today') { d.setHours(0, 0, 0, 0); return d }
  if (range === 'week')  { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d }
  if (range === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d }
  return new Date(0)
}

interface ReportRow {
  productId: string
  name: string
  sku: string
  specification?: string
  stockUnit?: string
  category: string
  sold: number
  stocked: number
  listRevenue: number
  revenue: number
  netStock: number
}

export default function ReportsPage() {
  const [range, setRange] = useState<Range>('today')
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all')

  async function refreshLocal() {
    const [txs, prods, cats, incs] = await Promise.all([getTransactions(), getProducts(), getCategories(), getIncidents()])
    setTransactions(txs)
    setProducts(prods)
    setCategories(cats)
    setIncidents(incs)
    setLoading(false)
  }

  useEffect(() => {
    async function load() {
      const [txs, prods, cats, incs] = await Promise.all([getTransactions(), getProducts(), getCategories(), getIncidents()])
      if (prods.length > 0) {
        setTransactions(txs)
        setProducts(prods)
        setCategories(cats)
        setIncidents(incs)
        setLoading(false)
      } else {
        await seedIfEmpty()
        await refreshLocal()
      }
      const synced = await syncFromServer()
      if (synced) await refreshLocal()
    }
    load()
  }, [])

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]))
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  const start = rangeStart(range)
  const filtered = transactions.filter((tx) => new Date(tx.createdAt) >= start)

  const sales     = filtered.filter((t) => t.type === 'SALE')
  const stockIns  = filtered.filter((t) => t.type === 'STOCK_IN')

  const revenue     = sales.reduce((sum, t) => sum + (t.unitPrice ?? productMap[t.productId]?.sellingPrice ?? 0) * t.quantity, 0)
  const listRevenue = sales.reduce((sum, t) => sum + (productMap[t.productId]?.sellingPrice ?? 0) * t.quantity, 0)
  const unitsSold   = sales.reduce((sum, t) => sum + t.quantity, 0)

  const allProductIds = Array.from(new Set(filtered.map((t) => t.productId)))
  const allRows: ReportRow[] = allProductIds.map((id) => {
    const p = productMap[id]
    const pSales   = sales.filter((t) => t.productId === id)
    const sold     = pSales.reduce((s, t) => s + t.quantity, 0)
    const stocked  = stockIns.filter((t) => t.productId === id).reduce((s, t) => s + t.quantity, 0)
    const listRev  = sold * (p?.sellingPrice ?? 0)
    const actRev   = pSales.reduce((s, t) => s + (t.unitPrice ?? p?.sellingPrice ?? 0) * t.quantity, 0)
    return {
      productId:     id,
      name:          p?.name ?? id,
      sku:           p?.sku  ?? '—',
      specification: p?.specification,
      stockUnit:     p?.stockUnit,
      category:      p ? (categoryMap[p.categoryId] ?? '—') : '—',
      sold,
      stocked,
      listRevenue:   listRev,
      revenue:       actRev,
      netStock:      computeStock(id, transactions, p?.initialStock ?? 0),
    }
  }).sort((a, b) => b.revenue - a.revenue)

  // Apply search + category filter
  const nq = normalizeQuery(search.trim())
  const rows = allRows.filter((r) => {
    const p = productMap[r.productId]
    if (filterCategoryId !== 'all' && p?.categoryId !== filterCategoryId) return false
    if (!nq) return true
    return normalizeQuery(r.name).includes(nq) || normalizeQuery(r.sku).includes(nq)
  })

  const lowStockItems = getLowStockItems(products, transactions)
  const lowStockCount = lowStockItems.length
  const discountGiven = listRevenue - revenue
  const hasDiscount = discountGiven > 0
  const showBothPrices = allRows.some((r) => r.listRevenue !== r.revenue)

  // Incidents for range
  const incidentsInRange = incidents.filter((i) => new Date(i.createdAt) >= start)
  const incidentMap = new Map<string, { productName: string; count: number; reasons: Record<string, number> }>()
  for (const inc of incidentsInRange) {
    const key = inc.productId ?? `__free__${inc.productName}`
    if (!incidentMap.has(key)) {
      incidentMap.set(key, { productName: inc.productName, count: 0, reasons: {} })
    }
    const s = incidentMap.get(key)!
    s.count++
    s.reasons[inc.reason] = (s.reasons[inc.reason] ?? 0) + 1
  }
  const heatspots = [...incidentMap.values()].sort((a, b) => b.count - a.count)

  function exportCsv() {
    const header = 'Product,SKU,Category,Sold,Stocked,List Revenue,Actual Revenue,Discount,Net Stock'
    const lines = rows.map((r) =>
      `"${r.name}","${r.sku}","${r.category}",${r.sold},${r.stocked},${r.listRevenue.toFixed(2)},${r.revenue.toFixed(2)},${(r.listRevenue - r.revenue).toFixed(2)},${r.netStock}`
    )
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `pos-report-${range}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportPDF() {
    try {
      const { generateCOBReportPDF } = await import('@/lib/pdf')
      const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? range
      const doc = generateCOBReportPDF({
        dateLabel: `${rangeLabel} — ${new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        revenue,
        listRevenue,
        unitsSold,
        lowStockCount,
        rows,
        lowStockItems: lowStockItems.map(({ product, stock }) => ({
          name: product.name,
          sku: product.sku,
          stock,
        })),
        missedSales: heatspots.map((h) => ({
          productName: h.productName,
          count: h.count,
          reasons: Object.entries(h.reasons)
            .map(([r, c]) => `${INCIDENT_REASON_LABELS[r as keyof typeof INCIDENT_REASON_LABELS] ?? r} (${c})`)
            .join(', '),
        })),
      })
      doc.save(`cob-report-${range}-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('Report downloaded as PDF')
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {RANGES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={`px-3 py-1.5 transition-colors ${
                  range === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={14} />
            CSV
          </button>
          <button
            onClick={exportPDF}
            disabled={allRows.length === 0}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <FileText size={14} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
          <div className="bg-blue-100 text-blue-600 p-2.5 rounded-lg shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Revenue</p>
            <p className="text-2xl font-bold mt-0.5">KSh {revenue.toLocaleString()}</p>
            {hasDiscount && <p className="text-xs text-amber-600 mt-0.5">−KSh {discountGiven.toLocaleString()} discount</p>}
          </div>
        </div>
        <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
          <div className="bg-green-100 text-green-600 p-2.5 rounded-lg shrink-0">
            <BarChart3 size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Units sold</p>
            <p className="text-2xl font-bold mt-0.5">{unitsSold.toLocaleString()}</p>
          </div>
        </div>
        <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
          <div className={`p-2.5 rounded-lg shrink-0 ${lowStockCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
            <Package size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Low stock items</p>
            <p className={`text-2xl font-bold mt-0.5 ${lowStockCount > 0 ? 'text-amber-600' : ''}`}>{lowStockCount}</p>
          </div>
        </div>
        <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
          <div className="bg-orange-100 text-orange-600 p-2.5 rounded-lg shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Missed sales</p>
            <p className="text-2xl font-bold mt-0.5 text-orange-600">{heatspots.reduce((s, h) => s + h.count, 0)}</p>
          </div>
        </div>
      </div>

      {/* Low stock warning */}
      {lowStockCount > 0 && (
        <div className="mb-6 border border-amber-300 bg-amber-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">⚠ Low Stock — {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} below {LOW_STOCK_THRESHOLD} units</p>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map(({ product, stock }) => (
              <span key={product.id} className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">
                {product.name} — {stock} left
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missed sales heatspots */}
      {heatspots.length > 0 && (
        <div className="mb-6 border border-orange-200 bg-orange-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-orange-800 mb-3">🔥 Missed Sales — Action Points</p>
          <div className="space-y-2">
            {heatspots.map((h) => (
              <div key={h.productName} className="flex items-start gap-3">
                <span className="text-xs font-bold text-orange-700 bg-orange-100 border border-orange-200 rounded-full px-2 py-0.5 shrink-0">{h.count}×</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{h.productName}</p>
                  <p className="text-xs text-gray-500">
                    {Object.entries(h.reasons)
                      .map(([r, c]) => `${INCIDENT_REASON_LABELS[r as keyof typeof INCIDENT_REASON_LABELS] ?? r}${c > 1 ? ` (${c})` : ''}`)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + category filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
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
      </div>

      {/* Category filter tabs */}
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

      {/* Breakdown table */}
      {loading ? (
        <div className="flex justify-center py-20 text-gray-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-sm">{search ? `No results for "${search}"` : 'No transactions for this period'}</p>
          {search && <button onClick={() => setSearch('')} className="mt-2 text-xs text-blue-600 hover:underline">Clear search</button>}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3">Spec / Size</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Sold</th>
                <th className="text-right px-4 py-3">Stocked</th>
                {showBothPrices && <th className="text-right px-4 py-3">List Rev (KSh)</th>}
                <th className="text-right px-4 py-3">{showBothPrices ? 'Actual Rev (KSh)' : 'Revenue (KSh)'}</th>
                <th className="text-right px-4 py-3">Net stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.specification ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.sku}</td>
                  <td className="px-4 py-3 text-gray-500">{r.category}</td>
                  <td className="px-4 py-3 text-right">{r.sold}{r.stockUnit ? ` ${r.stockUnit}` : ''}</td>
                  <td className="px-4 py-3 text-right">{r.stocked}{r.stockUnit ? ` ${r.stockUnit}` : ''}</td>
                  {showBothPrices && (
                    <td className="px-4 py-3 text-right text-gray-400 line-through text-xs">{r.listRevenue.toLocaleString()}</td>
                  )}
                  <td className="px-4 py-3 text-right font-medium">
                    {r.revenue.toLocaleString()}
                    {showBothPrices && r.listRevenue > r.revenue && (
                      <span className="ml-1 text-xs text-amber-500">−{(r.listRevenue - r.revenue).toLocaleString()}</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${r.netStock < LOW_STOCK_THRESHOLD ? 'text-amber-600' : 'text-gray-700'}`}>
                    {r.netStock}{r.stockUnit ? ` ${r.stockUnit}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  )
}
