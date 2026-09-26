import { useState, useRef, useMemo, useEffect } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Search, Camera, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { StockItem } from "@/types";
import { buildProductSearchIndex, searchProductIndex } from "@/lib/productSearch";
import { useInstantClearDeferredValue } from "@/hooks/useInstantClearDeferredValue";
import { usePosStore } from "@/store/usePosStore";
import BarcodeScanner from "../BarcodeScanner";

interface ProductSearchProps {
  stockData: StockItem[];
}

export const ProductSearch = ({ stockData }: ProductSearchProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useInstantClearDeferredValue(searchTerm);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const saleType = usePosStore((state) => state.saleType);
  const addToCart = usePosStore((state) => state.addToCart);

  const productIndex = useMemo(() => buildProductSearchIndex(stockData), [stockData]);

  const filteredStock = useMemo(() => {
    if (!deferredSearchTerm.trim()) return stockData.slice(0, 10);
    return searchProductIndex(productIndex, deferredSearchTerm, { limit: 10 });
  }, [stockData, productIndex, deferredSearchTerm]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  const handleAdd = (product: StockItem) => {
    const itemsPerSachet = product.items_per_sachet || 1;
    const sellType = saleType === 'wholesale' ? 'sachet' : 'item';
    const totalQuantity = product.quantity || 0;
    const maxQty = sellType === 'sachet' ? Math.floor(totalQuantity / itemsPerSachet) : totalQuantity;

    if (maxQty < 1) {
      toast({
        title: 'Out of Stock',
        description: `${product.productName} is unavailable in ${sellType} mode.`,
        variant: 'destructive'
      });
      return;
    }

    addToCart(product, sellType);
    setSearchTerm('');
    searchInputRef.current?.focus();
  };

  const handleBarcodeScan = (code: string) => {
    setShowBarcodeScanner(false);
    const found = stockData.find(s => s.barcode === code);
    if (found) {
      handleAdd(found);
    } else {
      toast({ title: "Product Not Found", description: `No product matches barcode ${code}`, variant: "destructive" });
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search products (press / to focus)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, filteredStock.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const picked = filteredStock[selectedIndex];
                if (picked) handleAdd(picked);
              } else if (e.key === 'Escape') {
                setSearchTerm("");
              }
            }}
            className="pl-10 h-11 text-lg bg-white/50 backdrop-blur-sm border-primary/10 transition-all focus:border-primary/30"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shadow-xs"
          onClick={() => setShowBarcodeScanner(true)}
        >
          <Camera className="h-5 w-5" />
        </Button>
      </div>

      {searchTerm && filteredStock.length > 0 && (
        <div className="absolute left-0 right-0 top-12 bg-card border border-border rounded-md shadow-xl z-50 max-h-80 overflow-y-auto mt-1 animate-in fade-in slide-in-from-top-2 duration-200">
          {filteredStock.map((product, idx) => {
            const isOutOfStock = (product.quantity || 0) <= 0;
            const itemsPerSachet = product.items_per_sachet || 1;
            const unitName = product.unit_name || product.packaging_type || 'package';
            const price = saleType === 'wholesale' ? (product.wholesale_price || 0) : (product.retail_price || 0);

            return (
              <div
                key={product.id}
                className={`p-3 cursor-pointer border-b last:border-b-0 transition-colors flex items-center justify-between ${
                  idx === selectedIndex ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted'
                } ${isOutOfStock ? 'opacity-50 grayscale pt-2' : ''}`}
                onClick={() => handleAdd(product)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="flex items-center gap-3">
                  {product.productImage && (
                    <img src={product.productImage} alt="" className="w-10 h-10 rounded object-cover shadow-xs" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {product.productName}
                      {isOutOfStock && <Badge variant="destructive" className="h-4 text-[10px]">Stock Out</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">
                      {saleType === 'wholesale' 
                        ? `📦 ${Math.floor(product.quantity / itemsPerSachet)} ${unitName}s available`
                        : `🛒 ${product.quantity} units available`}
                      <span className="mx-1.5">•</span>
                      <span className="text-primary font-bold">{fmtCurrency(price)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {idx === selectedIndex && <Badge variant="secondary" className="h-5 text-[9px] font-bold">ENTER</Badge>}
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors">
                    <Plus className="h-4 w-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showBarcodeScanner && (
        <BarcodeScanner
          isOpen={showBarcodeScanner}
          onScan={handleBarcodeScan}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </div>
  );
};
