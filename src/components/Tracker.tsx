import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Download, Search, Folder, ChevronDown, ChevronRight, ArrowUpDown,
  Receipt, FileSpreadsheet, Landmark, Layers, Plus, Upload, Eye, Trash2, Pencil,
} from "lucide-react";
import { fmtCurrency } from "@/lib/currency";
import ExcelImport from "@/components/ExcelImport";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import { useAppStateStore } from "@/store/appStateStore";

type Kind = "receipt" | "invoice" | "statement";
type Category = "all" | Kind;

const BUCKET = "receipts";
const KINDS: Kind[] = ["receipt", "invoice", "statement"];

const STATUSES = ["filed", "pending", "paid", "overdue", "void"] as const;

interface Doc {
  id: string;
  kind: Kind;
  title: string;
  reference: string | null;
  payee: string | null;
  amount: number | null;
  notes: string | null;
  status: string;
  document_date: string;
  account_name: string | null;
  account_type: string | null;
  period_start: string | null;
  period_end: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** "YYYY-MM" sorts chronologically as a plain string, so month order is free. */
const monthKeyOf = (dateStr?: string | null) => (dateStr || "").slice(0, 7) || "unknown";

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return "Unfiled";
  return new Date(y, m - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
};

const kindMeta: Record<Kind, { label: string; icon: typeof Receipt; color: string; bg: string }> = {
  receipt: { label: "Receipts", icon: Receipt, color: "text-amber-600", bg: "bg-amber-50" },
  invoice: { label: "Invoices", icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
  statement: { label: "Statements", icon: Landmark, color: "text-purple-600", bg: "bg-purple-50" },
};

const isImage = (t?: string | null) => !!t && t.startsWith("image/");
const isPdf = (t?: string | null) => !!t && (t === "application/pdf" || t.endsWith(".pdf"));

const formatBytes = (n?: number | null) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const Tracker = () => {
  const { toast } = useToast();
  const currentStoreId = useAppStateStore((s) => s.currentStoreId);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoading(loading, 350);

  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [form, setForm] = useState({
    kind: "receipt" as Kind,
    title: "",
    reference: "",
    payee: "",
    amount: "",
    notes: "",
    status: "filed",
    document_date: today(),
    account_name: "",
    account_type: "",
    period_start: "",
    period_end: "",
  });

  const [preview, setPreview] = useState<{ doc: Doc; url: string } | null>(null);

  const load = useCallback(async () => {
    if (!currentStoreId) {
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tracker_documents")
        .select("*")
        .eq("store_id", currentStoreId)
        .order("document_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDocs((data as Doc[]) || []);
    } catch (e: any) {
      toast({
        title: "Could not load documents",
        description: e?.message || String(e),
        variant: "destructive",
      });
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { receipt: 0, invoice: 0, statement: 0 };
    docs.forEach((d) => {
      if (c[d.kind] !== undefined) c[d.kind] += 1;
    });
    return { all: docs.length, ...c } as Record<Category, number>;
  }, [docs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (category !== "all" && d.kind !== category) return false;
      if (!q) return true;
      return [d.id, d.title, d.reference, d.payee, d.notes, d.account_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [docs, category, query]);

  const months = useMemo(() => {
    const groups: Record<string, Doc[]> = {};
    filtered.forEach((d) => {
      const k = monthKeyOf(d.document_date);
      (groups[k] ||= []).push(d);
    });
    const dir = sortOrder === "desc" ? -1 : 1;
    return Object.keys(groups)
      .sort((a, b) => (a < b ? -dir : a > b ? dir : 0))
      .map((key) => ({
        key,
        label: monthLabel(key),
        total: groups[key].reduce((s, d) => s + Number(d.amount || 0), 0),
        items: groups[key].sort((a, b) => {
          const ta = new Date(a.document_date).getTime();
          const tb = new Date(b.document_date).getTime();
          return sortOrder === "desc" ? tb - ta : ta - tb;
        }),
      }));
  }, [filtered, sortOrder]);

  const totalValue = useMemo(
    () => filtered.reduce((s, d) => s + Number(d.amount || 0), 0),
    [filtered],
  );

  // ---- file access -------------------------------------------------------
  // The bucket is private, so public URLs are useless here: everything goes
  // through a short-lived signed URL.
  const signedUrl = async (doc: Doc) => {
    if (!doc.file_path) throw new Error("This document has no file attached");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 300);
    if (error) throw error;
    return data.signedUrl;
  };

  const handleView = async (doc: Doc) => {
    try {
      setPreview({ doc, url: await signedUrl(doc) });
    } catch (e: any) {
      toast({ title: "Preview failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const handleDownload = async (doc: Doc) => {
    try {
      const url = await signedUrl(doc);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = doc.file_name || doc.title || "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  // ---- create / update ---------------------------------------------------
  const resetForm = () => {
    setEditing(null);
    setPicked(null);
    setForm({
      kind: "receipt",
      title: "",
      reference: "",
      payee: "",
      amount: "",
      notes: "",
      status: "filed",
      document_date: today(),
      account_name: "",
      account_type: "",
      period_start: "",
      period_end: "",
    });
  };

  const openNew = (kind: Kind = "receipt") => {
    resetForm();
    setForm((f) => ({ ...f, kind }));
    setFormOpen(true);
  };

  const openEdit = (doc: Doc) => {
    setEditing(doc);
    setPicked(null);
    setForm({
      kind: doc.kind,
      title: doc.title || "",
      reference: doc.reference || "",
      payee: doc.payee || "",
      amount: doc.amount != null ? String(doc.amount) : "",
      notes: doc.notes || "",
      status: doc.status || "filed",
      document_date: doc.document_date || today(),
      account_name: doc.account_name || "",
      account_type: doc.account_type || "",
      period_start: doc.period_start || "",
      period_end: doc.period_end || "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!currentStoreId) {
      return toast({ title: "No branch selected", variant: "destructive" });
    }
    if (!form.title.trim()) {
      return toast({ title: "Title is required", variant: "destructive" });
    }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let file_path: string | null = editing?.file_path ?? null;
      let file_name: string | null = editing?.file_name ?? null;
      let file_type: string | null = editing?.file_type ?? null;
      let file_size: number | null = editing?.file_size ?? null;

      if (picked) {
        const safe = picked.name.replace(/[^\w.\-]+/g, "_");
        const path = `tracker/${currentStoreId}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, picked);
        if (upErr) throw upErr;
        file_path = path;
        file_name = picked.name;
        file_type = picked.type || null;
        file_size = picked.size;
      }

      const payload = {
        store_id: currentStoreId,
        user_id: user?.id ?? null,
        kind: form.kind,
        title: form.title.trim(),
        reference: form.reference.trim() || null,
        payee: form.payee.trim() || null,
        amount: form.amount === "" ? null : Number(form.amount),
        notes: form.notes.trim() || null,
        status: form.status,
        document_date: form.document_date || today(),
        account_name: form.kind === "statement" ? form.account_name.trim() || null : null,
        account_type: form.kind === "statement" ? form.account_type.trim() || null : null,
        period_start: form.kind === "statement" && form.period_start ? form.period_start : null,
        period_end: form.kind === "statement" && form.period_end ? form.period_end : null,
        file_path,
        file_name,
        file_type,
        file_size,
      };

      if (editing) {
        // Update the row, and drop the file we are replacing so it does not linger.
        const { error } = await supabase.from("tracker_documents").update(payload).eq("id", editing.id);
        if (error) throw error;
        if (picked && editing.file_path) {
          await supabase.storage.from(BUCKET).remove([editing.file_path]);
        }
        toast({ title: "Document updated" });
      } else {
        const { error } = await supabase.from("tracker_documents").insert(payload);
        if (error) throw error;
        toast({ title: "Document filed" });
      }

      setFormOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (doc: Doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("tracker_documents").delete().eq("id", doc.id);
      if (error) throw error;
      if (doc.file_path) await supabase.storage.from(BUCKET).remove([doc.file_path]);
      toast({ title: "Document deleted" });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const exportRows = (rows: Doc[], name: string) => {
    if (!rows.length) return toast({ title: "Nothing to export", variant: "destructive" });
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        Title: r.title,
        Kind: r.kind,
        Reference: r.reference,
        Payee: r.payee,
        Amount: r.amount,
        Status: r.status,
        Date: r.document_date,
        Account: r.account_name,
        File: r.file_name,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    XLSX.writeFile(wb, `${name}.xlsx`);
  };

  const importConfig = {
    title: "File documents",
    fields: [
      { key: "title", label: "Title", required: true, type: "string" as const },
      { key: "kind", label: "Kind (receipt/invoice/statement)", type: "string" as const },
      { key: "amount", label: "Amount", type: "number" as const },
      { key: "document_date", label: "Date", type: "date" as const },
    ],
    templateData: [{ Title: "January bank statement", Kind: "statement", Amount: 0, Date: today() }],
    onImport: async (rows: any[]) => {
      if (!currentStoreId) return { success: 0, errors: ["No branch selected"] };
      const { data: { user } } = await supabase.auth.getUser();
      let success = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any;
        const kind: Kind = KINDS.includes(row.kind) ? row.kind : "receipt";
        const { error } = await supabase.from("tracker_documents").insert({
          store_id: currentStoreId,
          user_id: user?.id ?? null,
          kind,
          title: String(row.title || `Document ${i + 1}`),
          amount: row.amount === undefined || row.amount === "" ? null : Number(row.amount),
          document_date: row.document_date || today(),
        });
        if (error) errors.push(`Row ${i + 1}: ${error.message}`);
        else success++;
      }
      await load();
      return { success, errors };
    },
  };

  if (showLoader) return <PageLoader text="Loading tracker..." />;

  if (!currentStoreId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Folder className="h-10 w-10" />
        <p>Select a branch to view its documents.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Tracker
          </h2>
          <p className="text-muted-foreground">Receipts, invoices and account statements, filed by month</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSortOrder((s) => (s === "desc" ? "asc" : "desc"))} title="Toggle sort order" className="gap-2">
            <ArrowUpDown className="h-4 w-4" />
            {sortOrder === "desc" ? "Newest" : "Oldest"}
          </Button>
          <Button variant="outline" onClick={() => exportRows(filtered, category === "all" ? "all-documents" : category)} className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <ExcelImport config={importConfig} />
          <Button onClick={() => openNew(category === "all" ? "receipt" : category)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Document
          </Button>
        </div>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        {([
          { key: "all" as Category, label: "All Documents", icon: Layers, color: "text-slate-700", bg: "bg-slate-100" },
          { key: "receipt" as Category, ...kindMeta.receipt },
          { key: "invoice" as Category, ...kindMeta.invoice },
          { key: "statement" as Category, ...kindMeta.statement },
        ]).map(({ key, label, icon, color, bg }) => (
          <StatCard
            key={key}
            label={label}
            value={counts[key] ?? 0}
            sub={category === key ? `${filtered.length} shown` : undefined}
            icon={icon}
            color={color}
            bg={bg}
            active={category === key}
            title={`Show ${label.toLowerCase()}`}
            onClick={() => setCategory(key)}
          />
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={`Search ${category === "all" ? "documents" : category} by title, reference, or ID...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          {filtered.length} document{filtered.length === 1 ? "" : "s"}
          {filtered.length > 0 && <> &middot; {fmtCurrency(totalValue)}</>}
        </p>
      </div>

      {/* Month folders */}
      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No documents found. Use &ldquo;Add Document&rdquo; to file one.
          </div>
        ) : (
          <div className="space-y-3 pr-4">
            {months.map(({ key, label, items, total }) => {
              const open = !collapsed[key];
              return (
                <div key={key} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    onClick={() => setCollapsed((p) => ({ ...p, [key]: !p[key] }))}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{label}</span>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </div>
                    {total > 0 && <span className="font-semibold text-sm">{fmtCurrency(total)}</span>}
                  </button>

                  {open && (
                    <div className="border-t">
                      {items.map((d) => {
                        const meta = kindMeta[d.kind] ?? kindMeta.receipt;
                        const Icon = meta.icon;
                        return (
                          <div key={d.id} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50 transition-colors border-b last:border-b-0">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`p-2 rounded-lg ${meta.bg} shrink-0`}>
                                <Icon className={`h-5 w-5 ${meta.color}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold truncate">{d.title}</span>
                                  <Badge className="text-[10px]">{d.status}</Badge>
                                  {d.file_name && <Badge variant="outline" className="text-[10px] gap-1"><Upload className="h-2.5 w-2.5" />file</Badge>}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {[d.reference, d.payee, d.account_name].filter(Boolean).join(" \u00b7 ") || d.document_date}
                                </p>
                                {d.kind === "statement" && d.period_start && (
                                  <p className="text-xs text-muted-foreground">
                                    Period: {d.period_start} &rarr; {d.period_end || "open"}
                                  </p>
                                )}
                                {d.notes && <p className="text-xs text-muted-foreground truncate">{d.notes}</p>}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              {d.amount != null && <div className="font-semibold">{fmtCurrency(d.amount)}</div>}
                              <div className="text-xs text-muted-foreground">{d.document_date}</div>
                              {d.file_size != null && <div className="text-xs text-muted-foreground">{formatBytes(d.file_size)}</div>}
                              <div className="mt-2 flex gap-1 justify-end">
                                {d.file_path && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => handleView(d)} className="gap-1">
                                      <Eye className="h-3.5 w-3.5" />View
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleDownload(d)} className="gap-1">
                                      <Download className="h-3.5 w-3.5" />Download
                                    </Button>
                                  </>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => openEdit(d)} className="gap-1">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(d)} className="gap-1 text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Add / edit dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit document" : "Add document"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => {
                const meta = kindMeta[k];
                const Icon = meta.icon;
                return (
                  <button
                    key={k}
                    onClick={() => setForm((f) => ({ ...f, kind: k }))}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                      form.kind === k ? "ring-2 ring-primary bg-muted/50" : "hover:bg-muted/40"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                    {meta.label.replace(/s$/, "")}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. January bank statement" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.document_date} onChange={(e) => setForm({ ...form, document_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {form.kind !== "statement" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Reference</Label>
                  <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="INV-001" />
                </div>
              </div>
            )}

            {form.kind === "statement" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Account name</Label>
                    <Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="GTBank Current" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Account type</Label>
                    <Input value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} placeholder="Current / Savings" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Period start</Label>
                    <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Period end</Label>
                    <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>{form.kind === "invoice" ? "Payee / vendor" : "Notes"}</Label>
              {form.kind === "invoice" ? (
                <Input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
              ) : (
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>File (PDF, image or CSV)</Label>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />Choose file
                </Button>
                <span className="text-sm text-muted-foreground truncate">
                  {picked ? picked.name : editing?.file_name || "No file selected"}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setFormOpen(false); resetForm(); }} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "File document"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.doc.title}</DialogTitle>
          </DialogHeader>
          <div className="w-full h-[70vh] flex items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {preview && isImage(preview.doc.file_type) && (
              <img src={preview.url} alt={preview.doc.title} className="max-h-full max-w-full object-contain" />
            )}
            {preview && isPdf(preview.doc.file_type) && (
              <iframe src={preview.url} title={preview.doc.title} className="h-full w-full" />
            )}
            {preview && !isImage(preview.doc.file_type) && !isPdf(preview.doc.file_type) && (
              <div className="text-center text-muted-foreground">
                <FileSpreadsheet className="h-10 w-10 mx-auto mb-2" />
                <p>No inline preview for this file type.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            {preview?.doc.file_path && (
              <Button variant="outline" onClick={() => handleDownload(preview.doc)} className="gap-2">
                <Download className="h-4 w-4" />Download
              </Button>
            )}
            <Button onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tracker;
