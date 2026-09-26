import { useMemo, useState, useEffect, useRef } from "react";
import { useShift } from "@/providers/ShiftProvider";
import { fmtCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { StockItem } from "@/types";
import { useUpdateInventoryOptimistic, useDeleteProductOptimistic } from "@/hooks/useOptimizedData";
import { buildProductSearchIndex, searchProductIndex } from "@/lib/productSearch";
import { useInstantClearDeferredValue } from "@/hooks/useInstantClearDeferredValue";
import { InventoryFilters } from "./inventory/InventoryFilters";
import { InventoryTable } from "./inventory/InventoryTable";
import { EditProductDialog } from "./inventory/EditProductDialog";
import StatCard from "@/components/StatCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Package, Edit, ShoppingBag, Trash2, PenLine, X,
  AlertTriangle, Boxes, TrendingUp, Tag, Plus, LayoutDashboard,
  ClipboardCheck, ChevronLeft, ChevronRight, CheckCircle2,
} from "lucide-react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import SachetManagement from "./SachetManagement";

interface InventoryManagementProps {
  stockData: StockItem[];
  setStockData: React.Dispatch<React.SetStateAction<StockItem[]>>;
  categories?: { name: string }[];
  currentPage?: string;
  isLoading?: boolean;
}

const InventoryManagement = ({
  stockData,
  setStockData,
  categories,
  currentPage,
  isLoading = false,
}: InventoryManagementProps) => {
  const { toast } = useToast();
  const updateInventoryMutation = useUpdateInventoryOptimistic();
  const deleteProductMutation = useDeleteProductOptimistic();

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [hashStockFilter, setHashStockFilter] = useState<null | "low" | "critical">(null);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
  const [editingProduct, setEditingProduct] = useState<StockItem | null>(null);
  const [isBulkQtyOpen, setIsBulkQtyOpen] = useState(false);
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, number>>({});
  const [isStockCountOpen, setIsStockCountOpen] = useState(false);
  const [stockCountSupplier, setStockCountSupplier] = useState("all");
  const [stockCountIndex, setStockCountIndex] = useState(0);
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [finishedStockCounts, setFinishedStockCounts] = useState<Set<string>>(new Set());
  const stockCountRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({
    category: "__none__",
    supplier: "__none__",
    retailPrice: "",
    wholesalePrice: "",
    minStockLevel: "",
  });

  const deferredSearchTerm = useInstantClearDeferredValue(searchTerm);
  const { store } = useShift();
  const storeId = store?.id || localStorage.getItem("brec_current_store") || null;
  const [lowStockThreshold] = useState(() =>
    Number(
      localStorage.getItem(`lowStockThreshold_${storeId}`) ||
        localStorage.getItem("lowStockThreshold") ||
        100,
    ),
  );
  const [criticalStockThreshold] = useState(() =>
    Number(
      localStorage.getItem(`criticalStockThreshold_${storeId}`) ||
        localStorage.getItem("criticalStockThreshold") ||
        20,
    ),
  );

  useEffect(() => {
    if (currentPage && currentPage !== "inventory") {
      setSearchTerm("");
      setCategoryFilter("all");
      setHashStockFilter(null);
      setSelectedIds(new Set());
      window.location.hash = window.location.hash.split("?")[0];
    }
  }, [currentPage]);

  useEffect(() => {
    if (!isBulkQtyOpen) setBulkQuantities({});
  }, [isBulkQtyOpen]);

  useEffect(() => {
    const applyFromHash = () => {
      const hash = window.location.hash || "";
      const qIndex = hash.indexOf("?");
      if (qIndex === -1) {
        setHashStockFilter(null);
        return;
      }
      const params = new URLSearchParams(hash.slice(qIndex + 1));
      const stock = params.get("stock");
      if (stock === "low" || stock === "critical") setHashStockFilter(stock as "low" | "critical");
      else setHashStockFilter(null);
      const q = params.get("q");
      if (q) {
        setCategoryFilter("all");
        setSearchTerm(q);
      }
    };
    applyFromHash();
    window.addEventListener("hashchange", applyFromHash);
    return () => window.removeEventListener("hashchange", applyFromHash);
  }, []);

  const productIndex = useMemo(() => buildProductSearchIndex(stockData), [stockData]);

  const searchedStock = useMemo(() => {
    if (!deferredSearchTerm.trim()) return stockData;
    return searchProductIndex(productIndex, deferredSearchTerm);
  }, [productIndex, deferredSearchTerm, stockData]);

  const filteredStock = useMemo(() => {
    return searchedStock.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (supplierFilter !== "all" && (item.supplier_name || item.supplier || "") !== supplierFilter)
        return false;
      if (!hashStockFilter) return true;
      const critical = item.min_stock_level || criticalStockThreshold;
      const low = item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold;
      const qty = item.quantity || 0;
      return hashStockFilter === "critical" ? qty < critical : qty < low && qty >= critical;
    });
  }, [searchedStock, categoryFilter, supplierFilter, hashStockFilter, criticalStockThreshold, lowStockThreshold]);

  const categoriesList = useMemo(() => {
    const s = new Set<string>();
    stockData.forEach((i) => {
      if (i.category) s.add(i.category);
    });
    return Array.from(s).sort();
  }, [stockData]);

  const suppliersList = useMemo(() => {
    const s = new Set<string>();
    stockData.forEach((i) => {
      const n = i.supplier_name || i.supplier;
      if (n) s.add(n);
    });
    return Array.from(s).sort();
  }, [stockData]);

  const stockCountItems = useMemo(
    () => stockData
      .filter((item) => stockCountSupplier === "all" || (item.supplier_name || item.supplier || "") === stockCountSupplier)
      .sort((a, b) => `${a.productName || ""}-${a.id}`.localeCompare(`${b.productName || ""}-${b.id}`)),
    [stockData, stockCountSupplier],
  );
  const activeStockCountItem = stockCountItems[stockCountIndex] || null;
  const activePhysicalCount = activeStockCountItem ? physicalCounts[activeStockCountItem.id] ?? "" : "";
  const activeVariance = activeStockCountItem && activePhysicalCount !== ""
    ? Number(activePhysicalCount) - Number(activeStockCountItem.quantity || 0)
    : null;

  useEffect(() => {
    if (stockCountIndex >= stockCountItems.length) setStockCountIndex(Math.max(0, stockCountItems.length - 1));
  }, [stockCountIndex, stockCountItems.length]);

  const stockCountStorageKey = `stock-count-progress:${storeId || "unknown"}:${stockCountSupplier}`;

  useEffect(() => {
    if (!isStockCountOpen) return;
    try {
      const saved = JSON.parse(localStorage.getItem(stockCountStorageKey) || "null") as { physicalCounts?: Record<string, string>; finished?: string[] } | null;
      const availableIds = new Set(stockCountItems.map((item) => item.id));
      const savedFinished = new Set((saved?.finished || []).filter((id) => availableIds.has(id)));
      const savedCounts = Object.fromEntries(Object.entries(saved?.physicalCounts || {}).filter(([id]) => availableIds.has(id)));
      setFinishedStockCounts(savedFinished);
      setPhysicalCounts(savedCounts);
      const firstOpen = stockCountItems.findIndex((item) => !savedFinished.has(item.id));
      setStockCountIndex(firstOpen >= 0 ? firstOpen : Math.max(0, stockCountItems.length - 1));
    } catch {
      setFinishedStockCounts(new Set());
      setPhysicalCounts({});
      setStockCountIndex(0);
    }
  }, [isStockCountOpen, stockCountStorageKey, stockCountItems]);

  useEffect(() => {
    if (!isStockCountOpen) return;
    localStorage.setItem(stockCountStorageKey, JSON.stringify({
      physicalCounts,
      finished: Array.from(finishedStockCounts),
    }));
  }, [isStockCountOpen, stockCountStorageKey, physicalCounts, finishedStockCounts]);

  const scrollToStockCountItem = (index: number) => {
    if (!stockCountItems.length) return;
    const nextIndex = Math.max(0, Math.min(index, stockCountItems.length - 1));
    setStockCountIndex(nextIndex);
    const id = stockCountItems[nextIndex]?.id;
    if (id) setTimeout(() => stockCountRefs.current[id]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 30);
  };

  const finishStockCountItem = (id: string) => {
    setFinishedStockCounts((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const nextUnfinishedIndex = (fromIndex: number) => {
    for (let index = Math.max(0, fromIndex); index < stockCountItems.length; index += 1) {
      if (!finishedStockCounts.has(stockCountItems[index].id)) return index;
    }
    return -1;
  };

  const handleSavePhysicalCount = async (item: StockItem) => {
    const raw = physicalCounts[item.id];
    if (raw === undefined || raw === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      toast({ title: "Enter a valid physical count", variant: "destructive" });
      return;
    }
    const quantity = Math.max(0, Math.round(Number(raw)));
    const previous = item.quantity || 0;
    setStockData((current) => current.map((product) => product.id === item.id ? { ...product, quantity } : product));
    try {
      await updateInventoryMutation.mutateAsync({ id: item.id, updates: { quantity } });
      finishStockCountItem(item.id);
      const nextIndex = nextUnfinishedIndex(stockCountIndex + 1);
      if (nextIndex >= 0) scrollToStockCountItem(nextIndex);
      toast({ title: "Stock count saved", description: `${item.productName} is now ${quantity} units.` });
    } catch (error: any) {
      setStockData((current) => current.map((product) => product.id === item.id ? { ...product, quantity: previous } : product));
      toast({ title: "Could not save count", description: error.message, variant: "destructive" });
    }
  };

  const handleMatchAndNext = () => {
    if (!activeStockCountItem) return;
    setPhysicalCounts((current) => ({ ...current, [activeStockCountItem.id]: String(activeStockCountItem.quantity || 0) }));
    finishStockCountItem(activeStockCountItem.id);
    const nextIndex = nextUnfinishedIndex(stockCountIndex + 1);
    if (nextIndex >= 0) scrollToStockCountItem(nextIndex);
  };

  // ── derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalValue = stockData.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.cost_per_unit || item.costPerUnit || 0),
      0,
    );
    const criticalCount = stockData.filter((item) => {
      const threshold = item.min_stock_level || criticalStockThreshold;
      return (item.quantity || 0) < threshold;
    }).length;
    const lowCount = stockData.filter((item) => {
      const critical = item.min_stock_level || criticalStockThreshold;
      const low = item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold;
      const qty = item.quantity || 0;
      return qty < low && qty >= critical;
    }).length;
    return { totalValue, criticalCount, lowCount };
  }, [stockData, criticalStockThreshold, lowStockThreshold]);

  // ── handlers ────────────────────────────────────────────────────────────────
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await deleteProductMutation.mutateAsync(id);
      setStockData((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Deleted", description: `${name} removed` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size || !confirm(`Delete ${selectedIds.size} products?`)) return;
    try {
      await Promise.all([...selectedIds].map((id) => deleteProductMutation.mutateAsync(id)));
      setStockData((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      const count = selectedIds.size;
      setSelectedIds(new Set());
      toast({ title: "Deleted", description: `${count} products removed` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleBulkEdit = async () => {
    const updates: Partial<StockItem> = {};
    if (bulkEditForm.category && bulkEditForm.category !== "__none__") updates.category = bulkEditForm.category;
    if (bulkEditForm.supplier && bulkEditForm.supplier !== "__none__") {
      updates.supplier_name = bulkEditForm.supplier;
      (updates as any).supplier = bulkEditForm.supplier;
    }
    if (bulkEditForm.retailPrice) updates.retail_price = Number(bulkEditForm.retailPrice);
    if (bulkEditForm.wholesalePrice) updates.wholesale_price = Number(bulkEditForm.wholesalePrice);
    if (bulkEditForm.minStockLevel) updates.min_stock_level = Number(bulkEditForm.minStockLevel);
    if (!Object.keys(updates).length) {
      toast({ title: "No changes", description: "Fill at least one field", variant: "destructive" });
      return;
    }
    try {
      await Promise.all([...selectedIds].map((id) => updateInventoryMutation.mutateAsync({ id, updates })));
      setStockData((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, ...updates } : p)));
      const count = selectedIds.size;
      setSelectedIds(new Set());
      setIsBulkEditOpen(false);
      setBulkEditForm({ category: "__none__", supplier: "__none__", retailPrice: "", wholesalePrice: "", minStockLevel: "" });
      toast({ title: "Updated", description: `${count} products updated` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleBulkQuantityUpdate = async (item: StockItem, targetValue: number) => {
    const qty = Math.max(0, Math.round(targetValue));
    if (qty === (item.quantity || 0)) {
      setBulkQuantities((p) => ({ ...p, [item.id]: qty }));
      return;
    }
    const prevQty = item.quantity || 0;
    setStockData((prev) => prev.map((p) => (p.id === item.id ? { ...p, quantity: qty } : p)));
    setBulkQuantities((p) => ({ ...p, [item.id]: qty }));
    try {
      await updateInventoryMutation.mutateAsync({ id: item.id, updates: { quantity: qty } });
      toast({ title: "Updated", description: `${item.productName} is now ${qty}` });
    } catch (e: any) {
      setStockData((prev) => prev.map((p) => (p.id === item.id ? { ...p, quantity: prevQty } : p)));
      setBulkQuantities((p) => ({ ...p, [item.id]: prevQty }));
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setHashStockFilter(null);
    window.location.hash = window.location.hash.split("?")[0];
  };

  const showLoader = useMinimumLoading(isLoading, 350);
  if (showLoader) return <PageLoader text="Loading inventory..." />;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    // The main layout (Layout.tsx) handles page scrolling via overflow-y-auto.
    // Use a simple vertical stack so all content flows naturally.
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-bold">
            <Package className="h-8 w-8 text-primary" />
            Inventory
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Double-click a row to select &rarr; manage stock and bulk actions
          </p>
        </div>
        <Button onClick={() => { setStockCountSupplier("all"); setStockCountIndex(0); setIsStockCountOpen(true); }} className="gap-2">
          <ClipboardCheck className="h-4 w-4" /> Stock Count
        </Button>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Products"
          value={stockData.length}
          sub="items in stock"
          icon={Boxes}
          color="text-primary"
          bg="bg-primary/10"
        />
        <StatCard
          label="Inventory Value"
          value={fmtCurrency(stats.totalValue)}
          sub="cost × quantity"
          icon={TrendingUp}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          label="Critical Stock"
          value={stats.criticalCount}
          sub={`below ${criticalStockThreshold} units`}
          icon={AlertTriangle}
          color="text-destructive"
          bg="bg-destructive/10"
          onClick={() => setHashStockFilter(hashStockFilter === "critical" ? null : "critical")}
          active={hashStockFilter === "critical"}
          title="Filter critical stock items"
        />
        <StatCard
          label="Low Stock"
          value={stats.lowCount}
          sub="approaching minimum"
          icon={Tag}
          color="text-amber-600"
          bg="bg-amber-50"
          onClick={() => setHashStockFilter(hashStockFilter === "low" ? null : "low")}
          active={hashStockFilter === "low"}
          title="Filter low stock items"
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div>
        <InventoryFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          categoriesList={categoriesList}
          showAllCategories={showAllCategories}
          setShowAllCategories={setShowAllCategories}
          hashStockFilter={hashStockFilter}
          onClearFilters={handleClearFilters}
          onBulkUpdate={() => setIsBulkQtyOpen(true)}
          hasItems={filteredStock.length > 0}
          supplierFilter={supplierFilter}
          setSupplierFilter={setSupplierFilter}
          suppliersList={suppliersList}
        />
      </div>

      {/* ── Bulk selection toolbar ─────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 p-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-primary" />
            <span className="font-bold">{selectedIds.size} selected</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setIsBulkEditOpen(true)}
            >
              <PenLine className="h-4 w-4" /> Bulk Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* ── Scrollable table ───────────────────────────────────────────────── */}
      <div className="pb-6">
        <InventoryTable
          stockItems={filteredStock}
          lowStockThreshold={lowStockThreshold}
          criticalStockThreshold={criticalStockThreshold}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onEdit={(item) => setEditingProduct(item)}
          onDelete={handleDeleteProduct}
          onUpdateQty={async (item, qty) => {
            try {
              setStockData((prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, quantity: qty } : p)),
              );
              await updateInventoryMutation.mutateAsync({ id: item.id, updates: { quantity: qty } });
              toast({ title: "Updated", description: `${item.productName} is now ${qty}` });
            } catch (e: any) {
              setStockData((prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, quantity: item.quantity } : p)),
              );
              toast({ title: "Failed", description: e.message, variant: "destructive" });
            }
          }}
        />
      </div>

      <Dialog open={isStockCountOpen} onOpenChange={setIsStockCountOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-primary/10 bg-primary/5 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-6"><div><DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />Stock Count</DialogTitle><DialogDescription>Count physical stock by supplier and review each variance before finishing.</DialogDescription></div><div className="rounded-lg bg-primary/10 px-3 py-2 text-right text-xs"><span className="font-bold text-primary">{finishedStockCounts.size}</span><span className="text-muted-foreground"> / {stockCountItems.length} finished</span></div></div>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-end"><div className="space-y-2"><Label>Supplier</Label><Select value={stockCountSupplier} onValueChange={(value) => { setStockCountSupplier(value); setStockCountIndex(0); }}><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliersList.map((supplier) => <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>)}</SelectContent></Select></div><p className="text-sm text-muted-foreground">Items are ordered alphabetically. Finished items are saved automatically, so reopening continues at the next unfinished item.</p></div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" aria-label="Stock count items">{stockCountItems.map((item, index) => <button key={item.id} ref={(node) => { stockCountRefs.current[item.id] = node; }} type="button" onClick={() => scrollToStockCountItem(index)} className={`min-w-[170px] rounded-xl border p-3 text-left transition-colors ${index === stockCountIndex ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "bg-card hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{item.productName}</span>{finishedStockCounts.has(item.id) && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}</div><p className="mt-1 text-xs text-muted-foreground">Expected: {item.quantity || 0}</p></button>)}{!stockCountItems.length && <div className="w-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No inventory items for this supplier.</div>}</div>
            {activeStockCountItem && <div className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Item {stockCountIndex + 1} of {stockCountItems.length}</p><h3 className="mt-1 text-2xl font-bold">{activeStockCountItem.productName}</h3><p className="mt-1 text-sm text-muted-foreground">{activeStockCountItem.supplier_name || activeStockCountItem.supplier || "No supplier"} · {activeStockCountItem.category || "Uncategorised"}</p></div>{finishedStockCounts.has(activeStockCountItem.id) && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><CheckCircle2 className="h-3.5 w-3.5" />Finished</span>}</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">System quantity</p><p className="mt-1 text-2xl font-bold">{activeStockCountItem.quantity || 0}</p><p className="text-xs text-muted-foreground">Expected</p></div><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><Label htmlFor="physical-stock-count">Physical count</Label><Input id="physical-stock-count" type="number" min="0" value={activePhysicalCount} onChange={(event) => { setPhysicalCounts((current) => ({ ...current, [activeStockCountItem.id]: event.target.value })); setFinishedStockCounts((current) => { const next = new Set(current); next.delete(activeStockCountItem.id); return next; }); }} className="mt-2 h-11 text-lg font-bold" placeholder="Enter count" /></div><div className={`rounded-xl border p-4 ${activeVariance === null ? "bg-muted/30" : activeVariance === 0 ? "border-primary/20 bg-primary/5" : "border-destructive/20 bg-destructive/5"}`}><p className="text-xs text-muted-foreground">Variance</p><p className={`mt-1 text-2xl font-bold ${activeVariance === null ? "text-muted-foreground" : activeVariance === 0 ? "text-primary" : "text-destructive"}`}>{activeVariance === null ? "—" : activeVariance > 0 ? `+${activeVariance}` : activeVariance}</p><p className="text-xs text-muted-foreground">{activeVariance === null ? "Enter physical count" : activeVariance === 0 ? "Matched" : "Needs review"}</p></div></div><div className="mt-5 flex flex-wrap justify-between gap-2"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => scrollToStockCountItem(stockCountIndex - 1)} disabled={stockCountIndex === 0}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button variant="outline" size="sm" onClick={() => void handleSavePhysicalCount(activeStockCountItem)} disabled={activePhysicalCount === ""}>Save quantity</Button></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { finishStockCountItem(activeStockCountItem.id); const nextIndex = nextUnfinishedIndex(stockCountIndex + 1); if (nextIndex >= 0) scrollToStockCountItem(nextIndex); }}>{finishedStockCounts.has(activeStockCountItem.id) ? "Finished" : "Finish & Next"}</Button><Button size="sm" onClick={handleMatchAndNext}><CheckCircle2 className="mr-1 h-4 w-4" />Match & Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div></div>}
          </div>
          <DialogFooter className="border-t bg-muted/20 px-6 py-4"><Button variant="outline" onClick={() => setIsStockCountOpen(false)}>Close</Button><Button onClick={() => setIsStockCountOpen(false)} disabled={stockCountItems.length > 0 && finishedStockCounts.size < stockCountItems.length}>Finish stock count</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              Bulk Edit {selectedIds.size} Products
            </DialogTitle>
            <DialogDescription className="text-xs">
              Only fill fields you want to update. Empty fields stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category / Group</Label>
              <Select
                value={bulkEditForm.category}
                onValueChange={(v) => setBulkEditForm((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Keep current</SelectItem>
                  {categoriesList.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select
                value={bulkEditForm.supplier}
                onValueChange={(v) => setBulkEditForm((p) => ({ ...p, supplier: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Keep current</SelectItem>
                  {suppliersList.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Retail Price</Label>
                <Input
                  type="number"
                  placeholder="Keep current"
                  value={bulkEditForm.retailPrice}
                  onChange={(e) => setBulkEditForm((p) => ({ ...p, retailPrice: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Wholesale Price</Label>
                <Input
                  type="number"
                  placeholder="Keep current"
                  value={bulkEditForm.wholesalePrice}
                  onChange={(e) => setBulkEditForm((p) => ({ ...p, wholesalePrice: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Min Stock Level</Label>
              <Input
                type="number"
                placeholder="Keep current"
                value={bulkEditForm.minStockLevel}
                onChange={(e) => setBulkEditForm((p) => ({ ...p, minStockLevel: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkEdit}>Apply to {selectedIds.size} Products</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Quantity Update Dialog ─────────────────────────────────────── */}
      <Dialog open={isBulkQtyOpen} onOpenChange={setIsBulkQtyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Bulk Quantity Update
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4 pr-2">
            <p className="text-sm text-muted-foreground">
              Update quantities for all filtered items ({filteredStock.length}).
            </p>
            <div className="overflow-hidden rounded-lg border bg-card/70">
              <Table>
                <TableHeader className="bg-muted/50 text-[10px] uppercase tracking-wider">
                  <TableRow>
                    <TableHead className="w-48">Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">New Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStock.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        No products
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStock.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-semibold">{item.productName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                        <TableCell className="text-right font-bold">{item.quantity || 0}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            className="h-9 text-center font-bold"
                            value={bulkQuantities[item.id] ?? item.quantity}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!isNaN(n)) setBulkQuantities((p) => ({ ...p, [item.id]: n }));
                            }}
                            onBlur={() =>
                              void handleBulkQuantityUpdate(
                                item,
                                Number(bulkQuantities[item.id] ?? item.quantity),
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsBulkQtyOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Single Product Edit ─────────────────────────────────────────────── */}
      <EditProductDialog
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        product={editingProduct}
        categories={categoriesList}
        onSave={(updated) => {
          setStockData((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setEditingProduct(null);
        }}
      />

      {/* ── Product Details Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!selectedProduct} onOpenChange={(v) => !v && setSelectedProduct(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl">
                  <Package className="h-6 w-6 text-primary" />
                  {selectedProduct.productName}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-6 pt-4 md:grid-cols-3">
                <div className="space-y-4 md:col-span-1">
                  {selectedProduct.productImage ? (
                    <img
                      src={selectedProduct.productImage}
                      className="w-full aspect-square rounded-xl object-cover border-2 shadow-sm"
                      alt={selectedProduct.productName}
                    />
                  ) : (
                    <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center border-2 border-dashed">
                      <Plus className="h-12 w-12 text-muted-foreground opacity-20" />
                    </div>
                  )}
                  <div className="space-y-2 rounded-xl bg-muted/50 p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="font-bold">{selectedProduct.category}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Barcode:</span>
                      <span className="font-mono text-xs">{selectedProduct.barcode || "N/A"}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 text-sm">
                      <span className="text-muted-foreground">Unit Cost:</span>
                      <span className="font-bold">{fmtCurrency(selectedProduct.costPerUnit || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-primary">
                      <span className="text-muted-foreground">Retail:</span>
                      <span>{fmtCurrency(selectedProduct.retailPrice || 0)}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setSelectedProduct(null);
                      setEditingProduct(selectedProduct);
                    }}
                    className="w-full gap-2"
                  >
                    <Edit className="h-4 w-4" /> Edit Product Details
                  </Button>
                </div>
                <div className="space-y-6 md:col-span-2">
                  <div className="rounded-xl border border-primary/10 bg-primary/5 p-4">
                    <h4 className="mb-2 flex items-center gap-2 text-lg font-bold">
                      <LayoutDashboard className="h-5 w-5 text-primary" />
                      Performance & Conversion
                    </h4>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Manage packaging units, sachet conversions, and bulk stock movements here.
                    </p>
                    <SachetManagement
                      product={selectedProduct}
                      stockData={stockData}
                      onUpdateStock={(updated) => {
                        setStockData((prev) =>
                          prev.map((p) => (p.id === updated.id ? updated : p)),
                        );
                        setSelectedProduct(updated);
                      }}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-8 border-t pt-4">
                <Button variant="outline" onClick={() => setSelectedProduct(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryManagement;
