import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Edit, Trash2, AlertTriangle, CheckCircle, Package } from "lucide-react";
import { StockItem } from "@/types";

interface InventoryTableProps {
  stockItems: StockItem[];
  lowStockThreshold: number;
  criticalStockThreshold: number;
  onEdit: (item: StockItem) => void;
  onDelete: (id: string, name: string) => void;
  onUpdateQty: (item: StockItem, qty: number) => void;
}

export const InventoryTable = ({
  stockItems,
  lowStockThreshold,
  criticalStockThreshold,
  onEdit,
  onDelete,
  onUpdateQty
}: InventoryTableProps) => {
  const getStockStatus = (item: StockItem) => {
    const qty = item.quantity || 0;
    const critical = item.min_stock_level || criticalStockThreshold;
    const low = (item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold);
    
    if (qty < critical) return { status: "Critical", color: "destructive", icon: AlertTriangle };
    if (qty < low) return { status: "Low", color: "warning", icon: AlertTriangle };
    return { status: "Healthy", color: "success", icon: CheckCircle };
  };

  return (
    <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50 font-bold uppercase tracking-wider text-[10px]">
          <TableRow>
            <TableHead className="w-[300px]">Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Stock Qty</TableHead>
            <TableHead className="text-right">Cost Price</TableHead>
            <TableHead className="text-right">Retail Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stockItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-40 text-center py-12">
                <div className="flex flex-col items-center justify-center opacity-40">
                  <Package className="h-12 w-12 mb-2" />
                  <p>No products match your current filters</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            stockItems.map((item) => {
              const status = getStockStatus(item);
              const Icon = status.icon;
              return (
                <TableRow key={item.id} id={`product-${item.id}`} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.productImage ? (
                        <img src={item.productImage} className="w-10 h-10 rounded-md object-cover border" alt={item.productName} />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground border">
                          <Package className="h-5 w-5 opacity-40" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold truncate max-w-[200px]">{item.productName}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{item.size || "Standard"} • {item.barcode || "No Barcode"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-medium py-0 px-2 uppercase tracking-tight">{item.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className={`text-lg font-bold ${status.color === 'destructive' ? 'text-destructive' : ''}`}>
                        {item.quantity.toLocaleString()}
                      </span>
                      {item.unit_name && <span className="text-[10px] text-muted-foreground">{item.unit_name}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    UGX {(item.cost_per_unit || item.costPerUnit || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    UGX {(item.retail_price || item.retailPrice || 0).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.color as any} className="gap-1 px-2 py-0 text-[10px] font-bold h-6 flex w-fit items-center">
                      <Icon className="h-3 w-3" />
                      {status.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => onEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(item.id, item.productName)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
