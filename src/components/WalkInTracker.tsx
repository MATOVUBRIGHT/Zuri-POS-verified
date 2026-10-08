import { useEffect, useMemo, useRef, useState } from "react";
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
type Counts = { expat_female: number; expat_male: number; local_female: number; local_male: number };
type WalkInRow = Counts & { id: string; recorded_date: string; visitor_type: VisitorType };
type CountForm = Record<keyof Counts, string>;

const KEYS: Array<keyof Counts> = ["expat_female", "expat_male", "local_female", "local_male"];
const LABELS: Record<keyof Counts, string> = {
  expat_female: "Expat female",
  expat_male: "Expat male",
  local_female: "Local female",
  local_male: "Local male",
};

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const blankForm = (): CountForm => ({ expat_female: "0", expat_male: "0", local_female: "0", local_male: "0" });
const emptyCounts = (): Counts => ({ expat_female: 0, expat_male: 0, local_female: 0, local_male: 0 });
const sumCounts = (counts: Counts) => KEYS.reduce((sum, key) => sum + (Number(counts[key]) || 0), 0);
const toForm = (counts: Counts): CountForm => ({
  expat_female: String(counts.expat_female || 0),
  expat_male: String(counts.expat_male || 0),
  local_female: String(counts.local_female || 0),
  local_male: String(counts.local_male || 0),
});
const formTotal = (form: CountForm) => sumCounts({
  expat_female: Math.max(0, Number(form.expat_female) || 0),
  expat_male: Math.max(0, Number(form.expat_male) || 0),
  local_female: Math.max(0, Number(form.local_female) || 0),
  local_male: Math.max(0, Number(form.local_male) || 0),
});
const shiftDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

