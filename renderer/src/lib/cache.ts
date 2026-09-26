// lib/cache.ts - Persistent Cache Layer using IndexedDB
import localforage from 'localforage';

// Configure localforage for IndexedDB storage
localforage.config({
    name: 'BreposPOS',
    storeName: 'pos_cache',
    driver: localforage.INDEXEDDB,
    description: 'Persistent cache for POS data'
});

interface CacheItem<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

export const cache = {
    // Set data with expiration
    async set<T>(key: string, data: T, expiresInMs: number = 1000 * 60 * 30) { // 30min default
        const item: CacheItem<T> = {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + expiresInMs
        };
        await localforage.setItem(key, item);
    },

    // Get data if not expired
    async get<T>(key: string): Promise<T | null> {
        const item = await localforage.getItem<CacheItem<T>>(key);
        if (!item) return null;

        // Check expiration
        if (Date.now() > item.expiresAt) {
            await localforage.removeItem(key);
            return null;
        }

        return item.data;
    },

    // Force refresh (invalidate)
    async invalidate(key: string) {
        await localforage.removeItem(key);
    },

    // Clear all cache
    async clear() {
        await localforage.clear();
    },

    // Get keys matching pattern
    async keys(pattern?: string): Promise<string[]> {
        const keys = await localforage.keys();
        if (!pattern) return keys;
        return keys.filter(k => k.includes(pattern));
    }
};

// Specialized cache keys
export const CACHE_KEYS = {
    INVENTORY: (storeId: string) => `inventory_${storeId}`,
    SALES: (storeId: string) => `sales_${storeId}`,
    EXPENSES: (storeId: string) => `expenses_${storeId}`,
    CUSTOMERS: (storeId: string) => `customers_${storeId}`,
    STAFF: (storeId: string) => `staff_${storeId}`,
    CASH_TRANSACTIONS: (storeId: string) => `cash_tx_${storeId}`,
    STORE_INFO: (storeId: string) => `store_${storeId}`,
};
