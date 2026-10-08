// Hook that subscribes to Supabase Realtime changes and invalidates React Query cache
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BALANCES_KEY } from "@/hooks/usePaymentAccounts";
import { POLLED_TABLES, WATCHED_TABLES } from "@/lib/watchedTables";

// Realtime is the primary path. When the socket is unavailable we fall back to
// polling, but only for high-churn tables, only while the tab is visible, and on
// a slower interval: this runs per logged-in user and free-tier request quota is
// finite, so an unconditional 5s poll over every watched table is expensive.
const POLL_INTERVAL_MS = 15_000;
const BACKGROUND_POLL_INTERVAL = 60_000;

export function useRealtimeSync(storeId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<number | null>(null);
  const channelStatusRef = useRef<string>("");

  useEffect(() => {
    if (!storeId) return;

    const startPolling = () => {
      if (pollRef.current !== null) return;
      if (typeof document !== "undefined" && document.hidden) return;
      pollRef.current = window.setInterval(() => {
        if (document.hidden) return;
        POLLED_TABLES.forEach((table) => {
          queryClient.refetchQueries({ queryKey: [table, storeId] });
        });
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollRef.current === null) return;
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    };

    // A hidden tab polling every few seconds is pure waste; start/stop with
    // visibility so an idle window costs nothing.
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else if (channelStatusRef.current !== "SUBSCRIBED") {
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

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

          // `payment_account_balances` is an RPC, not a table, so it is not in
          // WATCHED_TABLES and cannot invalidate itself. Balances are derived from
          // the ledger, so a ledger change must refresh them too. Without this the
          // balance cards stayed stale until a focus/staleTime refresh, which made
          // account balances look non-live.
          if (table === "payment_account_ledger") {
            queryClient.invalidateQueries({ queryKey: [BALANCES_KEY, storeId] });
          }
        }
      );
    });

    try {
      channel.subscribe((status) => {
        channelStatusRef.current = status;
        if (status === "SUBSCRIBED") {
          stopPolling();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
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
      // Must pair with the listener added above. Leaving it bound leaks a closure
      // per storeId change that holds the old startPolling/stopPolling, and a stale
      // hidden-tab listener could stop or start polling for the *current* store.
      document.removeEventListener("visibilitychange", handleVisibility);
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
  const BACKGROUND_POLL_INTERVAL = 60_000;

  useEffect(() => {
    if (!storeId) return;

    let backgroundPollId: number | null = null;

    const refetchStoreTables = () => {
      // Only the tables that actually move while the user works. Refreshing all
      // watched tables on every tab switch re-read whole tables that realtime
      // already keeps current, which is expensive on the free tier.
      POLLED_TABLES.forEach((table) => {
        queryClient.refetchQueries({
          queryKey: [table, storeId],
        });
      });
    };

    const startBackgroundPolling = () => {
      if (backgroundPollId !== null) return;
      // No immediate refetch when hiding: the user is leaving the window, and
      // realtime keeps the cache current anyway. Just arm the slow interval.
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
          refetchStoreTables();
        }
        stopBackgroundPolling();
      }
    };

    // Also refetch on network reconnect
    const handleOnline = () => {
      refetchStoreTables();
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
