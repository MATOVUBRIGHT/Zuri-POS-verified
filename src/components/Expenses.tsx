import { useState, useRef, useMemo } from "react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import StatCard from "@/components/StatCard";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { ExpenseItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Trash2, Loader2, Upload, Image, Wallet, Camera,
  TrendingDown, Plus, Search, X, Calendar, Tag, FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAddExpenseOptimistic, useDeleteExpenseOptimistic } from "@/hooks/useOptimizedData";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import ExcelImport from "@/components/ExcelImport";

const expenseSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500),
  category: z.string().min(1, "Category is required"),
  amount: z.number().positive("Amount must be positive"),
  date: z.string().min(1, "Date is required"),
});

interface ExpensesProps {
  currentStoreId?: string | null;
  expensesData: ExpenseItem[];
  onAddExpense: (expense: ExpenseItem) => void;
  onDeleteExpense: (expenseId: string) => void;
  isLoading?: boolean;
}

const CATEGORIES = ["Transport","Utilities","Rent","Supplies","Marketing","Maintenance","Insurance","Petty Cash","Other"];
const PAYMENT_METHODS = ["Cash","Bank Transfer","Mobile Money","Cheque"];

const CATEGORY_COLORS: Record<string, string> = {
  Transport: "bg-blue-100 text-blue-700 border-blue-200",
  Utilities: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Rent: "bg-purple-100 text-purple-700 border-purple-200",
  Supplies: "bg-green-100 text-green-700 border-green-200",
  Marketing: "bg-pink-100 text-pink-700 border-pink-200",
  Maintenance: "bg-orange-100 text-orange-700 border-orange-200",
  Insurance: "bg-indigo-100 text-indigo-700 border-indigo-200",
  "Petty Cash": "bg-amber-100 text-amber-700 border-amber-200",
  Other: "bg-gray-100 text-gray-700 border-gray-200",
};

const emptyForm = {
  description: "", category: "", amount: "", paymentMethod: "",
  date: new Date().toISOString().split("T")[0], notes: "",
};

