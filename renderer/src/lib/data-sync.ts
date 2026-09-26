import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type TableName = keyof Database['public']['Tables'];

type InsertType<T extends TableName> = Database['public']['Tables'][T]['Insert'];
type UpdateType<T extends TableName> = Database['public']['Tables'][T]['Update'];

// Data synchronization service for offline-first capabilities
export class DataSyncService {
  private db: IDBDatabase | null = null;
  private dbName = "brepos-offline-db";
  private dbVersion = 1;
  private syncQueue: Array<{ operation: string; table: TableName; data: unknown }> = [];
  private isSyncing = false;
  private userId: string | null = null;
  private storeId: string | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        this.userId = session.user.id;
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", session.user.id)
          .limit(1);
        this.storeId = stores?.[0]?.id || null;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = () => {
        this.db = request.result;
        const db = this.db;
        const storeNames = [
          "inventory", "sales", "expenses", "customers",
          "staff", "cash_transactions", "suppliers", "categories", "syncQueue"
        ];
        storeNames.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            if (storeName === "syncQueue") {
              db.createObjectStore(storeName, { autoIncrement: true });
            } else {
              db.createObjectStore(storeName, { keyPath: "id" });
            }
          }
        });
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.loadSyncQueue();
      };

      request.onerror = (event) => {
        console.error("IndexedDB error:", event);
      };
    } catch (error) {
      console.error("DataSyncService initialization error:", error);
    }
  }

  private async loadSyncQueue() {
    if (!this.db) return;
    const db = this.db;

    return new Promise<void>((resolve) => {
      const transaction = db.transaction("syncQueue", "readonly");
      const store = transaction.objectStore("syncQueue");
      const request = store.getAll();

      request.onsuccess = () => {
        this.syncQueue = request.result;
        resolve();
      };

      request.onerror = () => {
        console.error("Failed to load sync queue");
        resolve();
      };
    });
  }

  private async saveSyncQueue() {
    if (!this.db) return;
    const db = this.db;

    return new Promise<void>((resolve) => {
      const transaction = db.transaction("syncQueue", "readwrite");
      const store = transaction.objectStore("syncQueue");

      store.clear();
      this.syncQueue.forEach(item => {
        store.add(item);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error("Failed to save sync queue");
        resolve();
      };
    });
  }

  public async addBatchToSyncQueue(operations: Array<{ operation: string; table: TableName; data: unknown }>) {
    if (operations.length === 0) return;

    if (!this.userId || !this.storeId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        this.userId = session.user.id;
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", session.user.id)
          .limit(1);
        this.storeId = stores?.[0]?.id || null;
      }
    }

    this.syncQueue.push(...operations);
    await this.saveSyncQueue();
    this.attemptSync();
  }

  public async addToSyncQueue(operation: string, table: TableName, data: unknown) {
    if (!this.userId || !this.storeId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        this.userId = session.user.id;
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", session.user.id)
          .limit(1);
        this.storeId = stores?.[0]?.id || null;
      }
    }

    this.syncQueue.push({ operation, table, data });
    await this.saveSyncQueue();
    this.attemptSync();
  }

  public async attemptSync() {
    if (this.isSyncing) return;

    if (!this.userId || !this.storeId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        this.userId = session.user.id;
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", session.user.id)
          .limit(1);
        this.storeId = stores?.[0]?.id || null;
      }
    }

    if (!this.userId || !this.storeId) return;

    this.isSyncing = true;

    try {
      if (!navigator.onLine) {
        this.isSyncing = false;
        return;
      }

      while (this.syncQueue.length > 0) {
        const item = this.syncQueue[0];

        try {
          let result;
          switch (item.operation) {
            case "insert": {
              const insertData = item.data as InsertType<typeof item.table>;
              result = await supabase
                .from(item.table)
                .insert([insertData])
                .select();
              break;
            }
            case "update": {
              const updateData = item.data as UpdateType<typeof item.table>;
              if (!("id" in updateData) || typeof updateData.id !== "string") {
                throw new Error("Update operation requires an 'id' property of type string.");
              }
              result = await supabase
                .from(item.table)
                .update(updateData)
                .eq("id", updateData.id)
                .select();
              break;
            }
            case "delete": {
              if (!item.data || typeof item.data !== "object" || !("id" in item.data) || typeof (item.data as { id: string }).id !== "string") {
                throw new Error("Delete operation requires an 'id' property of type string.");
              }
              const deleteData = item.data as { id: string };
              result = await supabase
                .from(item.table)
                .delete()
                .eq("id", deleteData.id)
                .select();
              break;
            }
          }

          if (result?.error) {
            throw result.error;
          }

          this.syncQueue.shift();
          await this.saveSyncQueue();

        } catch (error) {
          console.error(`Sync failed for ${item.operation} ${item.table}:`, error);
          break;
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  public async getLocalData(table: string): Promise<unknown[]> {
    if (!this.db) return [];
    const db = this.db;

    return new Promise((resolve) => {
      const transaction = db.transaction(table, "readonly");
      const store = transaction.objectStore(table);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error(`Failed to get local ${table} data`);
        resolve([]);
      };
    });
  }

  public async saveLocalData(table: string, data: unknown[]): Promise<void> {
    if (!this.db) return;
    const db = this.db;

    return new Promise((resolve) => {
      const transaction = db.transaction(table, "readwrite");
      const store = transaction.objectStore(table);

      store.clear();
      data.forEach(item => {
        store.put(item);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error(`Failed to save local ${table} data`);
        resolve();
      };
    });
  }

  public async syncAllData(storeId?: string, userId?: string): Promise<void> {
    const sId = storeId || this.storeId;
    const uId = userId || this.userId;

    if (!uId || !sId) return;

    try {
      console.log(`Syncing all data for store ${sId}...`);

      const [
        inventory,
        sales,
        expenses,
        customers,
        staff,
        cash_tx,
        suppliers,
        categories
      ] = await Promise.all([
        supabase.from("inventory").select("*").eq("store_id", sId),
        supabase.from("sales").select("*").eq("store_id", sId).order('date_of_sale', { ascending: false }),
        supabase.from("expenses").select("*").eq("store_id", sId).order('date_of_expense', { ascending: false }),
        supabase.from("customers").select("*").eq("store_id", sId),
        supabase.from("staff").select("*").eq("store_id", sId),
        supabase.from("cash_transactions").select("*").eq("store_id", sId),
        supabase.from("suppliers").select("*").eq("store_id", sId),
        supabase.from("categories" as any).select("*").eq("store_id", sId)
      ]);

      await Promise.all([
        this.saveLocalData("inventory", inventory.data || []),
        this.saveLocalData("sales", sales.data || []),
        this.saveLocalData("expenses", expenses.data || []),
        this.saveLocalData("customers", customers.data || []),
        this.saveLocalData("staff", staff.data || []),
        this.saveLocalData("cash_transactions", cash_tx.data || []),
        this.saveLocalData("suppliers", suppliers.data || []),
        this.saveLocalData("categories", categories.data || [])
      ]);

      console.log("Full data sync complete.");
    } catch (error) {
      console.error("Failed to sync all data:", error);
    }
  }

  /**
   * When online, always fetch fresh data from the network so the dashboard
   * reflects the latest sales immediately after React Query cache invalidation.
   * Falls back to local IndexedDB cache only when offline or on network error.
   */
  public async getDataWithLocalFirst<T>(table: string, fetchFn: () => Promise<T>): Promise<T> {
    if (navigator.onLine) {
      try {
        const networkData = await fetchFn();
        if (networkData && Array.isArray(networkData)) {
          await this.saveLocalData(table, networkData);
        }
        return networkData;
      } catch (error) {
        console.warn(`Network fetch failed for ${table}, falling back to local cache:`, error);
        const localData = await this.getLocalData(table);
        return localData as unknown as T;
      }
    }

    // Offline: serve from local cache
    try {
      const localData = await this.getLocalData(table);
      return localData as unknown as T;
    } catch (error) {
      console.error(`Failed to get local ${table} data:`, error);
      return [] as unknown as T;
    }
  }

  public async hasOfflineData(): Promise<boolean> {
    if (!this.db) return false;
    const db = this.db;

    return new Promise((resolve) => {
      const transaction = db.transaction(["inventory", "sales", "expenses"], "readonly");
      const inventoryStore = transaction.objectStore("inventory");
      const salesStore = transaction.objectStore("sales");
      const expensesStore = transaction.objectStore("expenses");

      let hasData = false;

      inventoryStore.getAll().onsuccess = (e) => {
        const target = e.target as IDBRequest<unknown[]>;
        if (target.result && target.result.length > 0) hasData = true;
      };

      salesStore.getAll().onsuccess = (e) => {
        const target = e.target as IDBRequest<unknown[]>;
        if (target.result && target.result.length > 0) hasData = true;
      };

      expensesStore.getAll().onsuccess = (e) => {
        const target = e.target as IDBRequest<unknown[]>;
        if (target.result && target.result.length > 0) hasData = true;
      };

      transaction.oncomplete = () => resolve(hasData);
      transaction.onerror = () => resolve(false);
    });
  }
}

// Singleton instance
export const dataSyncService = new DataSyncService();

// React hook for data synchronization
export const useDataSync = () => {
  const queryClient = useQueryClient();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [hasOfflineData, setHasOfflineData] = useState(false);

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
    dataSyncService.hasOfflineData().then(setHasOfflineData);
  }, []);

  useEffect(() => {
    if (!isOffline) {
      dataSyncService.attemptSync();
    }
  }, [isOffline]);

  return {
    isOffline,
    hasOfflineData,
    dataSyncService,
    queryClient
  };
};
