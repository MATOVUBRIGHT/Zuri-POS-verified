import { useMemo, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StockItem, ProductVariant } from "@/types";
import { useUpdateInventoryOptimistic, useDeleteProductOptimistic } from "@/hooks/useOptimizedData";
import { buildProductSearchIndex, searchProductIndex } from "@/lib/productSearch";
import { useInstantClearDeferredValue } from "@/hooks/useInstantClearDeferredValue";
import { InventoryStats } from "./inventory/InventoryStats";
import { InventoryFilters } from "./inventory/InventoryFilters";
import { InventoryTable } from "./inventory/InventoryTable";
import { EditProductDialog } from "./inventory/EditProductDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, LayoutDashboard, Plus, Package, Edit, ShoppingBag } from "lucide-react";
import SachetManagement from "./SachetManagement";

interface InventoryManagementProps {
  stockData: StockItem[];
  setStockData: React.Dispatch<React.SetStateAction<StockItem[]>>;
  categories?: { name: string }[];
  currentPage?: string;
}

const InventoryManagement = ({ stockData, setStockData, categories, currentPage }: InventoryManagementProps) => {
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
  
  const deferredSearchTerm = useInstantClearDeferredValue(searchTerm);

  // Load from localStorage or defaults
  const [lowStockThreshold] = useState(() => Number(localStorage.getItem('lowStockThreshold') || 100));
  const [criticalStockThreshold] = useState(() => Number(localStorage.getItem('criticalStockThreshold') || 20));

  // Clear search bar when navigating away from inventory page
  useEffect(() => {
    if (currentPage && currentPage !== "inventory") {
      setSearchTerm("");
      setCategoryFilter("all");
      setHashStockFilter(null);
      // Inventory search filters are encoded in the hash (q/stock).
      // Clear them so a background refresh doesn't restore the old filtered view.
      window.location.hash = window.location.hash.split('?')[0];
    }
  }, [currentPage]);



  // Sync hash navigation
  useEffect(() => {
    const applyFromHash = () => {
      const hash = window.location.hash || '';
      const qIndex = hash.indexOf('?');
      if (qIndex === -1) {
        setHashStockFilter(null);
        return;
      }
      const params = new URLSearchParams(hash.slice(qIndex + 1));
      const stock = params.get('stock');
      if (stock === 'low' || stock === 'critical') setHashStockFilter(stock as any);
      else setHashStockFilter(null);

      const q = params.get('q');
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
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      if (!matchesCategory) return false;

      const matchesSupplier = supplierFilter === "all" || 
        (item.supplier_name || item.supplier || '') === supplierFilter;
      if (!matchesSupplier) return false;

      if (!hashStockFilter) return true;

      const critical = item.min_stock_level || criticalStockThreshold;
      const low = (item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold);
      const qty = item.quantity || 0;

      return hashStockFilter === "critical" ? qty < critical : qty < low && qty >= critical;
    });
  }, [searchedStock, categoryFilter, supplierFilter, hashStockFilter, criticalStockThreshold, lowStockThreshold]);

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    stockData.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [stockData]);

  const suppliersList = useMemo(() => {
    const set = new Set<string>();
    stockData.forEach(item => {
      const name = item.supplier_name || item.supplier;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [stockData]);

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await deleteProductMutation.mutateAsync(id);
      setStockData(prev => prev.filter(p => p.id !== id));
      toast({ title: "Product Deleted", description: `${name} removed from inventory` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setHashStockFilter(null);
    window.location.hash = window.location.hash.split('?')[0];
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LayoutDashboard className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
            <p className="text-sm text-muted-foreground">Manage stock levels, categories, and sachet conversions</p>
          </div>
        </div>
      </div>

      <InventoryStats 
        stockData={stockData}
        lowStockThreshold={lowStockThreshold}
        criticalStockThreshold={criticalStockThreshold}
        onFilterStatus={(s) => setHashStockFilter(s)}
      />

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

      <InventoryTable 
        stockItems={filteredStock}
        lowStockThreshold={lowStockThreshold}
        criticalStockThreshold={criticalStockThreshold}
        onEdit={(item) => {
          setEditingProduct(item);
        }}
        onDelete={handleDeleteProduct}
        onUpdateQty={async (item, qty) => {
          try {
             // Optimistic update
             setStockData(prev => prev.map(p => p.id === item.id ? { ...p, quantity: qty } : p));
             await updateInventoryMutation.mutateAsync({ id: item.id, updates: { quantity: qty } });
             toast({ title: "Stock Updated", description: `${item.productName} is now ${qty}` });
          } catch (e: any) {
             // Revert on error
             setStockData(prev => prev.map(p => p.id === item.id ? { ...p, quantity: item.quantity } : p));
             toast({ title: "Update Failed", description: e.message, variant: "destructive" });
          }
        }}
      />

      <Dialog open={isBulkQtyOpen} onOpenChange={setIsBulkQtyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Bulk Quantity Update
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <p className="text-sm text-muted-foreground">
              Update quantities for all currently filtered items ({filteredStock.length} items).
            </p>
            {filteredStock.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-accent/20">
                <div className="flex-1 min-w-0 pr-4">
                   <div className="font-medium text-sm truncate">{item.productName}</div>
                   <div className="text-[10px] text-muted-foreground">{item.category}</div>
                </div>
                <div className="w-[120px]">
                   <Input 
                      type="number" 
                      defaultValue={item.quantity} 
                      className="h-9 text-center font-bold"
                      onChange={(e) => {
                         const val = Number(e.target.value);
                         if (!isNaN(val)) {
                            // We will collect these in a Map or ref if we want a Save All button
                            // For simplicity in this bulk UI, let's just use the current values
                         }
                      }}
                      onBlur={async (e) => {
                         const val = Number(e.target.value);
                         if (!isNaN(val) && val !== item.quantity) {
                            try {
                               setStockData(prev => prev.map(p => p.id === item.id ? { ...p, quantity: val } : p));
                               await updateInventoryMutation.mutateAsync({ id: item.id, updates: { quantity: val } });
                            } catch (e: any) {
                               setStockData(prev => prev.map(p => p.id === item.id ? { ...p, quantity: item.quantity } : p));
                               toast({ title: "Update Failed", description: `${item.productName} update failed`, variant: "destructive" });
                            }
                         }
                      }}
                   />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsBulkQtyOpen(false)}>Done Updating</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <EditProductDialog
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        product={editingProduct}
        categories={categoriesList}
        onSave={(updated) => {
          setStockData(prev => prev.map(p => p.id === updated.id ? updated : p));
          setEditingProduct(null);
        }}
      />

      {/* Product Details & Sachet Conversion Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(v) => !v && setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl">
                  <Package className="h-6 w-6 text-primary" />
                  {selectedProduct.productName}
                </DialogTitle>
              </DialogHeader>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                <div className="md:col-span-1 space-y-4">
                   {selectedProduct.productImage ? (
                      <img src={selectedProduct.productImage} className="w-full aspect-square rounded-xl object-cover border-2 shadow-sm" alt={selectedProduct.productName} />
                   ) : (
                      <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center border-2 border-dashed">
                         <Plus className="h-12 w-12 text-muted-foreground opacity-20" />
                      </div>
                   )}
                   <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                      <div className="flex justify-between text-sm">
                         <span className="text-muted-foreground">Category:</span>
                         <span className="font-bold">{selectedProduct.category}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                         <span className="text-muted-foreground">Barcode:</span>
                         <span className="font-mono text-xs">{selectedProduct.barcode || "N/A"}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2">
                         <span className="text-muted-foreground">Unit Cost:</span>
                         <span className="font-bold">UGX {(selectedProduct.costPerUnit || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm text-primary font-bold">
                         <span className="text-muted-foreground">Retail:</span>
                         <span>UGX {(selectedProduct.retailPrice || 0).toLocaleString()}</span>
                      </div>
                   </div>
                   <Button 
                     onClick={() => {
                       setSelectedProduct(null);
                       setEditingProduct(selectedProduct);
                     }}
                     className="w-full gap-2"
                   >
                     <Edit className="h-4 w-4" />
                     Edit Product Details
                   </Button>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                       <LayoutDashboard className="h-5 w-5 text-primary" />
                       Performance & Conversion
                    </h4>
                    <p className="text-sm text-muted-foreground mb-4">
                       Manage packaging units, sachet conversions, and bulk stock movements here.
                    </p>
                    
                    <SachetManagement 
                        product={selectedProduct} 
                        stockData={stockData}
                        onUpdateStock={(updated) => {
                            setStockData(prev => prev.map(p => p.id === updated.id ? updated : p));
                            setSelectedProduct(updated);
                        }} 
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-8 border-t pt-4">
                 <Button variant="outline" onClick={() => setSelectedProduct(null)}>Close Details</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryManagement;
