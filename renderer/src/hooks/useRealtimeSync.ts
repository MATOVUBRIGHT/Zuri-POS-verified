// Hook that subscribes to Supabase Realtime changes and invalidates React Query cache
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const WATCHED_TABLES = [
  "inventory",
  "sales",
  "expenses",
  "cash_transactions",
  "customers",
  "suppliers",
  "staff",
  "shifts",
] as const;

export function useRealtimeSync(storeId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!storeId) return;

    let mounted = true;

    const startPolling = () => {
      if (pollRef.current !== null) return;
      pollRef.current = window.setInterval(() => {
        WATCHED_TABLES.forEach((table) => {
          queryClient.refetchQueries({ queryKey: [table, storeId] });
        });
      }, 15_000);
    };

    const stopPolling = () => {
      if (pollRef.current === null) return;
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    };

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`store-sync-${storeId}`);

    WATCHED_TABLES.forEach((table) => {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          // Invalidate the query for this table so it refetches
          queryClient.invalidateQueries({ queryKey: [table, storeId] });
          // Also invalidate generic keys used by some components
          queryClient.invalidateQueries({ queryKey: [table] });
        }
      );
    });

    try {
      channel.subscribe((status) => {
        if (!mounted) return;
        if (status === "SUBSCRIBED") {
          stopPolling();
          return;
        }
        // CLOSED is normal teardown — only poll on genuine errors
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[realtime] Disabled; falling back to polling.", { storeId, status });
          startPolling();
        }
      });
    } catch (e) {
      console.warn("[realtime] Subscribe threw; falling back to polling.", e);
      startPolling();
    }
    channelRef.current = channel;

    return () => {
      mounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      stopPolling();
    };
  }, [storeId, queryClient]);
}

// Hook to silently refetch data when returning from minimized/hidden state
export function useVisibilityRefresh(storeId: string | null) {
  const queryClient = useQueryClient();
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!storeId) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        // If hidden for more than 5 seconds, silently refetch all store data
        if (hiddenAt && Date.now() - hiddenAt > 5_000) {
          WATCHED_TABLES.forEach((table) => {
            queryClient.refetchQueries({ queryKey: [table, storeId], type: 'active' });
          });
        }
      }
    };

    const handleOnline = () => {
      WATCHED_TABLES.forEach((table) => {
        queryClient.refetchQueries({ queryKey: [table, storeId], type: 'active' });
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [storeId, queryClient]);
}