export default function WalkInTracker({ currentStoreId, showTrigger = true }: { currentStoreId?: string | null; showTrigger?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WalkInRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Walk-ins are always captured and reviewed per day.
  const [reportDate, setReportDate] = useState(todayKey);
  const [recordedDate, setRecordedDate] = useState(todayKey);
  const [recentDays, setRecentDays] = useState("14");

  // Buyers and no-sale visitors are entered side by side in one form, so a day
  // is recorded with a single save instead of switching a dropdown and
  // submitting twice.
  const [buyersForm, setBuyersForm] = useState<CountForm>(blankForm);
  const [nonBuyersForm, setNonBuyersForm] = useState<CountForm>(blankForm);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  // Bounded to the recent window this dialog can actually display. An earlier
// version loaded every walk-in row the branch had ever recorded, which grows
// without limit and is pure waste against the free-tier quota.
const RECENT_WINDOW_DAYS = 180;

const load = async () => {
    if (!currentStoreId) return;
    setLoading(true);
    const from = shiftDays(todayKey(), -RECENT_WINDOW_DAYS);
    const { data, error } = await (supabase.from("walkin_counts" as any) as any)
      .select("id, recorded_date, visitor_type, expat_female, expat_male, local_female, local_male")
      .eq("store_id", currentStoreId).gte("recorded_date", from).order("recorded_date", { ascending: false });
    if (error) toast({ title: "Could not load walk-ins", description: error.message, variant: "destructive" });
    else setRows((data || []) as WalkInRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [currentStoreId]);

  // Collapse every stored row into one entry per day. Multiple rows for the same
  // day (legacy appends) are summed rather than listed separately.
  const days = useMemo(() => {
    const map = new Map<string, { buyers: Counts; non_buyers: Counts }>();
    for (const row of rows) {
      const entry = map.get(row.recorded_date) ?? { buyers: emptyCounts(), non_buyers: emptyCounts() };
      const target = row.visitor_type === "buyers" ? entry.buyers : entry.non_buyers;
      for (const key of KEYS) target[key] += row[key] || 0;
      map.set(row.recorded_date, entry);
    }
    return [...map.entries()]
      .map(([date, value]) => {
        const buyersTotal = sumCounts(value.buyers);
        const nonBuyersTotal = sumCounts(value.non_buyers);
        return { date, ...value, buyersTotal, nonBuyersTotal, total: buyersTotal + nonBuyersTotal };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  const selectedDay = days.find(day => day.date === recordedDate);
  const hasSavedDay = Boolean(selectedDay);

  // Load the stored figures for the selected day into the form. Guarded by a
  // dirty flag so a background load never overwrites figures being typed.
  useEffect(() => {
    if (dirtyRef.current) return;
    const day = days.find(entry => entry.date === recordedDate);
    setBuyersForm(toForm(day?.buyers ?? emptyCounts()));
    setNonBuyersForm(toForm(day?.non_buyers ?? emptyCounts()));
    setDirty(false);
  }, [recordedDate, days]);

  const recent = useMemo(() => {
    const span = Number(recentDays) || 14;
    const from = shiftDays(reportDate, -(span - 1));
    return days.filter(day => day.date >= from && day.date <= reportDate);
  }, [days, reportDate, recentDays]);

  const dayTotals = useMemo(() => recent.reduce(
    (acc, day) => ({
      buyers: acc.buyers + day.buyersTotal,
      nonBuyers: acc.nonBuyers + day.nonBuyersTotal,
      total: acc.total + day.total,
    }),
    { buyers: 0, nonBuyers: 0, total: 0 },
  ), [recent]);

  const updateForm = (setter: typeof setBuyersForm) => (key: keyof Counts) => (value: string) => {
    dirtyRef.current = true;
    setDirty(true);
    setter(current => ({ ...current, [key]: value }));
  };
  const setBuyerField = updateForm(setBuyersForm);
  const setNonBuyerField = updateForm(setNonBuyersForm);

  const jumpToDay = (date: string) => {
    setReportDate(date);
    setRecordedDate(date);
    dirtyRef.current = false;
    setDirty(false);
  };

  // One row per group per day: replace that group's rows for the chosen date
  // instead of appending, so re-saving a day corrects it instead of inflating it.
  const saveDay = async () => {
    if (!currentStoreId) return;
    const groups: Array<{ type: VisitorType; form: CountForm }> = [
      { type: "buyers", form: buyersForm },
      { type: "non_buyers", form: nonBuyersForm },
    ];
    const buyersTotal = formTotal(buyersForm);
    const nonBuyersTotal = formTotal(nonBuyersForm);
    if (buyersTotal === 0 && nonBuyersTotal === 0) {
      toast({ title: "Nothing to save", description: "Enter at least one walk-in figure.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      for (const group of groups) {
        const values = Object.fromEntries(
          KEYS.map(key => [key, Math.max(0, Math.round(Number(group.form[key]) || 0))]),
        ) as Counts;
        const total = sumCounts(values);

        const { error: deleteError } = await (supabase.from("walkin_counts" as any) as any)
          .delete().eq("store_id", currentStoreId).eq("recorded_date", recordedDate).eq("visitor_type", group.type);
        if (deleteError) throw deleteError;

        if (total > 0) {
          const { error: insertError } = await (supabase.from("walkin_counts" as any) as any)
            .insert({ store_id: currentStoreId, recorded_date: recordedDate, visitor_type: group.type, ...values });
          if (insertError) throw insertError;
        }
      }

      await load();
      dirtyRef.current = false;
      setDirty(false);
      toast({
        title: hasSavedDay ? "Walk-ins updated" : "Walk-ins recorded",
        description: `${buyersTotal + nonBuyersTotal} visitors saved for ${recordedDate}.`,
      });
    } catch (error: any) {
      toast({ title: "Could not save walk-ins", description: error?.message ?? String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const renderGroup = (
    title: string,
    hint: string,
    form: CountForm,
    setField: (key: keyof Counts) => (value: string) => void,
  ) => (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="text-lg font-bold text-primary">{formTotal(form)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KEYS.map(key => (
          <div className="space-y-2" key={key}>
            <Label className="text-xs">{LABELS[key]}</Label>
            <Input type="number" min="0" inputMode="numeric" value={form[key]} onChange={event => setField(key)(event.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );

  const overallTotal = formTotal(buyersForm) + formTotal(nonBuyersForm);

  return <>
    {showTrigger && <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}><ClipboardList className="h-4 w-4" />Walk-ins</Button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Walk-in visitors</DialogTitle><DialogDescription>Enter buyers and no-sale visitors for each day, and review any recent date.</DialogDescription></DialogHeader>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Visitors" value={dayTotals.total} sub={`last ${recentDays} days`} icon={Users} color="text-primary" bg="bg-primary/10" />
          <StatCard label="Buyers" value={dayTotals.buyers} sub="made a purchase" icon={Check} color="text-primary" bg="bg-primary/10" />
          <StatCard label="No sales" value={dayTotals.nonBuyers} sub="no purchase" icon={ClipboardList} color="text-amber-600" bg="bg-amber-50" />
          <StatCard label="Buyers share" value={dayTotals.total ? `${Math.round((dayTotals.buyers / dayTotals.total) * 100)}%` : "0%"} sub="of all visitors" icon={Users} color="text-primary" bg="bg-primary/10" />
        </div>

        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-2"><Label>Find a day</Label><Input type="date" value={reportDate} max={todayKey()} onChange={event => { setReportDate(event.target.value); jumpToDay(event.target.value); }} /></div>
          <div className="space-y-2"><Label>Show</Label><Select value={recentDays} onValueChange={setRecentDays}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="14">Last 14 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => jumpToDay(todayKey())}>Today</Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
        </div>

        <Card className="border-primary/15">
          <CardHeader className="bg-primary/5 pb-3"><CardTitle className="text-base">Record a day</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Day</Label><Input type="date" value={recordedDate} max={todayKey()} onChange={event => { setRecordedDate(event.target.value); setReportDate(event.target.value); }} /></div>
              <div className="space-y-2"><Label>Status</Label><div className="flex h-9 items-center text-sm text-muted-foreground">{hasSavedDay ? "Already recorded — saving replaces this day" : "Not recorded yet"}</div></div>
            </div>
            {renderGroup("Buyers", "Walk-ins who made a purchase", buyersForm, setBuyerField)}
            {renderGroup("No sales", "Walk-ins who did not purchase", nonBuyersForm, setNonBuyerField)}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/5 px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Overall total{dirty ? " (unsaved)" : ""}</span>
              <span className="text-2xl font-bold text-primary">{overallTotal}</span>
              <Button onClick={() => void saveDay()} disabled={saving || !currentStoreId}>{saving ? "Saving..." : hasSavedDay ? "Update day" : "Save day"}</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Daily walk-ins</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="pb-3">Day</th>
                  <th className="pb-3 text-right">Expat F</th>
                  <th className="pb-3 text-right">Expat M</th>
                  <th className="pb-3 text-right">Local F</th>
                  <th className="pb-3 text-right">Local M</th>
                  <th className="pb-3 text-right">Buyers</th>
                  <th className="pb-3 text-right">No sales</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {recent.map(day => <tr key={day.date} className="border-b last:border-0">
                  <td className="py-3 font-medium">{day.date}</td>
                  <td className="text-right">{day.buyers.expat_female + day.non_buyers.expat_female}</td>
                  <td className="text-right">{day.buyers.expat_male + day.non_buyers.expat_male}</td>
                  <td className="text-right">{day.buyers.local_female + day.non_buyers.local_female}</td>
                  <td className="text-right">{day.buyers.local_male + day.non_buyers.local_male}</td>
                  <td className="text-right">{day.buyersTotal}</td>
                  <td className="text-right">{day.nonBuyersTotal}</td>
                  <td className="text-right font-bold">{day.total}</td>
                  <td className="text-right"><Button variant="ghost" size="sm" onClick={() => jumpToDay(day.date)}>Open</Button></td>
                </tr>)}
              </tbody>
            </table>
            {!recent.length && <p className="py-8 text-center text-sm text-muted-foreground">No walk-ins recorded in this range.</p>}
          </CardContent>
        </Card>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
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
  const total = rows.reduce((sum, row) => sum + sumCounts(row), 0);
  const buyers = rows.filter(row => row.visitor_type === "buyers").reduce((sum, row) => sum + sumCounts(row), 0);
  return <Card className="border-primary/20 bg-primary/5"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" />Walk-in visitors</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Total visitors</p><p className="mt-1 text-2xl font-bold text-primary">{total.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Buyers</p><p className="mt-1 text-2xl font-bold">{buyers.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">No-sale visits</p><p className="mt-1 text-2xl font-bold">{(total - buyers).toLocaleString()}</p></div></CardContent></Card>;
}