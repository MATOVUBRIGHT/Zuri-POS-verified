// src/lib/sync-status.ts
// Helper to check and display sync queue status

import { dataSyncService } from "./data-sync";

export async function getSyncQueueStatus() {
  try {
    // Access the sync queue through window for debugging
    const queue = (window as any).__syncQueue || [];
    return {
      queueLength: queue.length,
      isSyncing: (window as any).__isSyncing || false,
      lastError: (window as any).__lastSyncError || null,
      isOnline: navigator.onLine,
    };
  } catch (error) {
    return {
      queueLength: 0,
      isSyncing: false,
      lastError: error instanceof Error ? error.message : "Unknown error",
      isOnline: navigator.onLine,
    };
  }
}

export function setupSyncDebug() {
  if (!import.meta.env.DEV) {
    return;
  }

  // Expose sync service to window for debugging in console
  (window as any).dataSyncService = dataSyncService;
  (window as any).checkSyncQueue = async () => {
    return getSyncQueueStatus();
  };
  
  console.log("📡 Sync Debug Tools Ready!");
  console.log("Check sync queue with: window.checkSyncQueue()");
  console.log("Manual sync with: window.dataSyncService.attemptSync()");
}
