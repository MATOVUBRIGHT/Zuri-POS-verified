import { useState, useEffect } from "react";
import { fmtCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BatchItem } from "@/types";
import BarcodeScanner from "./BarcodeScanner";
import { useOptimizedSuppliers, useOptimizedCategories, useAddBatchStockOptimistic } from "@/hooks/useOptimizedData";
import { useShift } from "@/providers/ShiftProvider";
import { StockForm } from "./stock/StockForm";
import { BatchTable } from "./stock/BatchTable";
import ExcelImport from "./ExcelImport";
import { Package, PauseCircle, FileText, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBatchDraftsStore } from "@/store/batchDraftsStore";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { logSupabaseError } from "@/lib/supabaseError";

const StockEntry = ({ pageParams, availableCash: availableCashProp, currentStoreId }: { pageParams?: any; availableCash?: number; currentStoreId?: string | null }) => {
  const { toast } = useToast();
  const { activeShift, user } = useShift();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDraftsDialog, setShowDraftsDialog] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ processed: number; total: number } | null>(null);
  const [financeTaxRate, setFinanceTaxRate] = useState(18);

  const { heldBatch, drafts, holdBatch, clearHeld, saveDraft, deleteDraft } = useBatchDraftsStore();

  // Restore held batch on mount - keep heldBatch in store until submit/clear
  useEffect(() => {
    if (heldBatch.length > 0 && batchItems.length === 0) {
      setBatchItems(heldBatch);
    }
  }, []);

  // Auto-save batchItems to store on every change so refresh always restores latest
  useEffect(() => {
    holdBatch(batchItems);
  }, [batchItems]);
  
  const [formData, setFormData] = useState({
    productName: "",
    category: "",
    quantity: "",
    costPerUnit: "",
    retailPrice: "",
    wholesalePrice: "",
    looseItemPrice: "",
    packagingType: "individual",
    itemsPerUnit: "2",
    sachetsCount: "",
    looseItems: "0",
    barcode: "",
    barcode_type: "CODE128",
    barcode_mode: "standard",
    supplier: "",
    supplier_id: null as string | null,
    dateOfEntry: new Date().toISOString().split("T")[0],
    productImage: "",
    notes: "",
    size: "",
    unitName: "unit",
    onCredit: false,
    creditPaidNow: "0",
    creditDueDate: "",
    creditReference: "",
    creditDetails: "",
    overrideTaxes: false,
    taxRate: "18",
    minStockLevel: "",
    reorderQuantity: "",
  });

  const { data: suppliers = [] } = useOptimizedSuppliers(activeShift?.store_id || null);
  const { data: dbCategories = [] } = useOptimizedCategories(activeShift?.store_id || null);

  // Auto-fill form from pageParams (e.g. Restock from dashboard)
  useEffect(() => {
    if (!pageParams?.autoFill) return;
    setFormData(prev => ({
      ...prev,
      quantity: pageParams.quantity ? String(pageParams.quantity) : prev.quantity,
      productName: pageParams.productName || prev.productName,
      category: pageParams.category || prev.category,
      costPerUnit: pageParams.costPrice ? String(pageParams.costPrice) : prev.costPerUnit,
      retailPrice: pageParams.sellingPrice ? String(pageParams.sellingPrice) : prev.retailPrice,
      wholesalePrice: pageParams.wholesalePrice ? String(pageParams.wholesalePrice) : prev.wholesalePrice,
      barcode: pageParams.barcode || prev.barcode,
      productImage: pageParams.image || prev.productImage,
      supplier: pageParams.supplier || prev.supplier,
      size: pageParams.size || prev.size,
      unitName: pageParams.unitName || prev.unitName,
      packagingType: pageParams.packagingType || prev.packagingType,
      minStockLevel: pageParams.minStockLevel ? String(pageParams.minStockLevel) : prev.minStockLevel,
      reorderQuantity: pageParams.reorderQuantity ? String(pageParams.reorderQuantity) : prev.reorderQuantity,
    }));
  }, [pageParams]);
  
  const DEFAULT_CATEGORIES = [
    "Alcoholic Drink", "Bakery", "Beverages", "Canned Goods", "Condiments",
    "Dairy", "Energy Drink", "Food", "Frozen Foods", "Fruits", "Household",
    "Juice", "Meat", "Medicine", "Other", "Personal Care", "Snacks", "Soda",
    "Vegetables", "Water"
  ];
  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCategories])).sort();

  const batchMutation = useAddBatchStockOptimistic();

  const handleBarcodeScan = async (scannedBarcode: string) => {
    const barcode = scannedBarcode.trim();
    if (!barcode) return;
    setShowBarcodeScanner(false);
    const storeId = activeShift?.store_id;
    if (!storeId) {
      setFormData(prev => ({ ...prev, barcode }));
      toast({ title: "Barcode Scanned", description: `Product barcode: ${barcode}` });
      return;
    }

    // Inventory has compatibility columns that are not present in every
    // generated Supabase schema snapshot. Keep the runtime query explicit
    // while avoiding an erroneous relation type from blocking compilation.
    const { data, error } = await (supabase
      .from("inventory" as any) as any)
      .select("product_name, category, barcode, barcode_type, barcode_mode, cost_per_unit, retail_price, wholesale_price, loose_item_price, packaging_type, items_per_sachet, supplier, supplier_id, unit_name, size, min_stock_level, reorder_quantity, notes")
      .eq("store_id", storeId)
      .eq("barcode", barcode)
      .maybeSingle();

    if (error || !data) {
      setFormData(prev => ({ ...prev, barcode }));
      toast({
        title: "New barcode scanned",
        description: "No existing product was found. Enter the product details to add it to stock.",
      });
      return;
    }

    setFormData(prev => ({
      ...prev,
      productName: data.product_name || prev.productName,
      category: data.category || prev.category,
      barcode: data.barcode || barcode,
      barcode_type: data.barcode_type || prev.barcode_type,
      barcode_mode: data.barcode_mode || prev.barcode_mode,
      costPerUnit: data.cost_per_unit != null ? String(data.cost_per_unit) : prev.costPerUnit,
      retailPrice: data.retail_price != null ? String(data.retail_price) : prev.retailPrice,
      wholesalePrice: data.wholesale_price != null ? String(data.wholesale_price) : prev.wholesalePrice,
      looseItemPrice: data.loose_item_price != null ? String(data.loose_item_price) : prev.looseItemPrice,
      packagingType: data.packaging_type || prev.packagingType,
      itemsPerUnit: data.items_per_sachet != null ? String(data.items_per_sachet) : prev.itemsPerUnit,
      supplier: data.supplier || prev.supplier,
      supplier_id: data.supplier_id || prev.supplier_id,
      unitName: data.unit_name || prev.unitName,
      size: data.size || prev.size,
      minStockLevel: data.min_stock_level != null ? String(data.min_stock_level) : prev.minStockLevel,
      reorderQuantity: data.reorder_quantity != null ? String(data.reorder_quantity) : prev.reorderQuantity,
      notes: data.notes || prev.notes,
    }));
    toast({
      title: "Product loaded",
      description: `${data.product_name} was filled from this branch's stock record.`,
    });
  };

  const addToBatch = (item: Omit<BatchItem, "id">) => {
    const newItem: BatchItem = {
      ...item,
      id: Math.random().toString(36).substr(2, 9),
    };
    setBatchItems(prev => [...prev, newItem]);
    
    // Reset form but keep some defaults
    setFormData(prev => ({
      ...prev,
      productName: "",
      barcode: "",
      quantity: "",
      costPerUnit: "",
      retailPrice: "",
      wholesalePrice: "",
      looseItemPrice: "",
      productImage: "",
      notes: "",
      sachetsCount: "",
      looseItems: "0",
      creditPaidNow: "0",
      minStockLevel: "",
      reorderQuantity: "",
    }));

    toast({
      title: "Added to Batch",
      description: `${item.productName} has been added to the current batch.`,
    });
  };

  const removeFromBatch = (id: string) => {
    setBatchItems(prev => prev.filter(item => item.id !== id));
  };

  const handleHold = () => {
    if (batchItems.length === 0) return;
    holdBatch(batchItems);
    setBatchItems([]);
    toast({ title: "Batch held", description: "Your batch is saved and will restore when you return." });
  };

  const handleSaveDraft = () => {
    if (batchItems.length === 0) return;
    saveDraft(batchItems);
    setBatchItems([]);
    toast({ title: "Draft saved", description: "Batch saved as a draft." });
  };

  const handleClear = () => {
    setBatchItems([]);
    toast({ title: "Batch cleared" });
  };

  const handleSubmitBatch = () => {
    if (!activeShift?.store_id || !activeShift?.user_id) {
      toast({
        title: "Error",
        description: "No active store or user session found.",
        variant: "destructive",
      });
      return;
    }
    setShowPaymentDialog(true);
  };

  const executeBatch = async (paymentType: "cash" | "account" | "free") => {
    setIsSubmitting(true);
    setBatchProgress({ processed: 0, total: batchItems.length });
    try {
      const processedItems = batchItems.map(item => {
        if (paymentType === "cash") {
          return { ...item, onCredit: false, credit_paid_now: item.totalCost };
        } else if (paymentType === "account") {
          return { ...item, onCredit: true, credit_paid_now: 0 };
        } else {
          // No financial deduction, just add stock!
          return { ...item, onCredit: false, totalCost: 0 };
        }
      });

      const result: any = await batchMutation.mutateAsync({
        batchItems: processedItems,
        storeId: activeShift!.store_id,
        userId: user?.id || activeShift!.user_id,
        onProgress: (processed, total) => {
          setBatchProgress({ processed, total });
        },
      });

      const warningCount = (result?.warnings?.length ?? 0) as number;
      const failures = (result?.failures ?? []) as any[];
      const failureCount = failures.length as number;
      const savedLocally = Boolean(
        (result?.warnings || []).some((w: any) => String(w).toLowerCase().includes("saved locally"))
      );

      const failedIdx = new Set<number>(
        failures
          .map((f) => f?.batchIndex)
          .filter((v) => typeof v === "number")
      );

      // If some rows failed, keep only failed items so user can quickly retry without duplicating successes.
      if (failedIdx.size > 0) {
        setBatchItems((prev) => prev.filter((_, idx) => failedIdx.has(idx)));
      } else {
        setBatchItems([]);
        clearHeld();
      }

      setShowPaymentDialog(false);

      const insertedInventory = Number(result?.insertedInventory ?? batchItems.length - failedIdx.size);
      const failedInventory = failedIdx.size;

      toast({
        title: "Stock Applied",
        description:
          savedLocally
            ? `${batchItems.length} items saved locally. Will sync automatically when internet returns.`
            : failedInventory > 0
            ? `${insertedInventory} saved. ${failedInventory} failed and stayed in the batch for retry.`
            : `${insertedInventory} items were added successfully.`,
      });

      if (warningCount > 0) {
        toast({
          title: "Import Warnings",
          description: `${warningCount} issue(s) were fixed automatically (barcodes/formatting).`,
        });
      }

      if (failureCount > 0) {
        toast({
          title: "Some Rows Failed",
          description: `We kept failed items in your batch so you can retry. (${failureCount} failure(s))`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Stock entry error:", error);
      logSupabaseError("stockEntry.executeBatch", error);
      toast({
        title: "Error Submitting Batch",
        description: error.message || "Failed to process stock batch. Please check your connection and try again.",
        variant: "destructive",
      });

      // Provide troubleshooting info
      if (error.message?.includes("Not Found")) {
        toast({
          title: "Store Issue",
          description: "The system couldn't find your store. Please refresh and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setBatchProgress(null);
      setIsSubmitting(false);
    }
  };

  const batchTotal = batchItems.reduce((sum, item) => sum + item.totalCost, 0);
  const batchCashTotal = batchItems.reduce((sum, item) => 
    sum + (item.onCredit ? (item.credit_paid_now || 0) : item.totalCost), 0
  );
  const batchCreditTotal = batchItems.reduce((sum, item) => 
    sum + (item.onCredit ? (item.totalCost - (item.credit_paid_now || 0)) : 0), 0
  );

  const [availableCashLocal, setAvailableCashLocal] = useState(0);
  const availableCash = availableCashProp !== undefined ? availableCashProp : availableCashLocal;

  useEffect(() => {
    if (availableCashProp !== undefined) return; // use prop, skip fetch
    const fetchCashBalance = async () => {
      if (!activeShift?.store_id) return;
      const { data: transactions } = await supabase
        .from("cash_transactions")
        .select("amount, type")
        .eq("store_id", activeShift.store_id);

      const startingCash = activeShift.starting_cash || 0;
      const netCash = (transactions || []).reduce((sum, tx) => {
        const t = String(tx.type ?? "").toLowerCase();
        const isIn = t === "in" || t === "deposit" || t === "income";
        const isOut = t === "out" || t === "withdrawal" || t === "expense";
        return sum + (isIn ? tx.amount : isOut ? -tx.amount : 0);
      }, startingCash);

      setAvailableCashLocal(Math.max(0, netCash));
    };
    fetchCashBalance();
  }, [availableCashProp, activeShift?.store_id, activeShift?.starting_cash]);

  useEffect(() => {
    const fetchFinanceTaxRate = async () => {
      if (!activeShift?.store_id) {
        setFinanceTaxRate(18);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("tax_configurations")
          .select("rate, is_active")
          .eq("store_id", activeShift.store_id)
          .order("created_at", { ascending: true });

        if (error) throw error;

        const taxes = data || [];
        const activeTax = taxes.find((tax: any) => tax.is_active !== false) || taxes[0];
        const parsedRate = Number(activeTax?.rate);
        const nextRate = Number.isFinite(parsedRate) && parsedRate >= 0 ? parsedRate : 18;

        setFinanceTaxRate(nextRate);
        setFormData((prev) =>
          prev.overrideTaxes ? prev : { ...prev, taxRate: String(nextRate) }
        );
      } catch {
        setFinanceTaxRate(18);
      }
    };

    void fetchFinanceTaxRate();
  }, [activeShift?.store_id]);

  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Stock Entry</h2>
            <p className="text-sm text-muted-foreground">Manage inventory ingest and bulk operations</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
           <Button
             size="sm"
             className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
             onClick={handleHold}
             disabled={batchItems.length === 0}
             title="Hold batch — restores when you come back"
           >
             <PauseCircle className="h-4 w-4" />
             Hold
           </Button>
           <Button
             size="sm"
             className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-0"
             onClick={() => setShowDraftsDialog(true)}
           >
             <FileText className="h-4 w-4" />
             Draft
             {drafts.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px] bg-white text-blue-600">{drafts.length}</Badge>}
           </Button>
           <Button
             size="sm"
             className="gap-1.5 bg-red-500 hover:bg-red-600 text-white border-0"
             onClick={handleClear}
             disabled={batchItems.length === 0}
           >
             <Trash2 className="h-4 w-4" />
             Clear
           </Button>
           {/* Excel Import would go here with its own refactored logic if needed */}
           <ExcelImport config={{
            title: "Bulk Stock Import",
            fields: [
              { key: "product_name", label: "Product Name", required: true, aliases: ["Item", "Product", "Name"] },
              { key: "category", label: "Category", type: "string", defaultValue: "" },
                { key: "quantity", label: "Quantity", type: "number", required: true, aliases: ["Qty", "Stock", "Amount", "Units", "Qty (pcs)", "Qty (Units)"] },
                {
                  key: "cost_per_unit",
                  label: "Cost",
                  type: "number",
                  required: true,
                  aliases: ["Buy Price", "Buying Price", "Unit Cost", "Cost Per Unit", "Cost/Unit", "Purchase Price"],
                },
              { key: "retail_price", label: "Retail Price", type: "number", defaultValue: 0, aliases: ["Selling Price", "Retail", "Price"] },
              { key: "wholesale_price", label: "Wholesale Price", type: "number", defaultValue: 0, aliases: ["Bulk Price", "Wholesale"] },
              { key: "loose_item_price", label: "Loose Price", type: "number", defaultValue: 0 },
              { key: "barcode", label: "Barcode", type: "string", defaultValue: "", aliases: ["SKU", "Code"] },
              { key: "supplier", label: "Supplier", type: "string", defaultValue: "", aliases: ["Vendor", "Manufacturer"] },
              { key: "items_per_unit", label: "Items Per Unit", type: "number", defaultValue: 2 },
              { key: "unit_name", label: "Unit Name", type: "string", defaultValue: "", aliases: ["Unit"] },
              { key: "packaging_type", label: "Packaging Type", type: "string", defaultValue: "individual", aliases: ["Packaging"] },
              { key: "size", label: "Size/Dimensions", type: "string", defaultValue: "" },
              { key: "min_stock_level", label: "Min Stock Level", type: "number", defaultValue: 0, aliases: ["Alert Level", "Low Stock"] },
              { key: "reorder_quantity", label: "Reorder Qty", type: "number", defaultValue: 0, aliases: ["Reorder", "Restock Level"] },
              { key: "date_of_purchase", label: "Purchase Date", type: "string", defaultValue: new Date().toISOString().split("T")[0] },
              { key: "notes", label: "Notes", type: "string", defaultValue: "Imported via Excel", aliases: ["Description", "Details"] },
              { key: "product_image", label: "Product Image URL/Path", type: "string", defaultValue: "", aliases: ["Image", "Pic"] },
            ],
            onImport: async (rows) => {
              try {
                const mappedItems = rows.map((row, i) => ({
                  id: Math.random().toString(36).substr(2, 9) + i,
                  productName: row.product_name,
                  category: row.category || "",
                  quantity: row.quantity || 0,
                  costPerUnit: row.cost_per_unit || 0,
                  totalCost: (row.quantity || 0) * (row.cost_per_unit || 0),
                  retailPrice: row.retail_price || 0,
                  wholesalePrice: row.wholesale_price || 0,
                  looseItemPrice: row.loose_item_price || 0,
                  barcode: row.barcode || "",
                  supplier: row.supplier || "",
                  dateOfEntry: row.date_of_purchase || new Date().toISOString().split("T")[0],
                  date_of_purchase: row.date_of_purchase || new Date().toISOString().split("T")[0],
                  packagingType: row.packaging_type || "individual",
                  itemsPerUnit: row.items_per_unit || 2,
                  sachetsCount: Math.floor((row.quantity || 0) / (row.items_per_unit || 1)),
                  looseItems: (row.quantity || 0) % (row.items_per_unit || 1),
                  onCredit: false,
                  credit_paid_now: 0,
                  size: row.size || "",
                  productImage: row.product_image || "",
                  notes: row.notes || "Imported via Excel",
                  min_stock_level: row.min_stock_level || 0,
                  reorder_quantity: row.reorder_quantity || 0,
                  unit_name: row.unit_name || ""
                }));
                
                setBatchItems(prev => [...prev, ...mappedItems as any]);
                return { success: rows.length, errors: [] };
              } catch (e: any) {
                return { success: 0, errors: [e.message] };
              }
            },
            templateData: [
              {
                "Product Name": "Example Product",
                "Category": "",
                "Quantity": 100,
                "Cost": 2500,
                "Retail Price": 3500,
                "Wholesale Price": 3000,
                "Barcode": "123456789",
                "Supplier": "Main Supplier",
                "Items Per Unit": 1,
                "Unit Name": "Bottle",
                "Packaging Type": "individual",
                "Size/Dimensions": "500ml",
                "Min Stock Level": 10,
                "Reorder Qty": 50,
                "Purchase Date": new Date().toISOString().split("T")[0],
                "Notes": "Opening stock batch",
                "Product Image URL/Path": ""
              },
              {
                "Product Name": "Box of Biscuits",
                "Category": "Snacks",
                "Quantity": 10,
                "Cost": 15000,
                "Retail Price": 20000,
                "Wholesale Price": 18000,
                "Barcode": "987654321",
                "Supplier": "Biscuits Co",
                "Items Per Unit": 24,
                "Unit Name": "Box",
                "Packaging Type": "box",
                "Size/Dimensions": "Large",
                "Min Stock Level": 2,
                "Reorder Qty": 5,
                "Purchase Date": new Date().toISOString().split("T")[0],
                "Notes": "Bulk purchase",
                "Product Image URL/Path": ""
              }
            ]
           }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <StockForm
            categories={categories}
            suppliers={suppliers}
            onAddToBatch={addToBatch}
            setShowBarcodeScanner={setShowBarcodeScanner}
            formData={formData}
            setFormData={setFormData}
            financeTaxRate={financeTaxRate}
          />
        </div>

        <div className="lg:col-span-1">
          <BatchTable
            batchItems={batchItems}
            availableCash={availableCash}
            batchTotal={batchTotal}
            batchCashTotal={batchCashTotal}
            batchCreditTotal={batchCreditTotal}
            isSubmitting={isSubmitting}
            removeFromBatch={removeFromBatch}
            handleSubmitBatch={handleSubmitBatch}
          />
        </div>
      </div>

      <BarcodeScanner
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Stock Deduction</DialogTitle>
          <DialogDescription>
            How would you like to account for this batch of stock?
          </DialogDescription>
        </DialogHeader>
        {batchProgress && (
          <div className="px-6 pb-2 pt-2 text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span>
              Processing {batchProgress.processed}/{batchProgress.total} item{batchProgress.total !== 1 ? "s" : ""}...
            </span>
          </div>
        )}
        <div className="py-4 space-y-4 text-sm font-medium">
            <div className="flex justify-between px-2 text-muted-foreground border-b pb-2 mb-4">
              <span>Required Cost:</span>
              <span className="font-bold">{fmtCurrency(batchCashTotal)}</span>
            </div>
            
            {batchCashTotal > availableCash && (
               <p className="text-amber-600 text-xs text-center border p-2 bg-amber-50 rounded">
                 Warning: Not enough cash ({fmtCurrency(availableCash)} available). Use Credit or Free instead.
               </p>
            )}

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => executeBatch("cash")}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={batchCashTotal > availableCash}
                title={batchCashTotal > availableCash ? "Insufficient cash balance" : ""}
              >
                Deduct from Cash
                {batchCashTotal > availableCash && " (Insufficient)"}
              </Button>
              <Button onClick={() => executeBatch("account")} size="lg" variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                Put on Account (Credit)
              </Button>
              <Button onClick={() => executeBatch("free")} size="lg" variant="secondary" className="w-full transition-all">
                Add Stock Anyway (No Deduction)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showDraftsDialog} onOpenChange={setShowDraftsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Saved Drafts</DialogTitle>
            <DialogDescription>Load a draft to restore its items into the current batch.</DialogDescription>
          </DialogHeader>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No drafts saved yet.</p>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="space-y-2 pr-2">
                {drafts.map((draft) => (
                  <div key={draft.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium">{draft.name}</p>
                      <p className="text-xs text-muted-foreground">{draft.items.length} items - {new Date(draft.savedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBatchItems(prev => [...prev, ...draft.items]);
                          deleteDraft(draft.id);
                          setShowDraftsDialog(false);
                          toast({ title: "Draft loaded", description: `${draft.items.length} items added to batch.` });
                        }}
                      >
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteDraft(draft.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockEntry;
