/**
 * Sales Service - Offline-first data layer
 * Writes to SQLite first, marks as unsynced. Sync engine pushes when online.
 */
import { getDb } from '../database/db'
import { randomUUID } from 'crypto'

export interface SaleItem {
  product_id: string
  product_name: string
  quantity: number
  price: number
  total?: number
  barcode?: string
  [key: string]: unknown
}

export interface Sale {
  id: string
  items: SaleItem[]
  total: number
  created_at: string
  synced: boolean
  store_id?: string
  [key: string]: unknown
}

function toSale(row: Record<string, unknown>): Sale {
  let items: SaleItem[] = []
  try {
    const raw = row.products || row.items
    items = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
  } catch {
    items = []
  }
  const synced = (row.sync_status ?? row.synced) === 'synced'
  return {
    id: String(row.id),
    items,
    total: Number(row.total_amount ?? row.total ?? 0),
    created_at: String(row.date_of_sale ?? row.created_at ?? ''),
    synced,
    store_id: row.store_id ? String(row.store_id) : undefined,
    ...row
  }
}

export const salesService = {
  getAll: (storeId?: string): Sale[] => {
    const db = getDb()
    const rows = storeId
      ? db.prepare('SELECT * FROM sales WHERE store_id = ? ORDER BY date_of_sale DESC').all(storeId)
      : db.prepare('SELECT * FROM sales ORDER BY date_of_sale DESC').all()
    return (rows as Record<string, unknown>[]).map(toSale)
  },

  getById: (id: string): Sale | null => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toSale(row) : null
  },

  getUnsynced: (storeId?: string): Sale[] => {
    const db = getDb()
    const rows = storeId
      ? db.prepare("SELECT * FROM sales WHERE sync_status != 'synced' AND store_id = ? ORDER BY created_at ASC").all(storeId)
      : db.prepare("SELECT * FROM sales WHERE sync_status != 'synced' ORDER BY created_at ASC").all()
    return (rows as Record<string, unknown>[]).map(toSale)
  },

  create: (sale: Omit<Sale, 'id' | 'created_at' | 'synced'> & { id?: string }, storeId?: string): Sale => {
    const db = getDb()
    const id = (sale as any).id || randomUUID()
    const now = new Date().toISOString()
    const productsJson = JSON.stringify(sale.items || [])
    const row = {
      id,
      products: productsJson,
      total_amount: sale.total ?? 0,
      date_of_sale: now,
      created_at: now,
      sync_status: 'pending',
      store_id: storeId || sale.store_id || null,
      customer_id: (sale as any).customer_id || null,
      customer_name: (sale as any).customer_name || null,
      paid_in_cash: (sale as any).paid_in_cash ?? true,
      staff_id: (sale as any).staff_id || null,
      payment_details: JSON.stringify((sale as any).payment_details || {}),
      last_updated_at: now
    }
    db.prepare(
      `INSERT INTO sales (id, products, total_amount, date_of_sale, created_at, sync_status, store_id, customer_id, customer_name, paid_in_cash, staff_id, payment_details, last_updated_at)
       VALUES (@id, @products, @total_amount, @date_of_sale, @created_at, @sync_status, @store_id, @customer_id, @customer_name, @paid_in_cash, @staff_id, @payment_details, @last_updated_at)
       ON CONFLICT(id) DO UPDATE SET products=excluded.products, total_amount=excluded.total_amount, sync_status=excluded.sync_status, last_updated_at=excluded.last_updated_at`
    ).run(row as any)
    return toSale(row as Record<string, unknown>)
  },

  markSynced: (id: string): boolean => {
    const db = getDb()
    const result = db.prepare("UPDATE sales SET sync_status = 'synced', last_updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      id
    )
    return result.changes > 0
  }
}
