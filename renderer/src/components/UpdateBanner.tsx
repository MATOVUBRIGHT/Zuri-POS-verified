import React from 'react';
import { useAppUpdates } from '@/hooks/useAppUpdates';

export function UpdateBanner() {
  const { updateAvailable, downloadProgress, updateReady, installUpdate } = useAppUpdates();

  if (updateReady) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-4 bg-green-600 text-white px-4 py-2 text-sm shadow-lg">
        <span>✅ Update v{updateReady.version} is ready! Restart to apply.</span>
        <button
          onClick={installUpdate}
          className="px-3 py-1 bg-white text-green-700 rounded font-semibold hover:bg-green-50 transition"
        >
          Restart Now
        </button>
      </div>
    );
  }

  if (downloadProgress) {
    const pct = Math.round(downloadProgress.percent);
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-2 text-sm shadow-lg">
        <div className="flex items-center justify-between mb-1">
          <span>⬇ Downloading update... {pct}%</span>
        </div>
        <div className="w-full bg-blue-800 rounded-full h-1">
          <div className="bg-white h-1 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center gap-4 bg-blue-600 text-white px-4 py-2 text-sm shadow-lg">
        <span>🔄 Update v{updateAvailable.version} available — downloading in background...</span>
      </div>
    );
  }

  return null;
}
