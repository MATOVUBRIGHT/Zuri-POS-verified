import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Building2, Check, CreditCard, Download, FileText, Handshake, History, Loader2, Mail, Package, Phone, Plus, Printer, RefreshCw, Search, Truck, UserRoundPlus, Upload, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fmtCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useAddSaleOptimistic } from "@/hooks/useOptimizedData";
import type { Json } from "@/integrations/supabase/types";
import ExcelImport from "@/components/ExcelImport";
import type { Product, StockItem } from "@/types";
import { useShift } from "@/providers/ShiftProvider";

type Reseller = {
  id: string;
  store_id: string;
  name: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "pending" | "active" | "inactive";
  is_application: boolean;
  created_at: string;
};

type ResellerSale = {
  id: string;
  reseller_id: string;
  customer_name: string;
  date_of_sale: string;
  total_amount: number;
  paid_in_cash: boolean | null;
  products: Product[];
  created_at: string;
};

type ResellerPayment = {
  id: string;
  reseller_id: string;
  store_id: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  notes: string | null;
  created_at: string;
};

type ResellerCommission = {
  id: string;
  reseller_id: string;
  store_id: string;
  amount: number;
  commission_date: string;
  description: string | null;
  status: "unpaid" | "paid";
  recorded_by: string;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
};

type ResellerForm = {
  name: string;
  business_name: string;
  email: string;
  phone: string;
  notes: string;
};

type ResellerDataErrors = {
  resellers: boolean;
  sales: boolean;
  payments: boolean;
  commissions: boolean;
  unexpected: boolean;
};

const noResellerDataErrors: ResellerDataErrors = {
  resellers: false,
  sales: false,
  payments: false,
  commissions: false,
  unexpected: false,
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return String(error);
};

const emptyForm: ResellerForm = { name: "", business_name: "", email: "", phone: "", notes: "" };

const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => htmlEscapes[character] || character);

