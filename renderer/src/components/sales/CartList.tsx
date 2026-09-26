import React from "react";
import { ShoppingCart, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StockItem } from "@/types";
import { usePosStore } from "@/store/usePosStore";

interface CartListProps {
  stockData: StockItem[];
}

export const CartList = React.memo(function CartList({ stockData }: CartListProps) {
  const { cart, updateCartQty, updateCartPrice, removeFromCart } = usePosStore();

  return (
    <Card className="min-h-[300px] border-none shadow-sm flex flex-col bg-white/50 backdrop-blur-sm">
      <CardHeader className="pb-3 pt-4 px-4 sticky top-0 bg-white/80 z-10 backdrop-blur-md rounded-t-xl border-b border-primary/5">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground/80">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <ShoppingCart className="h-4 w-4" />
            </div>
            Cart Items
            <Badge variant="secondary" className="ml-1 h-5 bg-primary/10 text-primary border-none font-bold">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </Badge>
          </CardTitle>
          {cart.length > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider font-bold">
              {cart.length} unique products
            </span>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-12 text-muted-foreground opacity-60">
            <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <ShoppingCart className="h-8 w-8" />
            </div>
            <p className="text-sm font-semibold">Your cart is empty</p>
            <p className="text-xs">Search and add products to start a sale</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px] w-full px-4 py-2">
            <div className="space-y-2 pb-4">
              {cart.map((item) => {
                const stock = stockData.find(s => s.productName === item.productName);
                const itemsPerSachet = stock?.items_per_sachet || 1;
                const avail = item.sellType === 'sachet' 
                  ? Math.floor((stock?.quantity || 0) / itemsPerSachet) 
                  : (stock?.quantity || 0);
                const unitName = (stock?.unit_name || stock?.packaging_type || 'pkg');

                return (
                  <div 
                    key={`${item.productName}-${item.sellType}`} 
                    className="group flex items-center gap-3 p-3 bg-white border border-primary/5 rounded-xl text-sm transition-all hover:shadow-md hover:border-primary/20 animate-in fade-in slide-in-from-right-2 duration-300"
                  >
                    <div className="relative h-12 w-12 flex-shrink-0 bg-muted/30 rounded-lg overflow-hidden border border-border/50">
                      {stock?.productImage ? (
                        <img src={stock.productImage} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                          <ShoppingCart className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h4 className="font-bold truncate text-sm text-foreground/90">{item.productName}</h4>
                        <Badge 
                          variant={item.sellType === 'sachet' ? 'default' : 'secondary'} 
                          className={`text-[9px] h-4 px-1 line-clamp-1 border-none font-bold uppercase ${item.sellType === 'sachet' ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'}`}
                        >
                          {item.sellType === 'sachet' ? `📦 ${unitName}` : '🏷️ UNIT'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground">{avail} in stock</span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span className="text-[10px] font-bold text-primary">@ UGX {item.sellingPrice.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-lg border border-border/40">
                      <Input
                        type="number"
                        min="1"
                        max={avail}
                        value={item.quantity}
                        onChange={(e) => updateCartQty(item.productName, item.sellType, parseInt(e.target.value) || 0, avail)}
                        className="w-12 h-7 text-center text-xs font-bold border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
                      />
                      <span className="text-[10px] font-bold text-muted-foreground">×</span>
                      <Input
                        type="number"
                        min="0"
                        value={item.sellingPrice}
                        onChange={(e) => updateCartPrice(item.productName, item.sellType, parseFloat(e.target.value) || 0)}
                        className="w-20 h-7 text-xs font-bold border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
                      />
                    </div>

                    <div className="text-right min-w-[90px]">
                      <p className="font-black text-xs text-foreground">
                        UGX {(item.quantity * item.sellingPrice).toLocaleString()}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded-full group-hover:opacity-100 transition-all"
                      onClick={() => removeFromCart(item.productName, item.sellType)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
});
