/**
 * Sync Service - Background sync engine
 * Pushes unsynced data to server when online. Never blocks UI.
 */
import { getDb } from '../database/db'
import { randomUUID } from 'crypto'

type SyncType = 'sale' | 'update' | 'delete' | 'inventory' | 'expense' | 'customer' | 'staff'

export interface SyncQueueItem {
  id: string
  type: SyncType
  table_name: string
  payload: unknown
  status: 'pending' | 'synced' | 'failed'
  retry_count: number
  last_error?: string
  created_at: string
}

export const syncService = {
  enqueue: (type: SyncType, tableName: string, payload: unknown): string => {
    const db = getDb()
    const id = randomUUID()
    db.prepare(
      'INSERT INTO sync_queue (id, type, table_name, payload, status) VALUES (?, ?, ?, ?, ?)'
    ).run(id, type, tableName, JSON.stringify(payload), 'pending')
    return id
  },

  getPending: (limit = 100): SyncQueueItem[] => {
    const db = getDb()
    const rows = db.prepare("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?").all(limit) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: String(r.id),
      type: r.type as SyncType,
      table_name: String(r.table_name),
      payload: (() => {
        try {
          return typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
        } catch {
          return r.payload
        }
      })(),
      status: r.status as 'pending' | 'synced' | 'failed',
      retry_count: Number(r.retry_count ?? 0),
      last_error: r.last_error ? String(r.last_error) : undefined,
      created_at: String(r.created_at)
    }))
  },

  markSynced: (id: string): void => {
    getDb().prepare("UPDATE sync_queue SET status = 'synced' WHERE id = ?").run(id)
  },

  markFailed: (id: string, error: string): void => {
    getDb()
      .prepare("UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?")
      .run(error.substring(0, 500), id)
  },

  markRetry: (id: string): void => {
    getDb().prepare("UPDATE sync_queue SET status = 'pending' WHERE id = ?").run(id)
  },

  getUnsyncedSales: (storeId?: string): unknown[] => {
    const db = getDb()
    const rows = storeId
      ? db.prepare("SELECT * FROM sales WHERE sync_status != 'synced' AND store_id = ? ORDER BY created_at ASC").all(storeId)
      : db.prepare("SELECT * FROM sales WHERE sync_status != 'synced' ORDER BY created_at ASC").all()
    return rows as unknown[]
  },

  markSaleSynced: (saleId: string): void => {
    getDb().prepare("UPDATE sales SET sync_status = 'synced', last_updated_at = ? WHERE id = ?").run(new Date().toISOString(), saleId)
  },

  getPendingCount: (): number => {
    const row = getDb().prepare("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'").get() as { c: number }
    return row?.c ?? 0
  }
}
