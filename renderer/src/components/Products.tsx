import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Package, Edit2, Box, Boxes, RotateCw, DollarSign, Plus, Trash2, Eye, ChevronRight, Barcode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { StockItem } from "@/types";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { buildProductSearchIndex, searchProductIndex } from "@/lib/productSearch";
import { useInstantClearDeferredValue } from "@/hooks/useInstantClearDeferredValue";

interface ProductsProps {
  stockData: StockItem[];
  onUpdateStock?: (updated: StockItem) => void;
}

const Products = ({ stockData, onUpdateStock }: ProductsProps) => {
  const [products, setProducts] = useState<StockItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useInstantClearDeferredValue(searchTerm);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "quantity" | "sachets" | "loose">("name");
  const [editingProduct, setEditingProduct] = useState<StockItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<{
    productName: string;
    category: string;
    retail: number;
    wholesale: number;
    costPerUnit: number;
    barcode: string;
    packaging_type: string;
    unit_name: string;
    items_per_sachet: number;
    min_stock_level: number;
    reorder_quantity: number;
    notes: string;
    supplier: string;
    size: string;
    dateOfPurchase: string;
  }>({ 
    productName: '', 
    category: '', 
    retail: 0, 
    wholesale: 0, 
    costPerUnit: 0, 
    barcode: '', 
    packaging_type: 'sachet', 
    unit_name: 'item', 
    items_per_sachet: 1, 
    min_stock_level: 5, 
    reorder_quantity: 10, 
    notes: '',
    supplier: '',
    size: '',
    dateOfPurchase: ''
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewProduct, setViewProduct] = useState<StockItem | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [appliedTaxRate, setAppliedTaxRate] = useState(18);
  const { toast } = useToast();

  // Get unique categories for filter
  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);
  const activeStoreId = useMemo(() => {
    const productStoreId = products.find((p) => p.store_id)?.store_id;
    if (productStoreId) return productStoreId;
    return stockData.find((p) => p.store_id)?.store_id || null;
  }, [products, stockData]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
    setProducts(stockData);
  }, [stockData]);

  useEffect(() => {
    const fetchAppliedTaxRate = async () => {
      if (!activeStoreId) {
        setAppliedTaxRate(18);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("tax_configurations")
          .select("rate, is_active")
          .eq("store_id", activeStoreId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        const taxes = data || [];
        const activeTax = taxes.find((tax: any) => tax.is_active !== false) || taxes[0];
        const parsedRate = Number(activeTax?.rate);
        setAppliedTaxRate(Number.isFinite(parsedRate) && parsedRate >= 0 ? parsedRate : 18);
      } catch {
        setAppliedTaxRate(18);
      }
    };

    void fetchAppliedTaxRate();
  }, [activeStoreId]);

  const refreshProducts = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: stores } = await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);
      const storeId = stores?.[0]?.id;
      if (!storeId) return;

      const [{ data, error }] = await Promise.all([
        supabase.from('inventory').select('*').eq('store_id', storeId).order('product_name', { ascending: true }),
      ]);
      
      if (error) throw error;
      
      if (data) {
        const mappedProducts: StockItem[] = data.map((item: any) => ({
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          sachets_count: item.sachets_count || 0,
          loose_items: item.loose_items || 0,
          opened_sachets: item.opened_sachets || 0,
          items_per_sachet: item.items_per_sachet || 1,
          retail_price: item.retail_price || 0,
          wholesale_price: item.wholesale_price || 0,
          cost_per_unit: item.cost_per_unit || 0,
          costPerUnit: item.cost_per_unit || 0,
          product_name: item.product_name,
          category: item.category,
          totalValue: item.total_value,
          dateOfPurchase: item.date_of_purchase,
          store_id: item.store_id,
          min_stock_level: item.min_stock_level || 5,
          reorder_quantity: item.reorder_quantity || 10,
          notes: item.notes,
          packaging_type: item.packaging_type,
          unit_name: item.unit_name,
          barcode: item.barcode,
          barcode_type: item.barcode_type,
          barcode_mode: item.barcode_mode,
          supplier: item.supplier,
          size: item.size,
        }));
        setProducts(mappedProducts);
        toast({
          title: "✓ Data Refreshed",
          description: `Loaded ${mappedProducts.length} products`
        });
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const productIndex = useMemo(() => buildProductSearchIndex(products), [products]);
  const searchedProducts = useMemo(() => {
    if (!deferredSearchTerm.trim()) return products;
    return searchProductIndex(productIndex, deferredSearchTerm, { limit: products.length });
  }, [products, productIndex, deferredSearchTerm]);

  const filteredProducts = useMemo(() => {
    const filtered = searchedProducts.filter((p) => filterCategory === "all" || p.category === filterCategory);

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "quantity":
          return (b.quantity || 0) - (a.quantity || 0);
        case "sachets":
          return (b.sachets_count || 0) - (a.sachets_count || 0);
        case "loose":
          return (b.loose_items || 0) - (a.loose_items || 0);
        case "name":
        default:
          return a.productName.localeCompare(b.productName);
      }
    });
  }, [searchedProducts, filterCategory, sortBy]);

  const handleOpenSachet = async (product: StockItem) => {
    if (!product.id || !userId) return;

    const sachets = product.sachets_count || 0;
    const items_per = product.items_per_sachet || 1;
    const loose = product.loose_items || 0;
    const pkgType = product.packaging_type || 'sachet';
    const unitName = product.unit_name || 'item';

    if (sachets < 1) {
      toast({
        title: `No ${pkgType.charAt(0).toUpperCase() + pkgType.slice(1)}s`,
        description: `No ${pkgType}s available to open`,
        variant: "destructive"
      });
      return;
    }

    try {
      const newLoose = loose + items_per;
      const newSachets = sachets - 1;
      const newOpened = (product.opened_sachets || 0) + 1;

      const { error } = await supabase
        .from('inventory')
        .update({
          sachets_count: newSachets,
          loose_items: newLoose,
          opened_sachets: newOpened
        })
        .eq('id', product.id);

      if (error) throw error;

      setProducts(products.map(p => 
        p.id === product.id 
          ? { ...p, sachets_count: newSachets, loose_items: newLoose, opened_sachets: newOpened }
          : p
      ));

      toast({
        title: `✅ ${pkgType.charAt(0).toUpperCase() + pkgType.slice(1)} Opened`,
        description: `Opened 1 ${pkgType}. Now ${newLoose} ${unitName}s available.`
      });

      if (onUpdateStock) onUpdateStock({ ...product, sachets_count: newSachets, loose_items: newLoose });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const handleEditProduct = async (product: StockItem) => {
    if (!product.id || !userId) return;

    // Validate prices
    if (editForm.retail < 0 || editForm.wholesale < 0 || editForm.costPerUnit < 0) {
      toast({
        title: "Invalid Price",
        description: "Prices cannot be negative",
        variant: "destructive"
      });
      return;
    }

    // Validate required fields
    if (!editForm.productName.trim()) {
      toast({
        title: "Invalid Product Name",
        description: "Product name is required",
        variant: "destructive"
      });
      return;
    }

    if (!editForm.category.trim()) {
      toast({
        title: "Invalid Category",
        description: "Category is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('inventory')
        .update({
          product_name: editForm.productName.trim(),
          category: editForm.category.trim(),
          retail_price: editForm.retail,
          wholesale_price: editForm.wholesale,
          cost_per_unit: editForm.costPerUnit,
          barcode: editForm.barcode.trim() || undefined,
          packaging_type: editForm.packaging_type,
          unit_name: editForm.unit_name.trim() || 'item',
          items_per_sachet: editForm.items_per_sachet,
          min_stock_level: editForm.min_stock_level,
          reorder_quantity: editForm.reorder_quantity,
          notes: editForm.notes.trim() || undefined,
          supplier: editForm.supplier.trim() || undefined,
          size: editForm.size.trim() || undefined,
          date_of_purchase: editForm.dateOfPurchase || undefined,
        })
        .eq('id', product.id);

      if (error) throw error;

      setProducts(products.map(p =>
        p.id === product.id
          ? {
              ...p,
              productName: editForm.productName.trim(),
              product_name: editForm.productName.trim(),
              category: editForm.category.trim(),
              retail_price: editForm.retail,
              wholesale_price: editForm.wholesale,
              cost_per_unit: editForm.costPerUnit,
              costPerUnit: editForm.costPerUnit,
              barcode: editForm.barcode.trim() || undefined,
              packaging_type: editForm.packaging_type,
              unit_name: editForm.unit_name.trim() || 'item',
              items_per_sachet: editForm.items_per_sachet,
              min_stock_level: editForm.min_stock_level,
              reorder_quantity: editForm.reorder_quantity,
              notes: editForm.notes.trim() || undefined,
              supplier: editForm.supplier.trim() || undefined,
              size: editForm.size.trim() || undefined,
              dateOfPurchase: editForm.dateOfPurchase || undefined,
            }
          : p
      ));

      toast({
        title: "✅ Product Updated",
        description: `${editForm.productName} has been updated successfully.`
      });

      setEditDialogOpen(false);
      setEditingProduct(null);
      if (onUpdateStock) onUpdateStock(product);
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const openEditDialog = (product: StockItem) => {
    setEditingProduct(product);
    setEditForm({
      productName: product.productName,
      category: product.category || '',
      retail: product.retail_price || 0,
      wholesale: product.wholesale_price || 0,
      costPerUnit: product.cost_per_unit || product.costPerUnit || 0,
      barcode: product.barcode || '',
      packaging_type: product.packaging_type || 'sachet',
      unit_name: product.unit_name || 'item',
      items_per_sachet: product.items_per_sachet || 1,
      min_stock_level: product.min_stock_level || 5,
      reorder_quantity: product.reorder_quantity || 10,
      notes: product.notes || '',
      supplier: product.supplier || '',
      size: product.size || '',
      dateOfPurchase: product.dateOfPurchase || '',
    });
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="bg-primary/10 py-3">
          <CardTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Products & Packaging
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{filteredProducts.length} shown</Badge>
              <Badge variant="outline">{products.length} total</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshProducts}
                disabled={loading}
                title="Refresh data from database"
              >
                <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/40 border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Products Available</p>
                <p className="text-3xl font-extrabold tracking-tight">{filteredProducts.length.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total in Store</p>
                <p className="text-lg font-bold">{products.length.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by product name, barcode, supplier, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm shrink-0">Category:</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm shrink-0">Sort:</Label>
              <Select value={sortBy} onValueChange={(v: "name" | "quantity" | "sachets" | "loose") => setSortBy(v)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Product Name</SelectItem>
                  <SelectItem value="quantity">Total Quantity</SelectItem>
                  <SelectItem value="sachets">Packages</SelectItem>
                  <SelectItem value="loose">Loose Items</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products List */}
      {loading ? (
        <LoadingSpinner size="lg" text="Loading products..." />
      ) : (
        <ScrollArea className="h-[calc(100vh-300px)]">
          <div className="space-y-2 pr-4">
            {filteredProducts.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No products found</p>
                </CardContent>
              </Card>
            ) : (
              filteredProducts.map((product, index) => {
                const sachets = product.sachets_count || 0;
                const loose = product.loose_items || 0;
                const opened = product.opened_sachets || 0;
                const itemsPer = product.items_per_sachet || 1;
                const total = (sachets * itemsPer) + loose;
                const pkgType = product.packaging_type || 'sachet';

              return (
                <Card 
                  key={product.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => { setViewProduct(product); setViewDialogOpen(true); }}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-3">
                      {/* Compact Product Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {index + 1}
                        </div>
                        <div className="font-semibold truncate">{product.productName}</div>
                          <Badge variant="secondary" className="text-[10px] h-4 uppercase shrink-0">{product.category}</Badge>
                          {product.barcode && (
                            <Badge variant="outline" className="text-[10px] h-4 shrink-0 font-mono">
                              <Barcode className="h-3 w-3 mr-1" />
                              {product.barcode}
                            </Badge>
                          )}
                          {product.packaging_type && product.packaging_type !== 'sachet' && (
                            <Badge variant="outline" className="text-[10px] h-4 shrink-0">{product.packaging_type}</Badge>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span><Boxes className="h-3 w-3 inline mr-1" />{sachets} {pkgType}{sachets !== 1 ? 's' : ''}</span>
                          <span><Box className="h-3 w-3 inline mr-1" />{loose} {product.unit_name || 'unit'}{loose !== 1 ? 's' : ''}</span>
                          <span className="font-medium text-foreground">{total} total</span>
                        </div>
                        <div className="flex gap-3 text-xs mt-1 flex-wrap">
                          <span>Cost: <strong>UGX {(product.costPerUnit || product.cost_per_unit || 0).toLocaleString()}</strong></span>
                          <span>Retail: <strong>UGX {(product.retail_price || 0).toLocaleString()}</strong></span>
                          <span>Wholesale: <strong>UGX {(product.wholesale_price || 0).toLocaleString()}</strong></span>
                          {(() => {
                            const efris = Math.round((product.retail_price || 0) * (appliedTaxRate / 100));
                            const priceAfterTax = Math.max(100, Math.round(((product.retail_price || 0) + efris) / 100) * 100);
                            return efris > 0 ? (
                              <span className="text-warning">EFRIS: <strong>UGX {priceAfterTax.toLocaleString()}</strong></span>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      {/* Quick Actions + Arrow */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(product)}
                          title="Edit prices"
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenSachet(product)}
                          disabled={sachets === 0}
                          title="Open sachet"
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
      )}

      {/* Product Detail View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] min-h-0 flex flex-col overflow-hidden">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {viewProduct?.productName}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="pb-4">
          {viewProduct && (() => {
            const vSachets = viewProduct.sachets_count || 0;
            const vLoose = viewProduct.loose_items || 0;
            const vOpened = viewProduct.opened_sachets || 0;
            const vItemsPer = viewProduct.items_per_sachet || 1;
            const vTotal = (vSachets * vItemsPer) + vLoose;
            const vPkgType = viewProduct.packaging_type || 'sachet';
            return (
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary" className="uppercase">{viewProduct.category}</Badge>
                  {viewProduct.packaging_type && <Badge variant="outline">{viewProduct.packaging_type}</Badge>}
                  {viewProduct.size && <Badge variant="outline">Size: {viewProduct.size}</Badge>}
                  {viewProduct.barcode && (
                    <Badge variant="outline" className="font-mono">
                      <Barcode className="h-3 w-3 mr-1" />
                      {viewProduct.barcode}
                    </Badge>
                  )}
                </div>

                {/* Barcode Display Section */}
                {viewProduct.barcode && (
                  <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Product Barcode</p>
                      <Badge variant="outline" className="text-[10px]">
                        {viewProduct.barcode_type || 'CODE128'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <code className="text-lg font-bold font-mono bg-white dark:bg-gray-900 px-3 py-2 rounded border block text-center">
                          {viewProduct.barcode}
                        </code>
                      </div>
                    </div>
                    {viewProduct.barcode_mode && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Mode: {viewProduct.barcode_mode === 'standard' ? 'Standard (Packaged)' : 
                               viewProduct.barcode_mode === 'each_item' ? 'Each Item (Sachets)' : 
                               'Loose Items'}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground capitalize">{vPkgType}s (sealed)</p>
                    <p className="text-xl font-bold">{vSachets}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Loose Units</p>
                    <p className="text-xl font-bold">{vLoose}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Units per {vPkgType}</p>
                    <p className="text-xl font-bold">{vItemsPer}</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <p className="text-xs text-muted-foreground">Total Units</p>
                    <p className="text-xl font-bold text-primary">{vTotal}</p>
                  </div>
                </div>

                <div className="pt-3 space-y-2">
                  <h4 className="font-semibold text-sm">Pricing</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Cost per unit</p>
                      <p className="font-bold">UGX {(viewProduct.costPerUnit || viewProduct.cost_per_unit || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="font-bold">UGX {(viewProduct.totalValue || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Retail ({viewProduct.unit_name || 'item'})</p>
                      <p className="font-bold">UGX {(viewProduct.retail_price || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Wholesale ({vPkgType})</p>
                      <p className="font-bold">UGX {(viewProduct.wholesale_price || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  {/* EFRIS Tax breakdown */}
                  {(viewProduct.retail_price || 0) > 0 && (() => {
                    const retailPrice = viewProduct.retail_price || 0;
                    const efrisTax = Math.round(retailPrice * (appliedTaxRate / 100));
                    const priceWithTax = Math.max(100, Math.round((retailPrice + efrisTax) / 100) * 100);
                    return (
                      <div className="mt-2 p-3 bg-warning/10 rounded-lg">
                        <p className="text-xs font-medium text-warning mb-1">EFRIS Tax ({appliedTaxRate}%)</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Base</p>
                            <p className="font-semibold">UGX {retailPrice.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Tax</p>
                            <p className="font-semibold">UGX {efrisTax.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Final Price</p>
                            <p className="font-bold text-warning">UGX {priceWithTax.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {viewProduct.notes && (
                  <div className="pt-3">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{viewProduct.notes}</p>
                  </div>
                )}

                {/* Additional Product Info */}
                {(viewProduct.supplier || viewProduct.size || viewProduct.dateOfPurchase) && (
                  <div className="pt-3 space-y-2">
                    <h4 className="font-semibold text-sm">Product Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {viewProduct.supplier && (
                        <div>
                          <p className="text-xs text-muted-foreground">Supplier</p>
                          <p className="font-medium">{viewProduct.supplier}</p>
                        </div>
                      )}
                      {viewProduct.size && (
                        <div>
                          <p className="text-xs text-muted-foreground">Size</p>
                          <p className="font-medium">{viewProduct.size}</p>
                        </div>
                      )}
                      {viewProduct.dateOfPurchase && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Date of Purchase</p>
                          <p className="font-medium">{new Date(viewProduct.dateOfPurchase).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {vOpened > 0 && <Badge variant="outline" className="bg-warning/10">{vOpened} opened</Badge>}
                  {vLoose > 0 && <Badge variant="outline" className="bg-success/10">{vLoose} loose ready</Badge>}
                  {vSachets > 0 && <Badge variant="outline">{vSachets} sealed</Badge>}
                  {viewProduct.min_stock_level && vTotal <= viewProduct.min_stock_level && (
                    <Badge variant="destructive">Low Stock</Badge>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={(e) => { e.stopPropagation(); openEditDialog(viewProduct); setViewDialogOpen(false); }}
                  >
                    <DollarSign className="h-4 w-4 mr-2" /> Edit Prices
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={(e) => { e.stopPropagation(); handleOpenSachet(viewProduct); }}
                    disabled={vSachets === 0}
                  >
                    <RotateCw className="h-4 w-4 mr-2" /> Open {vPkgType}
                  </Button>
                </div>
              </div>
            );
          })()}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] min-h-0 flex flex-col overflow-hidden">
          <DialogHeader className="pb-4">
            <DialogTitle>Edit Product - {editingProduct?.productName}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="pb-4">
          {editingProduct && (
            <div className="space-y-4">
              {/* Required Fields */}
              <div className="space-y-2">
                <Label htmlFor="edit-productName">Product Name <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-productName"
                  value={editForm.productName}
                  onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                  placeholder="Enter product name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Category <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-category"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  placeholder="Enter category"
                />
              </div>

              {/* Pricing Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-cost">Cost Per Unit (UGX)</Label>
                  <Input
                    id="edit-cost"
                    type="number"
                    value={editForm.costPerUnit}
                    onChange={(e) => setEditForm({ ...editForm, costPerUnit: Math.max(0, Number(e.target.value)) })}
                    min="0"
                    step="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-retail">Retail Price (UGX)</Label>
                  <Input
                    id="edit-retail"
                    type="number"
                    value={editForm.retail}
                    onChange={(e) => setEditForm({ ...editForm, retail: Math.max(0, Number(e.target.value)) })}
                    min="0"
                    step="100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-wholesale">Wholesale Price per {editForm.packaging_type || 'sachet'} (UGX)</Label>
                <Input
                  id="edit-wholesale"
                  type="number"
                  value={editForm.wholesale}
                  onChange={(e) => setEditForm({ ...editForm, wholesale: Math.max(0, Number(e.target.value)) })}
                  min="0"
                  step="100"
                />
              </div>

              {/* Barcode */}
              <div className="space-y-2">
                <Label htmlFor="edit-barcode">Barcode</Label>
                <Input
                  id="edit-barcode"
                  value={editForm.barcode}
                  onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                  placeholder="Enter barcode (optional)"
                />
              </div>

              {/* Packaging Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-packaging">Packaging Type</Label>
                  <Select
                    value={editForm.packaging_type}
                    onValueChange={(v) => setEditForm({ ...editForm, packaging_type: v })}
                  >
                    <SelectTrigger id="edit-packaging">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sachet">Sachet</SelectItem>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="bottle">Bottle</SelectItem>
                      <SelectItem value="carton">Carton</SelectItem>
                      <SelectItem value="pack">Pack</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unit">Unit Name</Label>
                  <Input
                    id="edit-unit"
                    value={editForm.unit_name}
                    onChange={(e) => setEditForm({ ...editForm, unit_name: e.target.value })}
                    placeholder="e.g., item, piece, tablet"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-itemsPerSachet">Items per {editForm.packaging_type || 'sachet'}</Label>
                <Input
                  id="edit-itemsPerSachet"
                  type="number"
                  value={editForm.items_per_sachet}
                  onChange={(e) => setEditForm({ ...editForm, items_per_sachet: Math.max(1, Number(e.target.value)) })}
                  min="1"
                />
              </div>

              {/* Stock Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-minStock">Min Stock Level</Label>
                  <Input
                    id="edit-minStock"
                    type="number"
                    value={editForm.min_stock_level}
                    onChange={(e) => setEditForm({ ...editForm, min_stock_level: Math.max(0, Number(e.target.value)) })}
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reorder">Reorder Quantity</Label>
                  <Input
                    id="edit-reorder"
                    type="number"
                    value={editForm.reorder_quantity}
                    onChange={(e) => setEditForm({ ...editForm, reorder_quantity: Math.max(0, Number(e.target.value)) })}
                    min="0"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Input
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Additional notes (optional)"
                />
              </div>

              {/* Supplier & Size */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-supplier">Supplier</Label>
                  <Input
                    id="edit-supplier"
                    value={editForm.supplier}
                    onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })}
                    placeholder="Supplier name (optional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-size">Size</Label>
                  <Input
                    id="edit-size"
                    value={editForm.size}
                    onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                    placeholder="e.g., 500ml, 1kg (optional)"
                  />
                </div>
              </div>

              {/* Date of Purchase */}
              <div className="space-y-2">
                <Label htmlFor="edit-dateOfPurchase">Date of Purchase</Label>
                <Input
                  id="edit-dateOfPurchase"
                  type="date"
                  value={editForm.dateOfPurchase}
                  onChange={(e) => setEditForm({ ...editForm, dateOfPurchase: e.target.value })}
                />
              </div>

              <Button
                onClick={() => handleEditProduct(editingProduct)}
                className="w-full"
              >
                Save Changes
              </Button>
            </div>
          )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
