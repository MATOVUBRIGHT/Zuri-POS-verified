import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { retryWithBackoff } from "@/lib/retry";
import { sanitizeInventoryPayload } from "@/lib/inventoryPayload";
import { logSupabaseError } from "@/lib/supabaseError";

export type TableName = keyof Database["public"]["Tables"];

type InsertType<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
type UpdateType<T extends TableName> = Database["public"]["Tables"][T]["Update"];

type SyncOperation = "insert" | "update" | "delete";

type SyncJob = {
  id: string;
  operation: SyncOperation;
  table: TableName;
  data: unknown;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
  last_error?: string;
};

type LocalDataRow = {
  key: string;
  updated_at: number;
  data: unknown[];
};

const LS_QUEUE_KEY = "zuripos_sync_queue_v1";
const LS_LOCAL_PREFIX = "zuripos_local_table_v1:";

const DB_NAME = "zuripos-offline";
const DB_VERSION = 1;
const STORE_QUEUE = "syncQueue";
const STORE_LOCAL = "localData";

const nowMs = () => Date.now();

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const makeId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const supportsIndexedDb = () => typeof indexedDB !== "undefined";

const openDb = (): Promise<IDBDatabase | null> => {
  if (!supportsIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_LOCAL)) {
          db.createObjectStore(STORE_LOCAL, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const idbGetAll = async <T,>(db: IDBDatabase, store: string): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    const req = os.getAll();
    req.onsuccess = () => resolve((req.result || []) as T[]);
    req.onerror = () => reject(req.error);
  });
};

