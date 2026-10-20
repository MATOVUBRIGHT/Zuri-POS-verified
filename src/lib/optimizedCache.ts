// Optimized caching utility for better performance
import { cache } from '@/lib/cache';
import { supabase } from '@/integrations/supabase/client';

interface CacheOptions {
  ttl?: number;
  staleWhileRevalidate?: boolean;
  maxAge?: number;
  priority?: 'high' | 'normal' | 'low';
}

class OptimizedCache {
  private memoryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private requestCache = new Map<string, Promise<any>>();
  private maxMemorySize = 2000; // Increased cache size for better performance
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired items every 2 minutes for better performance
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 2 * 60 * 1000);
  }

  async get<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const {
      ttl = 10 * 60 * 1000, // Increased default TTL to 10 minutes
      staleWhileRevalidate = true,
      priority = 'normal'
    } = options;

    // Check memory cache first (fastest)
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem) {
      const isExpired = Date.now() - memoryItem.timestamp > memoryItem.ttl;
      
      if (!isExpired) {
        return memoryItem.data;
      }
      
      // If stale-while-revalidate is enabled, return stale data and update in background
      if (staleWhileRevalidate) {
        // Use setTimeout for truly non-blocking background refresh
        setTimeout(() => this.backgroundRefresh(key, fetcher, options), 0);
        return memoryItem.data;
      }
    }

    const pendingRequest = this.requestCache.get(key);
    if (pendingRequest) return pendingRequest;

    const persistentPromise = this.checkPersistentCache<T>(key);
    const cachedData = await Promise.race([
      persistentPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
    if (cachedData !== null) {
      this.setMemoryCache(key, cachedData, ttl);
      return cachedData;
    }

    const pendingAfterPersistentCheck = this.requestCache.get(key);
    if (pendingAfterPersistentCheck) return pendingAfterPersistentCheck;

    const request = this.fetchAndCache(key, fetcher, options);
    this.requestCache.set(key, request);
    try {
      return await request;
    } finally {
      if (this.requestCache.get(key) === request) this.requestCache.delete(key);
    }
  }

  private async checkPersistentCache<T>(key: string): Promise<T | null> {
    try {
      return await cache.get<T>(key);
    } catch {
      return null;
    }
  }

  private async fetchAndCache<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions): Promise<T> {
    const { ttl = 5 * 60 * 1000 } = options;
    
    try {
      const data = await fetcher();
      
      // Store in both memory and persistent cache
      this.setMemoryCache(key, data, ttl);
      // cache.set expects milliseconds, matching the TTL used by this class.
      // Dividing here reduced a 20-minute cache to roughly 1.2 seconds.
      await cache.set(key, data, ttl);
      
      return data;
    } catch (error) {
      // On error, try to return stale data if available
      const staleData = this.memoryCache.get(key);
      if (staleData) {
        console.warn('Returning stale data due to fetch error:', error);
        return staleData.data;
      }
      throw error;
    }
  }

  private async backgroundRefresh<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions) {
    try {
      await this.fetchAndCache(key, fetcher, options);
    } catch (error) {
      console.warn('Background refresh failed:', error);
    }
  }

  private setMemoryCache(key: string, data: any, ttl: number) {
    // Implement LRU eviction if cache is full
    if (this.memoryCache.size >= this.maxMemorySize) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.memoryCache.delete(key);
      }
    }
  }

  // Preload frequently accessed data
  async preload<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions = {}): Promise<void> {
    if (this.memoryCache.has(key) || this.requestCache.has(key)) return;
    try {
      await this.get(key, fetcher, { ...options, priority: 'low' });
    } catch (error) {
      console.warn(`Cache preload failed for "${key}":`, error);
    }
  }

  // Invalidate cache entries
  invalidate(keyPattern: string) {
    // Memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.includes(keyPattern)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Persistent cache invalidation. The IndexedDB layer stores the full key,
    // so remove every matching entry rather than only an exact key.
    void cache.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.includes(keyPattern))
        .map((key) => cache.invalidate(key)),
    ));
  }

  // Get cache stats for performance monitoring
  getStats() {
    return {
      memorySize: this.memoryCache.size,
      maxMemorySize: this.maxMemorySize,
      pendingRequests: this.requestCache.size,
      memoryKeys: Array.from(this.memoryCache.keys())
    };
  }

  // Clean up resources
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.memoryCache.clear();
    this.requestCache.clear();
  }
}

export const optimizedCache = new OptimizedCache();

// Hook for using optimized cache in React components
export function useOptimizedCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
) {
  return optimizedCache.get(key, fetcher, options);
}

// Preload common data patterns
export function preloadCommonData(storeId: string) {
  if (!storeId) return;

  void optimizedCache.preload(`categories:${storeId}`, async () => {
    const { data, error } = await supabase.from('categories').select('*').eq('store_id', storeId);
    if (error) throw error;
    return data || [];
  }, { ttl: 10 * 60 * 1000 });

  void optimizedCache.preload(`payment_methods:${storeId}`, async () => {
    const { data, error } = await supabase.from('payment_methods').select('*').eq('store_id', storeId);
    if (error) throw error;
    return data || [];
  }, { ttl: 15 * 60 * 1000 });
}

// Clean up on app unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    optimizedCache.destroy();
  });
}
