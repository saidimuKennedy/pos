export type TransactionType = 'STOCK_IN' | 'SALE' | 'RETURN' | 'ADJUSTMENT'

export interface Product {
  id: string
  name: string
  sku: string
  sellingPrice: number
  costPrice: number
  createdAt: Date
}

export interface InventoryTransaction {
  id: string
  productId: string
  type: TransactionType
  quantity: number
  unitPrice?: number
  deviceId: string
  createdAt: Date
  syncedAt?: Date
}