const Expenses = ({ currentStoreId, expensesData, onAddExpense, onDeleteExpense, isLoading = false }: ExpensesProps) => {
  const { toast } = useToast();
  const addExpenseMutation = useAddExpenseOptimistic();
  const deleteExpenseMutation = useDeleteExpenseOptimistic();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState(emptyForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [cardFilter, setCardFilter] = useState<"all" | "today" | "petty_cash">("all");
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false);
  const [mobileLink, setMobileLink] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const total = expensesData.reduce((s, e) => s + e.amount, 0);
    const todayTotal = expensesData.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0);
    const pettyCash = expensesData.filter(e => e.category === "Petty Cash").reduce((s, e) => s + e.amount, 0);
    const byCategory = CATEGORIES.map(c => ({
      name: c,
      total: expensesData.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0),
      count: expensesData.filter(e => e.category === c).length,
    })).filter(c => c.count > 0).sort((a, b) => b.total - a.total);
    return { total, todayTotal, pettyCash, count: expensesData.length, byCategory };
  }, [expensesData]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return expensesData
      .filter(e => filterCategory === "all" || e.category === filterCategory)
      .filter(e => {
        if (cardFilter === "today") return e.date === today;
        if (cardFilter === "petty_cash") return e.category === "Petty Cash";
        return true;
      })
      .filter(e => !q || e.description.toLowerCase().includes(q) || (e.category || "").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expensesData, searchTerm, filterCategory, cardFilter]);

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "File too large", description: "Max 5MB", variant: "destructive" }); return; }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = ev => setReceiptPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const amount = parseFloat(formData.amount) || 0;
    const v = expenseSchema.safeParse({ description: formData.description, category: formData.category, amount, date: formData.date });
    if (!v.success) { toast({ title: "Validation Error", description: v.error.errors.map(e => e.message).join(", "), variant: "destructive" }); return; }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      // Prefer the active branch (currentStoreId). Fall back: owned store →
      // then store_access for staff accounts that have no owned store.
      const storeId =
        currentStoreId ||
        (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id ||
        (await supabase.from("store_access").select("store_id").eq("user_id", user.id).limit(1)).data?.[0]?.store_id;
      if (!storeId) throw new Error("No store found");

      let receiptUrl: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop();
        const path = `${storeId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, receiptFile);
        if (!upErr) receiptUrl = path;
      }

      await addExpenseMutation.mutateAsync({
        user_id: user.id, store_id: storeId,
        description: formData.description, category: formData.category,
        amount, payment_method: formData.paymentMethod,
        date_of_expense: formData.date, receipt_url: receiptUrl,
      });

      if (String(formData.paymentMethod).toLowerCase().includes("cash")) {
        await supabase.from("cash_transactions").insert({
          user_id: user.id, store_id: storeId, amount,
          type: "out", description: `Expense: ${formData.description}`, account_type: "cash",
        }).then(() => {});
      }

      await logAudit({ action: "create", tableName: "expenses", newData: { description: formData.description, category: formData.category, amount }, storeId });
      onAddExpense({ id: "opt-" + Date.now(), description: formData.description, category: formData.category, amount, paymentMethod: formData.paymentMethod, date: formData.date, notes: formData.notes, createdAt: new Date().toISOString() });
      setFormData(emptyForm); setReceiptFile(null); setReceiptPreview(null);
      toast({ title: "✓ Expense recorded" });
      setAddOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setIsSubmitting(false); }
  };

  

  const generateMobileLink = async () => {
    // show dialog immediately with generating state
    setMobileLink(null);
    setMobileDialogOpen(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Login required to generate link');
      const storeId =
        currentStoreId ||
        (await supabase.from('stores').select('id').eq('user_id', user.id).limit(1)).data?.[0]?.id ||
        (await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1)).data?.[0]?.store_id;
      if (!storeId) throw new Error('No store found');

      // Secure token generation: prefer crypto.randomUUID, fallback to crypto.getRandomValues
      let token: string;
      try {
        if ((window as any).crypto && (window as any).crypto.randomUUID) token = (window as any).crypto.randomUUID();
        else if ((window as any).crypto && (window as any).crypto.getRandomValues) {
          const arr = new Uint8Array(16);
          (window as any).crypto.getRandomValues(arr);
          token = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
          token = String(Date.now()) + Math.random().toString(36).slice(2, 8);
        }
      } catch (e) { token = String(Date.now()) + Math.random().toString(36).slice(2, 8); }

      // Try to insert mobile_actions row; if table missing, fallback to link with params
      try {
        const payload = { action_type: 'expense_upload', store_id: storeId, token, payload: { description: formData.description || null }, expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString() };
        // Cast to `any` — mobile_actions is not in the generated types yet but the
        // table may exist at runtime. The surrounding try/catch handles the failure.
        const { error } = await (supabase as any).from('mobile_actions').insert(payload);
        if (error) throw error;
      } catch (e) {
        // ignore — fallback to a param-only link
      }

      // prefer a LAN-accessible host when running on localhost so phones can reach the dev server
      const origin = window.location.origin;
      const hostname = window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : "";

      const discoverLocalIP = async () => {
        try {
          const pc = new (window as any).RTCPeerConnection({ iceServers: [] });
          const ips = new Set();
          pc.createDataChannel('');
          pc.createOffer().then((sdp: any) => pc.setLocalDescription(sdp)).catch(() => {});
          return await new Promise<string | null>((resolve) => {
            const timeout = setTimeout(() => { try { pc.close(); } catch{}; resolve(null); }, 1500);
            pc.onicecandidate = (evt: any) => {
              if (!evt || !evt.candidate) return;
              const m = evt.candidate.candidate.match(/([0-9]{1,3}(?:\.[0-9]{1,3}){3})/);
              if (m) {
                const ip = m[1];
                if (!ip.startsWith('127.') && ip !== '0.0.0.0') {
                  ips.add(ip);
                  clearTimeout(timeout);
                  try { pc.close(); } catch {}
                  resolve(ip);
                }
              }
            };
          });
        } catch (e) { return null; }
      };

      let hostToUse = hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const ip = await discoverLocalIP();
        if (ip) hostToUse = ip; // use LAN ip so phone can reach dev server
      }

      const base = `${window.location.protocol}//${hostToUse}${port}`;
      const link = `${base}/mobile?token=${encodeURIComponent(token)}&store_id=${encodeURIComponent(storeId)}`;
      // add cache-busting timestamp to ensure QR image reloads
      setMobileLink(link + `&_ts=${Date.now()}`);
    } catch (err: any) {
      setMobileDialogOpen(false);
      toast({ title: 'Could not create mobile link', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await deleteExpenseMutation.mutateAsync(id);
      onDeleteExpense(id);
      toast({ title: "Expense deleted" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const showLoader = useMinimumLoading(isLoading, 350);
  if (showLoader) {
    return <PageLoader text="Loading expenses..." />;
  }

  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Receipt className="h-8 w-8 text-primary" />
            Expenses
          </h2>
          <p className="text-muted-foreground mt-1">Track and manage business expenditure</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExcelImport config={{
            title: "Import Expenses",
            fields: [
              { key: "description", label: "Description", required: true, type: "string" },
              { key: "category", label: "Category", type: "string", defaultValue: "Other" },
              { key: "amount", label: "Amount", type: "number", defaultValue: 0 },
              { key: "payment_method", label: "Payment Method", type: "string", defaultValue: "Cash" },
              { key: "date_of_expense", label: "Date", type: "date", defaultValue: new Date().toISOString().split("T")[0] },
            ],
            templateData: [{ "Description": "Office supplies", "Category": "Supplies", "Amount": 50000, "Payment Method": "Cash", "Date": "2026-03-09" }],
            onImport: async (rows) => {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error("Not authenticated");
              const storeId =
                currentStoreId ||
                (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id ||
                (await supabase.from("store_access").select("store_id").eq("user_id", user.id).limit(1)).data?.[0]?.store_id;
              if (!storeId) throw new Error("No store found");
              let success = 0; const errors: string[] = [];
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row.description) { errors.push(`Row ${i + 1}: Missing description`); continue; }
                const { error } = await supabase.from("expenses").insert({ store_id: storeId, user_id: user.id, description: String(row.description).trim(), category: String(row.category || "Other"), amount: Number(row.amount) || 0, payment_method: String(row.payment_method || "Cash"), date_of_expense: row.date_of_expense || new Date().toISOString().split("T")[0] });
                if (error) errors.push(`Row ${i + 1}: ${error.message}`); else success++;
              }
              return { success, errors };
            },
          }} />
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />Add Expense
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: "all" as const, label: "Total Expenses", value: fmtCurrency(stats.total), sub: `${stats.count} records`, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
          { key: "today" as const, label: "Today", value: fmtCurrency(stats.todayTotal), sub: `${expensesData.filter(e => e.date === today).length} records`, icon: Calendar, color: "text-amber-600", bg: "bg-amber-50" },
          { key: "petty_cash" as const, label: "Petty Cash", value: fmtCurrency(stats.pettyCash), sub: `${expensesData.filter(e => e.category === "Petty Cash").length} records`, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
          { key: "all" as const, label: "Total Records", value: stats.count, sub: "all expenses", icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
        ].map(({ key, label, value, sub, icon, color, bg }) => (
          <StatCard
            key={label}
            label={label}
            value={value}
            sub={cardFilter === key ? `showing ${filtered.length}` : sub}
            icon={icon}
            color={color}
            bg={bg}
            active={cardFilter === key && label !== "Total Records"}
            title={`Show ${label.toLowerCase()}`}
            onClick={() => setCardFilter((c) => (c === key ? "all" : key))}
          />
        ))}
      </div>

      {/* Category breakdown */}
      {stats.byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.byCategory.slice(0, 6).map(c => (
            <button key={c.name} onClick={() => setFilterCategory(filterCategory === c.name ? "all" : c.name)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${filterCategory === c.name ? "bg-primary text-primary-foreground border-primary" : `${CATEGORY_COLORS[c.name] || "bg-muted"} hover:opacity-80`}`}>
              <Tag className="h-3 w-3" />
              {c.name} · {fmtCurrency(c.total)}
            </button>
          ))}
          {filterCategory !== "all" && (
            <button onClick={() => setFilterCategory("all")} className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs text-muted-foreground hover:bg-muted">
              <X className="h-3 w-3" />Clear
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search expenses..." autoComplete="off" className="pl-9 pr-9 h-10" />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Expense list */}
        <ScrollArea className="min-h-0 flex-1" type="auto">
        <div className="space-y-4 pr-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">{searchTerm || filterCategory !== "all" ? "No expenses match your filter" : "No expenses recorded yet"}</p>
              {!searchTerm && filterCategory === "all" && (
                <Button className="mt-4" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" />Record First Expense</Button>
              )}
            </div>
          ) : filtered.map(expense => (
            <div key={expense.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{expense.description}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[expense.category] || "bg-muted text-muted-foreground"}`}>
                      {expense.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(expense.date)}{expense.paymentMethod ? ` · ${expense.paymentMethod}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-destructive">-{fmtCurrency(expense.amount)}</p>
                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(expense.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Add Expense Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Record Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input placeholder="e.g., Fuel for delivery" value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount ({getCurrencySymbol()}) *</Label>
                <Input type="number" step="0.01" placeholder="0" value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={formData.paymentMethod} onValueChange={v => setFormData({ ...formData, paymentMethod: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Optional notes..." value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} />
            </div>
            {/* Receipt */}
            <div className="space-y-1">
              <Label className="text-xs">Receipt (optional)</Label>
              <input type="file" ref={fileInputRef} accept="image/*" onChange={handleReceiptChange} className="hidden" />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />{receiptFile ? "Change" : "Upload"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generateMobileLink}>
                  <Camera className="h-3.5 w-3.5" />Scan with phone
                </Button>
                {receiptFile && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Image className="h-3.5 w-3.5" />{receiptFile.name}
                    <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              {receiptPreview && <img src={receiptPreview} alt="Receipt" className="mt-1 max-h-24 rounded-lg border object-cover" />}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording...</> : <><Plus className="h-4 w-4 mr-2" />Record Expense</>}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      
        {/* Mobile QR dialog */}
        <Dialog open={mobileDialogOpen} onOpenChange={setMobileDialogOpen}>
          <DialogContent className="max-w-sm text-center">
            <div className="py-4">
              <h3 className="font-semibold mb-2">Scan with your phone</h3>
              <p className="text-sm text-muted-foreground mb-3">Open this POS page on your phone to capture the receipt camera and upload directly.</p>
              {mobileLink ? (
                <div className="flex flex-col items-center gap-3">
                  <img alt="QR" src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(mobileLink)}`} />
                  <div className="text-xs break-all">{mobileLink}</div>
                  <div className="flex gap-2">
                    <Button onClick={() => { navigator.clipboard?.writeText(mobileLink); toast({ title: 'Copied' }); }}>Copy link</Button>
                    <Button onClick={() => { window.open(mobileLink, '_blank'); }}>Open</Button>
                  </div>
                  
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Generating link…</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default Expenses;
