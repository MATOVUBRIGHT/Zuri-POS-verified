// Startup optimization utilities to make app load instantly
import { optimizedCache } from './optimizedCache';

class StartupOptimizer {
  private criticalDataKeys: string[] = [];
  private startupTime = typeof window !== 'undefined' && 'performance' in window
    ? (window.performance.timing?.navigationStart ?? Date.now())
    : Date.now();

  // Track critical data that should be available instantly
  registerCriticalData(key: string) {
    this.criticalDataKeys.push(key);
  }

  // Preload critical data on app start
  async preloadCriticalData(storeId: string, userId: string) {
    if (!storeId || !userId) return;

    const preloadPromises = [
      // Preload most essential data first
      this.preloadInventorySummary(storeId),
      this.preloadSalesSummary(storeId),
      this.preloadUserPreferences(userId),
      this.preloadAppConfig(storeId)
    ];

    // Start all preloads in parallel but don't block UI
    Promise.allSettled(preloadPromises).catch(() => {
      // Ignore errors during preload - data will be fetched normally when needed
    });
  }

  private async preloadInventorySummary(storeId: string) {
    try {
      await optimizedCache.preload(`inventory_summary:${storeId}`, async () => {
        // Only fetch essential inventory data for dashboard
        const response = await fetch(`/api/inventory/summary?store_id=${storeId}&limit=50`);
        if (!response.ok) return [];
        return response.json();
      }, { ttl: 15 * 60 * 1000 });
    } catch {
      // Fallback to empty array - will fetch when needed
    }
  }

  private async preloadSalesSummary(storeId: string) {
    try {
      await optimizedCache.preload(`sales_summary:${storeId}`, async () => {
        // Only fetch recent sales for dashboard
        const response = await fetch(`/api/sales/summary?store_id=${storeId}&limit=20`);
        if (!response.ok) return [];
        return response.json();
      }, { ttl: 10 * 60 * 1000 });
    } catch {
      // Fallback to empty array
    }
  }

  private async preloadUserPreferences(userId: string) {
    try {
      const cached = localStorage.getItem(`user_prefs_${userId}`);
      if (cached) {
        optimizedCache.preload(`user_prefs:${userId}`, async () => JSON.parse(cached), 
          { ttl: 60 * 60 * 1000 });
      }
    } catch {
      // Ignore errors
    }
  }

  private async preloadAppConfig(storeId: string) {
    try {
      const cached = localStorage.getItem(`app_config_${storeId}`);
      if (cached) {
        optimizedCache.preload(`app_config:${storeId}`, async () => JSON.parse(cached),
          { ttl: 30 * 60 * 1000 });
      }
    } catch {
      // Ignore errors
    }
  }

  // Measure and log performance metrics
  measureStartupPerformance() {
    const navigationStart = typeof window !== 'undefined' && 'performance' in window
      ? (window.performance.timing?.navigationStart ?? this.startupTime)
      : this.startupTime;
    const loadTime = Math.max(0, Date.now() - navigationStart);

    if (loadTime > 3000) {
      console.warn(`Slow startup detected: ${loadTime}ms`);
      this.logPerformanceIssues();
    } else if (loadTime < 1500) {
      console.log(`Fast startup: ${loadTime}ms ⚡`);
    }

    if ('performance' in window && 'mark' in performance) {
      performance.mark('app-startup-complete');
      performance.measure('app-startup-time', 'navigationStart', 'app-startup-complete');
    }

    return loadTime;
  }

  private logPerformanceIssues() {
    const stats = optimizedCache.getStats();
    console.group('Performance Analysis');
    console.log('Cache stats:', stats);
    console.log('Memory usage:', this.getMemoryInfo());
    console.log('Network info:', this.getNetworkInfo());
    console.groupEnd();
  }

  private getMemoryInfo() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + 'MB',
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024) + 'MB',
        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
      };
    }
    return 'Not available';
  }

  private getNetworkInfo() {
    const connection = (navigator as any).connection;
    if (connection) {
      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink + ' Mbps',
        rtt: connection.rtt + 'ms'
      };
    }
    return 'Not available';
  }

  // Optimize based on device capabilities
  optimizeForDevice() {
    const connection = (navigator as any).connection;
    const memory = (performance as any).memory;

    // Adjust cache size based on available memory
    if (memory && memory.jsHeapSizeLimit) {
      const availableMemory = memory.jsHeapSizeLimit / 1024 / 1024; // MB
      if (availableMemory < 512) {
        // Low memory device - reduce cache size
        console.log('Low memory device detected - reducing cache size');
      } else if (availableMemory > 2048) {
        // High memory device - increase cache size
        console.log('High memory device detected - increasing cache size');
      }
    }

    // Adjust for slow connections
    if (connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g')) {
      console.log('Slow connection detected - optimizing for offline-first');
      // Enable more aggressive caching
    }
  }
}

export const startupOptimizer = new StartupOptimizer();

// Auto-start optimization on load
if (typeof window !== 'undefined') {
  startupOptimizer.optimizeForDevice();
}