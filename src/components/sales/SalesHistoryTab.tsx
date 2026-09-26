import { useState, useMemo, useEffect } from "react";
import { fmtCurrency } from "@/lib/currency";
import { History, Search, Receipt, Undo2, Loader2, User, Clock, DollarSign, ArrowUpRight, ArrowDownRight, RefreshCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LoadingMark } from "@/components/ui/loading-spinner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SaleItem, Product, StockItem, Staff, ExpenseItem, PaymentMethod } from "@/types";
import { useOptimizedSales } from "@/hooks/useOptimizedData";
import { useShift } from "@/providers/ShiftProvider";

interface SalesHistoryTabProps {
  currentStoreId: string;
  stockData: StockItem[];
  onPrint: (sale: SaleItem) => void;
}

export const SalesHistoryTab = ({ currentStoreId, stockData, onPrint }: SalesHistoryTabProps) => {
  const { user } = useShift();
  const { data: sales = [], isLoading, refetch } = useOptimizedSales(currentStoreId, user?.id || null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleItem | null>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);

  const filteredSales = useMemo(() => {
    if (!searchTerm.trim()) return sales;
    const s = searchTerm.toLowerCase();
    return sales.filter((sale: any) => 
      sale.customer_name?.toLowerCase().includes(s) || 
      sale.id.toLowerCase().includes(s) ||
      sale.receipt_number?.toLowerCase().includes(s) ||
      sale.receiptNumber?.toLowerCase().includes(s) ||
      (sale.total_amount || 0).toString().includes(s)
    );
  }, [sales, searchTerm]);

  const handleOpenReturn = (sale: any) => {
    setSelectedSale(sale);
    const products = Array.isArray(sale.products) ? sale.products : [];
    setReturnItems(products.map((p: any) => ({
      ...p,
      returnQty: 0,
      originalQty: p.quantity
    })));
    setReturnDialogOpen(true);
  };

  const processReturn = async () => {
    if (!selectedSale || isProcessingReturn) return;
    const itemsToReturn = returnItems.filter(it => it.returnQty > 0);
    if (itemsToReturn.length === 0) return;

    setIsProcessingReturn(true);
    try {
      const returnTotal = itemsToReturn.reduce((sum, it) => sum + (it.returnQty * (it.sellingPrice || it.price || 0)), 0);
      const reason = "Customer Return";
      const today = new Date().toISOString().split('T')[0];

      const isSchemaError = (error: any) => {
        const msg = String(error?.message || "").toLowerCase();
        const code = String(error?.code || "");
        return (
          code === "PGRST204" ||
          code === "42703" ||
          msg.includes("does not exist") ||
          msg.includes("column") ||
          msg.includes("schema cache")
        );
      };

      const primaryInsert = await (supabase.from('sale_returns' as any) as any).insert({
        store_id: currentStoreId,
        user_id: user?.id,
        sale_id: selectedSale.id,
        items: itemsToReturn,
        total_amount: returnTotal,
        reason,
      });

      if (primaryInsert.error) {
        if (!isSchemaError(primaryInsert.error)) throw primaryInsert.error;

        const legacyInsert = await (supabase.from('sales_returns' as any) as any).insert({
          store_id: currentStoreId,
          user_id: user?.id,
          sale_id: selectedSale.id,
          returned_products: itemsToReturn,
          total_refund_amount: returnTotal,
          return_reason: reason,
          return_date: today,
          refund_method: "cash",
          refund_status: "completed",
        });

        if (legacyInsert.error) throw legacyInsert.error;
      }

      for (const item of itemsToReturn) {
        const stockItem = stockData.find((s) => s.productName === item.productName);
        if (!stockItem?.id) continue;

        const itemsPerSachet = Number(stockItem.items_per_sachet || 1);
        const currentQty = Number(stockItem.quantity || 0);
        const returnedUnits =
          item.sellType === "sachet"
            ? Number(item.returnQty || 0) * itemsPerSachet
            : Number(item.returnQty || 0);
        const newQty = currentQty + returnedUnits;

        const { error: updateError } = await supabase
          .from("inventory")
          .update({
            quantity: newQty,
            total_value: newQty * Number(stockItem.cost_per_unit || stockItem.costPerUnit || 0),
            sachets_count: Math.floor(newQty / itemsPerSachet),
            loose_items: newQty % itemsPerSachet,
          })
          .eq("id", stockItem.id);

        if (updateError && !isSchemaError(updateError)) throw updateError;
      }

      toast({ title: "Return Successful", description: "The items have been returned to inventory." });
      setReturnDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Return Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessingReturn(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input 
             placeholder="Search transactions, customers, or amounts..." 
             className="pl-10 h-10 rounded-xl bg-white border-primary/5 shadow-sm focus:border-primary/20"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => refetch()} 
          className="h-10 w-10 text-primary hover:bg-primary/5 border-none shadow-sm"
          disabled={isLoading}
        >
          <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white/60 backdrop-blur-sm">
        <CardContent className="p-0">
           <ScrollArea className="h-[600px] w-full">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-60">
                   <LoadingMark size="md" />
                   <p className="text-sm font-bold text-primary animate-pulse uppercase tracking-widest">Recalling History...</p>
                </div>
              ) : filteredSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-40">
                   <History className="h-12 w-12" />
                   <p className="font-bold">No records matched your search</p>
                </div>
              ) : (
                <Table>
                   <TableHeader className="bg-muted/50 sticky top-0 z-20 backdrop-blur-md">
                      <TableRow className="border-none hover:bg-transparent">
                         <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground pl-6">Transaction</TableHead>
                         <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Customer</TableHead>
                         <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Payment</TableHead>
                         <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-right">Amount</TableHead>
                         <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-right pr-6">Actions</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {filteredSales.map((sale: any) => (
                        <TableRow key={sale.id} className="group border-b border-primary/5 hover:bg-white transition-colors">
                           <TableCell className="pl-6">
                              <div className="flex flex-col gap-0.5">
                                 <span className="font-mono text-[10px] font-black text-primary">#{sale.receipt_number || sale.receiptNumber || `LEGACY-${sale.id.slice(-8).toUpperCase()}`}</span>
                                 <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
                                    <Clock className="h-3 w-3" />
                                    {new Date(sale.date_of_sale).toLocaleDateString()}
                                 </div>
                              </div>
                           </TableCell>
                           <TableCell>
                              <div className="flex items-center gap-2">
                                 <div className="h-8 w-8 rounded-full bg-secondary/50 flex items-center justify-center text-secondary-foreground font-black text-xs">
                                    {sale.customer_name?.charAt(0).toUpperCase() || 'W'}
                                 </div>
                                 <span className="font-black text-sm text-foreground/80">{sale.customer_name || 'Walk-in'}</span>
                              </div>
                           </TableCell>
                           <TableCell>
                              <Badge variant={sale.paid_in_cash ? "secondary" : "destructive"} className="h-5 text-[9px] font-black uppercase px-2 rounded-full border-none bg-primary/10 text-primary">
                                 {sale.paid_in_cash ? (sale.payment_details?.paymentMethod || 'PAID') : 'DEBT'}
                              </Badge>
                           </TableCell>
                           <TableCell className="text-right font-black tabular-nums text-primary pr-4">
                              {fmtCurrency((sale.total_amount || 0))}
                           </TableCell>
                           <TableCell className="text-right pr-6">
                              <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
                                 <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/5" onClick={() => onPrint(sale)}>
                                    <Receipt className="h-4 w-4" />
                                 </Button>
                                 <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => handleOpenReturn(sale)}>
                                    <Undo2 className="h-4 w-4" />
                                 </Button>
                              </div>
                           </TableCell>
                        </TableRow>
                      ))}
                   </TableBody>
                </Table>
              )}
           </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
         <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
            <DialogHeader className="p-6 bg-amber-500 text-white">
               <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter">
                  <Undo2 className="h-6 w-6" />
                   Process Return
               </DialogTitle>
               <DialogDescription className="text-white/80 font-bold">
                  Refunding #{selectedSale?.id.slice(-8).toUpperCase()} for {selectedSale?.customerName}
               </DialogDescription>
            </DialogHeader>
            <div className="p-6 space-y-4">
               {returnItems.map(it => (
                 <div key={`${it.productName}-${it.sellType}`} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50">
                    <div className="flex flex-col">
                       <span className="font-bold text-sm">{it.productName}</span>
                       <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">{it.sellType} • {it.originalQty} sold</span>
                    </div>
                    <div className="flex items-center gap-3">
                       <Input 
                         type="number" 
                         className="h-10 w-20 text-center font-black rounded-lg border-primary/20" 
                         max={it.originalQty} 
                         min={0}
                         value={it.returnQty}
                         onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setReturnItems(prev => prev.map(p => 
                              p.productName === it.productName && p.sellType === it.sellType 
                                ? { ...p, returnQty: Math.min(val, it.originalQty) } 
                                : p
                            ));
                         }}
                       />
                       <span className="text-[10px] font-black text-muted-foreground uppercase w-8">QTY</span>
                    </div>
                 </div>
               ))}
            </div>
            <DialogFooter className="p-6 bg-muted/50 border-t border-border flex sm:justify-between items-center">
               <div className="text-left">
                  <span className="text-[9px] font-black text-muted-foreground uppercase opacity-70">Total Refund</span>
                  <div className="text-xl font-black text-amber-600">
                    {fmtCurrency(returnItems.reduce((s, i) => s + (i.returnQty * (i.sellingPrice || i.price || 0)), 0))}
                  </div>
               </div>
               <Button onClick={processReturn} disabled={isProcessingReturn} className="h-12 px-8 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl shadow-lg shadow-amber-600/20">
                  {isProcessingReturn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Undo2 className="h-4 w-4 mr-2" />}
                  FINALIZE RETURN
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  );
};
