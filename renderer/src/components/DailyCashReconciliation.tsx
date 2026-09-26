import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  ArrowRight,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatCurrency } from "@/services/posCalculator";

interface DailyCashReconciliationProps {
  currentStoreId?: string;
}

interface ReconciliationData {
  openingBalance: number;
  salesIncome: number;
  cashSales: number;
  creditSales: number;
  expenses: number;
  cashIn: number;
  cashOut: number;
  closingBalance: number;
  expectedClosing: number;
  variance: number;
  paymentMethodBreakdown: Array<{ method: string; amount: number; count: number }>;
}

const dedupeRowsById = <T extends { id?: unknown }>(rows: T[] | null | undefined): T[] => {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(row);
  }

  return deduped;
};

const normalizeCashTxType = (rawType: unknown): "in" | "out" | "unknown" => {
  const value = String(rawType || "").toLowerCase();
  if (value === "in" || value === "deposit" || value === "income") return "in";
  if (value === "out" || value === "withdrawal" || value === "expense") return "out";
  return "unknown";
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const DailyCashReconciliation = ({ currentStoreId }: DailyCashReconciliationProps) => {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [reconciliationData, setReconciliationData] = useState<ReconciliationData | null>(null);
  const [expenseDetails, setExpenseDetails] = useState<Array<{ id: string; description: string; amount: number; category: string; time: string }>>([]);
  const [cashTransactions, setCashTransactions] = useState<Array<{ id: string; type: string; amount: number; description: string; time: string }>>([]);
  const [countedCash, setCountedCash] = useState<string>("");
  const [isEditingCount, setIsEditingCount] = useState(false);

  const fetchReconciliationData = async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const startOfDay = `${selectedDate}T00:00:00`;
      const endOfDay = `${selectedDate}T23:59:59`;

      const [
        { data: sales },
        { data: methods },
        { data: expenses },
        { data: cashTx },
        { data: priorTransactions },
      ] = await Promise.all([
        supabase.from("sales").select("*").eq("store_id", currentStoreId).eq("date_of_sale", selectedDate),
        supabase.from("payment_methods").select("id, name").eq("store_id", currentStoreId).eq("is_active", true),
        supabase.from("expenses").select("*").eq("store_id", currentStoreId).eq("date_of_expense", selectedDate),
        supabase.from("cash_transactions").select("*").eq("store_id", currentStoreId).gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("cash_transactions").select("*").eq("store_id", currentStoreId).lt("created_at", startOfDay),
      ]);

      const dedupedSales = dedupeRowsById((sales || []) as any[]);
      const dedupedExpenses = dedupeRowsById((expenses || []) as any[]);
      const dedupedDayCashTx = dedupeRowsById((cashTx || []) as any[]);
      const dedupedPriorCashTx = dedupeRowsById((priorTransactions || []) as any[]);

      const methodNameById = new Map<string, string>();
      (methods || []).forEach((m) => { if (m?.id) methodNameById.set(m.id, m.name || ""); });

      const getSaleMethodLabel = (sale: any) => {
        if (!sale?.paid_in_cash) return "Credit";
        const dm = sale?.payment_details?.paymentMethod;
        if (typeof dm === "string" && dm.trim()) return dm.trim();
        return (sale?.payment_method_id ? methodNameById.get(sale.payment_method_id) : "") || "Cash";
      };

      const savedOpening = localStorage.getItem(`opening_balance_${selectedDate}_${currentStoreId}`);
      const savedClosing = localStorage.getItem(`closing_balance_${selectedDate}_${currentStoreId}`);
      if (savedClosing) setCountedCash(savedClosing);
      else setCountedCash("");

      const calculatedOpening = dedupedPriorCashTx.reduce((sum, tx: any) => {
        const txType = normalizeCashTxType(tx?.type);
        const amount = Number(tx?.amount) || 0;
        if (txType === "in") return sum + amount;
        if (txType === "out") return sum - amount;
        return sum;
      }, 0);
      const openingBalance = savedOpening ? parseFloat(savedOpening) : calculatedOpening;

      const cashSales = dedupedSales
        .filter((s: any) => {
          if (!s.paid_in_cash) return false;
          const m = getSaleMethodLabel(s).toLowerCase();
          return m ? m.includes("cash") : true;
        })
        .reduce((sum, s) => sum + Number(s.total_amount), 0);

      const creditSales = dedupedSales.filter((s: any) => !s.paid_in_cash).reduce((sum, s: any) => sum + Number(s.total_amount), 0);
      const salesIncome = dedupedSales.reduce((sum, s: any) => sum + Number(s.total_amount), 0);

      const expenseTotal = dedupedExpenses
        .filter((e) => String(e.payment_method || "cash").toLowerCase().includes("cash"))
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const ledgerIn = dedupedDayCashTx.reduce((sum, tx: any) => {
        return normalizeCashTxType(tx?.type) === "in" ? sum + (Number(tx?.amount) || 0) : sum;
      }, 0);

      const ledgerOut = dedupedDayCashTx.reduce((sum, tx: any) => {
        return normalizeCashTxType(tx?.type) === "out" ? sum + (Number(tx?.amount) || 0) : sum;
      }, 0);

      // Prevent double counting when sales/expenses are also mirrored in cash_transactions.
      const salesTxIn = dedupedDayCashTx.reduce((sum, tx: any) => {
        const txType = normalizeCashTxType(tx?.type);
        const desc = String(tx?.description || "").toLowerCase();
        if (txType === "in" && desc.includes("sale")) return sum + (Number(tx?.amount) || 0);
        return sum;
      }, 0);

      const expensesTxOut = dedupedDayCashTx.reduce((sum, tx: any) => {
        const txType = normalizeCashTxType(tx?.type);
        const desc = String(tx?.description || "").toLowerCase();
        if (txType === "out" && desc.includes("expense:")) return sum + (Number(tx?.amount) || 0);
        return sum;
      }, 0);

      const cashIn = Math.max(0, ledgerIn - salesTxIn);
      const cashOut = Math.max(0, ledgerOut - expensesTxOut);

      const expectedClosing = openingBalance + cashSales + cashIn - expenseTotal - cashOut;
      const actualClosing = savedClosing ? parseFloat(savedClosing) : expectedClosing;
      const variance = actualClosing - expectedClosing;

      const paymentMethodMap = new Map<string, { amount: number; count: number }>();
      dedupedSales.forEach((sale: any) => {
        const name = getSaleMethodLabel(sale);
        const ex = paymentMethodMap.get(name) || { amount: 0, count: 0 };
        paymentMethodMap.set(name, { amount: ex.amount + Number(sale.total_amount), count: ex.count + 1 });
      });

      setReconciliationData({
        openingBalance: round2(openingBalance),
        salesIncome: round2(salesIncome),
        cashSales: round2(cashSales),
        creditSales: round2(creditSales),
        expenses: round2(expenseTotal),
        cashIn: round2(cashIn),
        cashOut: round2(cashOut),
        closingBalance: round2(actualClosing),
        expectedClosing: round2(expectedClosing),
        variance: round2(variance),
        paymentMethodBreakdown: Array.from(paymentMethodMap.entries())
          .map(([method, d]) => ({ method, amount: round2(d.amount), count: d.count }))
          .sort((a, b) => b.amount - a.amount),
      });

      setExpenseDetails(
        dedupedExpenses
          .filter((e) => String(e.payment_method || "cash").toLowerCase().includes("cash"))
          .map((e: any) => ({
            id: e.id,
            description: e.description,
            amount: Number(e.amount),
            category: e.category,
            time: e.created_at ? new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""
          }))
      );
      setCashTransactions(
        dedupedDayCashTx.map((tx: any) => {
          const txType = normalizeCashTxType(tx?.type);
          return {
          id: tx.id,
          type: txType === "unknown" ? String(tx?.type || "out") : txType,
          amount: Number(tx.amount),
          description: tx.description || (txType === "in" ? "Cash added" : "Cash withdrawn"),
          time: new Date(tx.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        };
        })
      );
    } catch (error) {
      console.error("Reconciliation error:", error);
      toast({ title: "Error", description: "Failed to load reconciliation data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliationData();
  }, [selectedDate, currentStoreId]);

  const handleUpdateCount = () => {
    if (!countedCash || isNaN(Number(countedCash))) {
      toast({ title: "Invalid Amount", description: "Please enter a valid cash count", variant: "destructive" });
      return;
    }
    const val = parseFloat(countedCash);
    localStorage.setItem(`closing_balance_${selectedDate}_${currentStoreId}`, val.toString());
    setIsEditingCount(false);
    setReconciliationData((prev) => {
      if (!prev) return prev;
      return { ...prev, closingBalance: val, variance: val - prev.expectedClosing };
    });
    toast({ title: "Drawer Count Saved", description: "Reconciliation updated." });
  };

  const exportReport = () => {
    if (!reconciliationData) return;
    const txt = [
      "DAILY CASH RECONCILIATION REPORT",
      `Date: ${selectedDate}`,
      `Generated: ${new Date().toLocaleString()}`,
      "================================",
      `Opening Balance:   ${formatCurrency(reconciliationData.openingBalance)}`,
      `+ Cash Sales:      ${formatCurrency(reconciliationData.cashSales)}`,
      `+ Cash Added:      ${formatCurrency(reconciliationData.cashIn)}`,
      `- Cash Expenses:   ${formatCurrency(reconciliationData.expenses)}`,
      `- Cash Withdrawn:  ${formatCurrency(reconciliationData.cashOut)}`,
      "--------------------------------",
      `Expected Closing:  ${formatCurrency(reconciliationData.expectedClosing)}`,
      `Actual Count:      ${formatCurrency(reconciliationData.closingBalance)}`,
      `Variance:          ${formatCurrency(reconciliationData.variance)} ${reconciliationData.variance >= 0 ? "(Over)" : "(Short)"}`,
    ].join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([txt], { type: "text/plain" })),
      download: `cash-recon-${selectedDate}.txt`,
    });
    a.click();
    toast({ title: "Report Exported" });
  };

  return (
    <div className="space-y-6">
      {/* ── Header — same pattern as Dashboard / StockEntry / Inventory ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Daily Cash Reconciliation</h2>
          <p className="text-sm text-muted-foreground">Verify drawer totals and track physical cash flow</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          <Button onClick={fetchReconciliationData} variant="outline" size="sm">
            Sync
          </Button>
          <Button onClick={exportReport} variant="outline" size="sm" disabled={!reconciliationData}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" text="Loading reconciliation..." />
        </div>
      ) : reconciliationData ? (
        <>
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Opening Balance */}
            <Card className="bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800 hover:shadow-md transition-shadow rounded-xl overflow-hidden">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-1 font-semibold">
                  <ArrowRight className="h-3 w-3" /> Opening Balance
                </p>
                <div className="text-2xl font-bold text-success/90 dark:text-success/100">
                  {formatCurrency(reconciliationData.openingBalance)}
                </div>
              </CardContent>
            </Card>

            {/* Total Cash In */}
            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-900/20 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-800 hover:shadow-md transition-shadow rounded-xl overflow-hidden">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-1 font-semibold">
                  <TrendingUp className="h-3 w-3" /> Cash In
                </p>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {formatCurrency(reconciliationData.cashSales + reconciliationData.cashIn)}
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Sales: {formatCurrency(reconciliationData.cashSales, false)} | Added: {formatCurrency(reconciliationData.cashIn, false)}
                </p>
              </CardContent>
            </Card>

            {/* Total Cash Out */}
            <Card className="bg-gradient-to-br from-red-50 to-red-50/50 dark:from-red-900/20 dark:to-red-900/10 border-red-200 dark:border-red-800 hover:shadow-md transition-shadow rounded-xl overflow-hidden">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mb-1 font-semibold">
                  <TrendingDown className="h-3 w-3" /> Cash Out
                </p>
                <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                  {formatCurrency(reconciliationData.expenses + reconciliationData.cashOut)}
                </div>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Expenses: {formatCurrency(reconciliationData.expenses, false)} | Withdrawals: {formatCurrency(reconciliationData.cashOut, false)}
                </p>
              </CardContent>
            </Card>

            {/* Variance */}
            <Card className={`transition-all hover:shadow-md ${
              reconciliationData.variance === 0 
                ? "bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-900/20 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-800" 
                : "bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-900/20 dark:to-amber-900/10 border-amber-200 dark:border-amber-800"
            }`}>
              <CardContent className="pt-4 pb-3">
                <p className={`text-xs flex items-center gap-1 mb-1 font-semibold ${
                  reconciliationData.variance === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}>
                  <AlertCircle className="h-3 w-3" /> Variance
                </p>
                <p className={`text-2xl font-bold break-all ${
                  reconciliationData.variance === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
                }`}>
                  {reconciliationData.variance > 0 ? "+" : ""}{formatCurrency(reconciliationData.variance)}
                </p>
                <Badge
                  className={`mt-2 text-xs font-semibold ${
                    reconciliationData.variance === 0 
                      ? "bg-emerald-500/80 hover:bg-emerald-600 text-white" 
                      : "bg-amber-500/80 hover:bg-amber-600 text-white"
                  }`}
                >
                  {reconciliationData.variance === 0 ? "✓ Balanced" : reconciliationData.variance > 0 ? "Overage +" : "Shortage -"}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* ── Breakdown + Drawer count ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-900/10 dark:to-transparent rounded-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-blue-100 dark:border-blue-800">
                <CardTitle className="text-base font-bold text-blue-900 dark:text-blue-100">Expected Closing Balance</CardTitle>
                <p className="text-sm text-blue-600 dark:text-blue-400">System-calculated from ledger transactions</p>
              </CardHeader>
              <CardContent className="space-y-0">
                {[
                  { label: "Opening Balance", value: reconciliationData.openingBalance, sign: "", color: "text-blue-600 dark:text-blue-400" },
                  { label: "Cash Sales", value: reconciliationData.cashSales, sign: "+", color: "text-emerald-600 dark:text-emerald-400 font-semibold" },
                  { label: "Cash Added (in)", value: reconciliationData.cashIn, sign: "+", color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Cash Expenses", value: reconciliationData.expenses, sign: "-", color: "text-red-600 dark:text-red-400 font-semibold" },
                  { label: "Cash Withdrawn", value: reconciliationData.cashOut, sign: "-", color: "text-red-600 dark:text-red-400" },
                ].map(({ label, value, sign, color }) => (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-blue-100 dark:border-blue-900/50 last:border-0 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 px-2 -mx-2 rounded transition-colors">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                    <span className={`text-sm font-semibold ${color}`}>
                      {sign}{formatCurrency(value, false)}
                    </span>
                  </div>
                ))}
                {reconciliationData.creditSales > 0 && (
                  <div className="flex items-center justify-between py-1.5 text-muted-foreground/70 border-dashed border-b border-blue-200 dark:border-blue-800">
                    <span className="text-xs italic pl-1">Credit Sales (not in drawer)</span>
                    <span className="text-xs">{formatCurrency(reconciliationData.creditSales)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 font-bold text-base border-t-2 border-blue-300 dark:border-blue-700 bg-blue-100/50 dark:bg-blue-900/20 p-2 -mx-2 rounded-sm text-blue-900 dark:text-blue-100">
                  <span>Expected Closing</span>
                  <span className="break-all">{formatCurrency(reconciliationData.expectedClosing)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-2 transition-all ${
              reconciliationData.variance === 0 
                ? "border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-900/10 dark:to-transparent" 
                : "border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-900/10 dark:to-transparent"
            }`}>
              <CardHeader className={`pb-3 border-b ${
                reconciliationData.variance === 0 
                  ? "border-emerald-100 dark:border-emerald-800" 
                  : "border-amber-100 dark:border-amber-800"
              }`}>
                <CardTitle className={`text-base font-bold ${
                  reconciliationData.variance === 0 
                    ? "text-emerald-900 dark:text-emerald-100" 
                    : "text-amber-900 dark:text-amber-100"
                }`}>Physical Drawer Count</CardTitle>
                <p className={`text-sm ${
                  reconciliationData.variance === 0 
                    ? "text-emerald-600 dark:text-emerald-400" 
                    : "text-amber-600 dark:text-amber-400"
                }`}>Count the cash and enter the real total</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditingCount ? (
                  <div className="space-y-2">
                    <Label htmlFor="cash-count" className="text-sm font-medium">Counted Total (UGX)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="cash-count"
                        type="number"
                        value={countedCash}
                        onChange={(e) => setCountedCash(e.target.value)}
                        placeholder="Enter amount"
                        className="font-semibold"
                        autoFocus
                      />
                      <Button onClick={handleUpdateCount} className="shrink-0">
                        <CheckCircle className="h-4 w-4 mr-1" /> Save
                      </Button>
                      <Button variant="ghost" onClick={() => setIsEditingCount(false)} className="shrink-0">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-lg border p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors group"
                    onClick={() => setIsEditingCount(true)}
                  >
                    <p className="text-xs text-muted-foreground mb-1 flex justify-between">
                      Drawer Total
                      <span className="text-primary text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to edit
                      </span>
                    </p>
                    <p className="text-2xl font-bold break-all">
                      UGX {reconciliationData.closingBalance.toLocaleString()}
                    </p>
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Expected</span>
                    <span className="font-medium">UGX {reconciliationData.expectedClosing.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Actual Count</span>
                    <span className="font-medium">UGX {reconciliationData.closingBalance.toLocaleString()}</span>
                  </div>
                  <div
                    className={`flex items-center justify-between rounded-lg p-3 text-sm font-semibold mt-2 ${
                      reconciliationData.variance === 0
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {reconciliationData.variance === 0 ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      {reconciliationData.variance === 0
                        ? "Balanced"
                        : reconciliationData.variance > 0
                        ? "Overage"
                        : "Shortage"}
                    </span>
                    <span className="font-bold break-all">
                      UGX {Math.abs(reconciliationData.variance).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Payment methods + Outflows ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 rounded-xl overflow-hidden shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-y-auto">
                  <div className="p-4 space-y-2">
                    {reconciliationData.paymentMethodBreakdown.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No payments recorded</p>
                    ) : (
                      reconciliationData.paymentMethodBreakdown.map((pm, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{pm.method}</p>
                            <p className="text-xs text-muted-foreground">
                              {pm.count} txn{pm.count !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold">UGX {pm.amount.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">
                              {((pm.amount / (reconciliationData.salesIncome || 1)) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 rounded-xl overflow-hidden shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Cash Outflows</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Time</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ...expenseDetails.map((e) => ({ ...e, _kind: "Expense", type: "out" as const })),
                        ...cashTransactions.map((c) => ({ ...c, _kind: "Ledger" })),
                      ]
                        .sort((a, b) => (a.time > b.time ? -1 : 1))
                        .map((item, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  item._kind === "Expense"
                                    ? "text-amber-600 border-amber-200"
                                    : "text-blue-600 border-blue-200"
                                }`}
                              >
                                {item._kind}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[140px]">
                              <span className="block truncate" title={item.description}>
                                {item.description || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.time || "—"}</TableCell>
                            <TableCell
                              className={`text-right text-sm font-semibold ${
                                item.type === "in" ? "text-emerald-600" : "text-destructive"
                              }`}
                            >
                              {item.type === "in" ? "+" : "-"}UGX {item.amount.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      {expenseDetails.length === 0 && cashTransactions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8 text-sm">
                            No outflows recorded for this date
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card className="rounded-xl overflow-hidden shadow-sm">
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Select a store and date to view reconciliation data</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DailyCashReconciliation;
