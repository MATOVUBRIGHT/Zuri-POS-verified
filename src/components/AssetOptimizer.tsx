import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { assetCacheService } from "@/lib/asset-cache";

// Asset optimizer for progressive loading and caching
const AssetOptimizer = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // Preload and cache critical assets
  useEffect(() => {
    const preloadAssets = async () => {
      try {
        // Preload images
        const imageUrls = [
          "/favicon.ico",
          "/placeholder.svg",
          "/business-dashboard.jpg",
          "/inventory-management.jpg",
          "/sales-tracking.jpg"
        ];

        // Preload images
        const imagePromises = imageUrls.map(url => {
          return new Promise((resolve) => {
            const img = new Image();
            img.src = url;
            img.onload = resolve;
            img.onerror = resolve;
          });
        });

        // Preload fonts
        const fontPromises = [
          document.fonts.load("16px 'Inter'"),
          document.fonts.load("16px 'Inter', bold"),
          document.fonts.load("16px 'Inter', italic")
        ];

        await Promise.all([...imagePromises, ...fontPromises]);
        setAssetsLoaded(true);

      } catch (error) {
        console.error("Asset preloading error:", error);
        setAssetsLoaded(true);
      }
    };

    preloadAssets();
  }, []);

  return <>{children}</>;
};

export default AssetOptimizer;