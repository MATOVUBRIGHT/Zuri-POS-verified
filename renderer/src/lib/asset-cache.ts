import { useEffect, useState } from "react";

// Asset caching service
export class AssetCacheService {
  private cache: Map<string, string> = new Map();
  private cacheVersion = "v1";

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Load cached assets from localStorage
    try {
      const cachedData = localStorage.getItem(`assetCache_${this.cacheVersion}`);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        this.cache = new Map(parsed);
      }
    } catch (error) {
      console.error("Failed to load asset cache:", error);
    }
  }

  // Cache an asset
  public cacheAsset(key: string, data: string) {
    this.cache.set(key, data);
    this.saveCache();
  }

  // Get cached asset
  public getCachedAsset(key: string): string | undefined {
    return this.cache.get(key);
  }

  // Clear cache
  public clearCache() {
    this.cache.clear();
    localStorage.removeItem(`assetCache_${this.cacheVersion}`);
  }

  // Save cache to localStorage
  private saveCache() {
    try {
      const cacheData = JSON.stringify(Array.from(this.cache.entries()));
      localStorage.setItem(`assetCache_${this.cacheVersion}`, cacheData);
    } catch (error) {
      console.error("Failed to save asset cache:", error);
    }
  }

  // Pre-cache assets
  public async preCacheAssets(assetUrls: string[]) {
    try {
      const responses = await Promise.all(
        assetUrls.map(url =>
          fetch(url)
            .then(res => res.text())
            .then(data => ({ url, data }))
            .catch(() => ({ url, data: null }))
        )
      );

      responses.forEach(({ url, data }) => {
        if (data) {
          this.cacheAsset(url, data);
        }
      });

    } catch (error) {
      console.error("Asset pre-caching error:", error);
    }
  }
}

// Singleton instance
export const assetCacheService = new AssetCacheService();

// Use asset caching hook
export const useAssetCache = () => {
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    // Initialize cache
    const initCache = async () => {
      try {
        // Pre-cache critical assets
        await assetCacheService.preCacheAssets([
          "/manifest.json",
          "/favicon.ico"
        ]);
        setCacheReady(true);
      } catch (error) {
        console.error("Cache initialization error:", error);
        setCacheReady(true);
      }
    };

    initCache();
  }, []);

  return { cacheReady, assetCacheService };
};