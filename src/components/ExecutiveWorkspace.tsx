import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Building2,
  CreditCard,
  ChevronRight,
  CircleAlert,
  FileText,
  HandCoins,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Store,
  Trash2,
  TrendingDown,
  Settings as SettingsIcon,
  Settings2,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LoadingMark } from "@/components/ui/loading-spinner";
import { supabase } from "@/integrations/supabase/client";
import { WalkInPortfolioSummary } from "@/components/WalkInTracker";
import BranchManageDialog from "@/components/BranchManageDialog";
import { convertAndRound, fmtCurrencyFor } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import ExecutiveTeamAccess from "@/components/ExecutiveTeamAccess";
import Settings from "@/components/Settings";
import { useSubscription } from "@/providers/SubscriptionProvider";

type ExecutivePage =
  | "boss-dashboard"
  | "executive-branches"
  | "executive-finance"
  | "executive-accounts"
  | "executive-team"
  | "executive-reports"
  | "executive-settings";
type Branch = {
  id: string;
  store_name: string;
  user_id: string;
  created_at: string;
  sales: number;
  expenses: number;
  cash: number;
  electronic: number;
  transactions: number;
  todaySales: number;
  todayExpenses: number;
  todayTransactions: number;
  latestSaleAt: string | null;
  currency: string;
};

type CurrencyTotals = Record<string, {
  sales: number;
  expenses: number;
  cash: number;
  electronic: number;
  todaySales: number;
  transactions: number;
  todayTransactions: number;
}>;

