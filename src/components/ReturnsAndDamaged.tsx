import { useState, useEffect, useMemo } from "react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import StatCard from "@/components/StatCard";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { StockItem, SaleItem } from "@/types";
import { insertRowsWithSchemaFallback, updateByIdWithSchemaFallback } from "@/lib/supabaseSchemaFallback";
import {
  Undo2, AlertTriangle, Package, Search, X, Plus, Minus,
  RefreshCw, CheckCircle, Clock, TrendingDown
} from "lucide-react";

interface ReturnsAndDamagedProps {
  stockData: StockItem[];
  salesData: SaleItem[];
  currentStoreId?: string | null;
  onStockUpdate?: (updated: StockItem) => void;
  onSaleUpdate?: (updated: Partial<SaleItem> & { id: string }) => void;
  pageParams?: { saleId?: string };
}

interface ReturnRecord {
  id: string;
  sale_id: string;
  store_id: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; total: number; reason?: string }>;
  total_amount: number;
  reason: string;
  type: "return" | "damaged";
  status: "pending" | "completed";
  note?: string;
  created_at: string;
  sale?: { customer_name: string; date_of_sale: string; total_amount: number };
}

const normalizeReturnItems = (record: any): ReturnRecord["items"] => {
  const rawItems = Array.isArray(record?.items)
    ? record.items
    : Array.isArray(record?.returned_products)
    ? record.returned_products
    : [];

  return rawItems.map((item: any) => {
    const quantity = Number(item?.quantity ?? item?.returnQty ?? item?.qty ?? 0) || 0;
    const unitPrice = Number(item?.unitPrice ?? item?.sellingPrice ?? item?.price ?? 0) || 0;
    return {
      productName: String(item?.productName ?? item?.product_name ?? item?.name ?? "Unknown Product"),
      quantity,
      unitPrice,
      total: Number(item?.total ?? quantity * unitPrice) || 0,
      reason: item?.reason ? String(item.reason) : undefined,
    };
  });
};

const mapReturnRecord = (record: any): ReturnRecord => ({
  ...record,
  items: normalizeReturnItems(record),
  type: record?.type || (record?.sale_id ? "return" : "damaged"),
  status: record?.status || record?.refund_status || "completed",
  note: record?.note || record?.return_notes || "",
  reason: record?.reason || record?.return_reason || "",
});

const RETURN_REASONS = ["Customer changed mind", "Wrong item", "Defective product", "Expired", "Damaged in transit", "Other"];
const DAMAGED_REASONS = ["Broken", "Expired", "Water damage", "Manufacturing defect", "Handling damage", "Other"];

