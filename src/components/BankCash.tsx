import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Building2,
  FileText,
  Landmark,
  Loader2,
Receipt,
  Search,
  CalendarDays,
  RefreshCw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import BankCashForm, { type BranchAccount } from "@/components/BankCashForm";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";

type Deposit = {
  id: string;
  account_name: string | null;
  bank_name: string;
  account_number: string | null;
  amount: number;
  notes: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
};

interface BankCashProps {
  currentStoreId?: string | null;
  availableCash?: number;
  /** Optimistic cash-on-hand delta supplied by the page that owns the ledger. */
  onCashDelta?: (delta: number) => void;
}

const BankCash = ({
  currentStoreId,
  availableCash,
  onCashDelta,
}: BankCashProps) => {
  const { toast } = useToast();
  const storeId = currentStoreId ?? null;

    const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [bankedBy, setBankedBy] = useState<Record<string, string>>({});
  const [signedReceipts, setSignedReceipts] = useState<Record<string, string>>({});
  const [historySearch, setHistorySearch] = useState("");
  const [historyDate, setHistoryDate] = useState("");

  // Query-backed so Supabase Realtime (and the polling fallback) refreshes the
  // account list as soon as accounts are added, renamed, deactivated or removed.
const accountsQuery = usePaymentAccounts(storeId ?? null, true);
  const accounts = (accountsQuery.data ?? []) as unknown as BranchAccount[];

  // React Query returns a fresh result object on every render. Depending on it
  // re-created `loadAccounts` each render, which re-ran the effect below and
  // refetched in a loop, so the banking history reloaded endlessly and flickered
  // between the spinner and the list. Hold the refetch fn in a ref instead so
  // the callback identity stays stable.
  const refetchAccountsRef = useRef(accountsQuery.refetch);
  refetchAccountsRef.current = accountsQuery.refetch;

  const loadAccounts = useCallback(async () => {
    await refetchAccountsRef.current();
  }, []);

  const loadDeposits = useCallback(async () => {
    if (!storeId) {
      setDeposits([]);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from("cash_banking_deposits")
.select(
        "id, account_name, bank_name, account_number, amount, notes, receipt_url, created_by, created_at",
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(50);

if (error) {
      toast({
        title: "Could not load banking history",
        description: error.message,
        variant: "destructive",
      });
      // Surface it in the panel too: otherwise a failed load reads as
      // "Nothing banked yet." and hides real history from the user.
      setHistoryError(error.message);
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as Deposit[];
    setHistoryError(null);
setDeposits(rows);
    setIsLoading(false);

    // Deposits only store the auth uid, so resolve display names from profiles
    // for just the ids present in this window rather than the whole staff list.
    const actorIds = [
      ...new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id))),
    ];
    if (actorIds.length === 0) {
      setBankedBy({});
    } else {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", actorIds);
      const names: Record<string, string> = {};
      for (const p of (profiles ?? []) as Array<{ user_id: string; full_name: string | null }>) {
        if (p.full_name) names[p.user_id] = p.full_name;
      }
      setBankedBy(names);
    }

    // The receipts bucket is private, so each slip needs a short-lived signed
    // URL rather than a public one.
    const withReceipt = rows.filter((row) => Boolean(row.receipt_url));
    if (withReceipt.length > 0) {
      const entries = await Promise.all(
        withReceipt.map(async (row) => {
          const { data: signed } = await supabase.storage
            .from("receipts")
            .createSignedUrl(row.receipt_url as string, 60 * 30);
          return [row.id, signed?.signedUrl ?? null] as const;
        }),
      );
      const map: Record<string, string> = {};
      entries.forEach(([id, url]) => {
        if (url) map[id] = url;
      });
      setSignedReceipts(map);
    } else {
      setSignedReceipts({});
    }
  }, [storeId, toast]);

useEffect(() => {
    // Accounts are fetched by usePaymentAccounts on mount, so refetching them
    // here would double-request them. Only the deposit history needs an
    // explicit load.
    void loadDeposits();
  }, [loadDeposits]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadAccounts(), loadDeposits()]);
    setIsRefreshing(false);
  };

  const handleBanked = (amount: number) => {
    // The deposit leaves the till, so the caller's cash balance drops.
    onCashDelta?.(-amount);
    void loadDeposits();
    void loadAccounts();
  };

  const totalBanked = deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const filteredDeposits = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return deposits.filter((deposit) => {
      const matchesQuery = !query || [deposit.bank_name, deposit.account_name, deposit.account_number, deposit.notes, String(deposit.amount)].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesDate = !historyDate || deposit.created_at.slice(0, 10) === historyDate;
      return matchesQuery && matchesDate;
    });
  }, [deposits, historySearch, historyDate]);

  const formatStamp = (value: string) =>
    new Date(value).toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!storeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a branch to bank cash for.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Landmark className="h-7 w-7 text-primary" />
            Banking
          </h2>
          <p className="text-sm text-muted-foreground">
            Move cash on hand into a bank or mobile-money account.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="min-h-0 overflow-y-auto">
          <CardHeader>
            <CardTitle className="text-base">New deposit</CardTitle>
            <CardDescription>
              Cash on hand: {fmtCurrency(Number(availableCash) || 0)}{" "}
              {getCurrencySymbol()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BankCashForm
              storeId={storeId}
              availableCash={Number(availableCash) || 0}
              onBanked={handleBanked}
              onReloadAccounts={loadAccounts}
              accounts={accounts}
            />
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Recent banking
              </span>
              <Badge variant="secondary" className="gap-1.5">
                <Banknote className="h-3 w-3" />
                {fmtCurrency(totalBanked)} total
              </Badge>
            </CardTitle>
            <CardDescription>Search by bank, account, notes, amount, or date.</CardDescription>
            <div className="grid gap-2 pt-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search banking history" className="pl-9" />
              </div>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} className="pl-9" aria-label="Filter banking history by date" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading deposits…
              </div>
            ) : historyError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p className="font-semibold text-destructive">
                  Banking history unavailable
                </p>
                <p className="mt-1 break-words text-muted-foreground">
                  {historyError}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </Button>
              </div>
            ) : filteredDeposits.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                {deposits.length ? "No banking records match your filters." : "Nothing banked yet."}
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredDeposits.map((deposit) => {
                  const receiptHref = signedReceipts[deposit.id];
                  return (
                    <li
                      key={deposit.id}
                      className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{deposit.bank_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {deposit.account_number
                              ? `Acct ${deposit.account_number}`
                              : deposit.account_name || "Account not given"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-primary">
                          {fmtCurrency(Number(deposit.amount) || 0)}
                        </span>
                      </div>

<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatStamp(deposit.created_at)}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {deposit.created_by
                              ? bankedBy[deposit.created_by] || "Unknown user"
                              : "Unknown user"}
                          </span>
{receiptHref ? (
                            <a
                              href={receiptHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <FileText className="h-3 w-3" />
                              View receipt
                            </a>
                          ) : deposit.receipt_url ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <FileText className="h-3 w-3" />
                              Receipt unavailable
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {deposit.notes && (
                        <p className="mt-2 rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                          {deposit.notes}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BankCash;
