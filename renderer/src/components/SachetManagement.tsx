import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Package, Box, Boxes, RotateCw, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { dataSyncService } from "@/lib/data-sync";
import type { StockItem } from "@/types";

interface SachetManagementProps {
  stockData: StockItem[];
  onUpdateStock?: (updated: StockItem) => void;
  product?: StockItem; // Added for single product mode
}

const SachetManagement = ({ stockData, onUpdateStock, product }: SachetManagementProps) => {
  const [products, setProducts] = useState<StockItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
  const [showOpenSachetDialog, setShowOpenSachetDialog] = useState(false);
  const [showCloseSachetDialog, setShowCloseSachetDialog] = useState(false);
  const [openSachetCount, setOpenSachetCount] = useState(1);
  const [closeSachetCount, setCloseSachetCount] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    setProducts(stockData);
  }, [stockData]);

  const filteredProducts = products.filter(p => 
    p.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenSachet = async () => {
    if (!selectedProduct) return;

    const itemsPerSachet = selectedProduct.items_per_sachet || 1;
    const currentSachets = selectedProduct.sachets_count || 0;
    const currentLoose = selectedProduct.loose_items || 0;
    const currentOpened = selectedProduct.opened_sachets || 0;
    const itemsToOpen = Math.min(openSachetCount, currentSachets);
    const pkgType = selectedProduct.packaging_type || 'sachet';
    const unitName = selectedProduct.unit_name || 'item';

    if (itemsToOpen < 1) {
      toast({
        title: `No ${pkgType.charAt(0).toUpperCase() + pkgType.slice(1)}s Available`,
        description: `No sealed ${pkgType}s to open`,
        variant: "destructive"
      });
      return;
    }

    try {
      const newLoose = currentLoose + (itemsToOpen * itemsPerSachet);
      const newSachets = currentSachets - itemsToOpen;
      const newOpened = currentOpened + itemsToOpen;

      const updates = {
        id: selectedProduct.id,
        sachets_count: newSachets,
        loose_items: newLoose,
        opened_sachets: newOpened
      };

      await dataSyncService.addToSyncQueue('update', 'inventory', updates);

      const updatedProduct = {
        ...selectedProduct,
        sachets_count: newSachets,
        loose_items: newLoose,
        opened_sachets: newOpened
      };

      setProducts(products.map(p => 
        p.id === selectedProduct.id ? updatedProduct : p
      ));

      toast({
        title: `✅ ${pkgType.charAt(0).toUpperCase() + pkgType.slice(1)}s Opened`,
        description: `Opened ${itemsToOpen} ${pkgType}(s). Now ${newLoose} ${unitName}s available.`
      });

      setShowOpenSachetDialog(false);
      setOpenSachetCount(1);
      setSelectedProduct(null);
      if (onUpdateStock) onUpdateStock(updatedProduct);
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const handleCloseSachet = async () => {
    if (!selectedProduct) return;

    const itemsPerSachet = selectedProduct.items_per_sachet || 1;
    const currentLoose = selectedProduct.loose_items || 0;
    const currentOpened = selectedProduct.opened_sachets || 0;
    const currentSachets = selectedProduct.sachets_count || 0;
    const sachetsToClose = Math.min(closeSachetCount, currentOpened);
    const pkgType = selectedProduct.packaging_type || 'sachet';
    const unitName = selectedProduct.unit_name || 'item';

    if (sachetsToClose < 1) {
      toast({
        title: `No Open ${pkgType.charAt(0).toUpperCase() + pkgType.slice(1)}s`,
        description: `No opened ${pkgType}s to close`,
        variant: "destructive"
      });
      return;
    }

    const itemsNeeded = sachetsToClose * itemsPerSachet;
    if (currentLoose < itemsNeeded) {
      toast({
        title: `Insufficient Loose ${unitName.charAt(0).toUpperCase() + unitName.slice(1)}s`,
        description: `Need ${itemsNeeded} loose ${unitName}s to close ${sachetsToClose} ${pkgType}(s), but only ${currentLoose} available`,
        variant: "destructive"
      });
      return;
    }

    try {
      const newLoose = currentLoose - itemsNeeded;
      const newSachets = currentSachets + sachetsToClose;
      const newOpened = currentOpened - sachetsToClose;

      const updates = {
        id: selectedProduct.id,
        sachets_count: newSachets,
        loose_items: newLoose,
        opened_sachets: newOpened
      };

      await dataSyncService.addToSyncQueue('update', 'inventory', updates);

      const updatedProduct = {
        ...selectedProduct,
        sachets_count: newSachets,
        loose_items: newLoose,
        opened_sachets: newOpened
      };

      setProducts(products.map(p => 
        p.id === selectedProduct.id ? updatedProduct : p
      ));

      toast({
        title: `✅ ${pkgType.charAt(0).toUpperCase() + pkgType.slice(1)}s Closed`,
        description: `Closed ${sachetsToClose} ${pkgType}(s). Now ${newSachets} sealed ${pkgType}s available.`
      });

      setShowCloseSachetDialog(false);
      setCloseSachetCount(1);
      setSelectedProduct(null);
      if (onUpdateStock) onUpdateStock(updatedProduct);
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const handleOpenSachetDialog = (product: StockItem) => {
    setSelectedProduct(product);
    setShowOpenSachetDialog(true);
  };

  const handleCloseSachetDialog = (product: StockItem) => {
    setSelectedProduct(product);
    setShowCloseSachetDialog(true);
  };

  return (
    <div className="space-y-4">
      <Card>
      {!product && (
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Packaging Management
            </div>
            <Badge variant="secondary">{products.length} products</Badge>
          </CardTitle>
        </CardHeader>
      )}
        <CardContent>
        <div className="space-y-3">
          {!product && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          <ScrollArea className={product ? "" : "h-[600px]"}>
            <div className="space-y-3">
              {(product ? [product] : filteredProducts).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No products found</p>
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const sachets = product.sachets_count || 0;
                    const loose = product.loose_items || 0;
                    const opened = product.opened_sachets || 0;
                    const itemsPer = product.items_per_sachet || 1;
                    const total = (sachets * itemsPer) + loose;
                    const pkgType = product.packaging_type || 'sachet';
                    const unitName = product.unit_name || 'item';

                    return (
                      <Card key={product.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="font-semibold text-lg mb-2">{product.productName}</div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                {/* Sealed Sachets */}
                                <div className="flex items-center gap-2">
                                    <Boxes className="h-4 w-4 text-blue-500" />
                                    <div>
                                      <div className="text-xs text-muted-foreground">Sealed {pkgType}s</div>
                                      <div className="font-semibold">{sachets}</div>
                                    </div>
                                  </div>

                                  {/* Opened Sachets */}
                                  <div className="flex items-center gap-2">
                                    <Box className="h-4 w-4 text-yellow-500" />
                                    <div>
                                      <div className="text-xs text-muted-foreground">Opened {pkgType}s</div>
                                      <div className="font-semibold">{opened}</div>
                                    </div>
                                  </div>

                                  {/* Loose Items */}
                                  <div className="flex items-center gap-2">
                                    <Box className="h-4 w-4 text-green-500" />
                                    <div>
                                      <div className="text-xs text-muted-foreground">Loose {unitName}s</div>
                                      <div className="font-semibold">{loose}</div>
                                    </div>
                                  </div>

                                  {/* Items Per Sachet */}
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-orange-500" />
                                    <div>
                                      <div className="text-xs text-muted-foreground">{unitName}s/{pkgType}</div>
                                      <div className="font-semibold">{itemsPer}</div>
                                    </div>
                                  </div>
                              </div>

                              {/* Total Quantity */}
                              <div className="flex items-center gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                  <Boxes className="h-4 w-4 text-purple-500" />
                                  <div>
                                      <div className="text-xs text-muted-foreground">Total {unitName}s</div>
                                      <div className="font-semibold">{total}</div>
                                    </div>
                                </div>
                              </div>

                              {/* Status Badges */}
                              <div className="flex gap-2 flex-wrap mb-3">
                                {sachets > 0 && (
                                  <Badge variant="outline">
                                    {sachets} sealed {pkgType}s
                                  </Badge>
                                )}
                                {opened > 0 && (
                                  <Badge variant="outline" className="bg-yellow-50">
                                    {opened} opened {pkgType}s
                                  </Badge>
                                )}
                                {loose > 0 && (
                                  <Badge variant="outline" className="bg-green-50">
                                    {loose} {unitName}s ready
                                  </Badge>
                                )}
                              </div>

                              {/* Prices */}
                              <div className="flex gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Retail ({unitName}): </span>
                                  <span className="font-semibold">UGX {(product.retail_price || 0).toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Wholesale ({pkgType}): </span>
                                  <span className="font-semibold">UGX {(product.wholesale_price || (product.retail_price || 0) * (product.items_per_sachet || 1)).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                              {/* Open Sachet Button */}
                              <Dialog open={showOpenSachetDialog && selectedProduct?.id === product.id} onOpenChange={setShowOpenSachetDialog}>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenSachetDialog(product)}
                                    disabled={sachets === 0}
                                    className="flex items-center gap-2"
                                  >
                                    <RotateCw className="h-4 w-4" />
                                    Open {pkgType}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      📦 Open {pkgType} - {product.productName}
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="p-3 bg-muted rounded-lg">
                                      <div className="text-sm text-muted-foreground mb-2">Current Status:</div>
                                      <div className="grid grid-cols-3 gap-2 text-sm">
                                        <div>📦 Sealed: {sachets}</div>
                                        <div>🟡 Opened: {opened}</div>
                                        <div>🔹 {unitName}s: {loose}</div>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      <Label htmlFor="openCount">Number of {pkgType}s to open</Label>
                                      <Input
                                        id="openCount"
                                        type="number"
                                        min="1"
                                        max={sachets}
                                        value={openSachetCount}
                                        onChange={(e) => setOpenSachetCount(Math.max(1, Math.min(sachets, parseInt(e.target.value) || 1)))}
                                        className="w-32"
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Each {pkgType} contains {itemsPer} {unitName}s
                                      </p>
                                    </div>

                                    <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                                      <div className="text-sm font-medium text-success mb-1">After Opening:</div>
                                      <div className="text-sm text-muted-foreground">
                                        📦 Sealed: {sachets - openSachetCount} | 🟡 Opened: {opened + openSachetCount} | 🔹 {unitName}s: {loose + (openSachetCount * itemsPer)}
                                      </div>
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                      <Button 
                                        variant="outline" 
                                        onClick={() => {
                                          setShowOpenSachetDialog(false);
                                          setOpenSachetCount(1);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button onClick={handleOpenSachet}>
                                        Open {pkgType}s
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>

                              {/* Close Sachet Button */}
                              <Dialog open={showCloseSachetDialog && selectedProduct?.id === product.id} onOpenChange={setShowCloseSachetDialog}>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCloseSachetDialog(product)}
                                    disabled={opened === 0 || loose < itemsPer}
                                    className="flex items-center gap-2"
                                  >
                                    <Plus className="h-4 w-4" />
                                    Close {pkgType}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      📦 Close {pkgType} - {product.productName}
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="p-3 bg-muted rounded-lg">
                                      <div className="text-sm text-muted-foreground mb-2">Current Status:</div>
                                      <div className="grid grid-cols-3 gap-2 text-sm">
                                        <div>📦 Sealed: {sachets}</div>
                                        <div>🟡 Opened: {opened}</div>
                                        <div>🔹 {unitName}s: {loose}</div>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      <Label htmlFor="closeCount">Number of {pkgType}s to close</Label>
                                      <Input
                                        id="closeCount"
                                        type="number"
                                        min="1"
                                        max={opened}
                                        value={closeSachetCount}
                                        onChange={(e) => setCloseSachetCount(Math.max(1, Math.min(opened, parseInt(e.target.value) || 1)))}
                                        className="w-32"
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Each {pkgType} needs {itemsPer} {unitName}s
                                      </p>
                                    </div>

                                    {loose < (closeSachetCount * itemsPer) && (
                                      <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                                        <div className="flex items-center gap-2 text-warning font-medium mb-1">
                                          <AlertTriangle className="h-4 w-4" />
                                          Insufficient {unitName}s
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          Need {closeSachetCount * itemsPer} {unitName}s to close {closeSachetCount} {pkgType}s.
                                        </div>
                                      </div>
                                    )}

                                    <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                                      <div className="text-sm font-medium text-success mb-1">After Closing:</div>
                                      <div className="text-sm text-muted-foreground">
                                        📦 Sealed: {sachets + closeSachetCount} | 🟡 Opened: {opened - closeSachetCount} | 🔹 {unitName}s: {loose - (closeSachetCount * itemsPer)}
                                      </div>
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                      <Button 
                                        variant="outline" 
                                        onClick={() => {
                                          setShowCloseSachetDialog(false);
                                          setCloseSachetCount(1);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button 
                                        onClick={handleCloseSachet}
                                        disabled={loose < (closeSachetCount * itemsPer)}
                                      >
                                        Close {pkgType}s
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>

                              {/* Quick Actions */}
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedProduct(product);
                                    setOpenSachetCount(1);
                                    setShowOpenSachetDialog(true);
                                  }}
                                  disabled={sachets === 0}
                                  className="text-xs"
                                >
                                  +1
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedProduct(product);
                                    setCloseSachetCount(1);
                                    setShowCloseSachetDialog(true);
                                  }}
                                  disabled={opened === 0 || loose < itemsPer}
                                  className="text-xs"
                                >
                                  -1
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SachetManagement;
