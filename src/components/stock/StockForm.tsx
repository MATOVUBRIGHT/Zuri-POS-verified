import { useState, useRef } from "react";
import { getCurrencySymbol } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package, CreditCard } from "lucide-react";
import { ProductSearchInput } from "./ProductSearchInput";
import { BarcodeSection } from "./BarcodeSection";
import { SupplierSelector } from "./SupplierSelector";
import { EfrisTaxPreview } from "./EfrisTaxPreview";
import { BatchItem } from "@/types";

interface StockFormProps {
  categories: string[];
  suppliers: { id: string; name: string; company: string | null }[];
  onAddToBatch: (item: Omit<BatchItem, "id">) => void;
  setShowBarcodeScanner: (show: boolean) => void;
  formData: any;
  setFormData: (updates: any) => void;
  financeTaxRate: number;
}

export const StockForm = ({
  categories,
  suppliers,
  onAddToBatch,
  setShowBarcodeScanner,
  formData,
  setFormData,
  financeTaxRate
}: StockFormProps) => {
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [manualSupplierMode, setManualSupplierMode] = useState(false);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const safeValue = (value: unknown, fallback = ""): string | number => {
    if (typeof value === "string" || typeof value === "number") {
      return value;
    }

    return fallback;
  };

  const handleUpdateFormData = (updates: any) => {
    setFormData((prev: any) => ({ ...prev, ...updates }));
  };

  const handleAddToBatchLocal = () => {
    const qty = parseInt(formData.quantity) || 0;
    const cost = parseFloat(formData.costPerUnit) || 0;
    const itemsPerUnit = parseInt(formData.itemsPerUnit) || 2;
    const packagingType = formData.packagingType || (itemsPerUnit === 2 ? "individual" : "sachet");
    const retailBase = parseFloat(formData.retailPrice) || 0;
    const wholesaleBase = parseFloat(formData.wholesalePrice) || 0;
    const looseBase = parseFloat(formData.looseItemPrice) || 0;
    const effectiveTaxRate = formData.overrideTaxes
      ? Math.max(0, parseFloat(formData.taxRate) || Number(financeTaxRate) || 0)
      : Math.max(0, Number(financeTaxRate) || 0);

    const applyEfrisTax = (base: number) => {
      if (!Number.isFinite(base) || base <= 0) return 0;
      const tax = Math.round(base * (effectiveTaxRate / 100));
      return Math.max(100, Math.round((base + tax) / 100) * 100);
    };

    const batchItem: Omit<BatchItem, "id"> = {
      productName: formData.productName,
      category: formData.category,
      quantity: qty,
      costPerUnit: cost,
      totalCost: qty * cost,
      retailPrice: applyEfrisTax(retailBase),
      wholesalePrice: applyEfrisTax(wholesaleBase),
      looseItemPrice: applyEfrisTax(looseBase),
      packagingType: packagingType,
      itemsPerUnit: itemsPerUnit,
      sachetsCount: Math.floor(qty / itemsPerUnit),
      looseItems: qty % itemsPerUnit,
      barcode: formData.barcode,
      barcode_type: formData.barcode_type,
      barcode_mode: formData.barcode_mode,
      onCredit: formData.onCredit,
      supplier_id: formData.supplier_id,
      supplier: formData.supplier,
      credit_paid_now: parseFloat(formData.creditPaidNow) || 0,
      credit_due_date: formData.creditDueDate,
      credit_reference: formData.creditReference,
      credit_details: formData.creditDetails,
      date_of_purchase: formData.dateOfEntry,
      product_image: formData.productImage,
      dateOfEntry: formData.dateOfEntry,
      productImage: formData.productImage,
      notes: formData.notes,
      size: formData.size,
      unit_name: formData.unitName,
      min_stock_level: parseInt(formData.minStockLevel) || 0,
      reorder_quantity: parseInt(formData.reorderQuantity) || 0
    };

    onAddToBatch(batchItem);
  };

  return (
    <Card className="shadow-md border-primary/10">
      <CardHeader className="bg-primary/5 border-b shrink-0 py-4">
        <CardTitle className="text-xl flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          Add Stock Item
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-14rem)]">
        {/* Product Search & Identity */}
        <div className="space-y-4">
          <ProductSearchInput
            productName={formData.productName}
            setFormData={handleUpdateFormData}
            setShowBarcodeScanner={setShowBarcodeScanner}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier / Group</Label>
              {!showCustomCategory ? (
                <Select
                  value={formData.category || "__none__"}
                  onValueChange={(v) => {
                    if (v === "custom") { setShowCustomCategory(true); return; }
                    handleUpdateFormData({ category: v === "__none__" ? "" : v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Not set —</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="custom">✏️ Add new…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="New category…"
                    value={customCategory}
                    onChange={(e) => {
                      setCustomCategory(e.target.value);
                      handleUpdateFormData({ category: e.target.value });
                    }}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setShowCustomCategory(false)}>←</Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                ref={quantityInputRef}
                type="number"
                placeholder="0"
                value={safeValue(formData.quantity)}
                onChange={(e) => handleUpdateFormData({ quantity: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Packaging Details */}
        <div className="p-4 bg-muted/30 rounded-xl space-y-4 border border-dashed">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Packaging & Units
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="space-y-2">
              <Label>Packaging Type</Label>
              <Select
                value={formData.packagingType || "__none__"}
                onValueChange={(v) => {
                  const val = v === "__none__" ? "" : v;
                  const itemsPerUnit = val === "individual" ? "1" : val ? "12" : "1";
                  handleUpdateFormData({ packagingType: val, itemsPerUnit });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set (unit)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Not set (unit) —</SelectItem>
                  <SelectItem value="individual">Individual / Loose</SelectItem>
                  <SelectItem value="bottle">Bottle</SelectItem>
                  <SelectItem value="can">Can</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="bag">Bag</SelectItem>
                  <SelectItem value="pack">Pack</SelectItem>
                  <SelectItem value="crate">Crate</SelectItem>
                  <SelectItem value="carton">Carton</SelectItem>
                  <SelectItem value="tray">Tray</SelectItem>
                  <SelectItem value="roll">Roll</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Items per {formData.packagingType || 'unit'}</Label>
              <Input
                type="number"
                value={safeValue(formData.itemsPerUnit)}
                onChange={(e) => handleUpdateFormData({ itemsPerUnit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Name</Label>
              <Input
                placeholder="e.g. bottle"
                value={safeValue(formData.unitName)}
                onChange={(e) => handleUpdateFormData({ unitName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Stock Level (Alert Threshold)</Label>
              <Input
                type="number"
                placeholder="10"
                value={safeValue(formData.minStockLevel)}
                onChange={(e) => handleUpdateFormData({ minStockLevel: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Reorder Quantity</Label>
              <Input
                type="number"
                placeholder="20"
                value={safeValue(formData.reorderQuantity)}
                onChange={(e) => handleUpdateFormData({ reorderQuantity: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Pricing & Tax */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cost Price (Per unit) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{getCurrencySymbol()}</span>
                <Input
                  className="pl-12"
                  type="number"
                  value={safeValue(formData.costPerUnit)}
                  onChange={(e) => handleUpdateFormData({ costPerUnit: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Retail Price (Per unit)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{getCurrencySymbol()}</span>
                <Input
                  className="pl-12 pr-16"
                  type="number"
                  value={safeValue(formData.retailPrice)}
                  onChange={(e) => handleUpdateFormData({ retailPrice: e.target.value })}
                />
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-[10px]"
                  onClick={() => handleUpdateFormData({ retailPrice: String(Math.round(parseFloat(formData.costPerUnit) * 1.3)) })}
                >
                  Auto
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200/60 bg-amber-50/60 p-3 dark:bg-amber-950/20 dark:border-amber-800/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Finance Tax</p>
                <p className="text-xs text-muted-foreground">
                  Default rate from Finance settings: {Number(financeTaxRate).toFixed(2)}%
                </p>
              </div>
              <Button
                type="button"
                variant={formData.overrideTaxes ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  handleUpdateFormData({
                    overrideTaxes: !formData.overrideTaxes,
                    taxRate: formData.overrideTaxes ? String(financeTaxRate) : formData.taxRate,
                  })
                }
              >
                {formData.overrideTaxes ? "Disable Override" : "Override Taxes"}
              </Button>
            </div>
            {formData.overrideTaxes && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div className="space-y-2">
                  <Label>Override Tax Rate (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={safeValue(formData.taxRate, String(financeTaxRate))}
                    onChange={(e) => handleUpdateFormData({ taxRate: e.target.value })}
                    placeholder={String(financeTaxRate)}
                  />
                </div>
              </div>
            )}
          </div>

          <EfrisTaxPreview 
            retailPrice={formData.retailPrice}
            wholesalePrice={formData.wholesalePrice}
            overrideTaxes={formData.overrideTaxes}
            taxRate={formData.taxRate}
            defaultTaxRate={financeTaxRate}
          />
        </div>

        {/* Barcode & Extra */}
        <BarcodeSection
          barcode={formData.barcode}
          barcodeType={formData.barcode_type}
          barcodeMode={formData.barcode_mode}
          unitName={formData.unitName}
          setFormData={handleUpdateFormData}
          setShowBarcodeScanner={setShowBarcodeScanner}
        />

        <SupplierSelector
          supplier={formData.supplier}
          suppliersList={suppliers}
          manualSupplierMode={manualSupplierMode}
          setFormData={handleUpdateFormData}
          setManualSupplierMode={setManualSupplierMode}
        />

        {/* Credit Purchase Option */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 border p-3 rounded-lg bg-accent/20">
            <Checkbox 
              id="credit-check" 
              checked={formData.onCredit} 
              onCheckedChange={(v) => handleUpdateFormData({ onCredit: !!v })} 
            />
            <Label htmlFor="credit-check" className="flex items-center gap-2 cursor-pointer font-medium">
              <CreditCard className="h-4 w-4" />
              Purchase on Credit
            </Label>
          </div>

          {formData.onCredit && (
            <div className="p-4 border rounded-xl bg-accent/10 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-2">
                <Label className="text-xs">Paid Now ({getCurrencySymbol()})</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={safeValue(formData.creditPaidNow)}
                  onChange={(e) => handleUpdateFormData({ creditPaidNow: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  value={safeValue(formData.creditDueDate)}
                  onChange={(e) => handleUpdateFormData({ creditDueDate: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <Button 
          onClick={handleAddToBatchLocal} 
          className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20"
          disabled={!formData.productName || !formData.quantity || !formData.costPerUnit}
        >
          <Plus className="h-5 w-5 mr-2" />
          Add to Batch
        </Button>
      </CardContent>
    </Card>
  );
};