const normalizeImportDate = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const saleDocumentHtml = (
  kind: "Invoice" | "Delivery note",
  reseller: Reseller,
  sale: ResellerSale,
  storeName: string,
) => {
  const ref = `${kind === "Invoice" ? "INV" : "DN"}-${sale.id.slice(-8).toUpperCase()}`;
  const products = Array.isArray(sale.products) ? sale.products : [];
  const rows = products.map((product) => `
    <tr>
      <td>${escapeHtml(product.productName)}</td>
      <td>${escapeHtml(product.quantity)}</td>
      ${kind === "Invoice" ? `<td>${escapeHtml(fmtCurrency(product.sellingPrice))}</td><td>${escapeHtml(fmtCurrency(product.quantity * product.sellingPrice))}</td>` : ""}
    </tr>`).join("");

  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>${kind} ${ref}</title>
  <style>
    body{font:14px Arial,sans-serif;color:#111827;margin:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #111827;padding-bottom:18px}
    h1{font-size:25px;margin:0}h2{font-size:16px;margin:28px 0 8px}.muted{color:#6b7280}.ref{font:700 16px monospace}
    table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:11px 8px;border-bottom:1px solid #d1d5db;text-align:left}
    th{background:#f3f4f6}tfoot td{font-weight:700}.total{text-align:right}.foot{margin-top:42px;border-top:1px solid #d1d5db;padding-top:14px;color:#6b7280}
    @media print{body{margin:15mm}}
  </style></head><body>
    <header><div><h1>${escapeHtml(storeName || "Store")}</h1><p class="muted">${kind === "Invoice" ? "Sales invoice" : "Goods dispatch document"}</p></div>
    <div class="ref">${ref}<br><span class="muted">${escapeHtml(new Date(sale.date_of_sale).toLocaleDateString())}</span></div></header>
    <h2>${kind === "Invoice" ? "Bill to" : "Deliver to"}</h2>
    <strong>${escapeHtml(reseller.business_name || reseller.name)}</strong>
    <div>${escapeHtml(reseller.name)}</div><div>${escapeHtml(reseller.phone || "")}</div><div>${escapeHtml(reseller.email || "")}</div>
    <table><thead><tr><th>Item</th><th>Quantity</th>${kind === "Invoice" ? "<th>Unit price</th><th>Amount</th>" : ""}</tr></thead>
    <tbody>${rows}</tbody>
    ${kind === "Invoice" ? `<tfoot><tr><td colspan="3" class="total">Total</td><td>${escapeHtml(fmtCurrency(sale.total_amount))}</td></tr></tfoot>` : ""}
    </table>
    ${kind === "Invoice" ? `<p><strong>Payment at supply:</strong> ${sale.paid_in_cash ? "Paid in full" : "Credit supply (payments tracked on reseller balance)"}</p>` : `<p>Received by: __________________________ &nbsp;&nbsp; Date: ______________</p>`}
    <div class="foot">Thank you for your business.</div>
    <script>window.onload=()=>window.print();</script>
  </body></html>`;
};

interface ResellersProps {
  currentStoreId: string | null;
  stockData: StockItem[];
}

interface ResellerDetailViewProps {
  reseller: Reseller;
  sales: ResellerSale[];
  payments: ResellerPayment[];
  commissions: ResellerCommission[];
  balance: number;
  unpaidCommission: number;
  salesUnavailable: boolean;
  balanceUnavailable: boolean;
  paymentsUnavailable: boolean;
  commissionsUnavailable: boolean;
  storeName: string;
  loading: boolean;
  onBack: () => void;
  onStatusChange: (status: Reseller["status"]) => void;
  updatingStatus: boolean;
  importAction: ReactNode;
  onSupply: () => void;
  onRecordPayment: () => void;
  onAddCommission: () => void;
  onPaymentHistory: () => void;
  onPrintInvoice: (sale: ResellerSale) => void;
  onPreviewDeliveryNote: (sale: ResellerSale) => void;
  onDownloadDeliveryNote: (sale: ResellerSale) => void;
  onMarkCommissionPaid: (commission: ResellerCommission) => void;
  updatingCommissionId: string | null;
  pdfBusyId: string | null;
}

const displayDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();

const ResellerDetailView = ({
  reseller,
  sales,
  payments,
  commissions,
  balance,
  unpaidCommission,
  salesUnavailable,
  balanceUnavailable,
  paymentsUnavailable,
  commissionsUnavailable,
  storeName,
  loading,
  onBack,
  onStatusChange,
  updatingStatus,
  importAction,
  onSupply,
  onRecordPayment,
  onAddCommission,
  onPaymentHistory,
  onPrintInvoice,
  onPreviewDeliveryNote,
  onDownloadDeliveryNote,
  onMarkCommissionPaid,
  updatingCommissionId,
  pdfBusyId,
}: ResellerDetailViewProps) => {
  const suppliedTotal = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
  const latestSupply = salesUnavailable ? null : sales.reduce<ResellerSale | null>((latest, sale) =>
    !latest || new Date(sale.date_of_sale).getTime() > new Date(latest.date_of_sale).getTime() ? sale : latest, null);

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-5">
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />Back to resellers
      </Button>
      <section className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Handshake className="h-6 w-6 text-primary" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{reseller.business_name || reseller.name}</h2>
              <Badge variant={reseller.status === "active" ? "default" : reseller.status === "pending" ? "secondary" : "outline"}>{reseller.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{reseller.name}{reseller.is_application ? " · Application" : ""}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {reseller.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{reseller.phone}</span>}
              {reseller.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{reseller.email}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Select value={reseller.status} onValueChange={(status) => onStatusChange(status as Reseller["status"])} disabled={updatingStatus}>
            <SelectTrigger className="w-32" aria-label={`Change status for ${reseller.name}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
          </Select>
          {importAction}
          <Button type="button" variant="outline" onClick={onAddCommission}><Plus className="mr-2 h-4 w-4" />Add commission</Button>
          <Button type="button" onClick={onSupply} disabled={reseller.status !== "active"}><Package className="mr-2 h-4 w-4" />Stock supply</Button>
        </div>
      </section>

      <section aria-label="Reseller account summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest stock supply</p>
          <p className="mt-2 text-lg font-semibold">{salesUnavailable ? "Unavailable" : latestSupply ? displayDate(latestSupply.date_of_sale) : "—"}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lifetime supplied</p>
          <p className="mt-2 text-lg font-semibold">{salesUnavailable ? "Unavailable" : fmtCurrency(suppliedTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{salesUnavailable ? "Supply history could not be refreshed" : `${sales.length} supply record${sales.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supply balance due</p>
          <p className={`mt-2 text-lg font-semibold ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{balanceUnavailable ? "Unavailable" : fmtCurrency(balance)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unpaid commissions</p>
          <p className="mt-2 text-lg font-semibold">{commissionsUnavailable ? "Unavailable" : fmtCurrency(unpaidCommission)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Tracked separately from supply balance</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Stock supply history</h3>
              <p className="text-sm text-muted-foreground">Invoices and delivery documents for supplied goods.</p>
            </div>
            {!balanceUnavailable && balance > 0 && <Button type="button" variant="outline" size="sm" onClick={onRecordPayment}><CreditCard className="mr-2 h-4 w-4" />Record payment</Button>}
          </div>
          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 rounded-lg border bg-card py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading supply history…</div>
          ) : salesUnavailable ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-8 text-center text-sm text-muted-foreground">
              Could not load stock supply history. Refresh the page and try again.
            </div>
          ) : sales.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card px-5 py-12 text-center">
              <Package className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 font-medium">No stock supplies yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Record a supply to create its invoice and delivery note.</p>
              <Button type="button" className="mt-4" onClick={onSupply} disabled={reseller.status !== "active"}><Package className="mr-2 h-4 w-4" />Stock supply</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sales.map((sale) => (
                <article key={sale.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">INV-{sale.id.slice(-8).toUpperCase()}</span>
                        <span className="text-sm text-muted-foreground">{displayDate(sale.date_of_sale)}</span>
                        <Badge variant={sale.paid_in_cash ? "default" : "secondary"}>{sale.paid_in_cash ? "Paid at supply" : "Credit supply"}</Badge>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {sale.products.length > 0 ? sale.products.map((product, index) => (
                          <div key={`${sale.id}-${product.id}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate">{product.productName}</span>
                            <span className="shrink-0 text-muted-foreground">{product.quantity} × {fmtCurrency(product.sellingPrice)}</span>
                          </div>
                        )) : <span className="text-sm text-muted-foreground">Items not listed</span>}
                      </div>
                      <p className="mt-3 font-semibold">{fmtCurrency(sale.total_amount)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => onPrintInvoice(sale)}><Printer className="mr-1.5 h-3.5 w-3.5" />Invoice</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onPreviewDeliveryNote(sale)}><FileText className="mr-1.5 h-3.5 w-3.5" />Preview note</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onDownloadDeliveryNote(sale)} disabled={pdfBusyId === sale.id}>
                        {pdfBusyId === sale.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}Download PDF
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div><h3 className="font-semibold">Payments received</h3><p className="text-xs text-muted-foreground">Against stock-supply invoices</p></div>
              <Button type="button" variant="ghost" size="sm" onClick={onPaymentHistory}><History className="mr-1.5 h-4 w-4" />History</Button>
            </div>
            <div className="space-y-3 p-4">
              {loading ? <p className="py-2 text-sm text-muted-foreground">Loading payment history…</p> : paymentsUnavailable ? (
                <p role="alert" className="py-2 text-sm text-destructive">Could not load payment history. Refresh to retry.</p>
              ) : payments.length ? payments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="flex items-start justify-between gap-3 text-sm">
                  <div><p className="font-medium">{payment.payment_method}</p><p className="text-xs text-muted-foreground">{displayDate(payment.paid_at)}{payment.notes ? ` · ${payment.notes}` : ""}</p></div>
                  <strong className="shrink-0">{fmtCurrency(Number(payment.amount))}</strong>
                </div>
              )) : <p className="py-2 text-sm text-muted-foreground">No payments received yet.</p>}
              {payments.length > 5 && <p className="text-xs text-muted-foreground">Showing 5 of {payments.length} payments. Open history to see all.</p>}
            </div>
          </section>

          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div><h3 className="font-semibold">Commission ledger</h3><p className="text-xs text-muted-foreground">Independent from reseller invoice balance</p></div>
              <Button type="button" variant="outline" size="sm" onClick={onAddCommission}><Plus className="mr-1.5 h-4 w-4" />Add</Button>
            </div>
            <div className="space-y-3 p-4">
              {loading ? <p className="py-2 text-sm text-muted-foreground">Loading commission ledger…</p> : commissionsUnavailable ? (
                <p role="alert" className="py-2 text-sm text-destructive">Could not load commission records. Refresh to retry.</p>
              ) : commissions.length ? commissions.map((commission) => (
                <div key={commission.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{fmtCurrency(Number(commission.amount))}</strong>
                      <Badge variant={commission.status === "paid" ? "default" : "secondary"}>{commission.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{displayDate(commission.commission_date)}{commission.description ? ` · ${commission.description}` : ""}</p>
                  </div>
                  {commission.status === "unpaid" && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onMarkCommissionPaid(commission)} disabled={updatingCommissionId === commission.id}>
                      {updatingCommissionId === commission.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}Mark paid
                    </Button>
                  )}
                </div>
              )) : <p className="py-2 text-sm text-muted-foreground">No commissions recorded. New entries begin unpaid.</p>}
            </div>
          </section>

          {reseller.notes && <section className="rounded-lg border bg-card p-4"><h3 className="font-semibold">Notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{reseller.notes}</p></section>}
          <p className="text-right text-xs text-muted-foreground">{storeName}</p>
        </aside>
      </div>
    </div>
  );
};

const Resellers = ({ currentStoreId, stockData }: ResellersProps) => {
  const { toast } = useToast();
  const { user, store } = useShift();
  const addSaleMutation = useAddSaleOptimistic();
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [sales, setSales] = useState<ResellerSale[]>([]);
  const [payments, setPayments] = useState<ResellerPayment[]>([]);
  const [commissions, setCommissions] = useState<ResellerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoadErrors, setDataLoadErrors] = useState<ResellerDataErrors>(noResellerDataErrors);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentHistoryDialogOpen, setPaymentHistoryDialogOpen] = useState(false);
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [deliveryPreviewSale, setDeliveryPreviewSale] = useState<ResellerSale | null>(null);
  const [activeResellerId, setActiveResellerId] = useState<string | null>(null);
  const [applicationMode, setApplicationMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<ResellerForm>(emptyForm);
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(null);
  const [productId, setProductId] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [salePayment, setSalePayment] = useState<"paid" | "credit">("paid");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [commissionDate, setCommissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [commissionDescription, setCommissionDescription] = useState("");
  const [updatingCommissionId, setUpdatingCommissionId] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!currentStoreId) {
      setResellers([]);
      setSales([]);
      setPayments([]);
      setCommissions([]);
      setDataLoadErrors(noResellerDataErrors);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [resellersResult, salesResult, paymentsResult, commissionsResult] = await Promise.all([
        supabase.from("resellers")
          .select("id, store_id, name, business_name, email, phone, notes, status, is_application, created_at")
          .eq("store_id", currentStoreId)
          .order("created_at", { ascending: false }),
        supabase.from("sales")
          .select("id, reseller_id, customer_name, date_of_sale, total_amount, paid_in_cash, products, created_at")
          .eq("store_id", currentStoreId)
          .not("reseller_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("reseller_payments")
          .select("id, reseller_id, store_id, amount, payment_method, paid_at, notes, created_at")
          .eq("store_id", currentStoreId)
          .order("paid_at", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("reseller_commissions")
          .select("id, reseller_id, store_id, amount, commission_date, description, status, recorded_by, paid_at, paid_by, created_at")
          .eq("store_id", currentStoreId)
          .order("commission_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      setDataLoadErrors({
        resellers: Boolean(resellersResult.error),
        sales: Boolean(salesResult.error),
        payments: Boolean(paymentsResult.error),
        commissions: Boolean(commissionsResult.error),
        unexpected: false,
      });
      const queryErrorMessages: string[] = [];
      if (resellersResult.error) {
        console.error("Error loading reseller accounts:", resellersResult.error);
        queryErrorMessages.push(`accounts: ${resellersResult.error.message}`);
      }
      if (salesResult.error) {
        console.error("Error loading reseller stock supplies:", salesResult.error);
        queryErrorMessages.push(`stock supplies: ${salesResult.error.message}`);
      }
      if (paymentsResult.error) {
        console.error("Error loading reseller payments:", paymentsResult.error);
        queryErrorMessages.push(`payments: ${paymentsResult.error.message}`);
      }
      if (commissionsResult.error) {
        console.error("Error loading reseller commissions:", commissionsResult.error);
        queryErrorMessages.push(`commissions: ${commissionsResult.error.message}`);
      }
      if (queryErrorMessages.length) {
        toast({ title: "Could not load reseller data", description: queryErrorMessages.join("; "), variant: "destructive" });
      }
      if (!resellersResult.error) setResellers((resellersResult.data || []) as Reseller[]);
      if (!salesResult.error) {
        setSales((salesResult.data || []).map((sale) => ({
          ...sale,
          reseller_id: sale.reseller_id!,
          products: Array.isArray(sale.products) ? sale.products as unknown as Product[] : [],
        })) as ResellerSale[]);
      }
      if (!paymentsResult.error) setPayments((paymentsResult.data || []) as ResellerPayment[]);
      if (!commissionsResult.error) setCommissions((commissionsResult.data || []) as ResellerCommission[]);
    } catch (error) {
      console.error("Unexpected error loading reseller data:", error);
      setDataLoadErrors({ resellers: true, sales: true, payments: true, commissions: true, unexpected: true });
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: "Could not refresh reseller data", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const salesByReseller = useMemo(() => {
    const grouped = new Map<string, ResellerSale[]>();
    sales.forEach((sale) => grouped.set(sale.reseller_id, [...(grouped.get(sale.reseller_id) || []), sale]));
    grouped.forEach((resellerSales) => resellerSales.sort((a, b) =>
      new Date(b.date_of_sale).getTime() - new Date(a.date_of_sale).getTime()
    ));
    return grouped;
  }, [sales]);

  const paymentsByReseller = useMemo(() => {
    const grouped = new Map<string, ResellerPayment[]>();
    payments.forEach((payment) => grouped.set(payment.reseller_id, [...(grouped.get(payment.reseller_id) || []), payment]));
    grouped.forEach((resellerPayments) => resellerPayments.sort((a, b) =>
      new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
      || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
    return grouped;
  }, [payments]);

  const commissionsByReseller = useMemo(() => {
    const grouped = new Map<string, ResellerCommission[]>();
    commissions.forEach((commission) => grouped.set(commission.reseller_id, [...(grouped.get(commission.reseller_id) || []), commission]));
    grouped.forEach((resellerCommissions) => resellerCommissions.sort((a, b) =>
      new Date(b.commission_date).getTime() - new Date(a.commission_date).getTime()
      || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
    return grouped;
  }, [commissions]);

  const unpaidCommissionsByReseller = useMemo(() => {
    const amounts = new Map<string, number>();
    commissions.forEach((commission) => {
      if (commission.status === "unpaid") {
        amounts.set(commission.reseller_id, (amounts.get(commission.reseller_id) || 0) + Number(commission.amount || 0));
      }
    });
    return amounts;
  }, [commissions]);

  const balancesByReseller = useMemo(() => {
    const balances = new Map<string, number>();
    resellers.forEach((reseller) => {
      const unpaidSales = (salesByReseller.get(reseller.id) || [])
        .filter((sale) => sale.paid_in_cash !== true)
        .reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
      const received = (paymentsByReseller.get(reseller.id) || [])
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      balances.set(reseller.id, Math.max(0, unpaidSales - received));
    });
    return balances;
  }, [resellers, salesByReseller, paymentsByReseller]);

  const filteredResellers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return resellers
      .filter((reseller) => statusFilter === "all" || reseller.status === statusFilter)
      .filter((reseller) => {
        if (!query) return true;
        const matchesReseller = [reseller.name, reseller.business_name, reseller.email, reseller.phone]
          .some((value) => String(value || "").toLowerCase().includes(query));
        const matchesSuppliedItem = (salesByReseller.get(reseller.id) || []).some((sale) =>
          sale.products.some((product) => String(product.productName || "").toLowerCase().includes(query))
        );
        return matchesReseller || matchesSuppliedItem;
      });
  }, [resellers, salesByReseller, searchTerm, statusFilter]);

  const availableStockItems = useMemo(() => {
    const query = productSearchTerm.trim().toLowerCase();
    return stockData.filter((item) => {
      const available = Math.max(0, Number(item.quantity || 0) - Number(item.damaged_quantity || 0));
      const name = String(item.productName || item.product_name || "");
      return available > 0 && (!query || name.toLowerCase().includes(query));
    });
  }, [stockData, productSearchTerm]);

  const openCreateDialog = (isApplication: boolean) => {
    setApplicationMode(isApplication);
    if (isApplication) {
      const fullName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || "");
      setForm({
        ...emptyForm,
        name: fullName || user?.email?.split("@")[0] || "",
        business_name: store?.store_name || "",
        email: user?.email || "",
      });
    } else {
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const saveReseller = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentStoreId || !user) {
      toast({ title: "Store or account unavailable", description: "Select a store and sign in before saving.", variant: "destructive" });
      return;
    }
    const name = form.name.trim();
    if (!name) {
      toast({ title: "Contact name required", description: "Enter a contact name before saving.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("resellers").insert({
        store_id: currentStoreId,
        created_by: user.id,
        name,
        business_name: form.business_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        status: applicationMode ? "pending" : "active",
        is_application: applicationMode,
      });
      if (error) throw error;

      toast({
        title: applicationMode ? "Application submitted" : "Reseller added",
        description: applicationMode ? "Your store's application is pending review." : `${name} was added.`,
      });
      setDialogOpen(false);
      setForm(emptyForm);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error saving reseller:", error);
      toast({ title: "Could not save reseller", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (reseller: Reseller, status: Reseller["status"]) => {
    setUpdatingId(reseller.id);
    const { error } = await supabase.from("resellers")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", reseller.id).eq("store_id", reseller.store_id);
    if (error) {
      console.error("Error updating reseller status:", error);
      toast({ title: "Could not update status", description: error.message, variant: "destructive" });
    } else {
      setResellers((items) => items.map((item) => item.id === reseller.id ? { ...item, status } : item));
      toast({ title: "Status updated", description: `${reseller.name} is now ${status}.` });
    }
    setUpdatingId(null);
  };

  const addProduct = () => {
    const item = stockData.find((stock) => stock.id === productId);
    if (!item) {
      toast({ title: "Item unavailable", description: "Choose an item from the current in-stock list and try again.", variant: "destructive" });
      return;
    }
    const availableQuantity = Number(item.quantity || 0) - Number(item.damaged_quantity || 0);
    if (availableQuantity <= 0) {
      toast({ title: "No sellable stock", description: `${item.productName || item.product_name} has no undamaged stock available.`, variant: "destructive" });
      setProductId("");
      return;
    }
    const alreadyAdded = cart.find((product) => product.id === item.id);
    if (alreadyAdded) {
      toast({ title: "Already added", description: "Change the quantity on the existing line item." });
      return;
    }
    const sellingPrice = Number(item.retail_price || item.retailPrice || 0);
    setCart((items) => [...items, {
      id: item.id,
      productName: item.productName || item.product_name,
      quantity: 1,
      sellingPrice,
      sellType: "item",
      cost_per_unit: Number(item.cost_per_unit || item.costPerUnit || 0),
      items_per_sachet: Number(item.items_per_sachet || 1),
    }]);
    setProductId("");
  };

  const updateCartLine = (id: string, updates: Partial<Product>) => {
    setCart((items) => items.map((item) => item.id === id ? { ...item, ...updates } : item));
  };

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0), [cart]);

  const openSaleDialog = (reseller: Reseller) => {
    setSelectedReseller(reseller);
    setCart([]);
    setSalePayment("paid");
    setProductId("");
    setProductSearchTerm("");
    setSaleDialogOpen(true);
  };

  const openPaymentDialog = (reseller: Reseller) => {
    setSelectedReseller(reseller);
    setPaymentAmount("");
    setPaymentMethod("Cash");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentNotes("");
    setPaymentDialogOpen(true);
  };

  const savePayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || !selectedReseller || !currentStoreId || !user) return;
    if (dataLoadErrors.sales || dataLoadErrors.payments || dataLoadErrors.unexpected) {
      toast({ title: "Balance unavailable", description: "Refresh reseller data before recording a payment.", variant: "destructive" });
      return;
    }

    const amount = Number(paymentAmount);
    const balance = balancesByReseller.get(selectedReseller.id) || 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Enter a valid payment", description: "Payment amount must be greater than zero.", variant: "destructive" });
      return;
    }
    if (amount > balance + 0.005) {
      toast({ title: "Payment exceeds balance", description: `The outstanding balance is ${fmtCurrency(balance)}.`, variant: "destructive" });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    try {
      const { error } = await supabase.from("reseller_payments").insert({
        store_id: currentStoreId,
        reseller_id: selectedReseller.id,
        recorded_by: user.id,
        amount,
        payment_method: paymentMethod,
        paid_at: paymentDate,
        notes: paymentNotes.trim() || null,
      });
      if (error) throw error;

      toast({ title: "Payment recorded", description: `${fmtCurrency(amount)} received from ${selectedReseller.business_name || selectedReseller.name}.` });
      setPaymentDialogOpen(false);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error recording reseller payment:", error);
      toast({ title: "Payment could not be recorded", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const openCommissionDialog = (reseller: Reseller) => {
    setSelectedReseller(reseller);
    setCommissionAmount("");
    setCommissionDate(new Date().toISOString().slice(0, 10));
    setCommissionDescription("");
    setCommissionDialogOpen(true);
  };

  const saveCommission = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || !selectedReseller || !currentStoreId || !user) return;

    const amount = Number(commissionAmount);
    const date = new Date(`${commissionDate}T00:00:00`);
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(commissionDate)
      || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== commissionDate) {
      toast({ title: "Check commission details", description: "Enter a valid positive amount and date.", variant: "destructive" });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    try {
      const { error } = await supabase.from("reseller_commissions").insert({
        store_id: currentStoreId,
        reseller_id: selectedReseller.id,
        recorded_by: user.id,
        amount,
        commission_date: commissionDate,
        description: commissionDescription.trim() || null,
        status: "unpaid",
      });
      if (error) throw error;

      toast({ title: "Commission recorded", description: `${fmtCurrency(amount)} added as unpaid for ${selectedReseller.business_name || selectedReseller.name}.` });
      setCommissionDialogOpen(false);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error recording reseller commission:", error);
      toast({ title: "Commission could not be recorded", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const markCommissionPaid = async (commission: ResellerCommission) => {
    if (!user || commission.status !== "unpaid" || updatingCommissionId) return;
    setUpdatingCommissionId(commission.id);
    try {
      const { data, error } = await supabase.from("reseller_commissions")
        .update({ status: "paid" })
        .eq("id", commission.id)
        .eq("store_id", currentStoreId)
        .eq("status", "unpaid")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast({ title: "Commission already updated", description: "Refresh the reseller detail to see its latest status." });
        await loadData();
        return;
      }
      toast({ title: "Commission marked paid", description: "This does not change the reseller's stock-supply balance." });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error marking reseller commission paid:", error);
      toast({ title: "Could not update commission", description: message, variant: "destructive" });
    } finally {
      setUpdatingCommissionId(null);
    }
  };

  const saveSale = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!selectedReseller || !currentStoreId || !user) {
      toast({
        title: "Stock supply cannot be recorded",
        description: !currentStoreId ? "Select a store before recording a stock supply." : "Your signed-in account is unavailable. Sign in again and retry.",
        variant: "destructive",
      });
      return;
    }
    if (selectedReseller.status !== "active") {
      toast({ title: "Reseller is not active", description: "Activate this reseller before recording a stock supply.", variant: "destructive" });
      return;
    }
    if (!cart.length || total <= 0) {
      toast({ title: "Add sale items", description: "Add at least one item with a valid selling price.", variant: "destructive" });
      return;
    }
    const invalidItem = cart.find((product) => {
      const stock = stockData.find((item) => item.id === product.id);
      return !stock || product.quantity <= 0 || product.quantity > Number(stock.quantity || 0) - Number(stock.damaged_quantity || 0);
    });
    if (invalidItem) {
      toast({ title: "Check item quantity", description: `${invalidItem.productName} is not available in the requested quantity.`, variant: "destructive" });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    try {
      await addSaleMutation.mutateAsync({
        customerName: selectedReseller.business_name || selectedReseller.name,
        dateOfSale: new Date().toISOString().slice(0, 10),
        totalAmount: total,
        paidInCash: salePayment === "paid",
        products: cart,
        store_id: currentStoreId,
        user_id: user.id,
        reseller_id: selectedReseller.id,
        payment_details: salePayment === "paid"
          ? { paymentProviderType: "cash", paymentMethod: "Cash" }
          : null,
        inventorySnapshot: stockData,
      });
      toast({ title: "Stock supply recorded", description: "Inventory was updated once. Invoice and delivery note are ready." });
      setSaleDialogOpen(false);
      await loadData();
    } catch (error) {
      const message = getErrorMessage(error);
      const migrationMissing = /reseller_id|schema cache|column .* does not exist/i.test(message);
      console.error("Error recording reseller sale:", error);
      toast({
        title: "Sale could not be recorded",
        description: migrationMissing
          ? "The reseller database migration may not be applied. Apply the reseller migration in Supabase, then refresh and retry."
          : message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const printDocument = (kind: "Invoice" | "Delivery note", reseller: Reseller, sale: ResellerSale) => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast({ title: "Print window blocked", description: "Allow pop-ups for this app, then try again.", variant: "destructive" });
      return;
    }
    printWindow.document.write(saleDocumentHtml(kind, reseller, sale, store?.store_name || ""));
    printWindow.document.close();
    printWindow.focus();
  };

  const downloadDeliveryNotePdf = async (reseller: Reseller, sale: ResellerSale) => {
    setPdfBusyId(sale.id);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 17;
      const reference = `DN-${sale.id.slice(-8).toUpperCase()}`;
      let y = 22;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text(store?.store_name || "Store", margin, y);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text("DELIVERY NOTE", pageWidth - margin, y, { align: "right" });
      y += 9;
      pdf.setDrawColor(37, 99, 72);
      pdf.setLineWidth(0.7);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 10;

      pdf.setFont("helvetica", "bold");
      pdf.text("Deliver to", margin, y);
      pdf.text("Document details", pageWidth / 2 + 4, y);
      const detailsStartY = y + 6;
      pdf.setFont("helvetica", "normal");
      const businessLines = pdf.splitTextToSize(reseller.business_name || reseller.name, pageWidth / 2 - margin - 8);
      pdf.text(businessLines, margin, detailsStartY);
      let recipientY = detailsStartY + Math.max(5, businessLines.length * 5);
      pdf.text(`Contact: ${reseller.name}`, pageWidth / 2 + 4, detailsStartY);
      pdf.text(`Reference: ${reference}`, pageWidth / 2 + 4, detailsStartY + 6);
      pdf.text(`Supply date: ${new Date(`${sale.date_of_sale}T00:00:00`).toLocaleDateString()}`, pageWidth / 2 + 4, detailsStartY + 12);
      if (reseller.phone) {
        pdf.text(`Phone: ${reseller.phone}`, margin, recipientY);
        recipientY += 5;
      }
      if (reseller.email) {
        pdf.text(`Email: ${reseller.email}`, margin, recipientY);
        recipientY += 5;
      }
      y = Math.max(recipientY, detailsStartY + 18) + 3;

      const drawTableHeader = () => {
        pdf.setFillColor(241, 245, 242);
        pdf.rect(margin, y, pageWidth - margin * 2, 9, "F");
        pdf.setFont("helvetica", "bold");
        pdf.text("Item supplied", margin + 3, y + 6);
        pdf.text("Quantity", pageWidth - margin - 3, y + 6, { align: "right" });
        y += 13;
        pdf.setFont("helvetica", "normal");
      };
      drawTableHeader();
      const products = Array.isArray(sale.products) ? sale.products : [];
      products.forEach((product) => {
        const itemLines = pdf.splitTextToSize(String(product.productName || "Item"), pageWidth - margin * 2 - 42);
        const rowHeight = Math.max(8, itemLines.length * 5 + 2);
        if (y + rowHeight > pageHeight - 48) {
          pdf.addPage();
          y = 20;
          drawTableHeader();
        }
        pdf.text(itemLines, margin + 3, y + 4);
        pdf.text(String(product.quantity), pageWidth - margin - 3, y + 4, { align: "right" });
        y += rowHeight;
        pdf.setDrawColor(220, 226, 221);
        pdf.setLineWidth(0.2);
        pdf.line(margin, y, pageWidth - margin, y);
      });
      if (products.length === 0) {
        pdf.setTextColor(95, 105, 97);
        pdf.text("No item details were stored for this supply.", margin + 3, y + 3);
        y += 10;
      }

      y = Math.max(y + 14, pageHeight - 48);
      pdf.setDrawColor(180, 188, 181);
      pdf.line(margin, y, pageWidth / 2 - 8, y);
      pdf.line(pageWidth / 2 + 8, y, pageWidth - margin, y);
      pdf.setFontSize(9);
      pdf.setTextColor(75, 85, 78);
      pdf.text("Received by / signature", margin, y + 5);
      pdf.text("Date received", pageWidth / 2 + 8, y + 5);
      pdf.save(`${reference}.pdf`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error generating delivery note PDF:", error);
      toast({ title: "PDF could not be generated", description: message, variant: "destructive" });
    } finally {
      setPdfBusyId(null);
    }
  };

  const resellerImportConfig = (reseller: Reseller) => ({
    title: `Import sales for ${reseller.business_name || reseller.name}`,
    description: "Import historical sales and items supplied. Imported records are for history and document printing only; they will not reduce inventory again.",
    fields: [
      { key: "product_name", label: "Item sold", required: true, type: "string" as const, aliases: ["product", "item", "product name"] },
      { key: "quantity", label: "Quantity", required: true, type: "number" as const, aliases: ["qty", "items supplied"] },
      { key: "unit_price", label: "Unit price", required: true, type: "number" as const, aliases: ["selling price", "price"] },
      { key: "total_amount", label: "Line total", type: "number" as const, aliases: ["amount", "total"] },
      { key: "date_of_sale", label: "Date", type: "date" as const, defaultValue: new Date().toISOString().slice(0, 10), aliases: ["sale date", "date supplied"] },
      { key: "payment_status", label: "Payment status", type: "string" as const, defaultValue: "paid", aliases: ["paid", "payment"] },
    ],
    templateData: [
      { "Item sold": "Coca Cola 500ml", Quantity: 12, "Unit price": 1500, "Line total": 18000, Date: new Date().toISOString().slice(0, 10), "Payment status": "paid" },
    ],
    onImport: async (rows: Record<string, unknown>[]) => {
      if (!currentStoreId || !user) throw new Error("A signed-in user and selected store are required.");
      const errors: string[] = [];
      const saleRows: Array<{
        store_id: string;
        user_id: string;
        reseller_id: string;
        customer_name: string;
        date_of_sale: string;
        total_amount: number;
        paid_in_cash: boolean;
        products: Json;
      }> = [];

      rows.forEach((row, index) => {
        const name = String(row.product_name || "").trim();
        const quantity = Number(row.quantity);
        const unitPrice = Number(row.unit_price);
        const lineTotal = Number(row.total_amount) || quantity * unitPrice;
        const date = normalizeImportDate(row.date_of_sale);

        if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(lineTotal) || lineTotal <= 0 || !date) {
          errors.push(`Row ${index + 1}: Item, positive quantity, valid unit price/line total, and valid date are required.`);
          return;
        }

        const stockItem = stockData.find((item) =>
          String(item.productName || item.product_name).trim().toLowerCase() === name.toLowerCase()
        );
        const rawPayment = String(row.payment_status || "paid").trim().toLowerCase();
        const paid = ["paid", "cash", "yes", "true", "1"].includes(rawPayment);
        saleRows.push({
          store_id: currentStoreId,
          user_id: user.id,
          reseller_id: reseller.id,
          customer_name: reseller.business_name || reseller.name,
          date_of_sale: date,
          total_amount: lineTotal,
          paid_in_cash: paid,
          products: [{
            id: stockItem?.id || crypto.randomUUID(),
            productName: name,
            quantity,
            sellingPrice: lineTotal / quantity,
            sellType: "item",
            cost_per_unit: Number(stockItem?.cost_per_unit || stockItem?.costPerUnit || 0),
            items_per_sachet: Number(stockItem?.items_per_sachet || 1),
          }] as unknown as Json,
        });
      });

      if (saleRows.length) {
        const { error } = await supabase.from("sales").insert(saleRows);
        if (error) throw error;
      }
      await loadData();
      return { success: saleRows.length, errors };
    },
  });

  if (!currentStoreId) {
    return <Card><CardHeader><CardTitle>Resellers</CardTitle><p className="text-sm text-muted-foreground">Select a store to manage resellers and their sales.</p></CardHeader></Card>;
  }

  const resellerSalesTotal = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
  const outstandingBalanceTotal = Array.from(balancesByReseller.values()).reduce((sum, balance) => sum + balance, 0);
  const detailReseller = resellers.find((reseller) => reseller.id === activeResellerId) || null;
  const detailSales = detailReseller ? salesByReseller.get(detailReseller.id) || [] : [];
  const detailPayments = detailReseller ? paymentsByReseller.get(detailReseller.id) || [] : [];
  const detailCommissions = detailReseller ? commissionsByReseller.get(detailReseller.id) || [] : [];
  const salesUnavailable = dataLoadErrors.sales || dataLoadErrors.unexpected;
  const paymentsUnavailable = dataLoadErrors.payments || dataLoadErrors.unexpected;
  const commissionsUnavailable = dataLoadErrors.commissions || dataLoadErrors.unexpected;
  const balanceUnavailable = salesUnavailable || paymentsUnavailable;
  const failedDataSets = [
    dataLoadErrors.resellers && "reseller accounts",
    dataLoadErrors.sales && "stock supplies",
    dataLoadErrors.payments && "payments",
    dataLoadErrors.commissions && "commissions",
  ].filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {(failedDataSets.length > 0 || dataLoadErrors.unexpected) && (
        <div role="alert" className="flex flex-col justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <p className="text-destructive">
            {dataLoadErrors.unexpected
              ? "Reseller data could not be refreshed. Financial totals may be unavailable."
              : `Could not refresh ${failedDataSets.join(", ")}. Affected totals are marked unavailable.`}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry
          </Button>
        </div>
      )}
      {detailReseller ? (
        <ResellerDetailView
          reseller={detailReseller}
          sales={detailSales}
          payments={detailPayments}
          commissions={detailCommissions}
          balance={balancesByReseller.get(detailReseller.id) || 0}
          unpaidCommission={unpaidCommissionsByReseller.get(detailReseller.id) || 0}
          salesUnavailable={salesUnavailable}
          balanceUnavailable={balanceUnavailable}
          paymentsUnavailable={paymentsUnavailable}
          commissionsUnavailable={commissionsUnavailable}
          storeName={store?.store_name || ""}
          loading={loading}
          onBack={() => setActiveResellerId(null)}
          onStatusChange={(status) => void updateStatus(detailReseller, status)}
          updatingStatus={updatingId === detailReseller.id}
          importAction={
            <ExcelImport
              config={resellerImportConfig(detailReseller)}
              trigger={<Button type="button" variant="outline" disabled={detailReseller.status !== "active"}><Upload className="mr-2 h-4 w-4" />Import history</Button>}
            />
          }
          onSupply={() => openSaleDialog(detailReseller)}
          onRecordPayment={() => openPaymentDialog(detailReseller)}
          onAddCommission={() => openCommissionDialog(detailReseller)}
          onPaymentHistory={() => { setSelectedReseller(detailReseller); setPaymentHistoryDialogOpen(true); }}
          onPrintInvoice={(sale) => printDocument("Invoice", detailReseller, sale)}
          onPreviewDeliveryNote={(sale) => { setSelectedReseller(detailReseller); setDeliveryPreviewSale(sale); }}
          onDownloadDeliveryNote={(sale) => void downloadDeliveryNotePdf(detailReseller, sale)}
          onMarkCommissionPaid={(commission) => void markCommissionPaid(commission)}
          updatingCommissionId={updatingCommissionId}
          pdfBusyId={pdfBusyId}
        />
      ) : (
        <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Resellers</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage reseller accounts, stock supplies, balances, and commissions.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => openCreateDialog(true)}><Handshake className="mr-2 h-4 w-4" />Become a reseller</Button>
          <Button className="w-full sm:w-auto" onClick={() => openCreateDialog(false)}><Plus className="mr-2 h-4 w-4" />Add reseller</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Resellers" value={dataLoadErrors.resellers || dataLoadErrors.unexpected ? "Unavailable" : resellers.length.toString()} sub={dataLoadErrors.resellers || dataLoadErrors.unexpected ? "Could not load accounts" : `${resellers.filter((reseller) => reseller.status === "active").length} active accounts`} icon={Handshake} color="text-blue-600" bg="bg-blue-100" />
        <StatCard label="Reseller Sales" value={salesUnavailable ? "Unavailable" : fmtCurrency(resellerSalesTotal)} sub={salesUnavailable ? "Could not load supply history" : `${sales.length} stock supplies`} icon={Package} color="text-purple-600" bg="bg-purple-100" />
        <StatCard label="Balance Due" value={balanceUnavailable ? "Unavailable" : fmtCurrency(outstandingBalanceTotal)} sub={balanceUnavailable ? "Could not calculate balances" : "Unpaid stock supplies"} icon={Wallet} color="text-amber-700" bg="bg-amber-100" />
        <StatCard label="Unpaid Commissions" value={commissionsUnavailable ? "Unavailable" : fmtCurrency(Array.from(unpaidCommissionsByReseller.values()).reduce((sum, amount) => sum + amount, 0))} sub={commissionsUnavailable ? "Could not load commission ledger" : "Tracked separately from balances"} icon={CreditCard} color="text-rose-700" bg="bg-rose-100" />
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search resellers, contacts, or supplied items..." autoComplete="off" className="h-10 pl-9 pr-9" />
            {searchTerm && <button type="button" onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Clear search"><X className="h-4 w-4" /></button>}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="w-full sm:w-10 sm:px-0" onClick={() => void loadData()} disabled={loading} aria-label="Refresh resellers">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="sm:hidden">Refresh</span>
          </Button>
        </div>
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {loading ? "Updating reseller accounts…" : `Showing ${filteredResellers.length} of ${resellers.length} reseller${resellers.length === 1 ? "" : "s"}`}
          </p>
          {(searchTerm || statusFilter !== "all") && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
              <X className="mr-1.5 h-3.5 w-3.5" />Clear filters
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" type="auto">
        <div className="space-y-3 pr-2">
          {loading ? (
            <div role="status" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>Loading reseller accounts and ledgers…</span>
            </div>
          ) : dataLoadErrors.resellers ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-12 text-center text-sm text-destructive">
              Could not load reseller accounts. Retry the refresh to try again.
            </div>
          ) : filteredResellers.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-5 py-12 text-center text-muted-foreground">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10"><Handshake className="h-6 w-6 text-primary" /></div>
              <p className="mt-3 font-medium text-foreground">{searchTerm || statusFilter !== "all" ? "No resellers match these filters" : "No resellers added yet"}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm">{searchTerm || statusFilter !== "all" ? "Try a different name, item, or status, or clear the filters." : "Add a reseller to start tracking stock supplies, payments, and commissions."}</p>
              {!searchTerm && statusFilter === "all" ? (
                <Button className="mt-4" onClick={() => openCreateDialog(false)}><Plus className="mr-2 h-4 w-4" />Add first reseller</Button>
              ) : (
                <Button type="button" variant="outline" className="mt-4" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>Clear filters</Button>
              )}
            </div>
          ) : filteredResellers.map((reseller) => {
            const resellerSales = salesByReseller.get(reseller.id) || [];
            const outstandingBalance = balancesByReseller.get(reseller.id) || 0;
            const latestSupply = resellerSales[0];
            return (
              <Card key={reseller.id} className="overflow-hidden transition-colors hover:border-primary/30">
                <CardContent className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(120px,0.38fr)_minmax(140px,0.45fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10"><Handshake className="h-5 w-5 text-primary" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="max-w-full truncate font-semibold">{reseller.business_name || reseller.name}</h3>
                        <Badge variant={reseller.status === "active" ? "default" : reseller.status === "pending" ? "secondary" : "outline"}>{reseller.status}</Badge>
                        {reseller.is_application && <Badge variant="outline">Application</Badge>}
                      </div>
                      <p className="mt-0.5 break-words text-sm text-muted-foreground">
                        {reseller.business_name ? reseller.name : "Contact"}
                        {reseller.phone ? ` · ${reseller.phone}` : ""}
                        {reseller.email ? ` · ${reseller.email}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">Latest supply</p>
                    <p className="mt-0.5 font-medium">{salesUnavailable ? "Unavailable" : latestSupply ? displayDate(latestSupply.date_of_sale) : "No supplies yet"}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">Balance due</p>
                    <p className={`mt-0.5 font-semibold ${outstandingBalance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{balanceUnavailable ? "Unavailable" : fmtCurrency(outstandingBalance)}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setActiveResellerId(reseller.id)} className="w-full shrink-0 sm:w-auto">
                    Open reseller <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />{applicationMode ? "Become a reseller" : "Add reseller"}</DialogTitle>
            <DialogDescription>{applicationMode ? "Apply for your store to join the reseller program." : "Add a reseller contact to your store."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void saveReseller(event)} className="space-y-3 pt-1">
            <div className="space-y-1"><Label htmlFor="reseller-name" className="text-xs">Contact name *</Label><Input id="reseller-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="reseller-business" className="text-xs">Business name</Label><Input id="reseller-business" value={form.business_name} onChange={(event) => setForm({ ...form, business_name: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="reseller-email" className="text-xs">Email</Label><Input id="reseller-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="reseller-phone" className="text-xs">Phone</Label><Input id="reseller-phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="reseller-notes" className="text-xs">Notes</Label><Textarea id="reseller-notes" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{applicationMode ? "Submit application" : "Save reseller"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Record reseller payment</DialogTitle>
            <DialogDescription>
              Record a partial or full payment from {selectedReseller?.business_name || selectedReseller?.name}.
              The payment applies to their outstanding credit supplies only.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void savePayment(event)} className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-sm text-muted-foreground">Outstanding balance</span>
              <strong>{balanceUnavailable ? "Unavailable" : fmtCurrency(selectedReseller ? balancesByReseller.get(selectedReseller.id) || 0 : 0)}</strong>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reseller-payment-amount">Payment amount *</Label>
              <Input
                id="reseller-payment-amount"
                required
                type="number"
                min="0.01"
                max={balanceUnavailable ? undefined : selectedReseller ? balancesByReseller.get(selectedReseller.id) || 0 : 0}
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="reseller-payment-method">Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="reseller-payment-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank transfer</SelectItem>
                    <SelectItem value="Mobile Money">Mobile money</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reseller-payment-date">Payment date</Label>
                <Input id="reseller-payment-date" type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reseller-payment-notes">Notes</Label>
              <Textarea id="reseller-payment-notes" rows={2} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Optional reference or payment note" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || balanceUnavailable || !paymentAmount || Number(paymentAmount) <= 0 || Number(paymentAmount) > (selectedReseller ? balancesByReseller.get(selectedReseller.id) || 0 : 0)}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentHistoryDialogOpen} onOpenChange={setPaymentHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" />Payment history</DialogTitle>
            <DialogDescription>
              Payments recorded for {selectedReseller?.business_name || selectedReseller?.name}.
              Current balance due: {balanceUnavailable ? "Unavailable" : fmtCurrency(selectedReseller ? balancesByReseller.get(selectedReseller.id) || 0 : 0)}.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-3">
            <div className="space-y-2">
              {paymentsUnavailable ? (
                <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 py-10 text-center text-sm text-destructive">
                  Could not load payment records. Retry the page refresh.
                </div>
              ) : (selectedReseller ? paymentsByReseller.get(selectedReseller.id) || [] : []).length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  No payments recorded yet. Partial and full payments will appear here.
                </div>
              ) : (selectedReseller ? paymentsByReseller.get(selectedReseller.id) || [] : []).map((payment) => (
                <div key={payment.id} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{payment.payment_method}</p>
                    <p className="text-xs text-muted-foreground">{new Date(payment.paid_at).toLocaleDateString()}</p>
                    {payment.notes && <p className="mt-1 text-sm text-muted-foreground">{payment.notes}</p>}
                  </div>
                  <strong className="shrink-0">{fmtCurrency(Number(payment.amount || 0))}</strong>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentHistoryDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={commissionDialogOpen} onOpenChange={setCommissionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Add commission</DialogTitle>
            <DialogDescription>
              Record a commission for {selectedReseller?.business_name || selectedReseller?.name}. It starts unpaid and is tracked separately from supply invoices.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void saveCommission(event)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="reseller-commission-amount">Commission amount *</Label>
              <Input id="reseller-commission-amount" required type="number" min="0.01" step="0.01" value={commissionAmount} onChange={(event) => setCommissionAmount(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reseller-commission-date">Commission date *</Label>
              <Input id="reseller-commission-date" required type="date" value={commissionDate} onChange={(event) => setCommissionDate(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reseller-commission-description">Description / notes</Label>
              <Textarea id="reseller-commission-description" rows={3} value={commissionDescription} onChange={(event) => setCommissionDescription(event.target.value)} placeholder="Optional reason or reference" />
            </div>
            <div className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              New commission entries are recorded as unpaid. Mark them paid from the separate commission ledger.
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCommissionDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !commissionAmount || Number(commissionAmount) <= 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save commission
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deliveryPreviewSale && selectedReseller)} onOpenChange={(open) => { if (!open) setDeliveryPreviewSale(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery note preview</DialogTitle>
            <DialogDescription>Review this document before printing or downloading the PDF.</DialogDescription>
          </DialogHeader>
          {deliveryPreviewSale && selectedReseller && (
            <div className="mx-auto w-full max-w-2xl border bg-white p-5 text-slate-900 shadow-sm sm:p-9">
              <div className="flex flex-col justify-between gap-4 border-b-2 border-emerald-800 pb-5 sm:flex-row">
                <div>
                  <p className="text-xl font-bold">{store?.store_name || "Store"}</p>
                  <p className="mt-1 text-sm text-slate-500">Goods dispatch document</p>
                </div>
                <div className="sm:text-right">
                  <p className="font-mono text-sm font-bold">DN-{deliveryPreviewSale.id.slice(-8).toUpperCase()}</p>
                  <p className="mt-1 text-sm text-slate-500">{displayDate(deliveryPreviewSale.date_of_sale)}</p>
                </div>
              </div>
              <div className="grid gap-4 py-5 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Deliver to</p>
                  <p className="font-semibold">{selectedReseller.business_name || selectedReseller.name}</p>
                  <p className="text-sm text-slate-600">{selectedReseller.name}</p>
                  {selectedReseller.phone && <p className="text-sm text-slate-600">{selectedReseller.phone}</p>}
                  {selectedReseller.email && <p className="break-all text-sm text-slate-600">{selectedReseller.email}</p>}
                </div>
                <div className="sm:text-right">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Supply reference</p>
                  <p className="font-mono text-sm">INV-{deliveryPreviewSale.id.slice(-8).toUpperCase()}</p>
                  <p className="text-sm text-slate-600">{Array.isArray(deliveryPreviewSale.products) ? deliveryPreviewSale.products.length : 0} item lines</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] border-collapse text-sm">
                  <thead><tr className="bg-slate-100 text-left"><th className="p-3 font-semibold">Item supplied</th><th className="p-3 text-right font-semibold">Quantity</th></tr></thead>
                  <tbody>
                    {(Array.isArray(deliveryPreviewSale.products) ? deliveryPreviewSale.products : []).map((product, index) => (
                      <tr key={`${product.id}-${index}`} className="border-b border-slate-200"><td className="break-words p-3">{product.productName}</td><td className="p-3 text-right">{product.quantity}</td></tr>
                    ))}
                    {!deliveryPreviewSale.products.length && <tr><td colSpan={2} className="p-3 text-slate-500">No item details were stored for this supply.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-14 grid gap-8 sm:grid-cols-2">
                <div className="border-t border-slate-400 pt-2 text-xs text-slate-500">Received by / signature</div>
                <div className="border-t border-slate-400 pt-2 text-xs text-slate-500">Date received</div>
              </div>
              <p className="mt-8 text-center text-xs text-slate-500">Goods supplied by {store?.store_name || "Store"}</p>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setDeliveryPreviewSale(null)}>Close</Button>
            {deliveryPreviewSale && selectedReseller && (
              <>
                <Button type="button" variant="outline" onClick={() => printDocument("Delivery note", selectedReseller, deliveryPreviewSale)}><Printer className="mr-2 h-4 w-4" />Print note</Button>
                <Button type="button" onClick={() => void downloadDeliveryNotePdf(selectedReseller, deliveryPreviewSale)} disabled={pdfBusyId === deliveryPreviewSale.id}>
                  {pdfBusyId === deliveryPreviewSale.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Download PDF
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Record stock supply</DialogTitle>
            <DialogDescription>Add the items supplied to {selectedReseller?.business_name || selectedReseller?.name}. Saving records a sale, reduces store inventory, and makes an invoice and delivery note available.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void saveSale(event)} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearchTerm}
                onChange={(event) => setProductSearchTerm(event.target.value)}
                placeholder="Search this store’s in-stock items..."
                autoComplete="off"
                className="pl-9"
                aria-label="Search available inventory items"
              />
            </div>
            <div className="flex gap-2">
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Choose a matching in-stock item" /></SelectTrigger>
                <SelectContent>
                  {availableStockItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.productName || item.product_name} · {Number(item.quantity || 0)} available</SelectItem>
                  ))}
                  {!availableStockItems.length && <SelectItem value="no-matching-stock" disabled>No matching in-stock items</SelectItem>}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addProduct} disabled={!productId}><Plus className="mr-1 h-4 w-4" />Add item</Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
              {!cart.length ? <p className="py-8 text-center text-sm text-muted-foreground">Items sold will appear here.</p> : cart.map((product) => {
                const stock = stockData.find((item) => item.id === product.id);
                const maxQuantity = Math.max(0, Number(stock?.quantity || 0) - Number(stock?.damaged_quantity || 0));
                return (
                  <div key={product.id} className="grid grid-cols-[minmax(0,1fr)_86px_120px_auto] items-center gap-2 rounded-md bg-muted/40 p-2">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{product.productName}</p><p className="text-xs text-muted-foreground">{maxQuantity} available</p></div>
                    <Input aria-label={`${product.productName} quantity`} type="number" min="1" max={maxQuantity} value={product.quantity} onChange={(event) => updateCartLine(product.id, { quantity: Math.max(1, Math.min(maxQuantity || 1, Number(event.target.value) || 1)) })} />
                    <Input aria-label={`${product.productName} unit price`} type="number" min="0" step="0.01" value={product.sellingPrice} onChange={(event) => updateCartLine(product.id, { sellingPrice: Math.max(0, Number(event.target.value) || 0) })} />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${product.productName}`} onClick={() => setCart((items) => items.filter((item) => item.id !== product.id))}><X className="h-4 w-4" /></Button>
                  </div>
                );
              })}
              {cart.length > 0 && <div className="px-2 text-right text-xs text-muted-foreground">Columns: item, quantity, unit price</div>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Payment status</Label><Select value={salePayment} onValueChange={(value) => setSalePayment(value as "paid" | "credit")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paid">Paid in cash</SelectItem><SelectItem value="credit">Credit / unpaid</SelectItem></SelectContent></Select></div>
              <div className="flex items-end justify-between rounded-lg bg-muted/50 px-3 py-2"><span className="text-sm text-muted-foreground">Sale total</span><strong className="text-lg">{fmtCurrency(total)}</strong></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaleDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || cart.length === 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record stock supply</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Resellers;
