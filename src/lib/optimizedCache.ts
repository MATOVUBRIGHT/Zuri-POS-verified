// Optimized caching utility for better performance
import { cache } from '@/lib/cache';

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

    // Check if request is already in flight
    const pendingRequest = this.requestCache.get(key);
    if (pendingRequest) {
      return pendingRequest;
    }

    // Check persistent cache (IndexedDB) but don't block on it
    const persistentPromise = this.checkPersistentCache<T>(key);
    
    // Start fetching immediately, don't wait for persistent cache
    const request = this.fetchAndCache(key, fetcher, options);
    this.requestCache.set(key, request);

    try {
      // Try to get from persistent cache quickly
      const cachedData = await Promise.race([
        persistentPromise,
        new Promise(resolve => setTimeout(() => resolve(null), 100)) // 100ms timeout
      ]);
      
      if (cachedData) {
        // Cancel the network request and use cached data
        this.setMemoryCache(key, cachedData, ttl);
        this.requestCache.delete(key);
        return cachedData as T;
      }
      
      // Use network request
      const result = await request;
      return result;
    } catch (error) {
      this.requestCache.delete(key);
      throw error;
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
      await cache.set(key, data, ttl / 1000); // cache.set expects seconds
      
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

  private async fetchAndCache<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions): Promise<T> {
    const { ttl = 10 * 60 * 1000 } = options;
    
    try {
      const data = await fetcher();
      
      // Store in both memory and persistent cache (non-blocking)
      this.setMemoryCache(key, data, ttl);
      
      // Don't await persistent cache write to avoid blocking
      setTimeout(() => {
        cache.set(key, data, ttl / 1000).catch(() => {}); // Ignore errors
      }, 0);
      
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

  private cleanup() {
    const now = Date.now();
    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.memoryCache.delete(key);
      }
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
  async preload<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions = {}) {
    if (!this.memoryCache.has(key) && !this.requestCache.has(key)) {
      this.get(key, fetcher, { ...options, priority: 'low' });
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
    
    // Persistent cache invalidation
    cache.invalidate(keyPattern);
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

  // Preload frequently accessed endpoints
  optimizedCache.preload(`categories:${storeId}`, async () => {
    const { data } = await import('@/integrations/supabase/client').then(m => 
      m.supabase.from('categories').select('*').eq('store_id', storeId)
    );
    return data || [];
  }, { ttl: 10 * 60 * 1000 });

  optimizedCache.preload(`payment_methods:${storeId}`, async () => {
    const { data } = await import('@/integrations/supabase/client').then(m => 
      m.supabase.from('payment_methods').select('*').eq('store_id', storeId)
    );
    return data || [];
  }, { ttl: 15 * 60 * 1000 });
}

// Clean up on app unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    optimizedCache.destroy();
  });
}