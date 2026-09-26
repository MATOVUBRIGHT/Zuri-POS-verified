import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Save, X, ShoppingCart, Package } from "lucide-react";
import { BatchTransactionItem as BatchItem } from "@/types";

interface BatchTransactionPanelProps {
  type: 'sales' | 'stock';
  items: BatchItem[];
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  onSubmitAll: () => void;
  isSubmitting?: boolean;
}

const BatchTransactionPanel = ({ 
  type, 
  items, 
  onRemoveItem, 
  onClearAll, 
  onSubmitAll,
  isSubmitting 
}: BatchTransactionPanelProps) => {
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) {
    return (
      <Card className="h-full bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {type === 'sales' ? <ShoppingCart className="h-4 w-4" /> : <Package className="h-4 w-4" />}
            {type === 'sales' ? 'Sale Items' : 'Stock Items'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">No items added yet</p>
            <p className="text-xs mt-1">Add items from the left panel</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {type === 'sales' ? <ShoppingCart className="h-4 w-4" /> : <Package className="h-4 w-4" />}
            {type === 'sales' ? 'Sale Items' : 'Stock Items'}
            <Badge variant="secondary" className="ml-2">{items.length}</Badge>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClearAll}
            className="h-7 text-xs text-destructive hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pt-0">
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-2">
            {items.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × UGX {item.price.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">
                    UGX {(item.quantity * item.price).toLocaleString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveItem(item.id)}
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <div className="border-t pt-3 mt-3 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Items:</span>
            <span className="font-medium">{totalItems}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Amount:</span>
            <span className="font-bold text-primary">UGX {totalAmount.toLocaleString()}</span>
          </div>
          <Button 
            className="w-full" 
            onClick={onSubmitAll}
            disabled={isSubmitting || items.length === 0}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Processing...' : `Record ${items.length} ${type === 'sales' ? 'Sale(s)' : 'Stock Item(s)'}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BatchTransactionPanel;