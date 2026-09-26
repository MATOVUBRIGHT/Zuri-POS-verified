import { useState, useEffect, useMemo } from "react";
import StatCard from "@/components/StatCard";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger   } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner, PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Pencil, Trash2, Truck, Phone, Mail, MapPin, Building2, DollarSign, Package, TrendingUp, CreditCard, Undo2, Loader2, FileBarChart, Download } from "lucide-react";
import { logAudit } from "@/lib/audit";
import ExcelImport from "@/components/ExcelImport";

interface Supplier {
  id: string;
  store_id: string;
  user_id?: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  company: string | null;
  notes: string | null;
  total_supplied: number;
  outstanding_balance: number;
  created_at: string;
  updated_at: string;
}

interface RecentProduct {
  id: string;
  product_name: string;
  quantity: number;
  cost_per_unit: number;
  total_value: number;
  date_of_purchase: string;
}

interface MonthlySupplierSummary {
  month: string;
  items: number;
  payable: number;
  paid: number;
  balance: number;
}

interface SupplierSale {
  id: string;
  date: string;
  productName: string;
  quantity: number;
  amount: number;
}

interface SuppliersProps { currentStoreId?: string | null; onOpenReports?: () => void; onOpenScheduledPayments?: () => void; }
const Suppliers = ({ currentStoreId, onOpenReports, onOpenScheduledPayments }: SuppliersProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const showLoader = useMinimumLoading(loading, 350);
  const [searchTerm, setSearchTerm] = useState("");
  const [cardFilter, setCardFilter] = useState<"all" | "with_balance">("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySupplierSummary[]>([]);
  const [supplierSales, setSupplierSales] = useState<SupplierSale[]>([]);
  const [supplierDetailLoading, setSupplierDetailLoading] = useState(false);
  const [selectedSalesMonths, setSelectedSalesMonths] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    company: "",
    notes: "",
  });
  const [returningSupplier, setReturningSupplier] = useState<Supplier | null>(null);
  const [returnInventory, setReturnInventory] = useState<any[]>([]);
  const [returnForm, setReturnForm] = useState({ inventoryId: "", quantity: "", unitCredit: "", reason: "", reference: "" });
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    fetchSuppliers();

    // Prefill supplier name if navigated from Stock Entry (hash routing)
    try {
      const hash = window.location.hash || '';
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const query = hash.slice(qIndex + 1);
        const params = new URLSearchParams(query);
        const prefill = params.get('prefillSupplierName');
        if (prefill && prefill.trim()) {
          setFormData((prev) => ({ ...prev, name: prefill.trim() }));
          setIsDialogOpen(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const resolveStoreId = async (userId: string): Promise<string | null> => {
    const current = localStorage.getItem("brec_current_store");
    if (current) return current;

    const targetStoreId = currentStoreId || (await supabase.from("stores").select("id").eq("user_id", userId).limit(1)).data?.[0]?.id;
    const { data: accessData } = await supabase.from("store_access").select("store_id").eq("user_id", userId).limit(1);
    return targetStoreId || accessData?.[0]?.store_id || null;
  };

  const fetchSuppliers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const storeId = await resolveStoreId(user.id);
      if (!storeId) return;

      let res = await supabase
        .from("suppliers")
        .select("id, store_id, name, phone, email, address, company, notes, total_supplied, outstanding_balance, created_at, updated_at")
        .eq("store_id", storeId)
        .order("name", { ascending: true });

      if (res.error) {
        console.error("Error fetching suppliers:", res.error);
        return;
      }

      const rows = (res.data || []).map((s: any) => ({
        ...s,
        total_supplied: Number(s.total_supplied || 0) || 0,
        outstanding_balance: Number(s.outstanding_balance || 0) || 0,
      }));
      setSuppliers(rows as any);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const openSupplierReturn = async (supplier: Supplier) => {
    setReturningSupplier(supplier); setReturnForm({ inventoryId: "", quantity: "", unitCredit: "", reason: "", reference: "" });
    const storeId = await resolveStoreId((await supabase.auth.getUser()).data.user?.id || "");
    if (!storeId) return;
    const { data, error } = await supabase.from("inventory").select("id, product_name, quantity, cost_per_unit, supplier_id").eq("store_id", storeId).eq("supplier_id", supplier.id).gt("quantity", 0).order("product_name");
    if (error) toast({ title: "Could not load supplier stock", description: error.message, variant: "destructive" });
    setReturnInventory(data || []);
  };
  const saveSupplierReturn = async () => {
    const item = returnInventory.find(i => i.id === returnForm.inventoryId);
    const quantity = Number(returnForm.quantity); const unitCredit = Number(returnForm.unitCredit);
    if (!returningSupplier || !item || !Number.isInteger(quantity) || quantity <= 0 || quantity > Number(item.quantity) || unitCredit < 0) {
      toast({ title: "Check return details", description: "Choose an available item, valid whole quantity, and credit value.", variant: "destructive" }); return;
    }
    setReturning(true);
    const { error } = await supabase.rpc("return_inventory_to_supplier" as any, { p_supplier_id: returningSupplier.id, p_inventory_id: item.id, p_quantity: quantity, p_unit_credit: unitCredit, p_reason: returnForm.reason || null, p_reference: returnForm.reference || null });
    setReturning(false);
    if (error) { toast({ title: "Supplier return was not saved", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Return recorded", description: `${quantity} ${item.product_name} removed from branch stock and supplier balance updated.` });
    const storeId = returningSupplier.store_id;
    setReturningSupplier(null);
    await Promise.all([
      fetchSuppliers(),
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory", storeId] }),
    ]);
  };

  const fetchRecentProducts = async (supplier: Supplier) => {
    try {
      // Try supplier_id first, fallback to supplier_name match
      let res = await (supabase.from("inventory") as any)
        .select("id, product_name, quantity, cost_per_unit, total_value, date_of_purchase")
        .eq("store_id", supplier.store_id)
        .eq("supplier_id", supplier.id)
        .order("date_of_purchase", { ascending: false })
        .limit(50);

      // If no results with supplier_id, try supplier_name
      if (!res.error && (!res.data || res.data.length === 0)) {
        res = await (supabase.from("inventory") as any)
          .select("id, product_name, quantity, cost_per_unit, total_value, date_of_purchase")
          .eq("store_id", supplier.store_id)
          .eq("supplier_name", supplier.name)
          .order("date_of_purchase", { ascending: false })
          .limit(50);
      }

      if (res.error) {
        console.error("Error fetching products:", res.error);
        setRecentProducts([]);
        return;
      }

      setRecentProducts(res.data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchSupplierSales = async (supplier: Supplier): Promise<SupplierSale[]> => {
    const { data: inventoryRows, error: inventoryError } = await (supabase.from("inventory") as any)
      .select("id, product_name, supplier_id, supplier_name, supplier")
      .eq("store_id", supplier.store_id);
    if (inventoryError) throw inventoryError;
    const supplierProducts = new Set((inventoryRows || [])
      .filter((item: any) => item.supplier_id === supplier.id || String(item.supplier_name || item.supplier || "").toLowerCase() === supplier.name.toLowerCase())
      .map((item: any) => String(item.product_name || "").trim().toLowerCase())
      .filter(Boolean));
    const supplierProductIds = new Set((inventoryRows || [])
      .filter((item: any) => item.supplier_id === supplier.id || String(item.supplier_name || item.supplier || "").toLowerCase() === supplier.name.toLowerCase())
      .map((item: any) => String(item.id || ""))
      .filter(Boolean));
    if (!supplierProducts.size && !supplierProductIds.size) return [];

    const { data: salesRows, error: salesError } = await (supabase.from("sales") as any)
      .select("id, date_of_sale, created_at, products")
      .eq("store_id", supplier.store_id)
      .order("date_of_sale", { ascending: false });
    if (salesError) throw salesError;
    const sold: SupplierSale[] = [];
    (salesRows || []).forEach((sale: any) => {
      let products = sale.products;
      if (typeof products === "string") { try { products = JSON.parse(products); } catch { products = []; } }
      if (!Array.isArray(products)) return;
      products.forEach((product: any, index: number) => {
        const productName = String(product.product_name || product.productName || product.name || "").trim();
        const productId = String(product.product_id || product.productId || product.inventory_id || product.inventoryId || product.id || "");
        if (!supplierProducts.has(productName.toLowerCase()) && !supplierProductIds.has(productId)) return;
        const quantity = Number(product.quantity || product.qty || 0) || 0;
        const amount = Number(product.total_amount ?? product.total ?? product.subtotal ?? ((product.sellingPrice ?? product.price ?? 0) * quantity)) || 0;
        sold.push({ id: `${sale.id}-${index}`, date: sale.date_of_sale || sale.created_at || "", productName, quantity, amount });
      });
    });
    return sold;
  };

  const fetchMonthlySummary = async (supplier: Supplier) => {
    try {
      let { data, error } = await (supabase.from("stock_loans") as any)
        .select("id, date_of_purchase, quantity, total_amount, amount_paid, balance, status, supplier_id")
        .eq("store_id", supplier.store_id)
        .eq("supplier_id", supplier.id)
        .order("date_of_purchase", { ascending: false });
      if (error || !data?.length) {
        const fallback = await (supabase.from("stock_loans") as any)
          .select("id, date_of_purchase, quantity, total_amount, amount_paid, balance, status")
          .eq("store_id", supplier.store_id)
          .eq("supplier", supplier.name)
          .order("date_of_purchase", { ascending: false });
        data = fallback.data || [];
        error = fallback.error;
      }
      if (error) throw error;
      const grouped = new Map<string, MonthlySupplierSummary>();
      (data || []).forEach((loan: any) => {
        const month = String(loan.date_of_purchase || loan.created_at || "").slice(0, 7) || "Unknown";
        const row = grouped.get(month) || { month, items: 0, payable: 0, paid: 0, balance: 0 };
        row.items += Number(loan.quantity || 0) || 0;
        row.payable += Number(loan.total_amount || 0) || 0;
        row.paid += Number(loan.amount_paid || 0) || 0;
        row.balance += Number(loan.balance ?? Math.max(0, Number(loan.total_amount || 0) - Number(loan.amount_paid || 0))) || 0;
        grouped.set(month, row);
      });
      const { data: scheduledPaid } = await (supabase as any).from("scheduled_payments")
        .select("amount, month, status")
        .eq("store_id", supplier.store_id)
        .eq("schedule_type", "supplier")
        .eq("payee", supplier.name)
        .eq("status", "paid");
      (scheduledPaid || []).forEach((payment: any) => {
        const month = String(payment.month || "").slice(0, 7);
        const row = grouped.get(month);
        if (row) {
          row.paid += Number(payment.amount || 0) || 0;
          row.balance = Math.max(0, row.payable - row.paid);
        }
      });
      setMonthlySummary(Array.from(grouped.values()).sort((a, b) => b.month.localeCompare(a.month)));
    } catch (error) {
      console.error("Error fetching supplier monthly summary:", error);
      setMonthlySummary([]);
    }
  };

  const handleViewSupplier = (supplier: Supplier) => {
    setViewSupplier(null);
    setSupplierDetailLoading(true);
    setSelectedSalesMonths([]);
    void Promise.all([fetchRecentProducts(supplier), fetchMonthlySummary(supplier), fetchSupplierSales(supplier)])
      .then(([, , sales]) => {
        setSupplierSales(sales);
        setViewSupplier(supplier);
      })
      .catch((error: any) => toast({ title: "Could not load supplier details", description: error?.message || String(error), variant: "destructive" }))
      .finally(() => setSupplierDetailLoading(false));
  };

  const openSupplierSchedule = (supplier: Supplier, amount?: string) => {
    localStorage.setItem("zuripos:supplier-payment-prefill", JSON.stringify({
      payee: supplier.name,
      amount: amount || supplier.outstanding_balance,
      schedule_type: "supplier",
      period: "once",
      month: new Date().toISOString().slice(0, 7),
      notes: `Supplier payment for ${supplier.name}`,
    }));
    setPayDialogOpen(false);
    setViewSupplier(null);
    setPayingSupplier(null);
    onOpenScheduledPayments?.();
  };

  const supplierSalesMonths = useMemo(() => Array.from(new Set(supplierSales.map((sale) => sale.date.slice(0, 7)).filter(Boolean))).sort().reverse(), [supplierSales]);

  const toggleSalesMonth = (month: string) => {
    setSelectedSalesMonths((current) => current.includes(month) ? current.filter((value) => value !== month) : [...current, month]);
  };

  const downloadSupplierSalesReport = () => {
    if (!viewSupplier) return;
    const months = selectedSalesMonths.length ? selectedSalesMonths : supplierSalesMonths;
    const rowsByMonth = months.map((month) => ({ month, rows: supplierSales.filter((sale) => sale.date.slice(0, 7) === month) }));
    let template: any = {};
    try { template = JSON.parse(localStorage.getItem("zuri_supplier_report_template") || "{}"); } catch { /* use defaults */ }
    const company = template.companyName || "Zuri POS";
    const accent = template.accent || "#d6a437";
    const navy = template.navy || "#0d3157";
    const sections = rowsByMonth.map(({ month, rows }) => {
      const items = rows.reduce((sum, row) => sum + row.quantity, 0);
      const total = rows.reduce((sum, row) => sum + row.amount, 0);
      const body = rows.map((row) => `<tr><td>${row.date}</td><td>${row.productName}</td><td>${row.quantity}</td><td>${fmtCurrency(row.amount)}</td></tr>`).join("") || `<tr><td colspan="4">No items sold in this month.</td></tr>`;
      return `<section class="month"><h2>${month}</h2><table><thead><tr><th>Date</th><th>Item sold</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${body}</tbody></table><div class="total"><strong>${items.toLocaleString()} items sold</strong><strong>${fmtCurrency(total)}</strong></div></section>`;
    }).join("") || `<p>No sales recorded for the selected months.</p>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${viewSupplier.name} sales report</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#edf1f5;font-family:Arial,sans-serif;color:#173754}.page{width:210mm;min-height:297mm;margin:20px auto;background:#fff;padding:16mm;box-shadow:0 8px 28px #0002}header{border-bottom:4px solid ${accent};display:flex;justify-content:space-between;padding-bottom:12px}h1{color:${navy};margin:0;font-size:25px}h2{color:${navy};margin:24px 0 8px;border-left:4px solid ${accent};padding-left:8px}.muted{color:#60758a}table{width:100%;border-collapse:collapse;font-size:11px}th{background:${navy};color:#fff;text-align:left;padding:8px}td{border:1px solid #d7e0e8;padding:8px}td:nth-child(3),td:nth-child(4){text-align:right}.month{page-break-inside:avoid}.total{display:flex;justify-content:space-between;background:#f4f7fa;border-bottom:2px solid ${accent};padding:10px}.grand{margin-top:24px;padding:14px;background:#fff5d9;border:1px solid ${accent};font-size:17px}@media print{body{background:white}.page{margin:0;box-shadow:none}}</style></head><body><main class="page"><header><div><h1>${company}</h1><p class="muted">${template.address || "Supplier sales report"}</p></div><div><strong>${template.title || "SUPPLIER SALES REPORT"}</strong><p class="muted">Generated ${new Date().toLocaleDateString()}</p></div></header><h2>${viewSupplier.name}</h2><p class="muted">Actual items sold, grouped by selected month</p>${sections}<div class="grand"><strong>Total sales</strong><strong>${fmtCurrency(supplierSales.filter((sale) => months.includes(sale.date.slice(0, 7))).reduce((sum, sale) => sum + sale.amount, 0))}</strong></div></main></body></html>`;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!printWindow) { toast({ title: "Allow popups to download the report", variant: "destructive" }); return; }
    printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); printWindow.print();
  };

  const handlePaySupplier = async () => {
    if (!payingSupplier || !payAmount || parseFloat(payAmount) <= 0) {
      toast({ title: "Error", description: "Enter a valid payment amount", variant: "destructive" });
      return;
    }

    const amount = parseFloat(payAmount);
    const currentOutstanding = Number((payingSupplier as any).outstanding_balance || 0) || 0;
    if (amount > currentOutstanding) {
      toast({ title: "Error", description: "Payment exceeds outstanding balance", variant: "destructive" });
      return;
    }

    try {
      const newBalance = Math.max(0, currentOutstanding - amount);
      const { error } = await supabase
        .from("suppliers")
        .update({
          outstanding_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payingSupplier.id);

      if (error) {
        const msg = String(error.message || "").toLowerCase();
        const looksLikeMissingSchema =
          msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column") || msg.includes("outstanding_balance");
        if (!looksLikeMissingSchema) throw error;

        // Fallback: apply payment to unpaid stock_loans for this supplier (name match).
        const supplierName = payingSupplier.name;
        const storeId = payingSupplier.store_id;

        const { data: loans, error: loansError } = await supabase
          .from("stock_loans")
          .select("id, balance, amount_paid, total_amount, status")
          .eq("store_id", storeId)
          .eq("status", "unpaid")
          .eq("supplier", supplierName)
          .order("created_at", { ascending: true });
        if (loansError) throw loansError;

        let remaining = amount;
        for (const loan of (loans as any[]) || []) {
          if (remaining <= 0) break;
          const bal = Number(loan.balance || 0) || 0;
          if (bal <= 0) continue;
          const pay = Math.min(bal, remaining);
          remaining -= pay;

          const nextBal = Math.max(0, bal - pay);
          const nextPaid = (Number(loan.amount_paid || 0) || 0) + pay;
          const nextStatus = nextBal <= 0 ? "paid" : "unpaid";

          const { error: upErr } = await supabase
            .from("stock_loans")
            .update({ balance: nextBal, amount_paid: nextPaid, status: nextStatus } as any)
            .eq("id", loan.id);
          if (upErr) throw upErr;

          const { error: payErr } = await supabase
            .from("loan_payments")
            .insert({ loan_id: loan.id, amount_paid: pay } as any);
          if (payErr) throw payErr;
        }
      }

      await logAudit({
        action: "update",
        tableName: "suppliers",
        recordId: payingSupplier.id,
        oldData: { outstanding_balance: currentOutstanding },
        newData: { outstanding_balance: newBalance, payment: amount },
        storeId: payingSupplier.store_id,
      });

      toast({ title: "Payment Recorded", description: `${fmtCurrency(amount)} paid to ${payingSupplier.name}` });
      setPayDialogOpen(false);
      setPayAmount("");
      setPayingSupplier(null);
      fetchSuppliers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Supplier name is required", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const storeId = await resolveStoreId(user.id);
      if (!storeId) throw new Error("No store found");

      if (editingSupplier) {
        let res = await supabase
          .from("suppliers")
          .update({
            name: formData.name.trim(),
            phone: formData.phone || null,
            email: formData.email || null,
            address: formData.address || null,
            company: formData.company || null,
            notes: formData.notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", editingSupplier.id);

        if (res.error) {
          const msg = String(res.error.message || "").toLowerCase();
          const looksLikeMissingCols =
            (msg.includes("company") || msg.includes("notes") || msg.includes("updated_at") || msg.includes("email") || msg.includes("phone") || msg.includes("address")) &&
            (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"));
          if (looksLikeMissingCols) {
            res = await supabase
              .from("suppliers")
              .update({ name: formData.name.trim() } as any)
              .eq("id", editingSupplier.id);
          }
        }

        if (res.error) throw res.error;

        await logAudit({
          action: "update",
          tableName: "suppliers",
          recordId: editingSupplier.id,
          oldData: { name: editingSupplier.name },
          newData: { name: formData.name.trim() },
          storeId,
        });

        toast({ title: "Supplier Updated", description: `${formData.name} has been updated` });
      } else {
        let res = await supabase
          .from("suppliers")
          .insert({
            store_id: storeId,
            user_id: user.id,
            name: formData.name.trim(),
            phone: formData.phone || null,
            email: formData.email || null,
            address: formData.address || null,
            company: formData.company || null,
            notes: formData.notes || null,
          } as any)
          .select()
          .single();

        if (res.error) {
          const msg = String(res.error.message || "").toLowerCase();
          const looksLikeMissingUserId =
            msg.includes("user_id") && (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"));
          if (looksLikeMissingUserId) {
            res = await supabase
              .from("suppliers")
              .insert({
                store_id: storeId,
                name: formData.name.trim(),
                phone: formData.phone || null,
                email: formData.email || null,
                address: formData.address || null,
                company: formData.company || null,
                notes: formData.notes || null,
              } as any)
              .select()
              .single();
          }
        }

        if (res.error) throw res.error;

        await logAudit({
          action: "create",
          tableName: "suppliers",
          recordId: (res.data as any).id,
          newData: { name: formData.name.trim(), company: formData.company },
          storeId,
        });

        toast({ title: "Supplier Added", description: `${formData.name} has been added` });
      }

      resetForm();
      setIsDialogOpen(false);
      fetchSuppliers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`Delete supplier "${supplier.name}"?`)) return;

    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", supplier.id);
      if (error) throw error;

      await logAudit({
        action: "delete" as any,
        tableName: "suppliers",
        recordId: supplier.id,
        oldData: { name: supplier.name },
        storeId: supplier.store_id,
      });

      toast({ title: "Deleted", description: `${supplier.name} has been removed` });
      fetchSuppliers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      company: supplier.company || "",
      notes: supplier.notes || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: "", phone: "", email: "", address: "", company: "", notes: "" });
    setEditingSupplier(null);
  };

    const searched = suppliers.filter(s =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.company || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.phone || "").includes(searchTerm)
    );
    const filtered = cardFilter === "with_balance"
      ? searched.filter(s => s.outstanding_balance > 0)
      : searched;

  const totalOwed = suppliers.reduce((sum, s) => sum + (Number((s as any).outstanding_balance || 0) || 0), 0);

  if (showLoader) {
    return <PageLoader text="Loading suppliers..." />;
  }
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Truck className="h-8 w-8 text-primary" />
            Suppliers
          </h2>
          <p className="text-muted-foreground mt-1">
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
            {totalOwed > 0 && <span className="text-destructive ml-2">· {fmtCurrency(totalOwed)} owed</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {onOpenReports && (
            <Button variant="outline" className="gap-2" onClick={onOpenReports}>
            <FileBarChart className="h-4 w-4" /> Supplier Reports
            </Button>
          )}
          <ExcelImport config={{
            title: "Import Suppliers from Excel",
            description: "Upload an Excel file with supplier data",
            fields: [
              { key: "name", label: "Name", required: true, type: "string" },
              { key: "company", label: "Company", type: "string" },
              { key: "phone", label: "Phone", type: "string" },
              { key: "email", label: "Email", type: "string" },
              { key: "address", label: "Address", type: "string" },
              { key: "notes", label: "Notes", type: "string" },
            ],
            templateData: [
              { "Name": "Jane Supplier", "Company": "ABC Ltd", "Phone": "+256700000000", "Email": "jane@abc.com", "Address": "Kampala", "Notes": "" },
            ],
            onImport: async (rows) => {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error("Not authenticated");
              const storeId = await resolveStoreId(user.id);
              if (!storeId) throw new Error("No store found");

              let success = 0;
              const errors: string[] = [];
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row.name) { errors.push(`Row ${i + 1}: Missing name`); continue; }
                let res = await supabase.from("suppliers").insert({
                  store_id: storeId,
                  user_id: user.id,
                  name: String(row.name).trim(),
                  company: row.company ? String(row.company) : null,
                  phone: row.phone ? String(row.phone) : null,
                  email: row.email ? String(row.email) : null,
                  address: row.address ? String(row.address) : null,
                  notes: row.notes ? String(row.notes) : null,
                } as any);

                if (res.error) {
                  const msg = String(res.error.message || "").toLowerCase();
                  const looksLikeMissingUserId =
                    msg.includes("user_id") && (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"));
                  if (looksLikeMissingUserId) {
                    res = await supabase.from("suppliers").insert({
                      store_id: storeId,
                      name: String(row.name).trim(),
                      company: row.company ? String(row.company) : null,
                      phone: row.phone ? String(row.phone) : null,
                      email: row.email ? String(row.email) : null,
                      address: row.address ? String(row.address) : null,
                      notes: row.notes ? String(row.notes) : null,
                    } as any);
                  }
                }

                if (res.error) { errors.push(`Row ${i + 1}: ${res.error.message}`); } else { success++; }
              }
              fetchSuppliers();
              return { success, errors };
            },
          }} />
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus size={16} />
                Add Supplier
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
            <DialogHeader className="pb-4">
              <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-4">
              <div className="pb-4 space-y-4">
              <div className="space-y-2">
                <Label>Supplier Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. John's Wholesale" />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} placeholder="Company name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+256..." />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Location / address" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." rows={3} />
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingSupplier ? "Update Supplier" : "Add Supplier"}
              </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "all" as const, label: "Total Suppliers", value: suppliers.length, sub: cardFilter === "with_balance" ? `showing ${filtered.length}` : "all suppliers", icon: Truck, color: "text-blue-600", bg: "bg-blue-50" },
          { key: "with_balance" as const, label: "With Balance", value: suppliers.filter(s => s.outstanding_balance > 0).length, sub: "outstanding", icon: CreditCard, color: "text-red-600", bg: "bg-red-50" },
          { key: undefined, label: "Total Supplied", value: `${fmtCurrency(suppliers.reduce((s, x) => s + x.total_supplied, 0))}`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { key: undefined, label: "Total Owed", value: `${fmtCurrency(totalOwed)}`, icon: DollarSign, color: totalOwed > 0 ? "text-red-600" : "text-green-600", bg: totalOwed > 0 ? "bg-red-50" : "bg-green-50" },
        ].map(({ key, label, value, sub, icon, color, bg }) => (
          <StatCard
            key={label}
            label={label}
            value={value}
            sub={sub}
            icon={icon}
            color={color}
            bg={bg}
            active={!!key && cardFilter === key}
            title={key ? `Show ${label.toLowerCase()}` : undefined}
            onClick={key ? () => setCardFilter((c) => (c === key ? "all" : key)) : undefined}
          />
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search suppliers by name, company, or phone..." autoComplete="off" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-11" />
      </div>

      {/* Suppliers grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{searchTerm ? "No suppliers match your search" : "No suppliers yet"}</p>
          {!searchTerm && <Button className="mt-4" onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Add First Supplier</Button>}
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          {filtered.map(supplier => (
              <div key={supplier.id}
                className="flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                onClick={() => handleViewSupplier(supplier)}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
                    {supplier.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{supplier.name}</h4>
                      {supplier.outstanding_balance > 0 && (
                        <Badge variant="destructive" className="text-[10px]">Owes {fmtCurrency(supplier.outstanding_balance)}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[supplier.company, supplier.phone, supplier.email].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex gap-4 mt-1">
                      <div className="text-[10px] text-muted-foreground">
                        Supplied: <span className="font-bold text-emerald-600">{fmtCurrency(supplier.total_supplied)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  {supplier.outstanding_balance > 0 && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 border-emerald-200 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" title="Pay supplier" onClick={() => { setPayingSupplier(supplier); setPayDialogOpen(true); }}><DollarSign className="h-4 w-4" /><span>Pay</span></Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 gap-1 border-amber-200 px-2 text-amber-700 hover:bg-amber-50 hover:text-amber-800" title="Return items to vendor" onClick={() => void openSupplierReturn(supplier)}><Undo2 className="h-4 w-4" /><span>Return</span></Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2" title="Edit supplier" onClick={() => handleEdit(supplier)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:bg-destructive/10" title="Delete supplier" onClick={() => handleDelete(supplier)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Pay Supplier Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay {payingSupplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p>Outstanding: <strong className="text-destructive">{fmtCurrency((payingSupplier?.outstanding_balance || 0))}</strong></p>
            </div>
            <div className="space-y-2">
              <Label>Payment Amount ({getCurrencySymbol()})</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Enter amount..." min="0" max={payingSupplier?.outstanding_balance || 0} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => payingSupplier && openSupplierSchedule(payingSupplier, String(payingSupplier.outstanding_balance || 0))} className="flex-1 text-xs">
                Pay Full
              </Button>
              <Button onClick={() => payingSupplier && openSupplierSchedule(payingSupplier, payAmount)} className="flex-1 gap-1" disabled={!payAmount || Number(payAmount) <= 0}>
                <DollarSign size={14} />
                Schedule Pay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Supplier Dialog */}
      <Dialog open={!!viewSupplier} onOpenChange={(open) => !open && setViewSupplier(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Truck size={18} />
              {viewSupplier?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 pr-4">
            <div className="pb-4">
          {viewSupplier && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {viewSupplier.company && <div><p className="text-xs text-muted-foreground">Company</p><p className="font-medium">{viewSupplier.company}</p></div>}
                {viewSupplier.phone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{viewSupplier.phone}</p></div>}
                {viewSupplier.email && <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{viewSupplier.email}</p></div>}
                {viewSupplier.address && <div><p className="text-xs text-muted-foreground">Address</p><p className="font-medium">{viewSupplier.address}</p></div>}
                <div><p className="text-xs text-muted-foreground">Total Supplied</p><p className="font-bold">{fmtCurrency(viewSupplier.total_supplied)}</p></div>
                <div><p className="text-xs text-muted-foreground">Outstanding</p><p className={`font-bold ${viewSupplier.outstanding_balance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>{fmtCurrency(viewSupplier.outstanding_balance)}</p></div>
              </div>
              {/* Payment Details */}
              {(viewSupplier as any)?.payment_details && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <DollarSign size={14} />
                    Payment Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {(viewSupplier as any).payment_details?.bank_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Bank</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.bank_name}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.account_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Account Name</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.account_name}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.account_number && (
                      <div>
                        <p className="text-xs text-muted-foreground">Account Number</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.account_number}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.mobile_money_number && (
                      <div>
                        <p className="text-xs text-muted-foreground">Mobile Money</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.mobile_money_number}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.payment_terms && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Payment Terms</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.payment_terms}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewSupplier.notes && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p>{viewSupplier.notes}</p>
                </div>
              )}
              <div className="border-t pt-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp size={14} /> Actual items sold</h4>
                  <Button size="sm" variant="outline" className="gap-2" onClick={downloadSupplierSalesReport} disabled={!supplierSales.length}><Download className="h-4 w-4" />Download report</Button>
                </div>
                {supplierSalesMonths.length > 0 && <div className="mb-3 flex flex-wrap gap-2 rounded-lg bg-muted/40 p-2"><span className="self-center text-xs font-semibold text-muted-foreground">Months:</span>{supplierSalesMonths.map((month) => <Button key={month} type="button" size="sm" variant={selectedSalesMonths.includes(month) ? "default" : "outline"} onClick={() => toggleSalesMonth(month)}>{month}</Button>)}<span className="self-center text-xs text-muted-foreground">Leave unselected for all months</span></div>}
                {supplierSales.length === 0 ? <p className="text-sm text-muted-foreground">No completed sales found for this supplier.</p> : <div className="max-h-64 overflow-y-auto rounded-lg border"><table className="w-full min-w-[560px] text-sm"><thead className="sticky top-0 bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Item sold</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody>{supplierSales.filter((sale) => !selectedSalesMonths.length || selectedSalesMonths.includes(sale.date.slice(0, 7))).map((sale) => <tr key={sale.id} className="border-t"><td className="whitespace-nowrap px-3 py-2">{sale.date}</td><td className="px-3 py-2 font-medium">{sale.productName}</td><td className="px-3 py-2 text-right">{sale.quantity.toLocaleString()}</td><td className="px-3 py-2 text-right font-semibold">{fmtCurrency(sale.amount)}</td></tr>)}</tbody></table></div>}
              </div>
              <div className="border-t pt-3">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp size={14} /> Monthly purchases and payments
                </h4>
                {monthlySummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No monthly supplier purchases recorded.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr><th className="px-3 py-2">Month</th><th className="px-3 py-2 text-right">Items</th><th className="px-3 py-2 text-right">To pay</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Status</th></tr>
                      </thead>
                      <tbody>{monthlySummary.map((row) => {
                        const paid = row.balance <= 0.01;
                        const partial = !paid && row.paid > 0;
                        return <tr key={row.month} className="border-t">
                          <td className="px-3 py-2 font-medium">{row.month}</td>
                          <td className="px-3 py-2 text-right">{row.items.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtCurrency(row.payable)}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{fmtCurrency(row.paid)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtCurrency(Math.max(0, row.balance))}</td>
                          <td className="px-3 py-2"><Badge variant={paid ? "default" : partial ? "secondary" : "destructive"}>{paid ? "Paid" : partial ? "Part paid" : "Unpaid"}</Badge></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                )}
              </div>
              {/* Recent Products */}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                  <Package size={14} />
                  Products Supplied ({recentProducts.length})
                </h4>
                {recentProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products found from this supplier</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {recentProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                          <div>
                            <p className="font-medium">{p.product_name}</p>
                            <p className="text-xs text-muted-foreground">{p.date_of_purchase} • {p.quantity} units</p>
                          </div>
                          <p className="font-semibold">{fmtCurrency((p.total_value || p.quantity * p.cost_per_unit))}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 p-2 bg-muted rounded-lg text-sm flex justify-between">
                      <span className="text-muted-foreground">Total Cost from Products</span>
                      <span className="font-bold">{fmtCurrency(recentProducts.reduce((sum, p) => sum + (p.total_value || p.quantity * p.cost_per_unit), 0))}</span>
                    </div>
                  </>
                )}
              </div>
              {viewSupplier.outstanding_balance > 0 && (
                <Button className="w-full gap-2" onClick={() => { setPayingSupplier(viewSupplier); setPayDialogOpen(true); setViewSupplier(null); }}>
                  <DollarSign size={14} />
                  Pay {fmtCurrency(viewSupplier.outstanding_balance)}
                </Button>
              )}
              <Button variant="outline" className="w-full gap-2" onClick={() => { const supplier = viewSupplier; setViewSupplier(null); void openSupplierReturn(supplier); }}><Undo2 size={14} />Return item to supplier</Button>
            </div>
          )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog open={!!returningSupplier} onOpenChange={(open) => !open && setReturningSupplier(null)}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Return to supplier</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Return stock to {returningSupplier?.name}. This permanently reduces branch stock and applies the credit to their outstanding balance.</p>
          <div className="grid gap-3 py-2"><div><Label>Item / batch</Label><Select value={returnForm.inventoryId} onValueChange={(id) => { const item = returnInventory.find(i => i.id === id); setReturnForm(p => ({ ...p, inventoryId: id, unitCredit: String(item?.cost_per_unit || "") })); }}><SelectTrigger><SelectValue placeholder="Select supplier item" /></SelectTrigger><SelectContent>{returnInventory.map(item => <SelectItem key={item.id} value={item.id}>{item.product_name} · {item.quantity} available</SelectItem>)}</SelectContent></Select></div>
          {returnInventory.length === 0 && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No available inventory is linked to this supplier in this branch.</p>}
          <div className="grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input type="number" min="1" value={returnForm.quantity} onChange={e => setReturnForm({...returnForm,quantity:e.target.value})} /></div><div><Label>Credit per unit ({getCurrencySymbol()})</Label><Input type="number" min="0" value={returnForm.unitCredit} onChange={e => setReturnForm({...returnForm,unitCredit:e.target.value})} /></div></div>
          <div><Label>Reason (optional)</Label><Input value={returnForm.reason} onChange={e => setReturnForm({...returnForm,reason:e.target.value})} placeholder="Damaged, wrong delivery…" /></div><div><Label>Reference (optional)</Label><Input value={returnForm.reference} onChange={e => setReturnForm({...returnForm,reference:e.target.value})} /></div></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReturningSupplier(null)}>Cancel</Button><Button disabled={returning || !returnForm.inventoryId} onClick={() => void saveSupplierReturn()}>{returning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record supplier return</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
