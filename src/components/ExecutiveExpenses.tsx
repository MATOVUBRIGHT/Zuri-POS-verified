import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  CircleAlert,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrencyFor } from "@/lib/currency";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Branch = { id: string; store_name: string; currency: string };

type ExpenseRow = {
  id: string;
  store_id: string | null;
  description: string;
  category: string;
  amount: number;
  payment_method: string | null;
  date_of_expense: string;
  created_at: string;
};

const CATEGORIES = [
  "Board Member",
  "Director",
  "Salaries",
  "Personal",
  "Transport",
  "Utilities",
  "Rent",
  "Supplies",
  "Marketing",
  "Maintenance",
  "Insurance",
  "Other",
] as const;

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Mobile Money", "Cheque"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  "Board Member": "bg-purple-100 text-purple-700 border-purple-200",
  Director: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Salaries: "bg-sky-100 text-sky-700 border-sky-200",
  Personal: "bg-rose-100 text-rose-700 border-rose-200",
  Transport: "bg-blue-100 text-blue-700 border-blue-200",
  Utilities: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Rent: "bg-purple-100 text-purple-700 border-purple-200",
  Supplies: "bg-green-100 text-green-700 border-green-200",
  Marketing: "bg-pink-100 text-pink-700 border-pink-200",
  Maintenance: "bg-orange-100 text-orange-700 border-orange-200",
  Insurance: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Other: "bg-gray-100 text-gray-700 border-gray-200",
};

const expenseSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500),
  category: z.string().min(1, "Category is required"),
  amount: z.number().positive("Amount must be greater than zero"),
  date: z.string().min(1, "Date is required"),
  storeId: z.string().min(1, "Choose the branch this expense belongs to"),
});

const emptyForm = {
  description: "",
  category: "",
  amount: "",
  paymentMethod: "Cash",
  date: new Date().toISOString().split("T")[0],
  storeId: "",
  notes: "",
};

const todayIso = () => new Date().toISOString().split("T")[0];

