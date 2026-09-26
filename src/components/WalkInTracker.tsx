import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatCard from "@/components/StatCard";

type VisitorType = "buyers" | "non_buyers";
type WalkInRow = { id: string; recorded_date: string; visitor_type: VisitorType; expat_female: number; expat_male: number; local_female: number; local_male: number };
type CountForm = { expat_female: string; expat_male: string; local_female: string; local_male: string };

const todayKey = () => new Date().toISOString().slice(0, 10);
const blankForm: CountForm = { expat_female: "0", expat_male: "0", local_female: "0", local_male: "0" };
const totalRow = (row: Pick<WalkInRow, "expat_female" | "expat_male" | "local_female" | "local_male">) => row.expat_female + row.expat_male + row.local_female + row.local_male;

export default function WalkInTracker({ currentStoreId, showTrigger = true }: { currentStoreId?: string | null; showTrigger?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WalkInRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedDate, setRecordedDate] = useState(todayKey);
  const [visitorType, setVisitorType] = useState<VisitorType>("buyers");
  const [form, setForm] = useState<CountForm>(blankForm);
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [sortBy, setSortBy] = useState<"date" | "most">("date");
  const [reportDate, setReportDate] = useState(todayKey);

  const load = async () => {
    if (!currentStoreId) return;
    setLoading(true);
    const { data, error } = await (supabase.from("walkin_counts" as any) as any)
      .select("id, recorded_date, visitor_type, expat_female, expat_male, local_female, local_male")
      .eq("store_id", currentStoreId).order("recorded_date", { ascending: false });
    if (error) toast({ title: "Could not load walk-ins", description: error.message, variant: "destructive" });
    else setRows((data || []) as WalkInRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [currentStoreId]);

  const filteredRows = useMemo(() => {
    const end = new Date(`${reportDate}T23:59:59`);
    const start = new Date(end);
    start.setDate(start.getDate() - (period === "week" ? 6 : 29));
    return rows.filter(row => { const date = new Date(`${row.recorded_date}T12:00:00`); return date >= start && date <= end; }).sort((a, b) => sortBy === "most" ? totalRow(b) - totalRow(a) : b.recorded_date.localeCompare(a.recorded_date));
  }, [rows, reportDate, period, sortBy]);
  const buyersRows = filteredRows.filter(row => row.visitor_type === "buyers");
  const totalWalkins = filteredRows.reduce((sum, row) => sum + totalRow(row), 0);
  const totalBuyers = buyersRows.reduce((sum, row) => sum + totalRow(row), 0);
  const mostBuyers = buyersRows.reduce<WalkInRow | null>((best, row) => !best || totalRow(row) > totalRow(best) ? row : best, null);
  const formTotal = Object.values(form).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);

  const recordWalkIn = async () => {
    if (!currentStoreId) return;
    const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Math.max(0, Math.round(Number(value) || 0))]));
    setRecording(true);
    const { data, error } = await (supabase.from("walkin_counts" as any) as any).insert({ store_id: currentStoreId, recorded_date: recordedDate, visitor_type: visitorType, ...values }).select("id, recorded_date, visitor_type, expat_female, expat_male, local_female, local_male").single();
    setRecording(false);
    if (error) { toast({ title: "Could not record walk-ins", description: error.message, variant: "destructive" }); return; }
    setRows(current => [data as WalkInRow, ...current]);
    setForm(blankForm);
    toast({ title: "Walk-ins recorded", description: `${formTotal} ${visitorType === "buyers" ? "buyers" : "non-buyers"} saved for ${recordedDate}.` });
  };

  const labels = visitorType === "buyers"
    ? ["Expat Female buyer", "Expat Male buyer", "Local Female buyer", "Local Male buyer"]
    : ["Expat Female", "Expat Male", "Local Female", "Local Male"];
  const keys: Array<keyof CountForm> = ["expat_female", "expat_male", "local_female", "local_male"];

  return <>
    {showTrigger && <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}><ClipboardList className="h-4 w-4" />Walk-ins</Button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Walk-in visitors</DialogTitle><DialogDescription>Record buyers and non-buyers by date, then review weekly or monthly totals.</DialogDescription></DialogHeader>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Period total" value={totalWalkins} sub={period === "week" ? "this week" : "this month"} icon={Users} color="text-primary" bg="bg-primary/10" /><StatCard label="Buyers" value={totalBuyers} sub="buyer walk-ins" icon={Check} color="text-primary" bg="bg-primary/10" /><StatCard label="Non-buyers" value={totalWalkins - totalBuyers} sub="no-sale walk-ins" icon={ClipboardList} color="text-amber-600" bg="bg-amber-50" /><StatCard label="Most buyers" value={mostBuyers ? totalRow(mostBuyers) : 0} sub={mostBuyers?.recorded_date || "No buyer records"} icon={Users} color="text-primary" bg="bg-primary/10" /></div>
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"><div className="space-y-2"><Label>Report date</Label><Input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} /></div><Select value={period} onValueChange={value => setPeriod(value as "week" | "month")}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="week">Weekly</SelectItem><SelectItem value="month">Monthly</SelectItem></SelectContent></Select><Select value={sortBy} onValueChange={value => setSortBy(value as "date" | "most")}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date">Sort by date</SelectItem><SelectItem value="most">Most visitors</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
        <Card className="border-primary/15"><CardHeader className="bg-primary/5 pb-3"><CardTitle className="text-base">Record walk-in</CardTitle></CardHeader><CardContent className="space-y-4 pt-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Date</Label><Input type="date" value={recordedDate} onChange={event => setRecordedDate(event.target.value)} /></div><div className="space-y-2"><Label>Visitor group</Label><Select value={visitorType} onValueChange={value => setVisitorType(value as VisitorType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="buyers">Buyers</SelectItem><SelectItem value="non_buyers">No sales / non-buyers</SelectItem></SelectContent></Select></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{keys.map((key, index) => <div className="space-y-2" key={key}><Label>{labels[index]}</Label><Input type="number" min="0" value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></div>)}</div><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/5 px-4 py-3"><span className="text-sm text-muted-foreground">Total {visitorType === "buyers" ? "buyers" : "non-buyers"}</span><span className="text-xl font-bold text-primary">{formTotal}</span><Button onClick={() => void recordWalkIn()} disabled={recording || !currentStoreId}>{recording ? "Recording..." : "Record walk-in"}</Button></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Walk-in records</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="pb-3">Date</th><th className="pb-3">Type</th><th className="pb-3 text-right">Expat F</th><th className="pb-3 text-right">Expat M</th><th className="pb-3 text-right">Local F</th><th className="pb-3 text-right">Local M</th><th className="pb-3 text-right">Total</th></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id} className="border-b last:border-0"><td className="py-3">{row.recorded_date}</td><td className="capitalize">{row.visitor_type === "buyers" ? "Buyers" : "No sales"}</td><td className="text-right">{row.expat_female}</td><td className="text-right">{row.expat_male}</td><td className="text-right">{row.local_female}</td><td className="text-right">{row.local_male}</td><td className="text-right font-bold">{totalRow(row)}</td></tr>)}</tbody></table>{!filteredRows.length && <p className="py-8 text-center text-sm text-muted-foreground">No walk-in records for this period.</p>}</CardContent></Card>
      </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

export function WalkInPortfolioSummary({ storeIds }: { storeIds: string[] }) {
  const [rows, setRows] = useState<WalkInRow[]>([]);
  useEffect(() => {
    if (!storeIds.length) { setRows([]); return; }
    void (async () => {
      const { data } = await (supabase.from("walkin_counts" as any) as any)
        .select("id, recorded_date, visitor_type, expat_female, expat_male, local_female, local_male")
        .in("store_id", storeIds);
      setRows((data || []) as WalkInRow[]);
    })();
  }, [storeIds.join(",")]);
  const total = rows.reduce((sum, row) => sum + totalRow(row), 0);
  const buyers = rows.filter(row => row.visitor_type === "buyers").reduce((sum, row) => sum + totalRow(row), 0);
  return <Card className="border-primary/20 bg-primary/5"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" />Walk-in visitors</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Total visitors</p><p className="mt-1 text-2xl font-bold text-primary">{total.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Buyers</p><p className="mt-1 text-2xl font-bold">{buyers.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">No-sale visits</p><p className="mt-1 text-2xl font-bold">{(total - buyers).toLocaleString()}</p></div></CardContent></Card>;
}
