import { QueryClient, QueryKey } from "@tanstack/react-query";
import { WATCHED_TABLES } from "./watchedTables";

const STORAGE_KEY = "zuripos-query-cache";
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

export interface PersistedQuery {
  queryKey: QueryKey;
  data: unknown;
  timestamp: number;
}

const loadCache = (): PersistedQuery[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: PersistedQuery[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const cacheEntries = loadCache();

const saveCache = (entries: PersistedQuery[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
};

export const replayCachedQueries = (queryClient: QueryClient) => {
  const now = Date.now();
  cacheEntries.forEach((entry) => {
    if (now - entry.timestamp > CACHE_TTL) return;
    queryClient.setQueryData(entry.queryKey, entry.data);
  });
};

export const persistActiveQueries = (queryClient: QueryClient) => {
  const now = Date.now();
  const entries: PersistedQuery[] = [];
  queryClient.getQueryCache().getAll().forEach((query) => {
    const key = query.queryKey;
    if (!key || key.length === 0) return;
    if (!WATCHED_TABLES.includes(key[0] as any)) return;
    const data = query.state.data;
    if (data === undefined) return;
    entries.push({
      queryKey: key,
      data,
      timestamp: now,
    });
  });
  saveCache(entries);
};
