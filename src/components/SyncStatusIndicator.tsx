import { useDataSync } from "@/lib/data-sync";

export function SyncStatusIndicator() {
  const { isOffline, queueLength, isSyncing, lastError } = useDataSync();

  // Keep UI quiet when everything is healthy or when there are only queued jobs.
  // For web UX, we avoid showing "pending sync" warnings unless user is offline,
  // actively syncing, or an actual sync error happened.
  if (!isOffline && !isSyncing && !lastError) return null;

  const statusText = isOffline
    ? queueLength > 0
      ? `Saved locally (${queueLength})`
      : "Offline"
    : isSyncing
      ? `Syncing... (${queueLength})`
      : "Synced";

  const bg =
    isOffline ? "bg-yellow-600" : isSyncing ? "bg-blue-600" : "bg-green-600";

  return (
    <div className={`fixed bottom-4 right-4 ${bg} text-white px-3 py-2 rounded-lg shadow-lg text-xs z-50`}>
      <div className="font-medium">{statusText}</div>
      {lastError ? <div className="opacity-90 mt-1 max-w-[280px] truncate">{lastError}</div> : null}
    </div>
  );
}