export default function ExecutiveExpenses({ userId }: { userId: string | null }) {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [owned, linked] = await Promise.all([
        (supabase.from("stores") as any)
          .select("id, store_name, currency")
          .eq("user_id", userId),
        supabase.from("store_access").select("store_id").eq("user_id", userId),
      ]);
      if (owned.error || linked.error) throw owned.error || linked.error;

      const linkedIds = (linked.data || []).map((row: any) => row.store_id);
      const linkedStores = linkedIds.length
        ? await (supabase.from("stores") as any)
            .select("id, store_name, currency")
            .in("id", linkedIds)
        : { data: [], error: null };
      if (linkedStores.error) throw linkedStores.error;

      const map = new Map<string, Branch>();
      for (const store of [...(owned.data || []), ...(linkedStores.data || [])]) {
        if (!map.has(store.id)) {
          map.set(store.id, {
            id: store.id,
            store_name: store.store_name || "Unnamed branch",
            currency: (store.currency || "UGX").toUpperCase(),
          });
        }
      }
      const list = [...map.values()].sort((a, b) =>
        a.store_name.localeCompare(b.store_name),
      );
      setBranches(list);

      if (!list.length) {
        setRows([]);
        return;
      }
      const { data: expenseRows, error: expenseError } = await (supabase as any)
        .from("expenses")
        .select("id, store_id, description, category, amount, payment_method, date_of_expense, created_at")
        .in("store_id", list.map((branch) => branch.id))
        .order("date_of_expense", { ascending: false });
      if (expenseError) throw expenseError;
      setRows((expenseRows || []) as ExpenseRow[]);
    } catch (cause: any) {
      setError(cause?.message || "We could not load your expenses.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );

  const amountFor = (row: ExpenseRow) =>
    fmtCurrencyFor(Number(row.amount) || 0, branchById.get(row.store_id || "")?.currency);

  // Amounts are never summed across currencies: each is reported against the
  // branch that raised it so a mixed portfolio stays honest.
  const totalsByCurrency = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number; today: number }>();
    const today = todayIso();
    for (const row of rows) {
      const currency = branchById.get(row.store_id || "")?.currency || "UGX";
      const entry = grouped.get(currency) || { total: 0, count: 0, today: 0 };
      entry.total += Number(row.amount) || 0;
      entry.count += 1;
      if (row.date_of_expense === today) entry.today += Number(row.amount) || 0;
      grouped.set(currency, entry);
    }
    return [...grouped.entries()];
  }, [branchById, rows]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        (row.description || "").toLowerCase().includes(q) ||
        (row.category || "").toLowerCase().includes(q) ||
        (branchById.get(row.store_id || "")?.store_name || "")
          .toLowerCase()
          .includes(q),
    );
  }, [branchById, rows, searchTerm]);

  const openAdd = () => {
    setForm({ ...emptyForm, storeId: branches[0]?.id || "" });
    setAddOpen(true);
  };

  // An expense is money leaving a real account, so it must also land in that
  // branch's payment account ledger. The system has no gateway feed, so the
  // account is matched on provider type and skipped when none is configured.
  const postToAccount = async (
    storeId: string,
    paymentMethod: string,
    amount: number,
    description: string,
  ): Promise<boolean> => {
    try {
      const method = paymentMethod.toLowerCase();
      const providerType = method.includes("cash")
        ? "cash"
        : method.includes("mobile")
          ? "mobile_money"
          : "bank";
      const { data: matches, error: lookupError } = await (supabase as any)
        .from("branch_payment_accounts")
        .select("id")
        .eq("store_id", storeId)
        .eq("provider_type", providerType)
        .eq("is_active", true)
        .limit(1);
      if (lookupError) return false;
      const account = (matches || [])[0];
      if (!account) return false;

      const { error: postError } = await supabase.rpc(
        "record_payment_account_adjustment" as any,
        {
          p_account_id: account.id,
          p_amount: -Math.abs(amount),
          p_entry_type: "adjustment",
          p_reference: "Expense",
          p_notes: description,
        },
      );
      return !postError;
    } catch {
      return false;
    }
  };

  const saveExpense = async () => {
    if (saving) return;
    const parsed = expenseSchema.safeParse({
      description: form.description,
      category: form.category,
      amount: parseFloat(form.amount) || 0,
      date: form.date,
      storeId: form.storeId,
    });
    if (!parsed.success) {
      toast({
        title: "Check the details",
        description: parsed.error.errors.map((issue) => issue.message).join(", "),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const { error: insertError } = await (supabase as any)
        .from("expenses")
        .insert({
          user_id: userId,
          store_id: form.storeId,
          description: form.description.trim(),
          category: form.category,
          amount: parseFloat(form.amount) || 0,
          payment_method: form.paymentMethod || null,
          date_of_expense: form.date,
          notes: form.notes || null,
        });
      if (insertError) throw insertError;

      // Cash expenses leave the till, so mirror them as a cash movement.
      if (form.paymentMethod.toLowerCase().includes("cash")) {
        await (supabase as any).from("cash_transactions").insert({
          user_id: userId,
          store_id: form.storeId,
          amount: parseFloat(form.amount) || 0,
          type: "out",
          description: `Executive expense: ${form.description.trim()}`,
          account_type: "cash",
        });
      }

      const amountValue = parseFloat(form.amount) || 0;
      const posted = await postToAccount(
        form.storeId,
        form.paymentMethod,
        amountValue,
        form.description.trim(),
      );

      toast({
        title: "Expense recorded",
        description: posted
          ? "Added to the selected branch and its account balance."
          : "Added to the selected branch. No matching account was found, so the account balance was not changed.",
      });
      setAddOpen(false);
      setForm(emptyForm);
      await load();
    } catch (cause: any) {
      toast({
        title: "Could not record expense",
        description: cause?.message || String(cause),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const body = error ? (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CircleAlert className="mb-3 h-8 w-8 text-slate-400" />
      <p className="font-medium text-slate-900">Expenses are unavailable</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{error}</p>
      <Button variant="outline" className="mt-4" onClick={() => void load()}>
        Try again
      </Button>
    </div>
  ) : loading ? (
    <PageLoader text="Loading your expenses..." className="min-h-48" />
  ) : (
    <div className="space-y-3">
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Receipt className="mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-900">
            {searchTerm ? "No expenses match your search" : "No expenses recorded yet"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {searchTerm
              ? "Try a different payee, category or branch name."
              : "Record board, director or personal spend so your portfolio stays accurate."}
          </p>
          {!searchTerm && (
            <Button className="mt-4" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Record an expense
            </Button>
          )}
        </div>
      ) : (
        filtered.map((row) => {
          const branch = branchById.get(row.store_id || "");
          return (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-gray-50"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">{row.description}</h4>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                        CATEGORY_COLORS[row.category] || "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.category}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {branch?.store_name || "Unassigned branch"}
                    </span>
                    <span>
                      {new Date(row.date_of_expense).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {row.payment_method && <span>{row.payment_method}</span>}
                  </p>
                </div>
              </div>
              <p className="shrink-0 font-bold text-destructive">-{amountFor(row)}</p>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-bold">
            <Receipt className="h-8 w-8 text-primary" />
            My Expenses
          </h2>
          <p className="mt-1 text-muted-foreground">
            Record board, director and personal spend against the branch it belongs to.
          </p>
        </div>
        <Button onClick={openAdd} disabled={!branches.length} className="gap-2">
          <Plus className="h-4 w-4" />
          Add expense
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="shrink-0 rounded-lg bg-red-50 p-2">
            <TrendingDown className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Total recorded</p>
            <div className="min-w-0 font-bold text-lg text-red-600">
              {totalsByCurrency.length ? (
                totalsByCurrency.map(([currency, value]) => (
                  <p key={currency} className="truncate leading-tight">
                    {fmtCurrencyFor(value.total, currency)}
                  </p>
                ))
              ) : (
                <p>0</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="shrink-0 rounded-lg bg-amber-50 p-2">
            <Calendar className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Today</p>
            <div className="min-w-0 font-bold text-lg text-amber-600">
              {totalsByCurrency.length ? (
                totalsByCurrency.map(([currency, value]) => (
                  <p key={currency} className="truncate leading-tight">
                    {fmtCurrencyFor(value.today, currency)}
                  </p>
                ))
              ) : (
                <p>0</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="shrink-0 rounded-lg bg-blue-50 p-2">
            <Wallet className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Currencies</p>
            <p className="truncate font-bold text-lg text-blue-600">
              {totalsByCurrency.length || 0}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="shrink-0 rounded-lg bg-purple-50 p-2">
            <FileText className="h-5 w-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Records</p>
            <p className="truncate font-bold text-lg text-purple-600">{rows.length}</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by description, category or branch..."
          className="h-10 pl-9 pr-9"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {body}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record an expense</DialogTitle>
            <DialogDescription>
              This is charged to the branch you select, so your portfolio totals stay
              complete.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input
                placeholder="e.g. Board meeting transport"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Branch *</Label>
              <Select
                value={form.storeId}
                onValueChange={(value) => setForm({ ...form, storeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.store_name} ({branch.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm({ ...form, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Amount ({branchById.get(form.storeId)?.currency || "—"}) *
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment method</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(value) => setForm({ ...form, paymentMethod: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                placeholder="Optional notes..."
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveExpense()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