const idbPut = async (db: IDBDatabase, store: string, value: unknown) => {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const req = os.put(value as any);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const idbDelete = async (db: IDBDatabase, store: string, key: string) => {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export class DataSyncService {
  private dbPromise: Promise<IDBDatabase | null> = openDb();
  private queue: SyncJob[] = [];
  private localCache = new Map<string, LocalDataRow>();
  private initPromise: Promise<void>;
  private syncing = false;
  private lastError: string | null = null;
  private autoSyncId: number | null = null;

  private normalizeCashTransactionType(type: unknown): "in" | "out" {
    const normalized = String(type || "").trim().toLowerCase();
    return normalized === "in" || normalized === "income" || normalized === "deposit" ? "in" : "out";
  }

  private sanitizeInsertData<T extends TableName>(table: T, data: InsertType<T>): InsertType<T> {
    if (table === "inventory") {
      return sanitizeInventoryPayload(data as Record<string, unknown>) as InsertType<T>;
    }

    if (table === "sales") {
      // Strip server-managed columns that Supabase rejects in inserts
      const { updated_at, created_at, ...rest } = data as Record<string, unknown>;
      void updated_at; void created_at;
      return rest as InsertType<T>;
    }

    if (table === "cash_transactions") {
      const tx = data as InsertType<"cash_transactions">;
      return {
        ...tx,
        type: this.normalizeCashTransactionType(tx.type),
        account_type: tx.account_type ? String(tx.account_type).toLowerCase() : "cash",
      } as InsertType<T>;
    }

    return data;
  }

  private sanitizeUpdateData<T extends TableName>(table: T, data: UpdateType<T>): UpdateType<T> {
    if (table === "inventory") {
      return sanitizeInventoryPayload(data as Record<string, unknown>) as UpdateType<T>;
    }

    if (table === "cash_transactions") {
      const tx = data as UpdateType<"cash_transactions">;
      return {
        ...tx,
        type: tx.type ? this.normalizeCashTransactionType(tx.type) : tx.type,
        account_type: tx.account_type ? String(tx.account_type).toLowerCase() : tx.account_type,
      } as UpdateType<T>;
    }

    return data;
  }

  constructor() {
    this.initPromise = this.initialize();

    // Best-effort background sync triggers
    try {
      window.addEventListener("online", () => {
        void this.attemptSync();
      });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void this.attemptSync();
      });

      // Periodic sync (offline-first: always retries when connectivity returns).
      this.autoSyncId = window.setInterval(() => {
        void this.attemptSync();
      }, 30000);
    } catch {
      // non-browser environment (tests)
    }
  }

  private updateDebugGlobals() {
    (window as any).__syncQueue = this.queue;
    (window as any).__isSyncing = this.syncing;
    (window as any).__lastSyncError = this.lastError;
  }

  private async persistQueue() {
    const db = await this.dbPromise;
    if (db) {
      // Store individual jobs for incremental updates.
      await Promise.all(this.queue.map((job) => idbPut(db, STORE_QUEUE, job))).catch(() => undefined);
      // Best-effort: remove orphaned jobs is handled on delete.
      return;
    }

    // localStorage fallback
    try {
      localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      // ignore quota
    }
  }

  private async persistLocalRow(row: LocalDataRow) {
    const db = await this.dbPromise;
    if (db) {
      await idbPut(db, STORE_LOCAL, row).catch(() => undefined);
      return;
    }

    try {
      localStorage.setItem(`${LS_LOCAL_PREFIX}${row.key}`, JSON.stringify(row));
    } catch {
      // ignore
    }
  }

  private async initialize() {
    const db = await this.dbPromise;
    if (db) {
      try {
        const allJobs = (await idbGetAll<SyncJob>(db, STORE_QUEUE)).sort((a, b) => a.created_at - b.created_at);
        // Purge jobs that have failed too many times (likely 409 duplicates)
        const validJobs: SyncJob[] = [];
        for (const job of allJobs) {
          if ((job.attempts || 0) >= 3) {
            // Discard — likely a duplicate that keeps 409ing
            await idbDelete(db, STORE_QUEUE, job.id).catch(() => undefined);
          } else {
            validJobs.push(job);
          }
        }
        this.queue = validJobs;
      } catch {
        this.queue = [];
      }

      try {
        const rows = await idbGetAll<LocalDataRow>(db, STORE_LOCAL);
        rows.forEach((r) => this.localCache.set(r.key, r));
      } catch {
        // ignore
      }
    } else {
      this.queue = safeJsonParse<SyncJob[]>(localStorage.getItem(LS_QUEUE_KEY), []);
    }

    this.updateDebugGlobals();
  }

  public getQueueSnapshot() {
    return this.queue.slice();
  }

  public isSyncing() {
    return this.syncing;
  }

  public getLastError() {
    return this.lastError;
  }

  public async enqueue(operation: SyncOperation, table: TableName, data: unknown) {
    await this.initPromise;
    const createdAt = nowMs();
    const job: SyncJob = {
      id: makeId(),
      operation,
      table,
      data,
      created_at: createdAt,
      attempts: 0,
      next_attempt_at: createdAt,
    };
    this.queue.push(job);
    this.updateDebugGlobals();
    await this.persistQueue();
  }

  public async enqueueMany(operation: SyncOperation, table: TableName, rows: unknown[]) {
    await this.initPromise;
    if (rows.length === 0) return;
    const createdAt = nowMs();
    for (let i = 0; i < rows.length; i++) {
      this.queue.push({
        id: makeId(),
        operation,
        table,
        data: rows[i],
        created_at: createdAt + i, // stable ordering
        attempts: 0,
        next_attempt_at: createdAt,
      });
    }
    this.updateDebugGlobals();
    await this.persistQueue();
  }

  public async addToSyncQueue(operation: string, table: TableName, data: unknown) {
    // Backwards compatible entry point: try remote; if it fails, queue for later.
    await this.initPromise;

    const op = operation as SyncOperation;
    if (!navigator.onLine) {
      await this.enqueue(op, table, data);
      throw new Error("Offline: saved locally and queued for sync");
    }

    try {
      return await this.applyOperation(op, table, data);
    } catch (err: any) {
      // Don't queue permanent client errors (4xx except 408/429) — they won't succeed on retry
      const errStatus = Number(err?.status || err?.cause?.status || 0);
      // 409 Conflict = already exists = treat as success, don't queue
      if (errStatus === 409) {
        console.info(`[DataSync] ${operation} ${table} already exists (409), treating as success`);
        return;
      }
      const isPermanentClientError = errStatus >= 400 && errStatus < 500 && errStatus !== 408 && errStatus !== 429;
      if (isPermanentClientError) {
        console.warn(`[DataSync] Not queuing ${operation} ${table} — permanent error (${errStatus}):`, err?.message);
        throw err;
      }
      // Network/server error: queue and continue UX.
      await this.enqueue(op, table, data);
      throw err;
    }
  }

  private async applyOperation(operation: SyncOperation, table: TableName, data: unknown) {
    const maybeRetryWithoutMissingColumn = async (
      result: any,
      payload: Record<string, unknown>,
      run: (nextPayload: Record<string, unknown>) => any
    ) => {
      if (!result.error || table !== "inventory") return result;
      let current = result;
      let nextPayload: Record<string, unknown> = { ...payload };

      for (let i = 0; i < 12; i++) {
        const message = String(current.error?.message || "");
        const code = String(current.error?.code || "");
        if (!code.startsWith("PGRST2")) return current;

        const missingColumn = message.match(/Could not find the '([^']+)' column/i)?.[1];
        if (!missingColumn || !(missingColumn in nextPayload)) return current;

        delete (nextPayload as any)[missingColumn];
        current = await run(nextPayload);
        if (!current.error) return current;
      }

      return current;
    };

    switch (operation) {
      case "insert": {
        const row = this.sanitizeInsertData(table, data as InsertType<typeof table>) as Record<string, unknown>;
        // Strip non-UUID id fields (e.g. 'sale-<uuid>') that Supabase rejects
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (row.id && typeof row.id === "string" && !UUID_RE.test(row.id)) {
          delete row.id;
        }
        // Use upsert so retried jobs with a valid id don't cause 409 conflicts
        const hasId = row.id && typeof row.id === "string";
        const runInsert = (payload: Record<string, unknown>) =>
          hasId
            ? supabase.from(table).upsert([payload as any], { onConflict: "id", ignoreDuplicates: true }).select()
            : supabase.from(table).insert([payload as any]).select();
        let result = await runInsert(row);
        result = await maybeRetryWithoutMissingColumn(result, row, runInsert);

        if (result.error) {
          if (table === "inventory") {
            logSupabaseError("dataSync.inventory.insert", result.error);
          }
          throw result.error;
        }
        return result.data;
      }
      case "update": {
        const updateData = this.sanitizeUpdateData(table, data as UpdateType<typeof table>);
        if (!("id" in updateData) || typeof updateData.id !== "string") {
          throw new Error("Update operation requires an 'id' property of type string.");
        }
        const { id: _updateId, ...updateFields } = updateData as Record<string, unknown>;
        const runUpdate = (payload: Record<string, unknown>) =>
          supabase.from(table).update(payload as any).eq("id", updateData.id).select();
        let result = await runUpdate(updateFields);
        result = await maybeRetryWithoutMissingColumn(result, updateFields, runUpdate);

        if (result.error) {
          if (table === "inventory") {
            logSupabaseError("dataSync.inventory.update", result.error);
          }
          throw result.error;
        }
        return result.data;
      }
      case "delete": {
        if (!data || typeof data !== "object" || !("id" in data) || typeof (data as { id: string }).id !== "string") {
          throw new Error("Delete operation requires an 'id' property of type string.");
        }

        const result = await supabase
          .from(table)
          .delete()
          .eq("id", (data as { id: string }).id)
          .select();

        if (result.error) throw result.error;
        return result.data;
      }
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  public async attemptSync() {
    await this.initPromise;
    if (!navigator.onLine) return;
    if (this.syncing) return;

    this.syncing = true;
    this.lastError = null;
    this.updateDebugGlobals();

    try {
      const maxJobsPerRun = 50;
      const now = nowMs();
      const runnable = this.queue
        .filter((j) => (j.next_attempt_at || 0) <= now)
        .sort((a, b) => a.created_at - b.created_at)
        .slice(0, maxJobsPerRun);

      for (const job of runnable) {
        try {
          await retryWithBackoff(
            async () => {
              await this.applyOperation(job.operation, job.table, job.data);
            },
            {
              retries: 3,
              baseDelayMs: 800,
              maxDelayMs: 8000,
              shouldRetry: (err) => {
                const code = String(err?.code || "");
                const message = String(err?.message || "").toLowerCase();
                if (code.startsWith("PGRST2")) return false;
                if (message.includes("could not find the") && message.includes("column")) return false;

                const status = Number(err?.status || err?.cause?.status || 0);
                if (status === 0) return true;
                if (status === 408 || status === 429) return true;
                if (status >= 500 && status < 600) return true;
                return false;
              },
            }
          );

          // Success: remove from queue + storage
          this.queue = this.queue.filter((q) => q.id !== job.id);
          const db = await this.dbPromise;
          if (db) await idbDelete(db, STORE_QUEUE, job.id).catch(() => undefined);
        } catch (err: any) {
          if (job.table === "inventory") {
            logSupabaseError("dataSync.inventory.syncJob", err, {
              operation: job.operation,
              attempts: job.attempts,
            });
          }

          // Discard jobs that get a permanent client error (4xx except 408/429)
          const errStatus = Number(err?.status || err?.cause?.status || 0);
          // 409 = already exists = discard silently (success)
          const isPermanentClientError = (errStatus >= 400 && errStatus < 500 && errStatus !== 408 && errStatus !== 429) || errStatus === 409;
          if (isPermanentClientError) {
            if (errStatus !== 409) {
              console.warn(`[DataSync] Discarding ${job.operation} ${job.table} job (${errStatus}):`, err?.message);
            }
            this.queue = this.queue.filter((q) => q.id !== job.id);
            const db = await this.dbPromise;
            if (db) await idbDelete(db, STORE_QUEUE, job.id).catch(() => undefined);
            continue;
          }

          job.attempts = (job.attempts || 0) + 1;
          job.last_error = String(err?.message || "Sync failed");

          // Exponential backoff scheduling (avoid hammering weak networks)
          const delay = Math.min(60_000, 2000 * Math.pow(2, Math.min(6, job.attempts)));
          job.next_attempt_at = nowMs() + delay;

          this.lastError = job.last_error;
          // Persist the updated job
          const db = await this.dbPromise;
          if (db) await idbPut(db, STORE_QUEUE, job).catch(() => undefined);
        }
      }

      this.updateDebugGlobals();
      await this.persistQueue();
    } finally {
      this.syncing = false;
      this.updateDebugGlobals();
    }
  }

  public async getLocalData(_table: string): Promise<unknown[]> {
    await this.initPromise;
    const key = String(_table);

    const fallbackInventoryFromCoreStore = () => {
      // If DataSyncService cache is empty but core offline-first store has inventory,
      // use it as a fallback so items never "disappear" on refresh/minimize.
      if (!key.startsWith("inventory:")) return [];
      const storeId = key.split(":")[1] || "";
      if (!storeId) return [];

      try {
        const persisted = safeJsonParse<any>(localStorage.getItem("zuripos_core_store_v1"), null);
        const inv = persisted?.state?.inventory;
        const list = Array.isArray(inv) ? inv : [];
        return list.filter((r: any) => String(r?.store_id || "") === storeId);
      } catch {
        return [];
      }
    };

    const cached = this.localCache.get(key);
    if (cached) {
      const data = cached.data || [];
      if ((data?.length || 0) === 0) {
        const fb = fallbackInventoryFromCoreStore();
        if (fb.length > 0) return fb;
      }
      return data;
    }

    const db = await this.dbPromise;
    if (db) {
      const rows = await idbGetAll<LocalDataRow>(db, STORE_LOCAL).catch(() => []);
      const row = rows.find((r) => r.key === key);
      if (row) {
        this.localCache.set(key, row);
        const data = row.data || [];
        if ((data?.length || 0) === 0) {
          const fb = fallbackInventoryFromCoreStore();
          if (fb.length > 0) return fb;
        }
        return data;
      }
      const fb = fallbackInventoryFromCoreStore();
      return fb.length > 0 ? fb : [];
    }

    const row = safeJsonParse<LocalDataRow>(localStorage.getItem(`${LS_LOCAL_PREFIX}${key}`), {
      key,
      updated_at: 0,
      data: [],
    });
    this.localCache.set(key, row);
    const data = row.data || [];
    if ((data?.length || 0) === 0) {
      const fb = fallbackInventoryFromCoreStore();
      if (fb.length > 0) return fb;
    }
    return data;
  }

  public async saveLocalData(_table: string, _data: unknown[]): Promise<void> {
    await this.initPromise;
    const key = String(_table);
    const row: LocalDataRow = { key, updated_at: nowMs(), data: Array.isArray(_data) ? _data : [] };
    this.localCache.set(key, row);
    await this.persistLocalRow(row);
  }

  public async syncAllData(): Promise<void> {
    await this.attemptSync();
  }

  private parseTableKey(key: string): { tableName: TableName | null; storeId: string | null } {
    const [rawTable, rawStoreId] = String(key).split(":");
    const tableName = rawTable as TableName;
    const isKnownFromQueue = this.queue.some((job) => job.table === tableName);

    return {
      tableName: isKnownFromQueue ? tableName : null,
      storeId: rawStoreId || null,
    };
  }

  private mergeWithPendingQueue(tableKey: string, rows: unknown[]): unknown[] {
    const baseRows = Array.isArray(rows) ? [...rows] : [];
    const { tableName, storeId } = this.parseTableKey(tableKey);
    if (!tableName) return baseRows;

    const queued = this.queue
      .filter((job) => job.table === tableName)
      .sort((a, b) => a.created_at - b.created_at);

    if (queued.length === 0) return baseRows;

    const matchesStore = (payload: any) => {
      if (!storeId) return true;
      const payloadStoreId = String(payload?.store_id || "");
      if (payloadStoreId) return payloadStoreId === storeId;
      // Updates/deletes may not include store_id; keep them so id-based matching can apply.
      return true;
    };

    for (const job of queued) {
      const payload = (job.data || {}) as Record<string, unknown>;
      if (!matchesStore(payload)) continue;

      if (job.operation === "insert") {
        const id = String(payload.id || `queued-${job.id}`);
        const idx = baseRows.findIndex((row: any) => String(row?.id || "") === id);
        const insertRow = { ...payload, id };

        if (idx >= 0) {
          baseRows[idx] = { ...(baseRows[idx] as any), ...insertRow };
        } else {
          baseRows.unshift(insertRow);
        }
        continue;
      }

      if (job.operation === "update") {
        const id = String(payload.id || "");
        if (!id) continue;
        const idx = baseRows.findIndex((row: any) => String(row?.id || "") === id);
        if (idx >= 0) {
          baseRows[idx] = { ...(baseRows[idx] as any), ...payload };
        }
        continue;
      }

      if (job.operation === "delete") {
        const id = String((payload as any)?.id || "");
        if (!id) continue;
        const idx = baseRows.findIndex((row: any) => String(row?.id || "") === id);
        if (idx >= 0) {
          baseRows.splice(idx, 1);
        }
      }
    }

    return baseRows;
  }

  public async getDataWithLocalFirst<T>(_table: string, fetchFn: () => Promise<T>): Promise<T> {
    await this.initPromise;
    const table = String(_table);

    // Serve from in-memory cache instantly if available
    if (this.localCache.has(table)) {
      const row = this.localCache.get(table);
      const cached = (row?.data ?? []) as unknown[];
      const merged = this.mergeWithPendingQueue(table, cached);
      // Kick off background refresh without blocking
      if (navigator.onLine) {
        fetchFn().then(data => {
          if (Array.isArray(data)) {
            const fresh = this.mergeWithPendingQueue(table, data as unknown[]);
            this.saveLocalData(table, fresh);
          }
        }).catch(() => {});
      }
      return merged as unknown as T;
    }

    if (!navigator.onLine) {
      return (await this.getLocalData(table)) as unknown as T;
    }

    try {
      const data = await fetchFn();
      if (Array.isArray(data)) {
        const merged = this.mergeWithPendingQueue(table, data as unknown as unknown[]);
        await this.saveLocalData(table, merged);
        return merged as unknown as T;
      }
      return data;
    } catch (err) {
      // Network failure - serve cached local data if available.
      const local = await this.getLocalData(table);
      const mergedLocal = this.mergeWithPendingQueue(table, local);
      return mergedLocal as unknown as T;
    }
  }

  public async hasOfflineData(): Promise<boolean> {
    await this.initPromise;
    return this.queue.length > 0 || this.localCache.size > 0;
  }
}

export const dataSyncService = new DataSyncService();

export const useDataSync = () => {
  const queryClient = useQueryClient();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [queueLength, setQueueLength] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setQueueLength((window as any).__syncQueue?.length || 0);
      setIsSyncing(Boolean((window as any).__isSyncing));
      setLastError(((window as any).__lastSyncError as string) || null);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const hasOfflineData = useMemo(() => queueLength > 0, [queueLength]);

  return {
    isOffline,
    hasOfflineData,
    queueLength,
    isSyncing,
    lastError,
    dataSyncService,
    queryClient,
  };
};
