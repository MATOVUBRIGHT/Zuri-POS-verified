/**
 * Product Service - Offline-first data layer
 * Reads/writes from SQLite only. No API calls.
 */
import { getDb } from '../database/db'
import { randomUUID } from 'crypto'

export interface Product {
  id: string
  name: string
  price: number
  barcode?: string
  stock: number
  updated_at: string
  store_id?: string
  [key: string]: unknown
}

// Maps to inventory table (product_name -> name, retail_price -> price, quantity -> stock)
function toProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    name: String(row.product_name || row.name || ''),
    price: Number(row.retail_price ?? row.price ?? 0),
    barcode: row.barcode ? String(row.barcode) : undefined,
    stock: Number(row.quantity ?? row.stock ?? 0),
    updated_at: String(row.last_updated_at ?? row.updated_at ?? row.created_at ?? new Date().toISOString()),
    store_id: row.store_id ? String(row.store_id) : undefined,
    ...row
  }
}

function fromProduct(p: Partial<Product>, storeId?: string): Record<string, unknown> {
  const id = p.id || randomUUID()
  const now = new Date().toISOString()
  const base = (p as any) || {}
  return {
    ...base,
    id,
    product_name: p.name ?? base.product_name,
    retail_price: p.price ?? base.retail_price ?? 0,
    barcode: p.barcode ?? base.barcode ?? null,
    quantity: p.stock ?? base.quantity ?? 0,
    cost_per_unit: base.cost_per_unit ?? 0,
    category: base.category || 'General',
    store_id: storeId || p.store_id || base.store_id || null,
    sync_status: 'pending',
    last_updated_at: now,
    created_at: base.created_at ?? now,
  }
}

export const productService = {
  getAll: (storeId?: string): Product[] => {
    const db = getDb()
    const rows = storeId
      ? db.prepare('SELECT * FROM inventory WHERE store_id = ? OR store_id IS NULL ORDER BY product_name ASC').all(storeId)
      : db.prepare('SELECT * FROM inventory ORDER BY product_name ASC').all()
    return (rows as Record<string, unknown>[]).map(toProduct)
  },

  getById: (id: string): Product | null => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toProduct(row) : null
  },

  getByBarcode: (barcode: string, storeId?: string): Product | null => {
    const db = getDb()
    const row = storeId
      ? db.prepare('SELECT * FROM inventory WHERE barcode = ? AND (store_id = ? OR store_id IS NULL)').get(barcode, storeId)
      : db.prepare('SELECT * FROM inventory WHERE barcode = ?').get(barcode)
    return (row as Record<string, unknown>) ? toProduct(row as Record<string, unknown>) : null
  },

  search: (query: string, storeId?: string, limit = 50): Product[] => {
    const db = getDb()
    const q = `%${query}%`
    const rows = storeId
      ? db.prepare(
          'SELECT * FROM inventory WHERE (product_name LIKE ? OR barcode LIKE ?) AND (store_id = ? OR store_id IS NULL) ORDER BY product_name ASC LIMIT ?'
        ).all(q, q, storeId, limit)
      : db.prepare('SELECT * FROM inventory WHERE product_name LIKE ? OR barcode LIKE ? ORDER BY product_name ASC LIMIT ?').all(q, q, limit)
    return (rows as Record<string, unknown>[]).map(toProduct)
  },

  add: (product: Partial<Product>, storeId?: string): Product => {
    const db = getDb()
    const row = fromProduct(product, storeId)
    const cols = Object.keys(row).filter(k => row[k] !== undefined)
    const placeholders = cols.map(k => `@${k}`).join(', ')
    const updates = cols.map(k => `${k} = excluded.${k}`).join(', ')
    db.prepare(
      `INSERT INTO inventory (${cols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`
    ).run(row as any)
    return productService.getById(row.id as string)!
  },

  update: (id: string, updates: Partial<Product>, storeId?: string): Product | null => {
    const existing = productService.getById(id)
    if (!existing) return null
    return productService.add({ ...existing, ...updates, id }, storeId)
  },

  updateStock: (id: string, delta: number): Product | null => {
    const p = productService.getById(id)
    if (!p) return null
    const newStock = Math.max(0, (p.stock ?? 0) + delta)
    return productService.update(id, { stock: newStock })
  },

  delete: (id: string): boolean => {
    const db = getDb()
    const result = db.prepare('DELETE FROM inventory WHERE id = ?').run(id)
    return result.changes > 0
  }
}
