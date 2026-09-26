import { useEffect, useMemo, useState } from "react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAppStateStore } from "@/store/appStateStore";
import { fmtCurrency, fmtCurrencyFor, getCurrencySymbol } from "@/lib/currency";
import { Users, Download, Plus, Receipt, Calendar, Clock, Eye, Building2 } from "lucide-react";
import ExcelImport from "@/components/ExcelImport";
import * as XLSX from "xlsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const emptyForm = { payee: "", amount: "", schedule_type: "salary", period: "monthly", month: "", notes: "" };

type BranchInfo = { name: string; currency: string };

type StatusFilter = "awaiting" | "all" | "done";

export default function ScheduledPayments({
  currentStoreId: propStoreId,
  executive = false,
  prefill,
}: {
  currentStoreId?: string | null;
  executive?: boolean;
  prefill?: { payee?: string; amount?: number | string; schedule_type?: string; period?: string; month?: string; notes?: string } | null;
}) {
  const { toast } = useToast();
  const selectedStoreId = useAppStateStore((s) => s.currentStoreId);
  const currentStoreId = propStoreId ?? selectedStoreId;
  const userRole = useAppStateStore((s) => s.userRole) || "owner";
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoading(loading, 350);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [branches, setBranches] = useState<Record<string, BranchInfo>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("awaiting");
  const [cardFilter, setCardFilter] = useState<string>("all");
  const [viewItem, setViewItem] = useState<any | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const canAuthorize = userRole === "accountant" || userRole === "admin" || userRole === "owner" || userRole === "boss";
  const canApprove = userRole === "owner" || userRole === "boss" || userRole === "admin";

  const load = async () => {
    setLoading(true);
    try {
      let query = (supabase as any).from('scheduled_payments').select('*').order('created_at', { ascending: false });
      // On a branch POS this is a precise branch query. In accountant/executive
      // workspaces the database RLS policy returns only assigned branches.
      if (currentStoreId) query = query.eq('store_id', currentStoreId);
      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Could not load scheduled payments', description: e?.message || String(e), variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const getStoreId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const owned = currentStoreId ? { data: [{ id: currentStoreId }] } : await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);
    const { data: access } = await supabase.from("store_access").select("store_id").eq("user_id", user.id).limit(1);
    return { storeId: currentStoreId || owned.data?.[0]?.id || access?.[0]?.store_id || null, userId: user.id };
  };

  useEffect(() => { void load(); }, [currentStoreId]);

  useEffect(() => {
    let saved = prefill;
    if (!saved) {
      try {
        saved = JSON.parse(localStorage.getItem("zuripos:supplier-payment-prefill") || "null");
        localStorage.removeItem("zuripos:supplier-payment-prefill");
      } catch { saved = null; }
    }
    if (!saved) return;
    setForm({
      ...emptyForm,
      payee: saved.payee || "",
      amount: saved.amount == null ? "" : String(saved.amount),
      schedule_type: saved.schedule_type || "supplier",
      period: saved.period || "once",
      month: saved.month || "",
      notes: saved.notes || "",
    });
    setAddOpen(true);
  }, [prefill]);

  // The executive queue spans every branch they oversee, so each payment is
  // labelled and formatted with the currency of the branch that raised it.
  useEffect(() => {
    if (!executive) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: storesError } = await (supabase.from("stores") as any)
          .select("id, store_name, currency");
        if (storesError) throw storesError;
        if (!active) return;
        const map: Record<string, BranchInfo> = {};
        for (const store of data || []) {
          map[store.id] = {
            name: store.store_name || "Unnamed branch",
            currency: (store.currency || "UGX").toUpperCase(),
          };
        }
        setBranches(map);
      } catch {
        if (active) setBranches({});
      }
    })();
    return () => { active = false; };
  }, [executive]);

  const amountFor = (item: any) => {
    const currency = branches[item.store_id]?.currency;
    return currency
      ? fmtCurrencyFor(Number(item.amount) || 0, currency)
      : fmtCurrency(Number(item.amount) || 0);
  };

  const branchLabel = (item: any) => branches[item.store_id]?.name || "Unassigned branch";


  const stats = useMemo(() => ({
    total: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    authorized: items.filter(i => i.status === 'authorized').length,
    approved: items.filter(i => i.status === 'approved' || i.status === 'paid').length,
    rejected: items.filter(i => i.status === 'rejected').length,
    totalValue: items.reduce((s, i) => s + (Number(i.amount) || 0), 0),
  }), [items]);

  const filtered = useMemo(() => {
    let rows = items;
    if (executive && statusFilter !== "all") {
      rows = rows.filter((i) =>
        statusFilter === "awaiting"
          ? i.status === "pending" || i.status === "authorized"
          : i.status === "approved" || i.status === "paid" || i.status === "rejected",
      );
    }
    // Stat cards narrow further by exact status.
    if (cardFilter !== "all") {
      rows = cardFilter === "awaiting"
        ? rows.filter((i) => i.status === "pending" || i.status === "authorized")
        : rows.filter((i) => i.status === cardFilter);
    }
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (i) =>
        (i.payee || "").toLowerCase().includes(q) ||
        (i.schedule_type || "").toLowerCase().includes(q) ||
        (executive && branchLabel(i).toLowerCase().includes(q)),
    );
  }, [items, searchTerm, executive, statusFilter, branches, cardFilter]);

  const performAction = async (id: string, status: string) => {
    setActioningId(id);
    try {
      const { userId } = await getStoreId();
      const payload: any = { status, updated_at: new Date().toISOString() };
      if (status === 'authorized') { payload.authorized_by = userId; payload.authorized_at = new Date().toISOString(); }
      if (status === 'approved' || status === 'paid') { payload.approved_by = userId; payload.approved_at = new Date().toISOString(); }
      if (status === 'rejected') { payload.rejected_by = userId; payload.rejected_at = new Date().toISOString(); }

      const { error } = await (supabase as any).from('scheduled_payments').update(payload).eq('id', id);
      if (error) throw error;
      toast({ title: 'Updated', description: `Payment marked ${status}` });
      setViewItem((current) => (current && current.id === id ? null : current));
      await load();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || String(e), variant: 'destructive' });
    } finally { setActioningId(null); }
  };

  const createPayment = async () => {
    if (!form.payee || !form.amount) return toast({ title: 'Invalid', description: 'Provide payee and amount', variant: 'destructive' });
    try {
      const { storeId, userId } = await getStoreId();
      const payload = {
        payee: form.payee,
        amount: Number(form.amount),
        schedule_type: form.schedule_type,
        period: form.period,
        month: form.month || null,
        notes: form.notes || null,
        status: 'pending',
        store_id: storeId || currentStoreId || null,
        created_at: new Date().toISOString(),
        created_by: userId,
      } as any;
      const { error } = await (supabase as any).from('scheduled_payments').insert(payload);
      if (error) throw error;
      toast({ title: 'Scheduled', description: 'Payment scheduled successfully.' });
      setForm(emptyForm); setAddOpen(false); await load();
    } catch (e: any) { toast({ title: 'Create failed', description: e?.message || String(e), variant: 'destructive' }); }
  };

  const exportPayments = () => {
    const rows = items.map(p => ({
      Payee: p.payee, Amount: p.amount, Type: p.schedule_type, Period: p.period, Month: p.month || '', Notes: p.notes || '',
      Status: p.status, CreatedAt: p.created_at, CreatedBy: p.created_by || '', AuthorizedBy: p.authorized_by || '', AuthorizedAt: p.authorized_at || '',
      ApprovedBy: p.approved_by || '', ApprovedAt: p.approved_at || '', RejectedBy: p.rejected_by || '', RejectedAt: p.rejected_at || '', StoreId: p.store_id || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "ScheduledPayments");
    XLSX.writeFile(wb, "scheduled_payments.xlsx");
  };

  const importConfig = {
    title: "Import Scheduled Payments",
    fields: [
      { key: "payee", label: "Payee", required: true, type: "string" as const },
      { key: "amount", label: "Amount", required: true, type: "number" as const },
      { key: "schedule_type", label: "Type", type: "string" as const },
      { key: "period", label: "Period", type: "string" as const },
      { key: "month", label: "Month", type: "string" as const },
      { key: "notes", label: "Notes", type: "string" as const },
    ],
    templateData: [{ Payee: "Supplier A", Amount: 1000, Type: "supplier", Period: "monthly", Month: "", Notes: "" }],
    onImport: async (rows: any[]) => {
      const { storeId, userId } = await getStoreId();
      if (!storeId) throw new Error("No store found");
      let success = 0; const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.payee || !row.amount) { errors.push(`Row ${i + 1}: Missing payee or amount`); continue; }
        const payload = {
          payee: String(row.payee).trim(), amount: Number(row.amount), schedule_type: row.schedule_type || 'other',
          period: row.period || 'once', month: row.month || null, notes: row.notes || null, status: 'pending',
          store_id: storeId, created_by: userId, created_at: new Date().toISOString()
        };
        const { error } = await (supabase as any).from('scheduled_payments').insert(payload);
        if (error) errors.push(`Row ${i + 1}: ${error.message}`); else success++;
      }
      await load(); return { success, errors };
    }
  };

  if (showLoader) {
    return <PageLoader text="Loading scheduled payments..." />;
  }
  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Receipt className="h-8 w-8 text-primary" />
            {executive ? "Payment Approvals" : "Scheduled Payments"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {executive
              ? "Payments raised by your accountants, waiting on your decision"
              : "Manage recurring and one-off supplier/staff payments"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportPayments}><Download className="h-4 w-4 mr-1" />Export</Button>
          {!executive && <ExcelImport config={importConfig} />}
          {!executive && (
            <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="h-4 w-4" />New schedule</Button>
          )}
        </div>
      </div>

      {executive && (
        <div className="flex flex-wrap gap-2">
          {([
            { key: "awaiting" as StatusFilter, label: "Awaiting your approval" },
            { key: "done" as StatusFilter, label: "Decided" },
            { key: "all" as StatusFilter, label: "All" },
          ]).map(({ key, label }) => {
            const count =
              key === "awaiting"
                ? items.filter((i) => i.status === "pending" || i.status === "authorized").length
                : key === "done"
                  ? items.filter((i) => i.status === "approved" || i.status === "paid" || i.status === "rejected").length
                  : items.length;
            return (
              <Button
                key={key}
                size="sm"
                variant={statusFilter === key ? "default" : "outline"}
                onClick={() => setStatusFilter(key)}
              >
                {label} ({count})
              </Button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(executive
          ? [
              { key: 'awaiting', label: 'Awaiting approval', value: stats.pending + stats.authorized, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
              { key: 'pending', label: 'Pending', value: stats.pending, icon: Receipt, color: 'text-blue-600', bg: 'bg-blue-50' },
              { key: 'authorized', label: 'Authorized', value: stats.authorized, icon: Calendar, color: 'text-sky-600', bg: 'bg-sky-50' },
              { key: 'approved', label: 'Approved', value: stats.approved, icon: Plus, color: 'text-emerald-600', bg: 'bg-green-50' },
            ]
          : [
              { key: 'all', label: 'Total', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
              { key: 'pending', label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
              { key: 'authorized', label: 'Authorized', value: stats.authorized, icon: Calendar, color: 'text-sky-600', bg: 'bg-sky-50' },
              { key: 'paid', label: 'Paid', value: stats.approved, icon: Plus, color: 'text-emerald-600', bg: 'bg-green-50' },
            ]).map(({ key, label, value, icon, color, bg }) => (
          <StatCard
            key={key}
            label={label}
            value={value}
            icon={icon}
            color={color}
            bg={bg}
            active={cardFilter === key}
            title={`Show ${label.toLowerCase()}`}
            onClick={() => setCardFilter((c) => (c === key ? 'all' : key))}
          />
        ))}
      </div>

      <div className="relative">
        <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={executive ? "Search by payee, type or branch..." : "Search by payee or type..."} className="pl-4 pr-9 h-10" />
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading scheduled payments...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">
            {executive
              ? statusFilter === "awaiting"
                ? "Nothing waiting on your approval"
                : "No scheduled payments"
              : "No scheduled payments"}
          </p>
          {!executive && <Button className="mt-4" onClick={() => setAddOpen(true)}>Create schedule</Button>}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1" type="auto">
          <div className="space-y-4 pr-4">
            {filtered.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-4 p-4 border rounded-xl hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
                    {item.payee?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold">{item.payee}</h4>
                      <Badge className="text-[10px] uppercase">{item.schedule_type}</Badge>
                      <span className="text-xs text-muted-foreground">{item.period}{item.month ? ` · ${item.month}` : ''}</span>
                      {executive && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {branchLabel(item)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                    <div className="flex gap-4 mt-1">
                      <div className="text-[10px] text-muted-foreground">Amount: <span className="font-bold text-emerald-600">{executive ? amountFor(item) : fmtCurrency(item.amount || 0)}</span></div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-start shrink-0">
                  <div className="text-right">
                    <p className="font-semibold">{executive ? amountFor(item) : fmtCurrency(item.amount || 0)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{item.status}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {executive ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setViewItem(item)}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                        <Button
                          size="sm"
                          disabled={item.status === 'approved' || item.status === 'paid' || actioningId === item.id}
                          onClick={() => performAction(item.id, 'approved')}
                        >
                          {actioningId === item.id ? 'Approving…' : 'Approve'}
                        </Button>
                      </>
                    ) : (
                      <>
                        {canAuthorize && item.status === 'pending' && <Button size="sm" onClick={() => performAction(item.id, 'authorized')}>Authorize</Button>}
                        {canApprove && (item.status === 'authorized' || item.status === 'pending') && <Button variant="secondary" size="sm" onClick={() => performAction(item.id, 'approved')}>Approve</Button>}
                        {item.status !== 'rejected' && <Button variant="ghost" size="sm" onClick={() => performAction(item.id, 'rejected')}>Reject</Button>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment details</DialogTitle>
            <DialogDescription>
              Raised by your accountant and awaiting your decision.
            </DialogDescription>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="min-w-0">
                  <p className="font-semibold">{viewItem.payee}</p>
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Building2 className="h-3 w-3" />
                    {branchLabel(viewItem)}
                  </p>
                </div>
                <p className="font-bold text-emerald-600">{amountFor(viewItem)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="capitalize">{viewItem.schedule_type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="capitalize">{viewItem.status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Period</p>
                  <p className="capitalize">{viewItem.period}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Month</p>
                  <p>{viewItem.month || "—"}</p>
                </div>
              </div>
              {viewItem.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="mt-1 break-words text-sm">{viewItem.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs text-muted-foreground">
                <div>
                  <p>Raised</p>
                  <p className="text-foreground">{new Date(viewItem.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p>Authorized</p>
                  <p className="text-foreground">
                    {viewItem.authorized_at ? new Date(viewItem.authorized_at).toLocaleString() : "Not yet"}
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={viewItem.status === 'approved' || viewItem.status === 'paid' || actioningId === viewItem.id}
                onClick={() => performAction(viewItem.id, 'approved')}
              >
                {viewItem.status === 'approved' || viewItem.status === 'paid'
                  ? 'Already approved'
                  : actioningId === viewItem.id
                    ? 'Approving…'
                    : 'Approve payment'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Create Scheduled Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label className="text-xs">Payee *</Label><Input value={form.payee} onChange={e => setForm({ ...form, payee: e.target.value })} className="mt-1" placeholder="Payee name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Amount</Label><Input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="mt-1" placeholder="0.00" /></div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.schedule_type} onValueChange={(v) => setForm({ ...form, schedule_type: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salary">Salary</SelectItem>
                    <SelectItem value="supplier">Pay suppliers</SelectItem>
                    <SelectItem value="rent">Rent</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Period</Label>
                <Select value={form.period} onValueChange={(v) => setForm({ ...form, period: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Period" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="once">Once</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Month (YYYY-MM)</Label><Input value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
            <Button onClick={createPayment} className="w-full">Schedule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
