import { useEffect, useMemo, useState } from "react";
import StatCard from "@/components/StatCard";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Package, RotateCw, DollarSign, Barcode, Tag,
  TrendingUp, AlertTriangle, Box, Boxes, ShoppingBag,
  Edit2, ChevronRight, Layers, Info, Truck, Calendar,
  Grid3X3, List, Copy, Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { StockItem } from "@/types";
import { LoadingSpinner, PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";

interface ProductsProps {
  currentStoreId?: string | null;
  stockData: StockItem[];
  onUpdateStock?: (updated: StockItem) => void;
  onDeleteStock?: (id: string) => void;
}

const Products = ({ currentStoreId, stockData, onUpdateStock, onDeleteStock }: ProductsProps) => {
  const [products, setProducts] = useState<StockItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [cardFilter, setCardFilter] = useState<"all" | "low_stock">("all");
  const [sortBy, setSortBy] = useState<"name" | "quantity" | "price" | "value">("name");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [viewProduct, setViewProduct] = useState<StockItem | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StockItem | null>(null);
  const [editForm, setEditForm] = useState({
    productName: "", category: "", retail: 0, wholesale: 0, costPerUnit: 0,
    barcode: "", packaging_type: "sachet", unit_name: "item", items_per_sachet: 1,
    min_stock_level: 5, reorder_quantity: 10, notes: "", supplier: "", size: "", dateOfPurchase: "",
    quantity: 0, sachets_count: 0, loose_items: 0,
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showLoader = useMinimumLoading(loading, 350);
  const [showList, setShowList] = useState(true);
  const [appliedTaxRate, setAppliedTaxRate] = useState(18);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const { toast } = useToast();

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);
  const activeStoreId = useMemo(() => products.find(p => p.store_id)?.store_id || stockData.find(p => p.store_id)?.store_id || null, [products, stockData]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
    setProducts(stockData);
  }, [stockData]);

  useEffect(() => {
    if (!activeStoreId) return;
    supabase.from("tax_configurations").select("rate, is_active").eq("store_id", activeStoreId)
      .order("created_at", { ascending: true }).then(({ data }) => {
        const active = (data || []).find((t: any) => t.is_active !== false) || data?.[0];
        const r = Number(active?.rate);
        setAppliedTaxRate(Number.isFinite(r) && r >= 0 ? r : 18);
      });
  }, [activeStoreId]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const searched = q
      ? products.filter(p =>
          p.productName.toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          (p.supplier || "").toLowerCase().includes(q)
        )
      : products;
      const filtered = searched.filter(p => filterCategory === "all" || p.category === filterCategory);
      const scoped = cardFilter === "low_stock"
        ? filtered.filter(p => p.quantity <= (p.min_stock_level || 5))
        : filtered;
      return scoped.sort((a, b) => {
      if (sortBy === "quantity") return (b.quantity || 0) - (a.quantity || 0);
      if (sortBy === "price") return (b.retail_price || 0) - (a.retail_price || 0);
      if (sortBy === "value") return ((b.quantity || 0) * (b.cost_per_unit || 0)) - ((a.quantity || 0) * (a.cost_per_unit || 0));
      return a.productName.localeCompare(b.productName);
    });
  }, [products, searchTerm, filterCategory, sortBy, cardFilter]);

  const stats = useMemo(() => ({
    total: products.length,
    lowStock: products.filter(p => p.quantity <= (p.min_stock_level || 5)).length,
    totalValue: products.reduce((s, p) => s + (p.quantity || 0) * (p.cost_per_unit || p.costPerUnit || 0), 0),
    categories: categories.length,
  }), [products, categories]);

  const duplicateGroups = useMemo(() => {
    const grouped = new Map<string, StockItem[]>();
    products.forEach((product) => {
      const key = `${product.productName.trim().toLowerCase()}|${String(product.barcode || "").trim().toLowerCase()}`;
      const group = grouped.get(key) || [];
      group.push(product);
      grouped.set(key, group);
    });
    return Array.from(grouped.values()).filter((group) => group.length > 1);
  }, [products]);

  const duplicateItems = useMemo(() => duplicateGroups.flatMap((group) => group.slice(1)), [duplicateGroups]);

  const openDuplicateDialog = () => {
    setSelectedDuplicateIds(new Set(duplicateItems.map((product) => product.id)));
    setDuplicateDialogOpen(true);
  };

  const handleDeleteDuplicates = async () => {
    const ids = Array.from(selectedDuplicateIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} duplicate product record${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setDeletingDuplicates(true);
    try {
      const { error } = await supabase.from("inventory").delete().in("id", ids);
      if (error) throw error;
      setProducts((current) => current.filter((product) => !selectedDuplicateIds.has(product.id)));
      ids.forEach((id) => onDeleteStock?.(id));
      setDuplicateDialogOpen(false);
      toast({ title: "Duplicates removed", description: `${ids.length} duplicate product record${ids.length === 1 ? "" : "s"} deleted.` });
    } catch (error: any) {
      toast({ title: "Could not remove duplicates", description: error.message, variant: "destructive" });
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const refreshProducts = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const targetStoreId = currentStoreId || (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id;
      const storeId = targetStoreId;
      if (!storeId) return;
      const { data, error } = await supabase.from("inventory").select("*").eq("store_id", storeId).order("product_name");
      if (error) throw error;
      setProducts((data || []).map((item: any) => ({
        id: item.id, productName: item.product_name, product_name: item.product_name,
        quantity: item.quantity, sachets_count: item.sachets_count || 0, loose_items: item.loose_items || 0,
        opened_sachets: item.opened_sachets || 0, items_per_sachet: item.items_per_sachet || 1,
        retail_price: item.retail_price || 0, wholesale_price: item.wholesale_price || 0,
        cost_per_unit: item.cost_per_unit || 0, costPerUnit: item.cost_per_unit || 0,
        category: item.category, totalValue: item.total_value, dateOfPurchase: item.date_of_purchase,
        store_id: item.store_id, min_stock_level: item.min_stock_level || 5,
        reorder_quantity: item.reorder_quantity || 10, notes: item.notes, packaging_type: item.packaging_type,
        unit_name: item.unit_name, barcode: item.barcode, barcode_type: item.barcode_type,
        barcode_mode: item.barcode_mode, supplier: item.supplier, size: item.size,
      })));
      toast({ title: "✓ Refreshed", description: `${data?.length || 0} products loaded` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const openEditDialog = (product: StockItem) => {
    setEditingProduct(product);
    setEditForm({
      productName: product.productName, category: product.category || "",
      retail: product.retail_price || 0, wholesale: product.wholesale_price || 0,
      costPerUnit: product.cost_per_unit || product.costPerUnit || 0,
      barcode: product.barcode || "", packaging_type: product.packaging_type || "sachet",
      unit_name: product.unit_name || "item", items_per_sachet: product.items_per_sachet || 1,
      min_stock_level: product.min_stock_level || 5, reorder_quantity: product.reorder_quantity || 10,
      notes: product.notes || "", supplier: (product as any).supplier || "",
      size: product.size || "", dateOfPurchase: product.dateOfPurchase || "",
      quantity: product.quantity || 0, sachets_count: product.sachets_count || 0, loose_items: product.loose_items || 0,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    if (!editForm.productName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    try {
      const { error } = await supabase.from("inventory").update({
        product_name: editForm.productName.trim(), category: editForm.category.trim(),
        retail_price: editForm.retail, wholesale_price: editForm.wholesale,
        cost_per_unit: editForm.costPerUnit, barcode: editForm.barcode || null,
        packaging_type: editForm.packaging_type, unit_name: editForm.unit_name || "item",
        items_per_sachet: editForm.items_per_sachet, min_stock_level: editForm.min_stock_level,
        reorder_quantity: editForm.reorder_quantity, notes: editForm.notes || null,
        supplier_name: editForm.supplier || null, size: editForm.size || null,
        date_of_purchase: editForm.dateOfPurchase || null,
        quantity: editForm.quantity, sachets_count: editForm.sachets_count, loose_items: editForm.loose_items,
      }).eq("id", editingProduct.id);
      if (error) throw error;
      const updated = { ...editingProduct, productName: editForm.productName.trim(), product_name: editForm.productName.trim(),
        category: editForm.category, retail_price: editForm.retail, wholesale_price: editForm.wholesale,
        cost_per_unit: editForm.costPerUnit, costPerUnit: editForm.costPerUnit, barcode: editForm.barcode || undefined,
        packaging_type: editForm.packaging_type, unit_name: editForm.unit_name, items_per_sachet: editForm.items_per_sachet,
        min_stock_level: editForm.min_stock_level, reorder_quantity: editForm.reorder_quantity,
        notes: editForm.notes || undefined, supplier: editForm.supplier || undefined, size: editForm.size || undefined,
        quantity: editForm.quantity, sachets_count: editForm.sachets_count, loose_items: editForm.loose_items,
      };
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? updated : p));
      if (viewProduct?.id === editingProduct.id) setViewProduct(updated);
      onUpdateStock?.(updated);
      toast({ title: "✓ Product Updated", description: `${editForm.productName} saved` });
      setEditDialogOpen(false);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleOpenSachet = async (product: StockItem) => {
    if (!product.id || !userId) return;
    const sachets = product.sachets_count || 0;
    if (sachets < 1) { toast({ title: "No packages to open", variant: "destructive" }); return; }
    const newLoose = (product.loose_items || 0) + (product.items_per_sachet || 1);
    const newSachets = sachets - 1;
    const newOpened = (product.opened_sachets || 0) + 1;
    const { error } = await supabase.from("inventory").update({ sachets_count: newSachets, loose_items: newLoose, opened_sachets: newOpened }).eq("id", product.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    const updated = { ...product, sachets_count: newSachets, loose_items: newLoose, opened_sachets: newOpened };
    setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
    if (viewProduct?.id === product.id) setViewProduct(updated);
    onUpdateStock?.(updated);
    toast({ title: `✓ Package Opened`, description: `${newLoose} ${product.unit_name || "units"} now available` });
  };

  const getStockStatus = (p: StockItem) => {
    const qty = p.quantity || 0;
    const min = p.min_stock_level || 5;
    if (qty === 0) return { label: "Out of Stock", color: "bg-red-100 text-red-700 border-red-200" };
    if (qty <= min) return { label: "Low Stock", color: "bg-amber-100 text-amber-700 border-amber-200" };
    return { label: "In Stock", color: "bg-green-100 text-green-700 border-green-200" };
  };

  if (showLoader) {
    return <PageLoader text="Loading products..." />;
  }
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            Products
          </h2>
          <p className="text-muted-foreground mt-1">Manage your inventory catalogue</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openDuplicateDialog} disabled={!duplicateItems.length} className="gap-2">
            <Copy className="h-4 w-4" /> Remove duplicates {duplicateItems.length ? `(${duplicateItems.length})` : ""}
          </Button>
          <Button variant="outline" size="sm" onClick={refreshProducts} disabled={loading}>
            <RotateCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowList(s => !s)}>
            {showList ? 'Hide list ▲' : 'Show list ▼'}
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "all" as const, icon: Package, label: "Total Products", value: stats.total, sub: cardFilter === "low_stock" ? `showing ${filteredProducts.length}` : "all products", color: "text-blue-600", bg: "bg-blue-50" },
          { key: "low_stock" as const, icon: AlertTriangle, label: "Low Stock", value: stats.lowStock, sub: "at or below minimum", color: "text-amber-600", bg: "bg-amber-50" },
          { key: undefined, icon: Tag, label: "Categories", value: stats.categories, color: "text-purple-600", bg: "bg-purple-50" },
          { key: undefined, icon: TrendingUp, label: "Stock Value", value: `${fmtCurrency(stats.totalValue)}`, color: "text-green-600", bg: "bg-green-50" },
        ].map(({ key, icon, label, value, sub, color, bg }) => (
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-muted/40 border rounded-xl px-4 py-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products, barcode, supplier..." autoComplete="off" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-background" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="quantity">Quantity</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="value">Stock Value</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex border rounded-lg overflow-hidden">
          <button onClick={() => setViewMode("grid")} className={`p-2 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Grid3X3 className="h-4 w-4" /></button>
          <button onClick={() => setViewMode("list")} className={`p-2 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><List className="h-4 w-4" /></button>
        </div>
        <Badge variant="secondary" className="text-xs">{filteredProducts.length} products</Badge>
      </div>

      {/* Products Grid / List */}
      {showList ? (
          <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-4" : "space-y-4 pb-4"}>
              {filteredProducts.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Package className="h-10 w-10 mb-2 opacity-30" />
                  <p className="font-medium">No products found</p>
                  <p className="text-xs text-muted-foreground">Try adjusting your search or filters</p>
                </div>
                ) : filteredProducts.map(product => {
              const status = getStockStatus(product);
              const margin = product.retail_price && product.cost_per_unit
                ? Math.round(((product.retail_price - product.cost_per_unit) / product.retail_price) * 100) : 0;
              const stockBarColor = product.quantity === 0 ? "bg-red-400" : product.quantity <= (product.min_stock_level || 5) ? "bg-amber-400" : "bg-green-400";

              if (viewMode === "list") return (
                <div key={product.id} onClick={() => { setViewProduct(product); setViewDialogOpen(true); }}
                  className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
                      {product.productName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-[150px]">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{product.productName}</h4>
                        <Badge variant={product.quantity === 0 ? "destructive" : product.quantity <= (product.min_stock_level || 5) ? "outline" : "secondary"} className="text-[10px] uppercase">
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {product.category} · Qty: <span className="font-bold text-foreground">{product.quantity}</span> · {fmtCurrency(product.retail_price || 0)}
                        {product.barcode && <span className="font-mono ml-2">{product.barcode}</span>}
                      </p>
                      {margin > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Margin: <span className="font-bold text-emerald-600">{margin}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(product)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenSachet(product)} disabled={(product.sachets_count || 0) === 0}><RotateCw className="h-4 w-4" /></Button>
                  </div>
                </div>
              );

              return (
                <div key={product.id} onClick={() => { setViewProduct(product); setViewDialogOpen(true); }}
                  className="rounded-xl border bg-card hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group overflow-hidden">
                  <div className={`h-1.5 w-full ${stockBarColor}`} />
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${status.color}`}>{status.label}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight line-clamp-2">{product.productName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{product.category}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground">Qty</p>
                        <p className="font-bold text-base">{product.quantity}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground">Retail</p>
                        <p className="font-bold text-sm">{(product.retail_price || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    {margin > 0 && (
                      <div className="flex items-center gap-1 text-xs text-green-700 font-medium">
                        <TrendingUp className="h-3 w-3" />{margin}% margin
                      </div>
                    )}
                    {product.barcode && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono truncate">
                        <Barcode className="h-3 w-3 shrink-0" />{product.barcode}
                      </div>
                    )}
                    <div className="flex gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => openEditDialog(product)}>
                        <Edit2 className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => handleOpenSachet(product)} disabled={(product.sachets_count || 0) === 0} title="Open package">
                        <RotateCw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
        ) : (
          <div className="p-4 border rounded-lg text-sm text-muted-foreground">Products list hidden — {filteredProducts.length} items. <button onClick={() => setShowList(true)} className="underline">Show</button></div>
        )}

      {/* Product Preview Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden rounded-2xl p-0">
          {viewProduct && (() => {
            const p = viewProduct;
            const sachets = p.sachets_count || 0;
            const loose = p.loose_items || 0;
            const itemsPer = p.items_per_sachet || 1;
            const total = (sachets * itemsPer) + loose;
            const pkg = p.packaging_type || "sachet";
            const status = getStockStatus(p);
            const margin = p.retail_price && p.cost_per_unit
              ? Math.round(((p.retail_price - p.cost_per_unit) / p.retail_price) * 100) : 0;
            const efrisTax = Math.round((p.retail_price || 0) * (appliedTaxRate / 100));
            const priceWithTax = Math.max(100, Math.round(((p.retail_price || 0) + efrisTax) / 100) * 100);
            return (
              <>
                {/* Hero header */}
                <div className="bg-primary/5 border-b border-primary/10 p-6 shrink-0">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
                      {p.productImage ? (
                        <img src={p.productImage} alt={p.productName} className="w-full h-full object-cover rounded-2xl" />
                      ) : (
                        <Package className="h-8 w-8 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold leading-tight">{p.productName}</h2>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge variant="secondary" className="text-xs">{p.category}</Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.color}`}>{status.label}</span>
                        {p.packaging_type && <Badge variant="outline" className="text-xs">{p.packaging_type}</Badge>}
                        {p.size && <Badge variant="outline" className="text-xs">{p.size}</Badge>}
                      </div>
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 overflow-y-auto" type="always">
                  <div className="p-6 pb-8 space-y-5">

                    {/* Stock overview */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: `${pkg}s`, value: sachets, sub: "In stock", icon: Boxes },
                        { label: "Loose", value: loose, sub: "Individual units", icon: Box },
                        { label: "Per pkg", value: itemsPer, sub: "Units per package", icon: Layers },
                        { label: "Total", value: total, sub: "All units", icon: ShoppingBag },
                      ].map(({ label, value, sub, icon: Icon }) => (
                        <StatCard key={label} label={label} value={value} sub={sub} icon={Icon} color="text-primary" bg="bg-primary/10" />
                      ))}
                    </div>

                    {/* Pricing */}
                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" />Pricing</h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border bg-card p-3">
                          <p className="text-xs text-muted-foreground">Cost</p>
                          <p className="font-bold">{fmtCurrency((p.cost_per_unit || p.costPerUnit || 0))}</p>
                        </div>
                        <div className="rounded-xl border bg-card p-3">
                          <p className="text-xs text-muted-foreground">Wholesale</p>
                          <p className="font-bold">{fmtCurrency((p.wholesale_price || 0))}</p>
                        </div>
                        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                          <p className="text-xs text-muted-foreground">Retail</p>
                          <p className="font-bold text-primary">{fmtCurrency((p.retail_price || 0))}</p>
                        </div>
                      </div>
                      {margin > 0 && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-sm text-primary">
                          <TrendingUp className="h-4 w-4" />
                          <span>{margin}% profit margin · {fmtCurrency(((p.retail_price || 0) - (p.cost_per_unit || 0)))} per unit</span>
                        </div>
                      )}
                      {efrisTax > 0 && (
                        <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs sm:grid-cols-3">
                          <div><p className="text-muted-foreground">Base</p><p className="font-semibold">{fmtCurrency((p.retail_price || 0))}</p></div>
                          <div><p className="text-muted-foreground">EFRIS ({appliedTaxRate}%)</p><p className="font-semibold">{fmtCurrency(efrisTax)}</p></div>
                          <div><p className="text-muted-foreground">Final</p><p className="font-bold text-primary">{fmtCurrency(priceWithTax)}</p></div>
                        </div>
                      )}
                    </div>

                    {/* Barcode */}
                    {p.barcode && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Barcode className="h-4 w-4 text-primary" />Barcode</h4>
                        <div className="rounded-xl border bg-muted/30 p-4 flex items-center justify-between">
                          <code className="text-lg font-mono font-bold">{p.barcode}</code>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">{p.barcode_type || "CODE128"}</Badge>
                            {p.barcode_mode && <Badge variant="outline" className="text-xs capitalize">{p.barcode_mode}</Badge>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Product details */}
                    {(p.supplier || p.size || p.dateOfPurchase || p.notes || p.unit_name) && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Info className="h-4 w-4 text-primary" />Details</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {p.supplier && <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" />Supplier</p><p className="font-medium mt-0.5">{p.supplier}</p></div>}
                          {p.unit_name && <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium mt-0.5">{p.unit_name}</p></div>}
                          {p.size && <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Size</p><p className="font-medium mt-0.5">{p.size}</p></div>}
                          {p.dateOfPurchase && <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />Purchased</p><p className="font-medium mt-0.5">{new Date(p.dateOfPurchase).toLocaleDateString()}</p></div>}
                          {p.min_stock_level && <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Min Stock</p><p className="font-medium mt-0.5">{p.min_stock_level}</p></div>}
                          {p.reorder_quantity && <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Reorder Qty</p><p className="font-medium mt-0.5">{p.reorder_quantity}</p></div>}
                        </div>
                        {p.notes && <div className="mt-2 rounded-xl border p-3 text-sm"><p className="text-xs text-muted-foreground mb-1">Notes</p><p>{p.notes}</p></div>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button className="flex-1" onClick={() => { openEditDialog(p); setViewDialogOpen(false); }}>
                        <Edit2 className="h-4 w-4 mr-2" />Edit Product
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => handleOpenSachet(p)} disabled={sachets === 0}>
                        <RotateCw className="h-4 w-4 mr-2" />Open {pkg}
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5 text-primary" />Remove duplicate products</DialogTitle>
            <DialogDescription>Keep the first record in each matching group and select the extra records to delete. Review carefully before proceeding.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-4">
            <div className="space-y-3">
              {duplicateGroups.map((group) => (
                <div key={group[0].id} className="rounded-xl border p-3">
                  <p className="mb-2 text-sm font-semibold">{group[0].productName}</p>
                  <div className="space-y-2">
                    {group.map((product, index) => {
                      const isKeep = index === 0;
                      return <label key={product.id} className={`flex items-center gap-3 rounded-lg p-2 ${isKeep ? "bg-muted/40" : "hover:bg-muted/30"}`}>
                        <input type="checkbox" checked={isKeep || selectedDuplicateIds.has(product.id)} disabled={isKeep} onChange={() => setSelectedDuplicateIds((current) => { const next = new Set(current); next.has(product.id) ? next.delete(product.id) : next.add(product.id); return next; })} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm">{product.productName}</span><span className="block text-xs text-muted-foreground">Qty {product.quantity || 0} · {product.barcode || "No barcode"} · {isKeep ? "Keep" : "Duplicate"}</span></span>
                        {isKeep ? <Badge variant="secondary">Keep</Badge> : <Badge variant="destructive">Delete</Badge>}
                      </label>;
                    })}
                  </div>
                </div>
              ))}
              {!duplicateGroups.length && <p className="py-8 text-center text-sm text-muted-foreground">No duplicate product records found.</p>}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDeleteDuplicates()} disabled={!selectedDuplicateIds.size || deletingDuplicates} className="gap-2"><Trash2 className="h-4 w-4" />{deletingDuplicates ? "Deleting..." : `Confirm and delete (${selectedDuplicateIds.size})`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit2 className="h-5 w-5" />Edit — {editingProduct?.productName}</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 overflow-y-auto" type="always">
            <div className="space-y-4 px-1 pb-4 pr-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1"><Label>Product Name *</Label><Input value={editForm.productName} onChange={e => setEditForm({ ...editForm, productName: e.target.value })} /></div>
                <div className="space-y-1"><Label>Category</Label><Input value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} /></div>
                <div className="space-y-1"><Label>Supplier</Label><Input value={editForm.supplier} onChange={e => setEditForm({ ...editForm, supplier: e.target.value })} /></div>
                <div className="space-y-1"><Label>Cost ({getCurrencySymbol()})</Label><Input type="number" min="0" value={editForm.costPerUnit} onChange={e => setEditForm({ ...editForm, costPerUnit: +e.target.value })} /></div>
                <div className="space-y-1"><Label>Retail Price ({getCurrencySymbol()})</Label><Input type="number" min="0" value={editForm.retail} onChange={e => setEditForm({ ...editForm, retail: +e.target.value })} /></div>
                <div className="space-y-1"><Label>Wholesale ({getCurrencySymbol()})</Label><Input type="number" min="0" value={editForm.wholesale} onChange={e => setEditForm({ ...editForm, wholesale: +e.target.value })} /></div>
                <div className="space-y-1"><Label>Barcode</Label><Input value={editForm.barcode} onChange={e => setEditForm({ ...editForm, barcode: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label>Packaging</Label>
                  <Select value={editForm.packaging_type} onValueChange={v => setEditForm({ ...editForm, packaging_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["sachet","box","bottle","carton","pack","individual","bag","loose"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Unit Name</Label><Input value={editForm.unit_name} onChange={e => setEditForm({ ...editForm, unit_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Items per pkg</Label><Input type="number" min="1" value={editForm.items_per_sachet} onChange={e => setEditForm({ ...editForm, items_per_sachet: +e.target.value })} /></div>
                <div className="space-y-1"><Label>Size</Label><Input value={editForm.size} onChange={e => setEditForm({ ...editForm, size: e.target.value })} placeholder="e.g. 500ml" /></div>
                <div className="space-y-1"><Label>Min Stock</Label><Input type="number" min="0" value={editForm.min_stock_level} onChange={e => setEditForm({ ...editForm, min_stock_level: +e.target.value })} /></div>
                <div className="space-y-1"><Label>Reorder Qty</Label><Input type="number" min="0" value={editForm.reorder_quantity} onChange={e => setEditForm({ ...editForm, reorder_quantity: +e.target.value })} /></div>
                <div className="space-y-1"><Label>Purchase Date</Label><Input type="date" value={editForm.dateOfPurchase} onChange={e => setEditForm({ ...editForm, dateOfPurchase: e.target.value })} /></div>
                <div className="col-span-2 space-y-1"><Label>Notes</Label><Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
              </div>
              {/* Stock section */}
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Stock Quantities</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label>Total Quantity</Label>
                    <Input type="number" min="0" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: +e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Packages / Sachets</Label>
                    <Input type="number" min="0" value={editForm.sachets_count} onChange={e => setEditForm({ ...editForm, sachets_count: +e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Loose Items</Label>
                    <Input type="number" min="0" value={editForm.loose_items} onChange={e => setEditForm({ ...editForm, loose_items: +e.target.value })} />
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={handleSaveEdit}>Save Changes</Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
