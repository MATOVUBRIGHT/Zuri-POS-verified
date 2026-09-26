import { useState } from 'react';
import { Printer, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { StockItem } from '@/types';


interface PrintPreviewEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: StockItem[];
  onPrint: () => void;
  connectedPrinter: any;
  onSettingsChange?: (settings: any) => void;
}

export default function PrintPreviewEditor({
  open,
  onOpenChange,
  products,
  onPrint,
  connectedPrinter,
  onSettingsChange,
}: PrintPreviewEditorProps) {
  const [productCopies, setProductCopies] = useState<Map<string, number>>(
    new Map(products.map(p => [p.id, 1]))
  );

  // Update copies when products change
  const updateCopies = (productId: string, copies: number) => {
    if (copies < 1) return;
    const newCopies = new Map(productCopies);
    newCopies.set(productId, copies);
    setProductCopies(newCopies);
  };

  const increaseCopies = (productId: string) => {
    const current = productCopies.get(productId) || 1;
    updateCopies(productId, current + 1);
  };

  const decreaseCopies = (productId: string) => {
    const current = productCopies.get(productId) || 1;
    if (current > 1) {
      updateCopies(productId, current - 1);
    }
  };

  const totalCopies = Array.from(productCopies.values()).reduce((sum, copies) => sum + copies, 0);

  const handlePrint = () => {
    // Store the copies for the print function to use
    (window as any).__printCopies = productCopies;
    onPrint();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Labels - Select Copies
          </DialogTitle>
          <DialogDescription>
            Choose how many copies to print for each product
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Printer Status */}
          {connectedPrinter && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-4">
                <div className="text-sm">
                  <p className="font-semibold text-blue-900">Printer Connected</p>
                  <p className="text-blue-700">{connectedPrinter.name}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Products List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Products to Print</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {products.map((product) => {
                const copies = productCopies.get(product.id) || 1;
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {product.productName}
                      </p>
                      <p className="text-xs text-gray-600">
                        SKU: {product.barcode || 'N/A'}
                      </p>
                      {product.retail_price && (
                        <p className="text-xs text-gray-600">
                          Price: UGX {product.retail_price.toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Copies Control */}
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => decreaseCopies(product.id)}
                        disabled={copies <= 1}
                        title="Decrease copies"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={copies}
                        onChange={(e) =>
                          updateCopies(product.id, parseInt(e.target.value) || 1)
                        }
                        className="h-8 w-16 text-center text-sm"
                      />

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => increaseCopies(product.id)}
                        title="Increase copies"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total Labels to Print:</span>
                <span className="text-2xl font-bold text-primary">{totalCopies}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={totalCopies === 0 || !connectedPrinter}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print {totalCopies} Labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
