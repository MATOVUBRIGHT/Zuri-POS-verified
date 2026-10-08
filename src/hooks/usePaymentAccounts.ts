import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// branch_payment_accounts / payment_account_ledger are introduced by migration
// but are absent from the generated Supabase types, so they are read through the
// same `as any` cast used elsewhere in the codebase.

// Keys must match WATCHED_TABLES entries in src/lib/watchedTables.ts so that
// realtime invalidation and the polling fallback refresh these queries.
export const ACCOUNTS_KEY = "branch_payment_accounts";
export const LEDGER_KEY = "payment_account_ledger";
export const BALANCES_KEY = "payment_account_balances";

export interface BranchAccount {
  id: string;
  name: string;
  provider_type: string;
  account_number: string | null;
  is_active?: boolean;
  external_link?: string | null;
  [key: string]: unknown;
}

export function usePaymentAccounts(storeId: string | null, activeOnly = false) {
  return useQuery({
    queryKey: [ACCOUNTS_KEY, storeId, activeOnly ? "active" : "all"],
    enabled: Boolean(storeId),
    // Balances change on every sale/return, so do not sit on a stale list.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BranchAccount[]> => {
      if (!storeId) return [];
      // Full rows: the accounts page renders opening_balance,
      // reference_instructions and external_link, not just the dropdown fields.
      let query = (supabase.from("branch_payment_accounts" as any) as any)
        .select("*")
        .eq("store_id", storeId);
      if (activeOnly) query = query.eq("is_active", true);
      // Dropdowns were alphabetical; the accounts page listed newest first.
      const { data, error } = activeOnly
        ? await query.order("name", { ascending: true })
        : await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BranchAccount[];
    },
  });
}

export function usePaymentAccountBalances(storeId: string | null) {
  return useQuery({
    queryKey: [BALANCES_KEY, storeId],
    enabled: Boolean(storeId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Record<string, number>> => {
      if (!storeId) return {};
      const { data, error } = await supabase.rpc("get_payment_account_balances" as any, {
        p_store_id: storeId,
      });
      if (error) throw error;
      return Object.fromEntries(
        ((data ?? []) as any[]).map((row) => [row.account_id, Number(row.available_balance || 0)]),
      );
    },
  });
}

export function usePaymentAccountLedger(storeId: string | null, limit = 12) {
  return useQuery({
    queryKey: [LEDGER_KEY, storeId, limit],
    enabled: Boolean(storeId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<any[]> => {
      if (!storeId) return [];
      const { data, error } = await (supabase.from("payment_account_ledger" as any) as any)
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}