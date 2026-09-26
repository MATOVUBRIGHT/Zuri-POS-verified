/**
 * Background sync engine
 * When online, pushes unsynced sales to Supabase. Does not block UI.
 */
import { offlineServices } from './offlineServices'

let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false
const SYNC_INTERVAL_MS = 30_000

async function pushUnsyncedSales(storeId?: string) {
  if (isSyncing || !navigator.onLine) return

  let supabase: any = null
  try {
    const { supabase: sb } = await import('@/integrations/supabase/client')
    supabase = sb
  } catch {
    return
  }
  if (!supabase) return

  try {

    const unsynced = await offlineServices.sync.getUnsyncedSales(storeId)
    if (unsynced.length === 0) return

    isSyncing = true

    for (const sale of unsynced) {
      try {
        // Strip SQLite-only columns before sending to Supabase
        const { sync_status, last_updated_at, payment_method_id, ...saleFields } = sale as any
        const payload = {
          ...saleFields,
          products: typeof saleFields.products === 'string' ? saleFields.products : JSON.stringify(saleFields.products || []),
          payment_details: typeof saleFields.payment_details === 'string' ? saleFields.payment_details : JSON.stringify(saleFields.payment_details || {}),
        }

        const { error } = await supabase.from('sales').upsert(payload, { onConflict: 'id' })

        if (!error) {
          await offlineServices.sync.markSaleSynced(sale.id)
        }
      } catch (err) {
        console.warn('[Sync] Failed to push sale:', sale.id, err)
      }
    }
  } catch (err) {
    console.warn('[Sync] Error:', err)
  } finally {
    isSyncing = false
  }
}

export function startBackgroundSync(storeId?: string) {
  stopBackgroundSync()
  pushUnsyncedSales(storeId)
  syncInterval = setInterval(() => pushUnsyncedSales(storeId), SYNC_INTERVAL_MS)
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

export function triggerSyncNow(storeId?: string) {
  return pushUnsyncedSales(storeId)
}
