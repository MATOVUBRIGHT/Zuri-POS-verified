import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BatchItem } from "@/types";
import BarcodeScanner from "./BarcodeScanner";
import { useOptimizedSuppliers, useOptimizedCategories, useAddBatchStockOptimistic } from "@/hooks/useOptimizedData";
import { useShift } from "@/providers/ShiftProvider";
import { StockForm } from "./stock/StockForm";
import { BatchTable } from "./stock/BatchTable";
import ExcelImport from "./ExcelImport";
import { Package, AlertCircle } from "lucide-react";
import { isBarcodeDuplicate } from "@/lib/barcode";

const StockEntry = () => {
  const { toast } = useToast();
  const { activeShift } = useShift();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [financeTaxRate, setFinanceTaxRate] = useState(18);
  
  const [formData, setFormData] = useState({
    productName: "",
    category: "Beverages",
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
  });

  const { data: suppliers = [] } = useOptimizedSuppliers(activeShift?.store_id || null);
  const { data: dbCategories = [] } = useOptimizedCategories(activeShift?.store_id || null);
  
  const DEFAULT_CATEGORIES = [
    "Alcoholic Drink", "Bakery", "Beverages", "Canned Goods", "Condiments",
    "Dairy", "Energy Drink", "Food", "Frozen Foods", "Fruits", "Household",
    "Juice", "Meat", "Medicine", "Other", "Personal Care", "Snacks", "Soda",
    "Vegetables", "Water"
  ];
  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCategories])).sort();

  const batchMutation = useAddBatchStockOptimistic();

  const handleBarcodeScan = (scannedBarcode: string) => {
    setFormData(prev => ({ ...prev, barcode: scannedBarcode }));
    setShowBarcodeScanner(false);
    toast({
      title: "Barcode Scanned",
      description: `Product barcode: ${scannedBarcode}`,
    });
  };

  const addToBatch = useCallback(async (item: Omit<BatchItem, "id">) => {
    if (!activeShift?.store_id) return;

    // 1. Check if barcode is already in the current UI batch
    if (item.barcode) {
      const isBarcodeInBatch = batchItems.some(existing => existing.barcode === item.barcode);
      if (isBarcodeInBatch) {
        toast({
          title: "Duplicate Barcode",
          description: `Barcode "${item.barcode}" is already in your current batch list.`,
          variant: "destructive",
        });
        return;
      }

      // 2. Check if barcode exists in the store (database)
      const isDuplicateInDb = await isBarcodeDuplicate(item.barcode, activeShift.store_id);
      if (isDuplicateInDb) {
        toast({
          title: "Barcode Exists",
          description: `Barcode "${item.barcode}" already exists in your inventory.`,
          variant: "destructive",
        });
        return;
      }
    }

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
    }));

    toast({
      title: "Added to Batch",
      description: `${item.productName} has been added to the current batch.`,
    });
  }, [batchItems, activeShift, toast]);

  const removeFromBatch = (id: string) => {
    setBatchItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmitBatch = async () => {
    if (!activeShift?.store_id || !activeShift?.user_id) {
      toast({
        title: "Error",
        description: "No active store or user session found.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Final safety check for duplicate barcodes in the entire batch before submission
      const barcodes = batchItems.map(i => i.barcode).filter(Boolean);
      const uniqueBarcodes = new Set(barcodes);
      if (barcodes.length !== uniqueBarcodes.size) {
        throw new Error("Duplicate barcodes found within the batch. Please remove duplicates.");
      }

      // Check database again for all barcodes in batch (in case of race conditions)
      for (const item of batchItems) {
        if (item.barcode) {
          const isDuplicate = await isBarcodeDuplicate(item.barcode, activeShift.store_id);
          if (isDuplicate) {
            throw new Error(`Barcode "${item.barcode}" (${item.productName}) already exists in inventory.`);
          }
        }
      }

      await batchMutation.mutateAsync({
        batchItems,
        storeId: activeShift.store_id,
        userId: activeShift.user_id,
      });

      setBatchItems([]);
      toast({
        title: "Success",
        description: `${batchItems.length} items added to stock successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process stock batch.",
        variant: "destructive",
      });
    } finally {
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

  const [availableCash, setAvailableCash] = useState(0);

  useEffect(() => {
    const fetchCashBalance = async () => {
      if (!activeShift?.store_id || !activeShift?.user_id) return;
      const startingCash = activeShift.starting_cash || 0;
      const { data: transactions } = await supabase
        .from("cash_transactions")
        .select("amount, type")
        .eq("store_id", activeShift.store_id)
        .eq("user_id", activeShift.user_id);

      const netCash = (transactions || []).reduce((sum, tx) => {
        return sum + (tx.type === "in" ? tx.amount : -tx.amount);
      }, startingCash);

      setAvailableCash(netCash);
    };
    fetchCashBalance();
  }, [activeShift?.store_id, activeShift?.user_id, activeShift?.starting_cash]);

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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Stock Entry</h2>
            <p className="text-sm text-muted-foreground">Manage inventory ingest and bulk operations</p>
          </div>
        </div>
        <div className="flex gap-2">
           {/* Excel Import would go here with its own refactored logic if needed */}
           <ExcelImport config={{
            title: "Bulk Stock Import",
            fields: [
              { key: "product_name", label: "Product Name", required: true },
              { key: "quantity", label: "Qty", type: "number" },
              { key: "cost_per_unit", label: "Cost", type: "number" },
            ],
            onImport: async (rows) => {
              // Simple bridge to the new mutation logic
              try {
                const mappedItems = rows.map(row => ({
                  productName: row.product_name,
                  category: row.category || "Beverages",
                  quantity: row.quantity || 0,
                  costPerUnit: row.cost_per_unit || 0,
                  totalCost: (row.quantity || 0) * (row.cost_per_unit || 0),
                  retailPrice: row.retail_price || 0,
                  wholesalePrice: row.wholesale_price || 0,
                  date_of_purchase: new Date().toISOString().split("T")[0],
                  packagingType: "individual",
                  itemsPerUnit: 1,
                  onCredit: false,
                  credit_paid_now: 0
                }));
                
                await batchMutation.mutateAsync({
                  batchItems: mappedItems,
                  storeId: activeShift!.store_id,
                  userId: activeShift!.user_id,
                });
                return { success: rows.length, errors: [] };
              } catch (e: any) {
                return { success: 0, errors: [e.message] };
              }
            }
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
    </div>
  );
};

export default StockEntry;
