import { useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, Download, Landmark, RefreshCw, Settings2, ShieldCheck, TriangleAlert, WalletCards, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RoleMode = "boss" | "accountant" | "master";
type StoreSummary = { id: string; store_name: string; user_id: string; created_at: string; sales: number; expenses: number; cash: number; electronic: number; transactions: number; walkins: number; buyerWalkins: number };

const money = (value: unknown) => Number(value || 0);

export default function RoleDashboards({ mode, userId, onCreateBranch, onOpenReports }: { mode: RoleMode; userId: string | null; onCreateBranch?: () => void; onOpenReports?: () => void }) {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [selected, setSelected] = useState<string>("all");
  const [periodDays, setPeriodDays] = useState("30");
  const [recentTransactions, setRecentTransactions] = useState<Array<{ id: string; total_amount: number | null; paid_in_cash: boolean | null; created_at: string; store_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      let source: any[] = [];
      if (mode === "master") {
        const { data, error } = await supabase.from("stores").select("id, store_name, user_id, created_at").order("created_at", { ascending: false });
        if (error) throw error; source = data || [];
      } else if (mode === "boss") {
        const [owned, linked] = await Promise.all([
          supabase.from("stores").select("id, store_name, user_id, created_at").eq("user_id", userId).order("created_at"),
          supabase.from("store_access").select("store_id").eq("user_id", userId).eq("role", "boss"),
        ]);
        if (owned.error || linked.error) throw owned.error || linked.error;
        const linkedIds = (linked.data || []).map((row: any) => row.store_id);
        const linkedStores = linkedIds.length ? await supabase.from("stores").select("id, store_name, user_id, created_at").in("id", linkedIds) : { data: [], error: null };
        if (linkedStores.error) throw linkedStores.error;
        source = [...(owned.data || []), ...(linkedStores.data || [])].filter((store, index, rows) => rows.findIndex(row => row.id === store.id) === index);
      } else {
        const { data: access, error } = await supabase.from("store_access").select("store_id").eq("user_id", userId).eq("role", "accountant");
        if (error) throw error;
        const ids = (access || []).map((row: any) => row.store_id);
        if (ids.length) { const { data, error: storesError } = await supabase.from("stores").select("id, store_name, user_id, created_at").in("id", ids); if (storesError) throw storesError; source = data || []; }
      }
      const since = new Date(); since.setDate(since.getDate() - Number(periodDays));
      const summaries = await Promise.all(source.map(async (store) => {
        const [salesResult, expensesResult, walkinsResult] = await Promise.all([
          supabase.from("sales").select("total_amount, paid_in_cash").eq("store_id", store.id).gte("created_at", since.toISOString()),
          supabase.from("expenses").select("amount").eq("store_id", store.id).gte("created_at", since.toISOString()),
          (supabase.from("walkin_counts" as any) as any).select("visitor_type, expat_female, expat_male, local_female, local_male").eq("store_id", store.id).gte("recorded_date", since.toISOString().slice(0, 10)),
        ]);
        if (salesResult.error || expensesResult.error) throw salesResult.error || expensesResult.error;
        const salesRows: any[] = salesResult.data || []; const expensesRows: any[] = expensesResult.data || [];
        const walkinRows: any[] = walkinsResult.error ? [] : walkinsResult.data || [];
        const walkinTotal = (row: any) => money(row.expat_female) + money(row.expat_male) + money(row.local_female) + money(row.local_male);
        return { ...store, sales: salesRows.reduce((sum, row) => sum + money(row.total_amount), 0), expenses: expensesRows.reduce((sum, row) => sum + money(row.amount), 0), cash: salesRows.filter(row => row.paid_in_cash).reduce((sum, row) => sum + money(row.total_amount), 0), electronic: salesRows.filter(row => !row.paid_in_cash).reduce((sum, row) => sum + money(row.total_amount), 0), transactions: salesRows.length, walkins: walkinRows.reduce((sum, row) => sum + walkinTotal(row), 0), buyerWalkins: walkinRows.filter(row => row.visitor_type === "buyers").reduce((sum, row) => sum + walkinTotal(row), 0) } as StoreSummary;
      }));
      setStores(summaries);
      if (mode === "accountant" && source.length) {
        const { data: recent, error: recentError } = await supabase.from("sales").select("id, total_amount, paid_in_cash, created_at, store_id").in("store_id", source.map(store => store.id)).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(8);
        if (recentError) throw recentError;
        setRecentTransactions(recent || []);
      } else setRecentTransactions([]);
    } catch (caught: any) { setError(caught?.message || "Unable to load dashboard data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [mode, userId, periodDays]);
  const visible = selected === "all" ? stores : stores.filter(s => s.id === selected);
  const activeTransactions = selected === "all" ? recentTransactions : recentTransactions.filter(transaction => transaction.store_id === selected);
  // Sales do not currently record a settlement reference. Electronic sales older
  // than one business day are therefore surfaced as explicit follow-up items,
  // rather than labelling every payment method as an exception.
  const reconciliationExceptions = activeTransactions.filter(transaction => !transaction.paid_in_cash && Date.now() - new Date(transaction.created_at).getTime() > 24 * 60 * 60 * 1000);
  const rankedBranches = [...visible].sort((a, b) => b.sales - a.sales);
  const totals = useMemo(() => visible.reduce((sum, s) => ({ sales: sum.sales + s.sales, expenses: sum.expenses + s.expenses, cash: sum.cash + s.cash, electronic: sum.electronic + s.electronic, transactions: sum.transactions + s.transactions, walkins: sum.walkins + s.walkins, buyerWalkins: sum.buyerWalkins + s.buyerWalkins }), { sales: 0, expenses: 0, cash: 0, electronic: 0, transactions: 0, walkins: 0, buyerWalkins: 0 }), [visible]);
  const title = mode === "boss" ? "Owner control room" : mode === "accountant" ? "Accountant workspace" : "Master developer control";
  const description = mode === "boss" ? "Consolidated performance across your owned and linked branches." : mode === "accountant" ? "Reconciliation-ready reporting for branches assigned to you." : "Platform-wide business, branch, and access oversight.";
  if (loading) return <div className="space-y-4 animate-pulse"><div className="h-24 rounded-xl bg-muted" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-muted" />)}</div></div>;
  if (error) return <Card className="border-destructive/30"><CardContent className="py-10 text-center"><TriangleAlert className="mx-auto mb-3 text-destructive" /><p className="font-medium">Dashboard data could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => void load()}>Try again</Button></CardContent></Card>;
  return <section className="space-y-6"><header className="flex flex-col gap-4 pb-3 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-2 flex items-center gap-2"><Badge variant={mode === "master" ? "destructive" : "secondary"}>{mode === "master" ? "Platform administration" : mode === "boss" ? "Business owner" : "Finance access"}</Badge><span className="text-xs text-muted-foreground">Reporting period</span></div><h1 className="flex items-center gap-3 text-3xl font-bold">{mode === "master" ? <Settings2 className="h-8 w-8 text-primary" /> : mode === "boss" ? <BarChart3 className="h-8 w-8 text-primary" /> : <Landmark className="h-8 w-8 text-primary" />}{title}</h1><p className="mt-1 text-muted-foreground">{description}</p></div><div className="flex flex-wrap gap-2"><Select value={periodDays} onValueChange={setPeriodDays}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>{onOpenReports && <Button variant="outline" onClick={onOpenReports}><Download className="mr-2 h-4 w-4" />Export reports</Button>}{mode === "boss" && <Button onClick={onCreateBranch}><Building2 className="mr-2 h-4 w-4" />Create branch</Button>}</div></header>
  {mode === "accountant" && stores.length > 1 && <div className="max-w-xs"><Select value={selected} onValueChange={setSelected}><SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger><SelectContent><SelectItem value="all">All assigned branches</SelectItem>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.store_name}</SelectItem>)}</SelectContent></Select></div>}
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[["Total sales", totals.sales, BarChart3, "text-primary"],["Operating result before COGS", totals.sales - totals.expenses, Landmark, "text-emerald-600"],["Expenses", totals.expenses, WalletCards, "text-amber-600"],["Cash sales less expenses", totals.cash - totals.expenses, ShieldCheck, "text-foreground"]].map(([label, value, Icon, colour]: any) => <Card key={label} className="border border-border/70"><CardContent className="p-5"><div className="flex items-start justify-between"><p className="text-sm font-medium text-muted-foreground">{label}</p><Icon className={`h-5 w-5 ${colour}`} /></div><p className="mt-3 text-2xl font-bold">{fmtCurrency(value)}</p><p className="mt-1 text-xs text-muted-foreground">{totals.transactions.toLocaleString()} recorded transactions</p></CardContent></Card>)}<Card className="border border-primary/20 bg-primary/5"><CardContent className="p-5"><div className="flex items-start justify-between"><p className="text-sm font-medium text-muted-foreground">Walk-ins</p><Users className="h-5 w-5 text-primary" /></div><p className="mt-3 text-2xl font-bold text-primary">{totals.walkins.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{totals.buyerWalkins.toLocaleString()} buyers · includes no-sale visits</p></CardContent></Card></div>
  <div className="grid gap-6 xl:grid-cols-5"><Card className="xl:col-span-3"><CardHeader><CardTitle className="text-base">{mode === "accountant" ? "Settlement exposure by branch" : mode === "boss" ? "Branch sales comparison" : "Platform sales comparison"}</CardTitle></CardHeader><CardContent className="h-72">{visible.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={visible.map(s => ({ name: s.store_name, sales: s.sales, expenses: s.expenses }))}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={12} /><YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} fontSize={12} /><Tooltip formatter={(value: number) => fmtCurrency(value)} /><Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4,4,0,0]} /><Bar dataKey="expenses" fill="hsl(var(--muted-foreground))" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer> : <Empty message={mode === "accountant" ? "No branch assignments yet" : "No branches yet"} />}</CardContent></Card><Card className="border-l-2 border-l-primary"><CardHeader><CardTitle className="text-base">{mode === "boss" ? "Executive brief" : mode === "accountant" ? "Reconciliation status" : "Platform attention"}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{visible.length === 0 ? <p className="text-muted-foreground">Nothing needs attention.</p> : mode === "boss" ? <><div><p className="font-medium">Leading branch</p><p className="text-muted-foreground">{rankedBranches[0]?.store_name} · {fmtCurrency(rankedBranches[0]?.sales || 0)}</p></div><div className="border-l-2 border-amber-500 pl-3"><p className="font-medium">Exception watch</p><p className="text-muted-foreground">{rankedBranches.filter(branch => branch.expenses > branch.sales).length} branch{rankedBranches.filter(branch => branch.expenses > branch.sales).length === 1 ? "" : "es"} with expenses above sales</p></div><div className="border-l-2 border-emerald-600 pl-3"><p className="font-medium">Portfolio coverage</p><p className="text-muted-foreground">{visible.length} reporting branch{visible.length === 1 ? "" : "es"}</p></div></> : <><div className="border-l-2 border-amber-500 pl-3"><p className="font-medium">Settlement follow-up</p><p className="text-muted-foreground">{reconciliationExceptions.length} electronic item{reconciliationExceptions.length === 1 ? "" : "s"} over one day old</p></div><div className="border-l-2 border-primary pl-3"><p className="font-medium">Cash ledger</p><p className="text-muted-foreground">Cash sales: {fmtCurrency(totals.cash)}</p></div><div className="border-l-2 border-emerald-600 pl-3"><p className="font-medium">Scope</p><p className="text-muted-foreground">{visible.length} branch{visible.length === 1 ? "" : "es"} in this review</p></div></>}</CardContent></Card></div>
  <Card><CardHeader><CardTitle className="text-base">{mode === "master" ? "Businesses and branch health" : "Branch performance"}</CardTitle></CardHeader><CardContent className="overflow-x-auto">{visible.length ? <table className="w-full min-w-[620px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="pb-3 font-medium">Branch</th><th className="pb-3 font-medium">Sales</th><th className="pb-3 font-medium">Expenses</th><th className="pb-3 font-medium">Net</th><th className="pb-3 font-medium">Status</th></tr></thead><tbody>{visible.map(s => <tr key={s.id} className="border-b last:border-0"><td className="py-4 font-medium">{s.store_name}</td><td>{fmtCurrency(s.sales)}</td><td>{fmtCurrency(s.expenses)}</td><td className="font-medium">{fmtCurrency(s.sales - s.expenses)}</td><td><Badge variant="secondary" className="text-emerald-700">Reporting</Badge></td></tr>)}</tbody></table> : <Empty message={mode === "accountant" ? "Your administrator has not assigned a branch. Ask them to add your accountant access." : "Create a branch to start receiving consolidated reports."} />}</CardContent></Card>
  {mode === "accountant" && <Card className="border-l-2 border-l-amber-500"><CardHeader><CardTitle className="text-base">Settlement exceptions</CardTitle><p className="text-sm text-muted-foreground">Only electronic sales older than one day are shown. A settlement reference is not available in the current sales data.</p></CardHeader><CardContent className="overflow-x-auto">{reconciliationExceptions.length ? <table className="w-full min-w-[520px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="pb-3">Time</th><th className="pb-3">Branch</th><th className="pb-3">Method</th><th className="pb-3">Amount</th><th className="pb-3">Required review</th></tr></thead><tbody>{reconciliationExceptions.map(transaction => <tr key={transaction.id} className="border-b last:border-0"><td className="py-3">{new Date(transaction.created_at).toLocaleString()}</td><td>{stores.find(store => store.id === transaction.store_id)?.store_name || "Assigned branch"}</td><td>Electronic</td><td>{fmtCurrency(Number(transaction.total_amount || 0))}</td><td><Badge variant="secondary">Match settlement</Badge></td></tr>)}</tbody></table> : <Empty message={selected === "all" ? "No electronic settlement follow-ups in this reporting period." : "No settlement follow-ups for this branch."} />}</CardContent></Card>}
  </section>;
}

function Empty({ message }: { message: string }) { return <div className="flex h-full min-h-40 flex-col items-center justify-center text-center"><Building2 className="mb-3 h-8 w-8 text-muted-foreground" /><p className="max-w-sm text-sm text-muted-foreground">{message}</p></div>; }