const branchPalette = [
  { card: "border-slate-200 bg-white", rail: "bg-sky-500", icon: "bg-sky-100 text-sky-700", status: "bg-sky-100 text-sky-700", manage: "bg-sky-600 hover:bg-sky-700", delete: "border-sky-300 text-sky-700 hover:bg-sky-100" },
  { card: "border-slate-200 bg-white", rail: "bg-violet-500", icon: "bg-violet-100 text-violet-700", status: "bg-violet-100 text-violet-700", manage: "bg-violet-600 hover:bg-violet-700", delete: "border-violet-300 text-violet-700 hover:bg-violet-100" },
  { card: "border-slate-200 bg-white", rail: "bg-emerald-500", icon: "bg-emerald-100 text-emerald-700", status: "bg-emerald-100 text-emerald-700", manage: "bg-emerald-600 hover:bg-emerald-700", delete: "border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
  { card: "border-slate-200 bg-white", rail: "bg-amber-500", icon: "bg-amber-100 text-amber-700", status: "bg-amber-100 text-amber-700", manage: "bg-amber-600 hover:bg-amber-700", delete: "border-amber-300 text-amber-700 hover:bg-amber-100" },
  { card: "border-slate-200 bg-white", rail: "bg-rose-500", icon: "bg-rose-100 text-rose-700", status: "bg-rose-100 text-rose-700", manage: "bg-rose-600 hover:bg-rose-700", delete: "border-rose-300 text-rose-700 hover:bg-rose-100" },
] as const;

const getLegacyBranchCurrency = (storeId: string) => {
  try {
    return localStorage.getItem(`app_currency_${storeId}`) || "UGX";
  } catch {
    return "UGX";
  }
};

const formatBranchCurrency = (amount: number, currency: string) =>
  fmtCurrencyFor(amount, currency);

const groupCurrencyTotals = (branches: Branch[]): CurrencyTotals =>
  branches.reduce<CurrencyTotals>((groups, branch) => {
    const currency = (branch.currency || "UGX").toUpperCase();
    const current = groups[currency] || {
      sales: 0, expenses: 0, cash: 0, electronic: 0, todaySales: 0,
      transactions: 0, todayTransactions: 0,
    };
    current.sales += branch.sales;
    current.expenses += branch.expenses;
    current.cash += branch.cash;
    current.electronic += branch.electronic;
    current.todaySales += branch.todaySales;
    current.transactions += branch.transactions;
    current.todayTransactions += branch.todayTransactions;
    groups[currency] = current;
    return groups;
  }, {});

const VIEW_CURRENCY_CODES = [
  "UGX",
  "KES",
  "TZS",
  "RWF",
  "ETB",
  "NGN",
  "GHS",
  "ZAR",
  "USD",
  "EUR",
  "GBP",
] as const;

const NATIVE_CURRENCY_OPTION = "__native__";

const MOTIVATION_LINES = [
  "Consistency compounds. Every branch, every day.",
  "Small wins stacked daily become real growth.",
  "Clarity today drives better margins tomorrow.",
  "Great decisions start with clear numbers.",
  "Momentum is built one strong day at a time.",
  "Your branches are the heartbeat of the business.",
  "Lead with the numbers, act with confidence.",
  "Every sale recorded is a promise kept.",
];

const fetchUsdRates = async (): Promise<Record<string, number>> => {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error("Could not reach the exchange rate service.");
  const data = await res.json();
  if (data.result !== "success") throw new Error("Could not read exchange rates.");
  return data.rates as Record<string, number>;
};

const summaryValue = (groups: CurrencyTotals, key: keyof Omit<CurrencyTotals[string], "transactions" | "todayTransactions">) =>
  Object.entries(groups).map(([currency, values]) => formatBranchCurrency(values[key] as number, currency));

export default function ExecutiveWorkspace({
  page,
  userId,
  onOpenBranch,
  canCreateBranch = true,
}: {
  page: ExecutivePage;
  userId: string | null;
  onOpenBranch: (branchId: string) => void;
  // An accountant can review branches but must not be able to create one.
  canCreateBranch?: boolean;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { subscription, isTrialActive } = useSubscription();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [subscriptionPromptOpen, setSubscriptionPromptOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [managedBranch, setManagedBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  // View-only currency preview. Rates and the chosen code live in component
  // state only and are never written to a store, so nothing is persisted.
  const [viewCurrency, setViewCurrency] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [displayName, setDisplayName] = useState(() => {
    if (!userId) return "";
    try {
      return localStorage.getItem(`zuripos_profile_name:${userId}`) || "";
    } catch {
      return "";
    }
  });
  const hasPaidBranchPlan = subscription?.status === "active" && !isTrialActive;
  const requiresPaidBranchPlan = branches.length > 0 && !hasPaidBranchPlan;

  useEffect(() => {
    if (!userId) {
      setDisplayName("");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data, error: nameError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .maybeSingle();
        if (!active) return;
        if (nameError) throw nameError;
        const savedName = String(data?.full_name || "").trim();
        if (savedName) {
          setDisplayName(savedName);
          try { localStorage.setItem(`zuripos_profile_name:${userId}`, savedName); } catch {}
        }
      } catch {
        // Keep the persisted name during transient network/session failures.
        // A failed refresh must not make the executive appear unnamed.
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const greeting = useMemo(() => {
    const firstName = displayName.trim().split(/\s+/)[0] || "";
    return firstName ? `Hello, ${firstName}` : "Hello";
  }, [displayName]);

  // Pinned to the calendar day so the line stays put instead of reshuffling
  // on every re-render.
  const motivation = useMemo(() => {
    const dayIndex = Math.floor(Date.now() / 86400000);
    return MOTIVATION_LINES[dayIndex % MOTIVATION_LINES.length];
  }, []);

  const subtitle =
    page === "boss-dashboard"
      ? motivation
      : page === "executive-team"
        ? "Create direct POS logins and scope each staff member to one branch."
        : period === "today"
          ? "Portfolio performance for today."
          : `Portfolio performance for the last ${period} days.`;

  const setCurrencyView = useCallback(
    async (target: string | null) => {
      if (!target) {
        setViewCurrency(null);
        setRates(null);
        return;
      }
      setRateLoading(true);
      try {
        setRates(await fetchUsdRates());
        setViewCurrency(target);
      } catch (cause: any) {
        setViewCurrency(null);
        setRates(null);
        toast({
          title: "Could not load exchange rates",
          description: cause?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setRateLoading(false);
      }
    },
    [toast],
  );

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [owned, linked] = await Promise.all([
        (supabase.from("stores") as any)
          .select("id, store_name, user_id, created_at, currency")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("store_access")
          .select("store_id")
          .eq("user_id", userId)
          .eq("role", "boss"),
      ]);
      if (owned.error || linked.error) throw owned.error || linked.error;
      const linkedIds = (linked.data || []).map((row: any) => row.store_id);
      const linkedStores = linkedIds.length
        ? await (supabase.from("stores") as any)
            .select("id, store_name, user_id, created_at, currency")
            .in("id", linkedIds)
        : { data: [], error: null };
      if (linkedStores.error) throw linkedStores.error;
      const source = [
        ...(owned.data || []),
        ...(linkedStores.data || []),
      ].filter(
        (store, index, rows) =>
          rows.findIndex((row) => row.id === store.id) === index,
      );
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const since = new Date(todayStart);
      if (period !== "today") since.setDate(since.getDate() - (Number(period) - 1));
      const storeIds = source.map((store) => store.id);
      const sinceIso = since.toISOString();
      const sinceDate = sinceIso.slice(0, 10);
      const [sales, expenses] = storeIds.length
        ? await Promise.all([
            supabase
              .from("sales")
              .select("store_id, total_amount, paid_in_cash, created_at, date_of_sale")
              .in("store_id", storeIds)
              .or(`created_at.gte.${sinceIso},date_of_sale.gte.${sinceDate}`),
            supabase
              .from("expenses")
              .select("store_id, amount, created_at, date_of_expense")
              .in("store_id", storeIds)
              .or(`created_at.gte.${sinceIso},date_of_expense.gte.${sinceDate}`),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];
      if (sales.error || expenses.error) throw sales.error || expenses.error;

      const businessDate = (row: any, businessKey: string) =>
        row[businessKey] || row.created_at || null;
      const inPeriod = (value: string | null) => {
        if (!value) return false;
        const date = new Date(value);
        return Number.isFinite(date.getTime()) && date >= since;
      };
      const salesByStore = new Map<string, any[]>();
      const expensesByStore = new Map<string, any[]>();
      (sales.data || []).forEach((row: any) => {
        if (!inPeriod(businessDate(row, "date_of_sale"))) return;
        const rows = salesByStore.get(row.store_id) || [];
        rows.push(row);
        salesByStore.set(row.store_id, rows);
      });
      (expenses.data || []).forEach((row: any) => {
        if (!inPeriod(businessDate(row, "date_of_expense"))) return;
        const rows = expensesByStore.get(row.store_id) || [];
        rows.push(row);
        expensesByStore.set(row.store_id, rows);
      });

      const summaries = source.map((store) => {
        const salesRows = salesByStore.get(store.id) || [];
        const expenseRows = expensesByStore.get(store.id) || [];
        const todayRows = salesRows.filter((row: any) => {
          const value = businessDate(row, "date_of_sale");
          const date = value ? new Date(value) : null;
          return date && Number.isFinite(date.getTime()) && date >= todayStart;
        });
        const latestSaleAt = salesRows.reduce<string | null>((latest, row: any) => {
          const value = businessDate(row, "date_of_sale");
          return value && (!latest || new Date(value) > new Date(latest)) ? value : latest;
        }, null);
        return {
          ...store,
          currency: store.currency || getLegacyBranchCurrency(store.id),
          sales: salesRows.reduce((sum, row: any) => sum + Number(row.total_amount || 0), 0),
          expenses: expenseRows.reduce((sum, row: any) => sum + Number(row.amount || 0), 0),
          cash: salesRows
            .filter((row: any) => row.paid_in_cash)
            .reduce((sum, row: any) => sum + Number(row.total_amount || 0), 0),
          electronic: salesRows
            .filter((row: any) => !row.paid_in_cash)
            .reduce((sum, row: any) => sum + Number(row.total_amount || 0), 0),
          transactions: salesRows.length,
          todaySales: todayRows.reduce((sum, row: any) => sum + Number(row.total_amount || 0), 0),
          todayExpenses: expenseRows
            .filter((row: any) => {
              const value = businessDate(row, "date_of_expense");
              return value && new Date(value) >= todayStart;
            })
            .reduce((sum, row: any) => sum + Number(row.amount || 0), 0),
          todayTransactions: todayRows.length,
          latestSaleAt,
        };
      });
      setBranches(summaries);
    } catch (cause: any) {
      setError(cause?.message || "We could not load your executive data.");
    } finally {
      setLoading(false);
    }
  }, [period, userId]);

  useEffect(() => {
    void load();
  }, [load]);
  const totals = useMemo(
    () =>
      branches.reduce(
        (acc, branch) => ({
          sales: acc.sales + branch.sales,
          expenses: acc.expenses + branch.expenses,
          cash: acc.cash + branch.cash,
          electronic: acc.electronic + branch.electronic,
          transactions: acc.transactions + branch.transactions,
        }),
        { sales: 0, expenses: 0, cash: 0, electronic: 0, transactions: 0 },
      ),
    [branches],
  );
  // Never rank raw monetary values across currencies. A stable name order is
  // safe for mixed-currency portfolios and keeps tables predictable.
  const ranked = useMemo(
    () => [...branches].sort((a, b) => a.store_name.localeCompare(b.store_name)),
    [branches],
  );
  const todayTotals = useMemo(
    () =>
      branches.reduce(
        (acc, branch) => ({
          sales: acc.sales + branch.todaySales,
          transactions: acc.transactions + branch.todayTransactions,
        }),
        { sales: 0, transactions: 0 },
      ),
    [branches],
  );
  const currencyTotals = useMemo(() => groupCurrencyTotals(branches), [branches]);
  const todayCurrencyTotals = useMemo(
    () => Object.fromEntries(Object.entries(currencyTotals).map(([currency, values]) => [currency, {
      sales: values.todaySales,
      transactions: values.todayTransactions,
    }])),
    [currencyTotals],
  );
  // Preview conversion only: converts a copy for display and never mutates the
  // loaded branch records, so the underlying data and stored currencies are
  // left untouched.
  const convertValue = useCallback(
    (amount: number, from: string) => {
      if (!viewCurrency || !rates) return amount;
      const fromRate = rates[(from || "UGX").toUpperCase()];
      const toRate = rates[viewCurrency];
      if (!fromRate || !toRate) return amount;
      return convertAndRound(amount, toRate / fromRate, viewCurrency);
    },
    [rates, viewCurrency],
  );
  const displayBranches = useMemo(
    () =>
      viewCurrency && rates
        ? ranked.map((branch) => ({
            ...branch,
            currency: viewCurrency,
            sales: convertValue(branch.sales, branch.currency),
            expenses: convertValue(branch.expenses, branch.currency),
            cash: convertValue(branch.cash, branch.currency),
            electronic: convertValue(branch.electronic, branch.currency),
            todaySales: convertValue(branch.todaySales, branch.currency),
            todayExpenses: convertValue(branch.todayExpenses, branch.currency),
          }))
        : ranked,
    [convertValue, ranked, rates, viewCurrency],
  );
  const displayCurrencyTotals = useMemo(
    () => groupCurrencyTotals(displayBranches),
    [displayBranches],
  );
  const displayTodayCurrencyTotals = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(displayCurrencyTotals).map(([currency, values]) => [
          currency,
          { sales: values.todaySales, transactions: values.todayTransactions },
        ]),
      ),
    [displayCurrencyTotals],
  );
  const openCreate = () => {
    if (!canCreateBranch) return;
    if (requiresPaidBranchPlan) {
      setSubscriptionPromptOpen(true);
      return;
    }
    setCreateOpen(true);
  };
  const createBranch = async () => {
    // Guard the write itself, not just the buttons: hiding a control is not an
    // authorization check.
    if (!canCreateBranch) return;
    if (requiresPaidBranchPlan) {
      setCreateOpen(false);
      setSubscriptionPromptOpen(true);
      return;
    }
    if (!branchName.trim() || !userId) return;
    setCreating(true);
    const { data, error: createError } = await supabase
      .from("stores")
      .insert({ store_name: branchName.trim(), user_id: userId })
      .select("id")
      .single();
    setCreating(false);
    if (createError) {
      toast({
        title: "Could not create branch",
        description: createError.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Branch created",
      description: `${branchName.trim()} is ready for setup.`,
    });
    setBranchName("");
    setCreateOpen(false);
    await load();
    if (data?.id) onOpenBranch(data.id);
  };
  const requestDeleteBranch = (branch: Branch) => {
    if (branch.user_id !== userId) {
      toast({ title: "Branch owner required", description: "Only the business owner can delete this branch.", variant: "destructive" });
      return;
    }
    if (branches.length <= 1) {
      toast({ title: "Cannot delete the only branch", description: "Keep at least one branch in the business.", variant: "destructive" });
      return;
    }
    setDeleteTarget(branch);
    setDeletePassword("");
    setDeletePasswordError("");
  };
  const deleteBranch = async () => {
    if (!deleteTarget || !deletePassword.trim() || !userId) {
      setDeletePasswordError("Enter your executive account password to continue.");
      return;
    }
    setDeleting(true);
    setDeletePasswordError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setDeletePasswordError("This account cannot be re-authenticated with a password.");
      setDeleting(false);
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: deletePassword });
    if (authError) {
      setDeletePasswordError("Incorrect account password.");
      setDeleting(false);
      return;
    }
    const { error: deleteError } = await supabase.from("stores").delete().eq("id", deleteTarget.id).eq("user_id", userId);
    if (deleteError) {
      toast({ title: "Could not delete branch", description: deleteError.message, variant: "destructive" });
      setDeleting(false);
      return;
    }
    const deletedName = deleteTarget.store_name;
    setDeleteTarget(null);
    setDeletePassword("");
    setManagedBranch((current) => current?.id === deleteTarget.id ? null : current);
    toast({ title: "Branch deleted", description: `${deletedName} and its branch data were deleted.`, variant: "success" });
    setDeleting(false);
    await load();
  };
  const content = error ? (
    <State
      icon={<CircleAlert />}
      title="Executive data is unavailable"
      detail={error}
      action={
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      }
    />
  ) : loading ? (
    <State
      icon={<LoadingMark size="sm" />}
      title="Preparing your portfolio"
      detail="Gathering the latest branch signals."
    />
  ) : page === "executive-branches" ? (
    <Branches
      branches={displayBranches}
      onCreate={canCreateBranch ? openCreate : undefined}
      onManage={setManagedBranch}
              onDelete={canCreateBranch ? requestDeleteBranch : undefined}
              canDelete={(branch) => branch.user_id === userId}
    />
  ) : page === "executive-team" ? (
    <ExecutiveTeamAccess userId={userId} />
  ) : page === "executive-finance" ? (
    <Finance
      totals={totals}
      currencyTotals={displayCurrencyTotals}
      branches={displayBranches}
      onManage={setManagedBranch}
    />
  ) : page === "executive-reports" ? (
    <Reports
      branches={displayBranches}
      totals={totals}
      currencyTotals={displayCurrencyTotals}
      onManage={setManagedBranch}
    />
  ) : page === "executive-settings" ? (
    <Settings
      stockData={[]}
      salesData={[]}
      expensesData={[]}
      currentStoreId={null}
      onDataImport={() => {}}
      executive
    />
  ) : (
    <Overview
      totals={totals}
      todayTotals={todayTotals}
      currencyTotals={displayCurrencyTotals}
      todayCurrencyTotals={displayTodayCurrencyTotals}
      branches={displayBranches}
      onCreate={canCreateBranch ? openCreate : undefined}
      onManage={setManagedBranch}
    />
  );
  const pageMeta: Record<
    string,
    { title: string; icon: React.ReactNode }
  > = {
    "boss-dashboard": { title: greeting, icon: <BarChart3 className="h-8 w-8 text-primary" /> },
    "executive-branches": { title: "Branches", icon: <Store className="h-8 w-8 text-primary" /> },
    "executive-team": { title: "Team & Access", icon: <Users className="h-8 w-8 text-primary" /> },
    "executive-finance": { title: "Finance", icon: <HandCoins className="h-8 w-8 text-primary" /> },
    "executive-reports": { title: "Reports", icon: <FileText className="h-8 w-8 text-primary" /> },
    "executive-settings": { title: "Settings", icon: <SettingsIcon className="h-8 w-8 text-primary" /> },
  };
  const activeMeta = pageMeta[page] || pageMeta["boss-dashboard"];

  return (
    <section className="mx-auto max-w-7xl space-y-7">
      {page !== "executive-settings" && (
      <div className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-950">
            {activeMeta.icon}
            {activeMeta.title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {page !== "executive-team" && (
            <Select
              value={viewCurrency ?? NATIVE_CURRENCY_OPTION}
              onValueChange={(value) =>
                void setCurrencyView(
                  value === NATIVE_CURRENCY_OPTION ? null : value,
                )
              }
            >
              <SelectTrigger
                aria-label="Preview all amounts in another currency"
                className="w-[168px] bg-white"
              >
                <span className="flex items-center">
                  <ArrowLeftRight className="mr-2 h-4 w-4 shrink-0 text-slate-500" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NATIVE_CURRENCY_OPTION}>
                  Native currency
                </SelectItem>
                {VIEW_CURRENCY_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    View all in {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {rateLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {page !== "executive-team" && <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger
              aria-label="Reporting period"
              className="w-[138px] bg-white"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>}
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh executive data"
            onClick={() => void load()}
          >
            <RefreshCw
              className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
          </Button>
          {/* Settings available in the executive sidebar - removed header shortcut */}
          {canCreateBranch && page !== "executive-reports" && page !== "executive-team" && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create branch
            </Button>
          )}
        </div>
      </div>
      )}
      {viewCurrency && page !== "executive-settings" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm text-sky-900">
            Previewing every amount converted to{" "}
            <span className="font-semibold">{viewCurrency}</span> at today&apos;s
            market rate. This is view only — nothing has been saved and your
            branch currencies are unchanged.
          </p>
          <Button size="sm" variant="outline" onClick={() => void setCurrencyView(null)}>
            <X className="mr-2 h-4 w-4" />
            Exit preview
          </Button>
        </div>
      )}
      {content}
      {/* Settings rendered inline via page route when `page === 'executive-settings'` */}
      <Dialog open={canCreateBranch && createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md border-slate-200">
          <DialogHeader>
            <DialogTitle>Create a branch</DialogTitle>
            <DialogDescription>
              Add a business location, then open it to begin using the POS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="e.g. Ntinda branch"
              onKeyDown={(event) =>
                event.key === "Enter" && void createBranch()
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!branchName.trim() || creating}
              onClick={() => void createBranch()}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create & open POS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subscriptionPromptOpen} onOpenChange={setSubscriptionPromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add another branch</DialogTitle>
            <DialogDescription>
              A paid business license is required before you can create and use another branch.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Choose a plan to continue. You can return here after approval.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscriptionPromptOpen(false)}>Cancel</Button>
            <Button onClick={() => { setSubscriptionPromptOpen(false); navigate("/plans", { state: { from: "/", reason: "additional_branch" } }); }}>
              View plans
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(null); setDeletePassword(""); setDeletePasswordError(""); } }}>
        <DialogContent className="max-w-md border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Confirm branch deletion
            </DialogTitle>
            <DialogDescription className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-amber-950">
              Deleting <span className="font-semibold">{deleteTarget?.store_name}</span> permanently removes its inventory, sales, expenses, staff, and access records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-executive-password">Executive account password</Label>
            <Input
              id="delete-executive-password"
              type="password"
              value={deletePassword}
              onChange={(event) => { setDeletePassword(event.target.value); setDeletePasswordError(""); }}
              onKeyDown={(event) => event.key === "Enter" && void deleteBranch()}
              autoFocus
              placeholder="Enter your account password"
            />
            {deletePasswordError && <p className="text-sm text-destructive">{deletePasswordError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting || !deletePassword.trim()} onClick={() => void deleteBranch()}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete branch permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BranchManageDialog
        open={!!managedBranch}
        onOpenChange={(next) => {
          if (!next) setManagedBranch(null);
        }}
        branch={
          managedBranch
            ? {
                id: managedBranch.id,
                store_name: managedBranch.store_name,
                currency: managedBranch.currency,
                sales: managedBranch.sales,
                expenses: managedBranch.expenses,
                transactions: managedBranch.transactions,
              }
            : null
        }
        onOpenPos={onOpenBranch}
      />
    </section>
  );
}

function Overview({
  totals,
  todayTotals,
  currencyTotals,
  todayCurrencyTotals,
  branches,
  onCreate,
  onManage,
}: {
  totals: any;
  todayTotals: { sales: number; transactions: number };
  currencyTotals: CurrencyTotals;
  todayCurrencyTotals: Record<string, { sales: number; transactions: number }>;
  branches: Branch[];
  onCreate: () => void;
  onManage: (branch: Branch) => void;
}) {
  const exceptionCount = branches.filter(
    (branch) => branch.todayExpenses > branch.todaySales,
  ).length;
  const todayActivityBranches = [...branches].sort((a, b) =>
    new Date(b.latestSaleAt || 0).getTime() - new Date(a.latestSaleAt || 0).getTime(),
  );
  const hasMixedCurrencies = new Set(branches.map((branch) => branch.currency)).size > 1;
  const todayLeader = !hasMixedCurrencies
    ? [...branches].sort((a, b) => b.todaySales - a.todaySales)[0]
    : null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Today sales" value={Object.entries(todayCurrencyTotals).map(([currency, values]) => formatBranchCurrency(values.sales, currency))} detail={`${todayTotals.transactions} transactions across reporting branches`} icon={<TrendingUp />} tone="emerald" />
        <Metric label="Portfolio revenue" value={summaryValue(currencyTotals, "sales")} detail="Sales for the selected period" icon={<Activity />} tone="navy" />
        <Metric label="Operating expenses" value={summaryValue(currencyTotals, "expenses")} detail="Recorded by branch in the selected period" icon={<TrendingDown />} tone="amber" />
        <Metric label="Net performance" value={Object.entries(currencyTotals).map(([currency, values]) => formatBranchCurrency(values.sales - values.expenses, currency))} detail={`${exceptionCount} branch${exceptionCount === 1 ? "" : "es"} need${exceptionCount === 1 ? "s" : ""} review`} icon={<WalletCards />} tone="rose" />
      </div>
      <TodayPulseBoard
        branches={todayActivityBranches}
        todayCurrencyTotals={todayCurrencyTotals}
        transactions={todayTotals.transactions}
        exceptions={exceptionCount}
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3 border-slate-200 shadow-sm">
          <CardHeader className="[&>h3]:!text-foreground">
            <CardTitle className="text-base">
              Sales & operating expenses
            </CardTitle>
            <CardDescription>
              Comparing each branch in the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {branches.length && !hasMixedCurrencies ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branches}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="store_name"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(value: number) => formatBranchCurrency(value, branches[0]?.currency || "UGX")} />
                  <Bar
                    dataKey="sales"
                    name="Sales"
                    fill="#047857"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expenses"
                    name="Expenses"
                    fill="#cbd5e1"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : hasMixedCurrencies ? (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <p className="font-medium text-slate-800">Comparison is separated by currency</p>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">Branch amounts are shown in their own currencies below, so unlike currencies are never charted or combined as one value.</p>
                </div>
              </div>
            ) : (
              <Empty onCreate={onCreate} />
            )}
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white text-slate-950 shadow-sm xl:col-span-2 [&_h3]:!text-slate-950 [&_h3]:!font-bold">
          <CardHeader className="px-7 pt-7 pb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-950">
              Action centre
            </p>
            <CardTitle className="text-lg text-slate-950">Today’s focus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 px-6 pb-6">
            <div className="border-l-2 border-emerald-400 pl-4">
              <p className="text-sm font-medium text-slate-950">
                {hasMixedCurrencies
                  ? "Today’s portfolio activity"
                  : todayLeader?.store_name || "No branch reporting yet"}
              </p>
              <p className="mt-2 break-words text-sm leading-6 text-slate-950">
                {branches.length
                  ? hasMixedCurrencies
                    ? Object.entries(todayCurrencyTotals).map(([currency, values]) => `${formatBranchCurrency(values.sales, currency)} today`).join(" · ")
                    : `${formatBranchCurrency(todayLeader?.todaySales || 0, todayLeader?.currency || "UGX")} in today’s sales`
                  : "Create your first branch to start monitoring performance."}
              </p>
            </div>
            <div className="border-l-2 border-amber-400 pl-4">
              <p className="text-sm font-medium text-slate-950">
                {exceptionCount
                  ? `${exceptionCount} branch${exceptionCount > 1 ? "es" : ""} need review`
                  : "No expense exceptions"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-950">
                {exceptionCount
                  ? "Operating expenses have overtaken sales in at least one location."
                  : "All reporting branches are within operating range."}
              </p>
            </div>
            <Button onClick={onCreate} className="w-full justify-between">
              Create a branch <Plus className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Branch performance</CardTitle>
            <CardDescription>
              Open a branch only when you need the operational POS.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onCreate}>
            Manage branches <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <BranchTable branches={branches.slice(0, 5)} onManage={onManage} />
        </CardContent>
      </Card>
    </div>
  );
}

function TodayPulseBoard({ branches, todayCurrencyTotals, transactions, exceptions }: { branches: Branch[]; todayCurrencyTotals: Record<string, { sales: number; transactions: number }>; transactions: number; exceptions: number }) {
  const updates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sales = branches
      .filter((branch) => branch.todayTransactions > 0)
      .sort((a, b) => new Date(b.latestSaleAt || 0).getTime() - new Date(a.latestSaleAt || 0).getTime())
      .slice(0, 4)
      .map((branch) => ({
        id: `${branch.id}-sale`, tone: "bg-emerald-500", title: `${branch.store_name} recorded ${branch.todayTransactions} sale${branch.todayTransactions === 1 ? "" : "s"}`,
        detail: `${formatBranchCurrency(branch.todaySales, branch.currency)} in today’s sales${branch.latestSaleAt ? ` · ${new Date(branch.latestSaleAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`,
      }));
    const exceptions = branches.filter((branch) => branch.todayExpenses > branch.todaySales).slice(0, 2).map((branch) => ({
      id: `${branch.id}-exception`, tone: "bg-amber-500", title: `${branch.store_name} needs an expense review`,
      detail: "Today’s recorded expenses are above today’s sales.",
    }));
    const newlyCreated = branches.filter((branch) => new Date(branch.created_at) >= today).slice(0, 2).map((branch) => ({
      id: `${branch.id}-created`, tone: "bg-sky-500", title: `${branch.store_name} was added today`,
      detail: "Ready for team access and POS setup.",
    }));
    return [...sales, ...exceptions, ...newlyCreated].slice(0, 5);
  }, [branches]);

  return (
    <Card className="overflow-hidden border-slate-200 bg-white text-slate-900 shadow-sm">
      <CardContent className="grid p-0 xl:grid-cols-[1.7fr_1fr]">
        <section className="relative flex flex-col overflow-hidden p-6 sm:p-8 xl:p-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 border border-emerald-400/15" />
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 border border-emerald-400/20" />
          <p className="text-[11px] font-bold uppercase tracking-[0.19em] text-emerald-700">Portfolio / live today</p>
          <div className="mt-5 space-y-1 break-words text-2xl font-semibold tracking-tight">{Object.entries(todayCurrencyTotals).map(([currency, values]) => <p key={currency}>{formatBranchCurrency(values.sales, currency)}</p>)}</div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Sales recorded today across {branches.length} reporting branch{branches.length === 1 ? "" : "es"}.</p>
          <div className="mt-auto grid grid-cols-2 gap-4 border-t border-slate-200 pt-5 sm:gap-8">
            <div className="min-w-0">
              <p className="text-2xl font-semibold">{transactions}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Transactions</p>
            </div>
            <div className="min-w-0 border-l border-slate-200 pl-4 sm:pl-8">
              <p className={`text-2xl font-semibold ${exceptions ? "text-amber-600" : "text-emerald-700"}`}>{exceptions}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Exceptions</p>
            </div>
          </div>
        </section>
        <aside className="border-t border-slate-100 bg-gray-50 p-6 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[0.19em] text-slate-400">Updates today</p><span className="h-2 w-2 bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,.8)]" /></div>
          {updates.length ? <div className="mt-5 space-y-4">{updates.slice(0, 3).map((update) => <article key={update.id} className="relative border-l border-slate-100 pl-4"><span className={`absolute -left-[4px] top-1.5 h-1.5 w-1.5 ${update.tone}`} /><p className="text-sm font-medium leading-5">{update.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{update.detail}</p></article>)}</div> : <p className="mt-5 text-sm leading-6 text-slate-500">No sales or operating changes have been recorded today.</p>}
        </aside>
        <section className="border-t border-slate-100 p-6 sm:p-7 xl:col-span-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.19em] text-slate-600">Branch signal</p>
          {branches.length ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {branches.map((branch, index) => {
                const needsAttention = branch.todayExpenses > branch.todaySales;
                const colors = branchPalette[index % branchPalette.length];
                return (
                  <Card key={branch.id} className={`relative min-w-0 overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md ${colors.card}`}>
                    <span className={`absolute inset-y-0 left-0 w-1 ${colors.rail}`} aria-hidden="true" />
                    <CardContent className="space-y-3 p-4 pl-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
                            <Store className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{branch.currency}</p>
                          <p className="mt-1 break-words text-sm font-medium">{branch.store_name}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {needsAttention ? (
                            <Badge className="bg-amber-100 text-amber-800">Needs review</Badge>
                          ) : (
                            <Badge className={colors.status}>Reporting</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 border-t border-slate-200/70 pt-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500">Transactions</p>
                          <p className="mt-1 font-semibold">{branch.todayTransactions}</p>
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="text-xs text-slate-500">Sales</p>
                          <p className="mt-1 break-words font-semibold">{formatBranchCurrency(branch.todaySales, branch.currency)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="py-5 text-sm text-slate-500">No branch activity yet.</p>
          )}

          <p className="mt-4 text-xs text-slate-600">{branches.filter(b => b.todayExpenses > b.todaySales).length ? `${branches.filter(b => b.todayExpenses > b.todaySales).length} branch${branches.filter(b => b.todayExpenses > b.todaySales).length === 1 ? "" : "es"} need expense attention today.` : "All branches are within today’s operating range."}</p>
        </section>
      </CardContent>
    </Card>
  );
}

function Branches({
  branches,
  onCreate,
  onManage,
  onDelete,
  canDelete,
}: {
  branches: Branch[];
  onCreate: () => void;
  onManage: (branch: Branch) => void;
  onDelete?: (branch: Branch) => void;
  canDelete: (branch: Branch) => boolean;
}) {
  return (
    <div className="space-y-5">
      {branches.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {branches.map((branch, index) => {
            const colors = branchPalette[index % branchPalette.length];
            return (
              <Card
              key={branch.id}
              className={`relative overflow-hidden shadow-sm transition-shadow hover:shadow-md ${colors.card}`}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${colors.rail}`} aria-hidden="true" />
              <CardHeader className="space-y-0 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colors.icon}`}>
                      <Building2 className="h-3.5 w-3.5" />
                    </span>
                    <CardTitle className="truncate text-sm leading-tight">
                      {branch.store_name}
                    </CardTitle>
                  </div>
                  <Badge className={`shrink-0 px-1.5 py-0 text-[10px] ${colors.status}`}>
                    Reporting
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 p-3 pt-0">
                <div className="grid grid-cols-2 gap-2 border-y border-slate-100 py-2">
                  <div>
                    <p className="text-[11px] text-slate-500">Sales</p>
                    <p className="mt-0.5 truncate text-sm font-semibold">
                      {formatBranchCurrency(branch.sales, branch.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Net</p>
                    <p className="mt-0.5 truncate text-sm font-semibold">
                      {formatBranchCurrency(branch.sales - branch.expenses, branch.currency)}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="flex gap-2">
                  <Button
                    size="sm"
                    className={`min-w-0 flex-1 text-white ${colors.manage}`}
                    onClick={() => onManage(branch)}
                    title={`Manage ${branch.store_name}`}
                  >
                    <Settings2 className="mr-1 h-3.5 w-3.5" />
                    Manage branch
                  </Button>
                  {onDelete && canDelete(branch) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`min-w-0 flex-1 border ${colors.delete}`}
                      onClick={() => onDelete(branch)}
                      title={`Delete ${branch.store_name}`}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete branch
                    </Button>
                  )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )})}
        </div>
      ) : (
        <Empty onCreate={onCreate} />
      )}
    </div>
  );
}
function Finance({ totals, currencyTotals, branches, onManage }: { totals: any; currencyTotals: CurrencyTotals; branches: Branch[]; onManage: (branch: Branch) => void }) {
  const { toast } = useToast();
  const [authorized, setAuthorized] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const loadAuthorized = async () => {
      try {
        const storeIds = branches.map(b => b.id);
        if (!storeIds.length) { setAuthorized([]); return; }
        const { data, error } = await (supabase as any).from('scheduled_payments').select('*').in('store_id', storeIds).eq('status', 'authorized').order('created_at', { ascending: false });
        if (error) throw error;
        // fetch bank accounts for these stores
        const { data: accounts } = await (supabase as any).from('branch_payment_accounts').select('*').in('store_id', storeIds).in('provider_type', ['bank']).order('created_at', { ascending: false });
        const map = (accounts || []).reduce((acc: any, a: any) => { acc[a.store_id] = acc[a.store_id] || a; return acc; }, {} as Record<string, any>);
        const enriched = (data || []).map((row: any) => ({ ...row, bank_link: map[row.store_id]?.external_link || null, bank_account_id: map[row.store_id]?.id || null, branch_name: branches.find(b => b.id === row.store_id)?.store_name || '' }));
        if (active) setAuthorized(enriched);
      } catch (e) {
        // ignore
      }
    };
    void loadAuthorized();
    return () => { active = false; };
  }, [branches]);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Revenue"
          value={summaryValue(currencyTotals, "sales")}
          detail="All branch sales"
          icon={<TrendingUp />}
          tone="emerald"
        />
        <Metric
          label="Operating expenses"
          value={summaryValue(currencyTotals, "expenses")}
          detail="Recorded branch expenses"
          icon={<TrendingDown />}
          tone="rose"
        />
        <Metric
          label="Cash receipts"
          value={summaryValue(currencyTotals, "cash")}
          detail="Cash payment method"
          icon={<WalletCards />}
          tone="navy"
        />
        <Metric
          label="Electronic receipts"
          value={summaryValue(currencyTotals, "electronic")}
          detail="Non-cash payment method"
          icon={<Landmark />}
          tone="amber"
        />
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Branch contribution</CardTitle>
          <CardDescription>
            Portfolio totals are consolidated; branch data remains
            access-scoped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BranchTable branches={branches} onManage={onManage} />
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Authorized scheduled payments</CardTitle>
          <CardDescription>Payments authorized by accountants awaiting approval and bank payment.</CardDescription>
        </CardHeader>
        <CardContent>
          {authorized.length === 0 ? (
            <p className="text-sm text-muted-foreground">No authorized payments.</p>
          ) : (
            <div className="space-y-3">
              {authorized.map((p) => (
                <div key={p.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{p.payee}</p>
                      <Badge className="text-[10px]">{p.schedule_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.branch_name} · {p.period}{p.month ? ` · ${p.month}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-2"><div className="font-semibold">{formatBranchCurrency(p.amount, branches.find((branch) => branch.id === p.store_id)?.currency || "UGX")}</div><div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</div></div>
                    {p.bank_link ? (
                      <Button size="sm" onClick={async () => {
                        try { window.open(p.bank_link, '_blank'); } catch {}
                        const { data: auth } = await supabase.auth.getUser();
                        const userId = auth.user?.id || null;
                        await (supabase as any).from('scheduled_payments').update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() }).eq('id', p.id);
                        toast({ title: 'Marked approved', description: `${p.payee} marked approved.` });
                        // refresh list
                        const idx = authorized.findIndex(a => a.id === p.id);
                        setAuthorized(authorized.filter(a => a.id !== p.id));
                      }}>Approve & Open bank</Button>
                    ) : (
                      <Button size="sm" onClick={async () => {
                        const setForAccountId = p.bank_account_id;
                        const prompt = window.prompt('No bank link set. Enter bank link (https://...):');
                        if (!prompt) return;
                        try {
                          if (setForAccountId) {
                            const { error } = await (supabase as any).from('branch_payment_accounts').update({ external_link: prompt }).eq('id', setForAccountId);
                            if (error) throw error;
                          } else {
                            // if no specific bank account exists, create one for the branch
                            const { error } = await (supabase as any).from('branch_payment_accounts').insert({ store_id: p.store_id, name: 'Bank account', provider_type: 'bank', external_link: prompt, opening_balance: 0, is_active: true });
                            if (error) throw error;
                          }
                          toast({ title: 'Link saved' });
                          // refresh authorized list
                          const remaining = authorized.filter(a => a.id !== p.id);
                          setAuthorized(remaining);
                        } catch (e: any) {
                          toast({ title: 'Could not save link', description: e?.message || String(e), variant: 'destructive' });
                        }
                      }}>Set bank link</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function Reports({
  branches,
  totals,
  currencyTotals,
  onManage,
}: {
  branches: Branch[];
  totals: any;
  currencyTotals: CurrencyTotals;
  onManage: (branch: Branch) => void;
}) {
  return (
    <div className="space-y-6">
      <WalkInPortfolioSummary storeIds={branches.map((branch) => branch.id)} />
      <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              Consolidated report
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Portfolio operating snapshot
            </h2>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              A decision-ready view across every branch you own or have been
              granted access to.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <ReportValue label="Sales" value={summaryValue(currencyTotals, "sales").join(" · ")} />
            <ReportValue
              label="Net"
              value={Object.entries(currencyTotals).map(([currency, values]) => formatBranchCurrency(values.sales - values.expenses, currency)).join(" · ")}
            />
            <ReportValue label="Branches" value={String(branches.length)} />
            <ReportValue
              label="Transactions"
              value={String(totals.transactions)}
            />
          </div>
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Reporting branches</CardTitle>
          <CardDescription>
            Review a branch’s operating performance or open its POS to manage
            shop-floor activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BranchTable branches={branches} onManage={onManage} />
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string | string[];
  detail: string;
  icon: React.ReactNode;
  tone: "emerald" | "navy" | "amber" | "rose";
}) {
  const variants = {
    emerald: {
      card: "metric-card-sales",
    },
    navy: {
      card: "metric-card-cash",
    },
    amber: {
      card: "metric-card-stock",
    },
    rose: {
      card: "metric-card-profit",
    },
  } as const;
  const colors = variants[tone];
  const values = Array.isArray(value) ? value : [value];
  return (
    <Card className={`metric-card ${colors.card} rounded-2xl`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-white/80">
          {label}
        </CardTitle>
        <span className="flex h-7 w-7 items-center justify-center text-white/70">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className="min-w-0 space-y-0.5">
          <p className="break-words text-2xl font-semibold leading-tight tracking-tight text-white">
            {values[0]}
          </p>
          {values.slice(1).map((entry) => (
            <p className="break-words text-sm font-medium leading-tight text-white/80" key={entry}>
              {entry}
            </p>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/70">{detail}</p>
      </CardContent>
    </Card>
  );
}
function BranchTable({
  branches,
  onManage,
}: {
  branches: Branch[];
  onManage?: (branch: Branch) => void;
}) {
  return branches.length ? (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.1em] text-slate-500">
          <tr>
            <th className="pb-3 font-semibold">Branch</th>
            <th className="pb-3 font-semibold">Sales</th>
            <th className="pb-3 font-semibold">Expenses</th>
            <th className="pb-3 font-semibold">Net</th>
            <th className="pb-3 font-semibold">Status</th>
            {onManage && <th className="pb-3" />}
          </tr>
        </thead>
        <tbody>
          {branches.map((branch, index) => {
            const colors = branchPalette[index % branchPalette.length];
            const net = branch.sales - branch.expenses;
            const needsAttention = net < 0;
            return (
            <tr
              key={branch.id}
              className="border-b border-slate-100 last:border-0"
            >
              <td className="py-3 font-medium text-slate-900">
                <div className="flex items-center gap-3">
                  <span className={`h-9 w-1 shrink-0 rounded-full ${colors.rail}`} aria-hidden="true" />
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
                    <Store className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{branch.store_name}</span>
                    <span className="block text-xs font-normal text-slate-500">{branch.currency} · {branch.transactions} transactions</span>
                  </span>
                </div>
              </td>
              <td className="font-medium text-slate-700">{formatBranchCurrency(branch.sales, branch.currency)}</td>
              <td className="text-slate-600">{formatBranchCurrency(branch.expenses, branch.currency)}</td>
              <td
                className={needsAttention ? "font-medium text-rose-600" : "font-medium text-emerald-700"}
              >
                {formatBranchCurrency(net, branch.currency)}
              </td>
              <td>
                <Badge
                  variant="secondary"
                  className={needsAttention ? "bg-amber-100 text-amber-800" : colors.status}
                >
                  {needsAttention ? "Review" : "Healthy"}
                </Badge>
              </td>
              {onManage && (
                <td className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onManage(branch)}
                  >
                    <Settings2 className="mr-1 h-3.5 w-3.5" />
                    Manage branch
                  </Button>
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
function Empty({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center text-center">
      <Building2 className="mb-3 h-8 w-8 text-slate-300" />
      <p className="font-medium text-slate-800">No branches to report on yet</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Create your first branch to set up a shop-floor POS and begin
        consolidating performance.
      </p>
      {onCreate && (
        <Button className="mt-4" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create branch
        </Button>
      )}
    </div>
  );
}
function State({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-15rem)] flex-col items-center justify-center text-center">
      <span className="mb-4 text-slate-400">{icon}</span>
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{detail}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
function ReportValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-200">
        {label}
      </p>
      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}
