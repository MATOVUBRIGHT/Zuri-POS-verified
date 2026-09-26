import { useMemo } from "react";
import { User, DollarSign, CreditCard, Banknote, Check, Plus, ShoppingCart, Receipt, Trash2, Clock, X, Undo2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePosStore } from "@/store/usePosStore";
import { calculateTransaction } from "@/services/posCalculator";
import { TaxConfig, PaymentMethod, Customer } from "@/types";
import { cn } from "@/lib/utils";

interface PaymentSummaryProps {
  customers: Customer[];
  taxes: TaxConfig[];
  paymentMethods: PaymentMethod[];
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  onClear: () => void;
  onViewReceipt: () => void;
  onReturnSales: () => void;
}

export const PaymentSummary = ({
  customers,
  taxes,
  paymentMethods,
  onSubmit,
  isSubmitting,
  onClear,
  onViewReceipt,
  onReturnSales
}: PaymentSummaryProps) => {
  const {
    cart,
    customerName,
    customerPhone,
    selectedCustomerId,
    discountAmount,
    discountType,
    selectedTaxId,
    selectedPaymentMethodId,
    amountReceived,
    formData,
    setCustomer,
    setDiscount,
    setTaxId,
    setPaymentMethodId,
    setAmountReceived,
    setFormData,
  } = usePosStore();

  const selectedTax = useMemo(() => taxes.find(t => t.id === selectedTaxId), [taxes, selectedTaxId]);
  
  const result = useMemo(() => 
    calculateTransaction(
      cart.map(item => ({ ...item })), 
      { value: parseFloat(discountAmount) || 0, type: discountType },
      selectedTax?.rate || 0
    ),
  [cart, discountAmount, discountType, selectedTax]);

  const { subtotal, discountAmount: totalDiscount, taxAmount, total } = result;
  const amountReceivedNum = parseFloat(amountReceived) || 0;
  const balance = amountReceivedNum - total;

  const currentMethod = useMemo(() => 
    paymentMethods.find(m => m.id === selectedPaymentMethodId),
  [paymentMethods, selectedPaymentMethodId]);

  const isCashMethod = currentMethod?.name.toLowerCase().includes('cash') ?? true;
  const isMoMo = currentMethod?.name.toLowerCase().includes('mobile') || currentMethod?.name.toLowerCase().includes('mtn') || currentMethod?.name.toLowerCase().includes('airtel');
  const isBank = currentMethod?.name.toLowerCase().includes('bank') || currentMethod?.name.toLowerCase().includes('transfer');
  const isCard = currentMethod?.name.toLowerCase().includes('card') || currentMethod?.name.toLowerCase().includes('visa') || currentMethod?.name.toLowerCase().includes('mastercard');

  return (
    <div className="space-y-4">
      {/* Customer Information */}
      <Card className="border-none shadow-sm bg-sidebar-dark text-sidebar-dark-foreground overflow-hidden">
        <div className="h-1 bg-primary w-full" />
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Customer Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-5">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-sidebar-dark-foreground/50 tracking-wider">Name</Label>
            <div className="relative group">
              <Input
                placeholder="Walk-in Customer"
                value={customerName}
                onChange={(e) => setCustomer(e.target.value, customerPhone)}
                className="h-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:bg-white/10 focus:border-primary/50 transition-all rounded-lg pl-3 pr-10"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 rounded-md">
                    <Check className={cn("h-4 w-4 transition-all", selectedCustomerId ? "text-primary scale-110" : "")} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[280px] bg-background border-border shadow-2xl" align="end">
                  <Command>
                    <CommandInput placeholder="Search system customers..." className="h-10" />
                    <CommandList className="max-h-60">
                      <CommandEmpty>No registered customers found.</CommandEmpty>
                      <CommandGroup heading="Recent Customers">
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            onSelect={() => setCustomer(c.full_name, c.phone || '', c.id)}
                            className="flex items-center justify-between p-2 cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-sm">{c.full_name}</span>
                              <span className="text-[10px] text-muted-foreground">{c.phone || 'No phone'}</span>
                            </div>
                            {selectedCustomerId === c.id && <Check className="h-4 w-4 text-primary" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-sidebar-dark-foreground/50 tracking-wider">Phone</Label>
              <Input
                placeholder="Optional"
                value={customerPhone}
                onChange={(e) => setCustomer(customerName, e.target.value)}
                className="h-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:bg-white/10 focus:border-primary/50 transition-all rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-sidebar-dark-foreground/50 tracking-wider">Sale Type</Label>
              <div className="h-10 px-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between text-xs font-bold">
                <span className="text-primary uppercase tracking-tighter">Retail Mode</span>
                <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Information */}
      <Card className="border-none shadow-sm bg-white/80 backdrop-blur-md">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground/80">
            <DollarSign className="h-4 w-4 text-primary" />
            Payment Selection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Select Tax</Label>
              <Select value={selectedTaxId || "none"} onValueChange={(v) => setTaxId(v === "none" ? null : v)}>
                <SelectTrigger className="h-10 rounded-lg border-primary/5 bg-primary/5 text-xs font-bold focus:ring-primary/20">
                  <SelectValue placeholder="No Tax" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-primary/10">
                  <SelectItem value="none">No Tax</SelectItem>
                  {taxes.map(tax => (
                    <SelectItem key={tax.id} value={tax.id} className="text-xs font-medium">
                      {tax.name} ({tax.rate}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Payment Method</Label>
              <Select value={selectedPaymentMethodId || ""} onValueChange={(v) => {
                setPaymentMethodId(v);
                setFormData({ paidInCash: true });
              }}>
                <SelectTrigger className="h-10 rounded-lg border-primary/5 bg-primary/5 text-xs font-bold focus:ring-primary/20">
                  <SelectValue placeholder="Choose Method" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-primary/10">
                  {paymentMethods.map(method => (
                    <SelectItem key={method.id} value={method.id} className="text-xs font-medium">
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Discount</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={discountAmount}
                  onChange={(e) => setDiscount(e.target.value, discountType)}
                  className="h-10 rounded-lg border-primary/5 bg-primary/5 text-xs font-bold focus:ring-primary/20"
                />
                <ToggleGroup 
                  type="single" 
                  value={discountType} 
                  onValueChange={(v) => v && setDiscount(discountAmount, v as any)}
                  className="bg-primary/5 p-1 rounded-lg border border-primary/5"
                >
                  <ToggleGroupItem value="fixed" className="h-7 w-8 text-[9px] font-black rounded-md data-[state=on]:bg-primary data-[state=on]:text-white transition-all">FIX</ToggleGroupItem>
                  <ToggleGroupItem value="percentage" className="h-7 w-8 text-[12px] font-black rounded-md data-[state=on]:bg-primary data-[state=on]:text-white transition-all">%</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Amt Received</Label>
              <Input
                type="number"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="UGX 0"
                className="h-10 rounded-lg border-primary/20 bg-primary/10 text-sm font-black text-primary focus:ring-primary/30 animate-in zoom-in-95 duration-200"
              />
            </div>
          </div>

          {/* Conditional non-cash forms */}
          {!isCashMethod && (
             <div className="pt-2 animate-in slide-in-from-top-4 duration-300">
                <Card className="bg-primary/5 border-dashed border-primary/20 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-primary/10 bg-primary/10 flex items-center justify-between">
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" />
                      Digital Payment
                    </span>
                    <Badge variant="outline" className="h-5 text-[9px] font-black bg-white/50 border-primary/20 text-primary uppercase">Verify Now</Badge>
                  </div>
                  <CardContent className="p-3 space-y-3">
                    {isMoMo && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-muted-foreground uppercase">MoMo Number</Label>
                          <Input 
                            value={formData.mobileMoneyNumber} 
                            onChange={(e) => setFormData({ mobileMoneyNumber: e.target.value })} 
                            className="h-10 text-sm font-black bg-white border-primary/10"
                            placeholder="e.g. 077..."
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-muted-foreground uppercase">Txn ID / Reference</Label>
                          <Input 
                            value={formData.transactionReference} 
                            onChange={(e) => setFormData({ transactionReference: e.target.value })} 
                            className="h-8 text-[10px] font-mono bg-white border-primary/10"
                            placeholder="Enter Transaction ID"
                          />
                        </div>
                      </>
                    )}
                    {isBank && (
                       <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-muted-foreground">Bank</Label>
                            <Input value={formData.bankName} onChange={(e) => setFormData({ bankName: e.target.value })} className="h-8 text-xs font-bold" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-muted-foreground">Account #</Label>
                            <Input value={formData.accountNumber} onChange={(e) => setFormData({ accountNumber: e.target.value })} className="h-8 text-xs font-bold" />
                          </div>
                       </div>
                    )}
                    {/* Add card/generic fields here... */}
                  </CardContent>
                </Card>
             </div>
          )}

          {/* Checkout Totals */}
          <div className="pt-4 border-t border-primary/5 space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-muted-foreground">SUBTOTAL</span>
              <span className="text-sm font-bold">UGX {subtotal.toLocaleString()}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between items-center px-1 text-warning">
                <span className="text-xs font-bold underline decoration-warning/30 decoration-dashed">DISCOUNT</span>
                <span className="text-sm font-black">-UGX {totalDiscount.toLocaleString()}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between items-center px-1 text-muted-foreground">
                <span className="text-xs font-bold">TAX ({selectedTax?.name})</span>
                <span className="text-sm font-bold">UGX {taxAmount.toLocaleString()}</span>
              </div>
            )}
            
            <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/20 flex items-center justify-between transform transition-all active:scale-95 duration-300">
               <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Payable Amount</span>
                  <div className="text-3xl font-black tabular-nums tracking-tighter">
                     UGX {total.toLocaleString()}
                  </div>
               </div>
               <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
                 <ShoppingCart className="h-6 w-6" />
               </div>
            </div>

            {amountReceivedNum >= total && (
               <div className="p-3 rounded-xl bg-success/10 border border-success/20 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-center gap-2">
                     <div className="h-2 w-2 rounded-full bg-success animate-ping" />
                     <span className="text-[11px] font-black text-success uppercase">Change Due</span>
                  </div>
                  <span className="text-lg font-black text-success tabular-nums">UGX {balance.toLocaleString()}</span>
               </div>
            )}
            {amountReceivedNum > 0 && amountReceivedNum < total && (
               <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-between animate-in slide-in-from-top-2 duration-500">
                  <div className="flex items-center gap-2">
                     <div className="h-2 w-2 rounded-full bg-warning" />
                     <span className="text-[11px] font-black text-warning uppercase">Balance to Debt</span>
                  </div>
                  <span className="text-lg font-black text-warning tabular-nums">UGX {Math.abs(balance).toLocaleString()}</span>
               </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-4 grid grid-cols-2 gap-3">
             <Button 
               type="button" 
               className="h-14 rounded-2xl bg-foreground text-background font-black text-base shadow-xl hover:shadow-2xl hover:bg-foreground/90 transition-all flex flex-col gap-0 select-none col-span-2"
               disabled={isSubmitting || cart.length === 0}
               onClick={onSubmit}
             >
                {isSubmitting ? (
                   <span className="flex items-center gap-2">
                     <div className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                     PROCESSING...
                   </span>
                ) : (
                   <>
                     <span>COMPLETE SALE</span>
                     <span className="text-[9px] opacity-60 font-mono tracking-widest">SUBMIT RECORD</span>
                   </>
                )}
             </Button>
             
             <Button 
               type="button" 
               variant="outline" 
               className="h-11 rounded-xl border-primary/5 bg-primary/5 text-primary font-bold shadow-xs hover:bg-primary/10"
               onClick={onViewReceipt}
             >
               <Receipt className="h-4 w-4 mr-2" />
               RECEIPT
             </Button>

             <Button 
               type="button" 
               variant="outline" 
               className="h-11 rounded-xl border-destructive/5 bg-destructive/5 text-destructive font-bold shadow-xs hover:bg-destructive/10"
               onClick={onClear}
             >
               <Trash2 className="h-4 w-4 mr-2" />
               CLEAR
             </Button>

             <Button 
               type="button" 
               variant="outline" 
               className="h-11 rounded-xl border-amber-500/10 bg-amber-500/5 text-amber-600 font-bold shadow-xs hover:bg-amber-500/10 col-span-2"
               onClick={onReturnSales}
             >
               <Undo2 className="h-4 w-4 mr-2" />
               VIEW SALES HISTORY
             </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