export default function ReturnsAndDamaged({ stockData, salesData, currentStoreId, onStockUpdate, onSaleUpdate, pageParams }: ReturnsAndDamagedProps) {
  const { toast } = useToast();
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoading(loading, 350);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("returns");

  // New return dialog
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnType, setReturnType] = useState<"return" | "damaged">("return");
  const [selectedSale, setSelectedSale] = useState<SaleItem | null>(null);
  const [saleSearch, setSaleSearch] = useState("");
  const [returnItems, setReturnItems] = useState<Array<{ productName: string; quantity: number; maxQty: number; unitPrice: number; selected: boolean }>>([]);
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [addToStock, setAddToStock] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Damaged stock (no sale)
  const [damagedProduct, setDamagedProduct] = useState("");
  const [damagedQty, setDamagedQty] = useState(1);
  const [damagedReason, setDamagedReason] = useState("");
  const [damagedNote, setDamagedNote] = useState("");

  useEffect(() => { fetchReturns(); }, [currentStoreId]);

  // Auto-open return dialog if navigated with a saleId
  useEffect(() => {
    if (pageParams?.saleId && salesData.length > 0) {
      const sale = salesData.find(s => s.id === pageParams.saleId);
      if (sale) openReturnDialog("return", sale);
    }
  }, [pageParams?.saleId, salesData]);

  const fetchReturns = async () => {
    if (!currentStoreId) { setLoading(false); return; }
    setLoading(true);
    try {
      const joinedQuery = await (supabase.from("sale_returns" as any)
        .select("*, sale:sales(customer_name, date_of_sale, total_amount)")
        .eq("store_id", currentStoreId)
        .order("created_at", { ascending: false }) as any);

      let rows = joinedQuery.data || [];
      let queryError = joinedQuery.error;

      if (queryError) {
        const msg = String(queryError.message || "").toLowerCase();
        const isRelationshipIssue =
          msg.includes("relationship") ||
          msg.includes("schema cache") ||
          msg.includes("could not find") ||
          String((queryError as any)?.code || "") === "PGRST200";

        if (!isRelationshipIssue) throw queryError;

        const fallback = await (supabase.from("sale_returns" as any)
          .select("*")
          .eq("store_id", currentStoreId)
          .order("created_at", { ascending: false }) as any);
        if (fallback.error) throw fallback.error;

        rows = fallback.data || [];
        const saleIds = Array.from(new Set(rows.map((r: any) => r.sale_id).filter(Boolean)));
        if (saleIds.length > 0) {
          const salesRes = await (supabase.from("sales" as any)
            .select("id, customer_name, date_of_sale, total_amount")
            .in("id", saleIds) as any);
          const saleMap = new Map<string, any>((salesRes.data || []).map((s: any) => [String(s.id), s]));
          rows = rows.map((r: any) => ({ ...r, sale: saleMap.get(String(r.sale_id)) || null }));
        }
      }

      setReturns((rows || []).map((record: any) => mapReturnRecord(record)));
    } catch { setReturns([]); }
    finally { setLoading(false); }
  };

  const filteredReturns = useMemo(() => {
    const q = search.toLowerCase();
    return returns.filter(r =>
      r.type === (activeTab === "returns" ? "return" : "damaged") &&
      (!q || r.reason?.toLowerCase().includes(q) || r.sale?.customer_name?.toLowerCase().includes(q) ||
        r.items?.some((i: any) => String(i?.productName || i?.product_name || "").toLowerCase().includes(q)))
    );
  }, [returns, search, activeTab]);

  const stats = useMemo(() => ({
    totalReturns: returns.filter(r => r.type === "return").length,
    totalDamaged: returns.filter(r => r.type === "damaged").length,
    returnValue: returns.filter(r => r.type === "return").reduce((s, r) => s + (r.total_amount || 0), 0),
    damagedValue: returns.filter(r => r.type === "damaged").reduce((s, r) => s + (r.total_amount || 0), 0),
  }), [returns]);

  const openReturnDialog = (type: "return" | "damaged", sale?: SaleItem) => {
    setReturnType(type);
    setReturnReason(""); setReturnNote(""); setAddToStock(true);
    if (sale) {
      setSelectedSale(sale);
      setReturnItems((sale.products || []).map(p => ({
        productName: p.productName, quantity: 1, maxQty: p.quantity || 1,
        unitPrice: p.sellingPrice || 0, selected: false,
      })));
    } else {
      setSelectedSale(null); setReturnItems([]);
    }
    setReturnDialogOpen(true);
  };

  const selectSaleForReturn = (sale: SaleItem) => {
    setSelectedSale(sale);
    setReturnItems((sale.products || []).map(p => ({
      productName: p.productName, quantity: 1, maxQty: p.quantity || 1,
      unitPrice: p.sellingPrice || 0, selected: false,
    })));
    setSaleSearch("");
  };

  const submitReturn = async () => {
    if (!currentStoreId) return;
    const selected = returnItems.filter(i => i.selected);
    if (returnType === "return" && (!selectedSale || selected.length === 0)) {
      toast({ title: "Select items to return", variant: "destructive" }); return;
    }
    if (!returnReason) { toast({ title: "Select a reason", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const items = returnType === "return"
        ? selected.map(i => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, total: i.quantity * i.unitPrice }))
        : [{ productName: damagedProduct, quantity: damagedQty, unitPrice: 0, total: 0 }];

      const totalAmount = items.reduce((s, i) => s + i.total, 0);

      const payload: any = {
        store_id: currentStoreId, user_id: user.id,
        items, total_amount: totalAmount,
        returned_products: items,
        reason: returnReason, return_reason: returnReason,
        return_notes: returnNote || null,
        refund_status: "completed", refund_method: "cash",
        return_date: new Date().toISOString().split("T")[0],
        type: returnType, status: "completed",
      };
      if (returnType === "return" && selectedSale) payload.sale_id = selectedSale.id;

      const insertResult = await insertRowsWithSchemaFallback("sale_returns", [payload]);
      if (insertResult.error) throw insertResult.error;

      if (returnType === "return" && selectedSale) {
        // 1. Mark sale as returned & reduce total_amount
        const newTotal = Math.max(0, (selectedSale.totalAmount || 0) - totalAmount);
        const isFullReturn = newTotal === 0;

        const saleUpdatePayload = {
          total_amount: newTotal,
          return_status: isFullReturn ? "returned" : "partial_return",
          returned_amount: totalAmount,
        } as Record<string, unknown>;
        const updateResult = await updateByIdWithSchemaFallback("sales", selectedSale.id, saleUpdatePayload);
        if (updateResult.error) {
          const minimalUpdate = await updateByIdWithSchemaFallback("sales", selectedSale.id, { total_amount: newTotal });
          if (minimalUpdate.error) throw minimalUpdate.error;
        }

        // Notify parent to update in-memory salesData immediately
        onSaleUpdate?.({
          id: selectedSale.id,
          totalAmount: newTotal,
          return_status: isFullReturn ? "returned" : "partial_return",
          returned_amount: totalAmount,
        } as any);

        // 2. Cash refund or reduce customer debt
        const isPaidCash = selectedSale.paidInCash || !(selectedSale as any).customer_id;
        if (isPaidCash && totalAmount > 0) {
          await supabase.from("cash_transactions").insert({
            store_id: currentStoreId, user_id: user.id,
            amount: totalAmount, type: "out",
            description: "Refund: return from sale #" + (selectedSale.id?.slice(-6) || ""),
            created_at: new Date().toISOString(),
          } as any);
        } else if ((selectedSale as any).customer_id && totalAmount > 0) {
          const { data: cust } = await (
            supabase.from("customers" as any)
              .select("outstanding_balance, unpaid_balance")
              .eq("id", (selectedSale as any).customer_id)
              .maybeSingle() as any
          );
          if (cust) {
            const currentBalance = Number((cust as any).outstanding_balance ?? (cust as any).unpaid_balance ?? 0) || 0;
            const newBal = Math.max(0, currentBalance - totalAmount);
            await (supabase.from("customers" as any).update({
              outstanding_balance: newBal,
              unpaid_balance: newBal,
            } as any).eq("id", (selectedSale as any).customer_id) as any);
          }
        }
      }

      // 3. Add back to stock if requested
      if (addToStock) {
        for (const item of items) {
          const stockItem = stockData.find(s => s.productName === item.productName);
          if (stockItem) {
            const newQty = (stockItem.quantity || 0) + item.quantity;
            await supabase.from("inventory").update({ quantity: newQty }).eq("id", stockItem.id);
            onStockUpdate?.({ ...stockItem, quantity: newQty });
          }
        }
      }

      toast({
        title: "✓ Return recorded",
        description: totalAmount > 0 ? fmtCurrency(totalAmount) + " refunded & sale updated" : undefined
      });
      setReturnDialogOpen(false);
      fetchReturns();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const submitDamaged = async () => {
    if (!currentStoreId || !damagedProduct || !damagedReason) {
      toast({ title: "Fill all required fields", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const stockItem = stockData.find(s => s.productName === damagedProduct);
      const damagedPayload = {
        store_id: currentStoreId, user_id: user.id,
        items: [{ productName: damagedProduct, quantity: damagedQty, unitPrice: stockItem?.cost_per_unit || 0, total: (stockItem?.cost_per_unit || 0) * damagedQty }],
        total_amount: (stockItem?.cost_per_unit || 0) * damagedQty,
        reason: damagedReason,
        return_reason: damagedReason,
        return_notes: damagedNote || null,
        refund_status: "completed",
        refund_method: "cash",
        return_date: new Date().toISOString().split("T")[0],
        returned_products: [{ productName: damagedProduct, quantity: damagedQty }],
      };
      const insertResult = await insertRowsWithSchemaFallback("sale_returns", [damagedPayload]);
      if (insertResult.error) throw insertResult.error;
      // Deduct from stock
      if (stockItem) {
        const newQty = Math.max(0, (stockItem.quantity || 0) - damagedQty);
        await supabase.from("inventory").update({ quantity: newQty }).eq("id", stockItem.id);
        onStockUpdate?.({ ...stockItem, quantity: newQty });
      }
      toast({ title: "✓ Damaged stock recorded" });
      setDamagedProduct(""); setDamagedQty(1); setDamagedReason(""); setDamagedNote("");
      fetchReturns();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const cur = getCurrencySymbol();

  const filteredSales = useMemo(() => {
    const q = saleSearch.toLowerCase();
    if (!q) return salesData.slice(0, 20);
    return salesData.filter(s =>
      s.customerName?.toLowerCase().includes(q) ||
      s.id?.slice(-8).toLowerCase().includes(q) ||
      s.products?.some(p => p.productName?.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [salesData, saleSearch]);

  if (showLoader) {
    return <PageLoader text="Loading returns..." />;
  }
  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Undo2 className="h-8 w-8 text-primary" />
            Returns & Damaged
          </h2>
          <p className="text-muted-foreground mt-1">Track returned items and damaged stock</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openReturnDialog("return")} className="gap-2 bg-amber-500 hover:bg-amber-600">
            <Undo2 className="h-4 w-4" />Record Return
          </Button>
          <Button onClick={() => openReturnDialog("damaged")} variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-50">
            <AlertTriangle className="h-4 w-4" />Mark Damaged
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchReturns}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { tab: "returns", label: "Total Returns", value: stats.totalReturns, icon: Undo2, color: "text-amber-600", bg: "bg-amber-50" },
          { tab: "returns", label: "Return Value", value: fmtCurrency(stats.returnValue), icon: TrendingDown, color: "text-amber-600", bg: "bg-amber-50" },
          { tab: "damaged", label: "Damaged Items", value: stats.totalDamaged, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
          { tab: "damaged", label: "Damaged Value", value: fmtCurrency(stats.damagedValue), icon: Package, color: "text-red-600", bg: "bg-red-50" },
        ].map(({ tab, label, value, icon, color, bg }) => (
          <StatCard
            key={label}
            label={label}
            value={value}
            icon={icon}
            color={color}
            bg={bg}
            active={activeTab === tab}
            title={`Show ${tab}`}
            onClick={() => setActiveTab(tab)}
          />
        ))}
      </div>

      {/* Quick damaged stock form */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />Quick Damaged Stock Entry</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Product *</Label>
            <Select value={damagedProduct} onValueChange={setDamagedProduct}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>{stockData.map(s => <SelectItem key={s.id} value={s.productName}>{s.productName} (Qty: {s.quantity})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Quantity *</Label>
            <Input type="number" min={1} value={damagedQty} onChange={e => setDamagedQty(Math.max(1, +e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason *</Label>
            <Select value={damagedReason} onValueChange={setDamagedReason}>
              <SelectTrigger><SelectValue placeholder="Reason" /></SelectTrigger>
              <SelectContent>{DAMAGED_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input placeholder="Additional details..." value={damagedNote} onChange={e => setDamagedNote(e.target.value)} />
          </div>
          <Button onClick={submitDamaged} disabled={submitting} className="bg-red-500 hover:bg-red-600 gap-2">
            <AlertTriangle className="h-4 w-4" />Record Damaged
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search returns..." autoComplete="off" className="pl-9 pr-9 h-10" />
        {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="returns" className="gap-2"><Undo2 className="h-4 w-4" />Returns ({stats.totalReturns})</TabsTrigger>
          <TabsTrigger value="damaged" className="gap-2"><AlertTriangle className="h-4 w-4" />Damaged ({stats.totalDamaged})</TabsTrigger>
        </TabsList>

        {["returns", "damaged"].map(tab => (
          <TabsContent key={tab} value={tab}>
            <ScrollArea className="min-h-0 flex-1" type="auto">
              <div className="space-y-3 pr-2">
                {loading ? (
                  <div className="text-center py-10 text-muted-foreground">Loading...</div>
                ) : filteredReturns.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    {tab === "returns" ? <Undo2 className="h-12 w-12 mx-auto mb-3 opacity-20" /> : <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-20" />}
                    <p className="font-medium">No {tab} recorded yet</p>
                  </div>
                ) : filteredReturns.map(r => (
                  <div key={r.id} className={`p-4 border rounded-xl ${tab === "returns" ? "border-amber-200 bg-amber-50/30" : "border-red-200 bg-red-50/30"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`p-2 rounded-lg shrink-0 ${tab === "returns" ? "bg-amber-100" : "bg-red-100"}`}>
                          {tab === "returns" ? <Undo2 className="h-4 w-4 text-amber-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{r.sale?.customer_name || "Stock Return"}</span>
                            <Badge variant="outline" className={tab === "returns" ? "border-amber-300 text-amber-700 bg-amber-50" : "border-red-300 text-red-700 bg-red-50"}>
                              {tab === "returns" ? "Return" : "Damaged"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{r.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.reason} · {fmtDate(r.created_at)}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(r.items || []).map((item: any, i: number) => (
                              <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">{item.quantity}× {item.productName}</span>
                            ))}
                          </div>
                          {r.note && <p className="text-xs text-muted-foreground mt-1 italic">"{r.note}"</p>}
                        </div>
                      </div>
                      {r.total_amount > 0 && (
                        <p className={`font-bold text-sm shrink-0 ${tab === "returns" ? "text-amber-600" : "text-red-600"}`}>
                          -{cur} {r.total_amount.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>

      {/* Return Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {returnType === "return" ? <Undo2 className="h-5 w-5 text-amber-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
              {returnType === "return" ? "Record Return" : "Mark as Damaged"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {returnType === "return" && (
              <>
                {!selectedSale ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Find Sale</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={saleSearch} onChange={e => setSaleSearch(e.target.value)} placeholder="Search by customer, product, sale ID..." autoComplete="off" className="pl-9" />
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {filteredSales.map(sale => (
                        <button key={sale.id} onClick={() => selectSaleForReturn(sale)}
                          className="w-full text-left p-2 rounded-lg border hover:bg-muted/50 transition-colors text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{sale.customerName || "Walk-in"}</span>
                            <span className="font-bold text-primary">{fmtCurrency(sale.totalAmount)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{sale.products?.map(p => `${p.quantity}× ${p.productName}`).join(", ")}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                      <div>
                        <p className="font-semibold">{selectedSale.customerName || "Walk-in"}</p>
                        <p className="text-xs text-muted-foreground">{fmtCurrency(selectedSale.totalAmount)}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedSale(null); setReturnItems([]); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Label className="text-xs">Select items to return</Label>
                    <div className="space-y-2">
                      {returnItems.map((item, idx) => (
                        <div key={idx} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${item.selected ? "border-amber-300 bg-amber-50/50" : ""}`}>
                          <input type="checkbox" checked={item.selected} onChange={e => {
                            const next = [...returnItems]; next[idx].selected = e.target.checked; setReturnItems(next);
                          }} className="h-4 w-4" />
                          <span className="flex-1 text-sm font-medium">{item.productName}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => { const n=[...returnItems]; n[idx].quantity=Math.max(1,n[idx].quantity-1); setReturnItems(n); }} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3"/></button>
                            <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                            <button onClick={() => { const n=[...returnItems]; n[idx].quantity=Math.min(n[idx].maxQty,n[idx].quantity+1); setReturnItems(n); }} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted"><Plus className="h-3 w-3"/></button>
                          </div>
                          <span className="text-xs text-muted-foreground w-20 text-right">{fmtCurrency(item.quantity * item.unitPrice)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="add-stock" checked={addToStock} onChange={e => setAddToStock(e.target.checked)} className="h-4 w-4" />
                      <Label htmlFor="add-stock" className="text-sm cursor-pointer">Add returned items back to stock</Label>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Reason *</Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>{(returnType === "return" ? RETURN_REASONS : DAMAGED_REASONS).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea placeholder="Additional details..." value={returnNote} onChange={e => setReturnNote(e.target.value)} rows={2} />
            </div>
            <Button onClick={submitReturn} disabled={submitting} className={`w-full gap-2 ${returnType === "return" ? "bg-amber-500 hover:bg-amber-600" : "bg-red-500 hover:bg-red-600"}`}>
              {submitting ? "Processing..." : returnType === "return" ? "Record Return" : "Mark as Damaged"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
