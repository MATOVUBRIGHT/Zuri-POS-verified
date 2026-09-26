import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingBag, Trash2, CreditCard, Loader2 } from "lucide-react";
import { BatchItem } from "@/types";

interface BatchTableProps {
  batchItems: BatchItem[];
  availableCash: number;
  batchTotal: number;
  batchCashTotal: number;
  batchCreditTotal: number;
  isSubmitting: boolean;
  removeFromBatch: (id: string) => void;
  handleSubmitBatch: () => void;
}

export const BatchTable = ({
  batchItems,
  availableCash,
  batchTotal,
  batchCashTotal,
  batchCreditTotal,
  isSubmitting,
  removeFromBatch,
  handleSubmitBatch
}: BatchTableProps) => {
  return (
    <Card className="h-[calc(100vh-12rem)] flex flex-col rounded-xl overflow-hidden">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          Current Batch
          {batchItems.length > 0 && (
            <Badge variant="secondary" className="ml-auto">{batchItems.length} items</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 -mx-2 px-2">
          {batchItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <ShoppingBag className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No items in batch</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {batchItems.map((item) => (
                <div key={item.id} className="p-3 border rounded-lg bg-accent/30 space-y-2 group relative">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-sm truncate">{item.productName}</h4>
                      <p className="text-[10px] text-muted-foreground uppercase">{item.category}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeFromBatch(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      {item.quantity} × UGX {item.costPerUnit.toLocaleString()}
                    </span>
                    <span className="font-semibold">
                      UGX {item.totalCost.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.onCredit ? (
                      <Badge variant="outline" className="text-[10px] py-0 text-amber-600 border-amber-200 bg-amber-50">
                        <CreditCard className="h-2.5 w-2.5 mr-1" />
                        Credit {item.credit_paid_now > 0 ? `(Partial: UGX ${item.credit_paid_now.toLocaleString()})` : ''}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] py-0 text-green-600 border-green-200 bg-green-50">
                        Cash Payment
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="pt-4 border-t space-y-3 shrink-0">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Batch Total:</span>
              <span className="font-medium text-foreground">UGX {batchTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted-foreground italic text-xs">
              <span>Cash Required:</span>
              <span className={batchCashTotal > availableCash ? "text-destructive font-bold" : "text-foreground font-medium"}>
                UGX {batchCashTotal.toLocaleString()}
              </span>
            </div>
            {batchCreditTotal > 0 && (
              <div className="flex justify-between text-amber-600 text-xs">
                <span>Credit Amount:</span>
                <span>UGX {batchCreditTotal.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 font-bold text-base border-t border-dashed border-muted-foreground/30">
              <span>Available Cash:</span>
              <span className={batchCashTotal > availableCash ? "text-destructive" : "text-green-600"}>
                UGX {availableCash.toLocaleString()}
              </span>
            </div>
          </div>

          <Button
            className="w-full gap-2 font-bold h-11"
            disabled={batchItems.length === 0 || isSubmitting || batchCashTotal > availableCash}
            onClick={handleSubmitBatch}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4" />
                Submit Batch Entry
              </>
            )}
          </Button>

          {batchCashTotal > availableCash && (
            <p className="text-[10px] text-destructive text-center font-medium animate-pulse">
              ⚠️ Insufficient cash to complete this batch
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
