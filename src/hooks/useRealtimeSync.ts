// Hook that subscribes to Supabase Realtime changes and invalidates React Query cache
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WATCHED_TABLES } from "@/lib/watchedTables";

export function useRealtimeSync(storeId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!storeId) return;

    let mounted = true;

    const startPolling = () => {
      if (pollRef.current !== null) return;
      // Realtime is best-effort; polling keeps the app usable on weak networks / WS-blocked ISPs.
      pollRef.current = window.setInterval(() => {
        WATCHED_TABLES.forEach((table) => {
          queryClient.refetchQueries({ queryKey: [table, storeId] });
        });
      }, 15_000); // 15s — less aggressive than 5s, avoids hammering the API
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
        // Ignore callbacks after cleanup — prevents poll restarts on unmount
        if (!mounted) return;

        if (status === "SUBSCRIBED") {
          stopPolling();
          return;
        }

        // CLOSED is a normal teardown status (emitted on removeChannel), not an error.
        // Only fall back to polling on genuine connection failures.
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
// Uses refetchQueries instead of invalidateQueries to avoid showing loading spinners
export function useVisibilityRefresh(storeId: string | null) {
  const queryClient = useQueryClient();
  const hiddenAtRef = useRef<number | null>(null);
  const BACKGROUND_POLL_INTERVAL = 25_000;

  useEffect(() => {
    if (!storeId) return;

    let backgroundPollId: number | null = null;

    const refetchStoreTables = () => {
      WATCHED_TABLES.forEach((table) => {
        queryClient.refetchQueries({
          queryKey: [table, storeId],
          type: 'all',
        });
      });
    };

    const startBackgroundPolling = () => {
      if (backgroundPollId !== null) return;
      refetchStoreTables();
      backgroundPollId = window.setInterval(refetchStoreTables, BACKGROUND_POLL_INTERVAL);
    };

    const stopBackgroundPolling = () => {
      if (backgroundPollId !== null) {
        clearInterval(backgroundPollId);
        backgroundPollId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        startBackgroundPolling();
      } else {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        // If hidden for more than 5 seconds, silently refetch all store data
        if (hiddenAt && Date.now() - hiddenAt > 5_000) {
          WATCHED_TABLES.forEach((table) => {
            queryClient.refetchQueries({
              queryKey: [table, storeId],
              type: 'all',
            });
          });
        }
        stopBackgroundPolling();
      }
    };

    // Also refetch on network reconnect
    const handleOnline = () => {
      WATCHED_TABLES.forEach((table) => {
        queryClient.refetchQueries({
          queryKey: [table, storeId],
          type: 'all',
        });
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      stopBackgroundPolling();
    };
  }, [storeId, queryClient]);
}
