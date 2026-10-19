const HOUR_MS = 60 * 60 * 1000;
const MANUAL_LIMIT = 3;

const readTimes = (key: string): number[] => {
  try {
    const values = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(values) ? values.filter((value): value is number => typeof value === "number" && Date.now() - value < HOUR_MS) : [];
  } catch { return []; }
};

export const automaticSyncIntervalMs = 30 * 60 * 1000;

export const consumeManualSync = (storeId: string): { allowed: boolean; remaining: number; retryAfterMs?: number } => {
  const key = `zuri_manual_sync:${storeId}`;
  const now = Date.now();
  const times = readTimes(key);
  if (times.length >= MANUAL_LIMIT) return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, HOUR_MS - (now - times[0])) };
  const next = [...times, now];
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* best effort */ }
  return { allowed: true, remaining: MANUAL_LIMIT - next.length };
};

export const shouldRunAutomaticSync = (storeId: string): boolean => {
  const key = `zuri_auto_sync:${storeId}`;
  let last = 0;
  try { last = Number(localStorage.getItem(key) || 0); } catch { /* continue */ }
  if (last && Date.now() - last < automaticSyncIntervalMs) return false;
  try { localStorage.setItem(key, String(Date.now())); } catch { /* continue */ }
  return true;
};
