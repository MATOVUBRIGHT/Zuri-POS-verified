import { useEffect, useMemo, useState } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toLocalDateKey } from "@/lib/date";
import StatCard from "@/components/StatCard";
import { CreditCard, Receipt, TrendingUp, WalletCards } from "lucide-react";

interface NonCashReconciliationProps {
  currentStoreId?: string;
}

type NonCashRow = {
  id: string;
  customer: string;
  method: string;
  paidTo: string | null;
  reference: string | null;
  received: number;
  total: number;
  time: string;
};

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

const round2 = (value: number) => Math.round(value * 100) / 100;

const NonCashReconciliation = ({ currentStoreId }: NonCashReconciliationProps) => {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(toLocalDateKey(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<NonCashRow[]>([]);
  const [methodBreakdown, setMethodBreakdown] = useState<Array<{ method: string; amount: number; count: number }>>(
    []
  );
  const [accountBreakdown, setAccountBreakdown] = useState<Array<{ method: string; paidTo: string; amount: number; count: number }>>(
    []
  );
  const [nonCashExpenses, setNonCashExpenses] = useState(0);

  const fetchData = async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Not authenticated");

      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("*")
        .eq("store_id", currentStoreId)
        .eq("date_of_sale", selectedDate);
      if (salesError) throw salesError;

      const { data: methods, error: methodsError } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("store_id", currentStoreId);
      if (methodsError) throw methodsError;

      const { data: expenses, error: expensesError } = await supabase
        .from("expenses")
        .select("*")
        .eq("store_id", currentStoreId)
        .eq("date_of_expense", selectedDate);
      if (expensesError) throw expensesError;

      const dedupedSales = dedupeRowsById((sales || []) as Array<{ id?: string }>);
      const dedupedMethods = dedupeRowsById((methods || []) as Array<{ id?: string }>);
      const dedupedExpenses = dedupeRowsById((expenses || []) as Array<{ id?: string }>);

      const methodNameById = new Map<string, string>();
      const methodDetailsById = new Map<string, any>();
      dedupedMethods.forEach((m: any) => {
        if (m?.id) {
          methodNameById.set(m.id, String(m.name || ""));
          methodDetailsById.set(m.id, m.details ?? null);
        }
      });

      const getMethodLabel = (sale: any) => {
        const detailsMethod = sale?.payment_details?.paymentMethod;
        if (typeof detailsMethod === "string" && detailsMethod.trim()) return detailsMethod.trim();
        const byId = sale?.payment_method_id ? methodNameById.get(sale.payment_method_id) : "";
        return byId || "Cash";
      };

      const getPaidToLabel = (sale: any) => {
        const d = sale?.payment_details;
        const direct = d?.mobileMoneyNumber || d?.tillNumber || d?.paybillNumber || d?.accountNumber || null;
        if (direct) return String(direct);

        const mid = sale?.payment_method_id;
        if (!mid) return null;
        const md = methodDetailsById.get(mid);
        if (!md) return null;
        return (
          md.mobileMoneyNumber ||
          md.tillNumber ||
          md.paybillNumber ||
          md.accountNumber ||
          null
        );
      };

      const payments: NonCashRow[] = [];
      const byMethod = new Map<string, { amount: number; count: number }>();
      const byAccount = new Map<string, { method: string; paidTo: string; amount: number; count: number }>();

      dedupedSales.forEach((s: any) => {
        const method = getMethodLabel(s);
        const methodLower = method.toLowerCase();
        const isCash = methodLower.includes("cash");

        const total = Number(s.total_amount) || 0;
        const amountReceivedRaw = s?.payment_details?.amountReceived;
        const amountReceived = Number(amountReceivedRaw);
        const received = Number.isFinite(amountReceived) && amountReceived > 0
          ? amountReceived
          : (s.paid_in_cash ? total : 0);

        if (received <= 0 || isCash) return;

        const paidTo = getPaidToLabel(s);
        const reference = s?.payment_details?.transactionReference || null;

        const r: NonCashRow = {
          id: s.id,
          customer: s.customer_name || "Walk-in",
          method,
          paidTo,
          reference,
          received,
          total,
          time: s.created_at ? new Date(s.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "",
        };
        payments.push(r);

        const mb = byMethod.get(method) || { amount: 0, count: 0 };
        byMethod.set(method, { amount: mb.amount + received, count: mb.count + 1 });

        const paidToKey = paidTo ? String(paidTo) : "Unknown";
        const key = `${method}||${paidToKey}`;
        const ab = byAccount.get(key) || { method, paidTo: paidToKey, amount: 0, count: 0 };
        byAccount.set(key, { ...ab, amount: ab.amount + received, count: ab.count + 1 });
      });

      payments.sort((a, b) => b.received - a.received);

      const mbArr = Array.from(byMethod.entries())
        .map(([method, v]) => ({ method, amount: round2(v.amount), count: v.count }))
        .sort((a, b) => b.amount - a.amount);

      const abArr = Array.from(byAccount.values())
        .map((v) => ({ ...v, amount: round2(v.amount) }))
        .sort((a, b) => b.amount - a.amount);

      const expNonCash = dedupedExpenses
        .filter((e: any) => !String(e.payment_method || "").toLowerCase().includes("cash"))
        .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);

      setRows(payments);
      setMethodBreakdown(mbArr);
      setAccountBreakdown(abArr);
      setNonCashExpenses(round2(expNonCash));
    } catch (e) {
      console.error("Non-cash reconciliation error:", e);
      toast({
        title: "Error",
        description: "Failed to load non-cash reconciliation data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, currentStoreId]);

  const totalReceived = useMemo(() => rows.reduce((sum, r) => sum + (r.received || 0), 0), [rows]);

  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3"><WalletCards className="h-8 w-8 text-primary" />Non-Cash Reconciliation</h2>
          <p className="text-muted-foreground mt-1">Verify mobile money, bank, card, and other electronic payments.</p>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="noncash-date" className="text-xs text-muted-foreground">Reporting date</Label>
            <Input
              id="noncash-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 w-[170px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Non-Cash Received" value={fmtCurrency(Math.round(totalReceived))} sub={`${rows.length} payment(s)`} icon={CreditCard} color="text-primary" bg="bg-primary/10" />
        <StatCard label="Non-Cash Expenses" value={fmtCurrency(Math.round(nonCashExpenses))} sub="Expenses paid electronically" icon={Receipt} color="text-red-600" bg="bg-red-50 dark:bg-red-950" />
        <StatCard label="Net Received" value={fmtCurrency(Math.round(totalReceived - nonCashExpenses))} sub="Received minus expenses" icon={TrendingUp} color="text-primary" bg="bg-primary/10" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            {methodBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No non-cash payments for this date.</p>
            ) : (
              <div className="space-y-2">
                {methodBreakdown.map((m) => {
                  // Determine card color based on payment method
                  const methodLower = m.method.toLowerCase();
                  let cardClass = "bg-gradient-to-br from-gray-500/10 to-gray-500/5 border-gray-500/20";
                  
                  if (methodLower.includes('mtn') || methodLower.includes('mobile money')) {
                    cardClass = "bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20";
                  } else if (methodLower.includes('airtel')) {
                    cardClass = "bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20";
                  } else if (methodLower.includes('pesapal')) {
                    cardClass = "bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20";
                  } else if (methodLower.includes('card') || methodLower.includes('credit') || methodLower.includes('debit')) {
                    cardClass = "bg-gradient-to-br from-blue-600/10 to-blue-600/5 border-blue-600/20";
                  } else if (methodLower.includes('bank')) {
                    cardClass = "bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20";
                  }
                  
                  return (
                    <div key={m.method} className={`flex items-center justify-between rounded-md border p-3 ${cardClass}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{m.count}</Badge>
                        <span className="font-medium">{m.method}</span>
                      </div>
                      <span className="font-bold">{fmtCurrency(Math.round(m.amount))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By Paid-To Account</CardTitle>
          </CardHeader>
          <CardContent>
            {accountBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No non-cash payments for this date.</p>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2">
                {accountBreakdown.map((a) => {
                  // Determine card color based on payment method
                  const methodLower = a.method.toLowerCase();
                  let cardClass = "bg-gradient-to-br from-gray-500/10 to-gray-500/5 border-gray-500/20";
                  
                  if (methodLower.includes('mtn') || methodLower.includes('mobile money')) {
                    cardClass = "bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20";
                  } else if (methodLower.includes('airtel')) {
                    cardClass = "bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20";
                  } else if (methodLower.includes('pesapal')) {
                    cardClass = "bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20";
                  } else if (methodLower.includes('card') || methodLower.includes('credit') || methodLower.includes('debit')) {
                    cardClass = "bg-gradient-to-br from-blue-600/10 to-blue-600/5 border-blue-600/20";
                  } else if (methodLower.includes('bank')) {
                    cardClass = "bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20";
                  }
                  
                  return (
                    <div key={`${a.method}||${a.paidTo}`} className={`flex items-center justify-between rounded-md border p-3 ${cardClass}`}>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.method}</p>
                        <p className="text-xs text-muted-foreground truncate">To {a.paidTo}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{fmtCurrency(Math.round(a.amount))}</p>
                        <p className="text-[11px] text-muted-foreground">{a.count} payment(s)</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Non-Cash Payments Details</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No non-cash payments for this date.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Paid To</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Sale Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{r.time}</TableCell>
                    <TableCell className="font-medium">{r.customer}</TableCell>
                    <TableCell>{r.method}</TableCell>
                    <TableCell className="text-xs">{r.paidTo || "-"}</TableCell>
                    <TableCell className="text-xs">{r.reference || "-"}</TableCell>
                    <TableCell className="text-right font-bold">{fmtCurrency(Math.round(r.received))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmtCurrency(Math.round(r.total))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NonCashReconciliation;

