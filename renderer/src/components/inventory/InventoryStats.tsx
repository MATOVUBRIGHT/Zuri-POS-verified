import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Boxes, Package, AlertTriangle, ChevronDown } from "lucide-react";
import { StockItem } from "@/types";

interface InventoryStatsProps {
  stockData: StockItem[];
  lowStockThreshold: number;
  criticalStockThreshold: number;
  onFilterStatus: (status: "low" | "critical" | null) => void;
}

export const InventoryStats = ({
  stockData,
  lowStockThreshold,
  criticalStockThreshold,
  onFilterStatus,
}: InventoryStatsProps) => {
  const totalProducts = stockData.length;
  const totalValue = stockData.reduce(
    (sum, item) => sum + ((item.quantity || 0) * (item.cost_per_unit || item.costPerUnit || 0)),
    0
  );

  const criticalStockList = stockData.filter((item) => {
    const threshold = item.min_stock_level || criticalStockThreshold;
    return (item.quantity || 0) < threshold;
  });

  const lowStockList = stockData.filter((item) => {
    const critical = item.min_stock_level || criticalStockThreshold;
    const low = item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold;
    const qty = item.quantity || 0;
    return qty < low && qty >= critical;
  });

  const chartData = stockData
    .slice(0, 20)
    .map((item) => {
      const qty = item.quantity || 0;
      const critical = item.min_stock_level || criticalStockThreshold;
      const low = item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold;

      let color = "hsl(var(--success))";
      if (qty < critical) color = "hsl(var(--destructive))";
      else if (qty < low) color = "hsl(var(--warning))";

      return {
        name: item.productName.length > 12 ? `${item.productName.substring(0, 10)}...` : item.productName,
        quantity: qty,
        color,
      };
    })
    .sort((a, b) => a.quantity - b.quantity);

  const criticalDisplay = criticalStockList.slice(0, 6);
  const lowDisplay = lowStockList.slice(0, 6);
  const [isCriticalDetailsOpen, setIsCriticalDetailsOpen] = useState(false);
  const [isLowStockDetailsOpen, setIsLowStockDetailsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1 shadow-sm border-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Products</p>
                <h3 className="text-2xl font-bold mt-1">{totalProducts}</h3>
              </div>
              <div className="p-2 bg-primary/10 rounded-full">
                <Package className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Inventory Value:</span>
              <span className="font-semibold text-primary">UGX {totalValue.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card
          className="md:col-span-1 shadow-sm border-destructive/10 cursor-pointer hover:bg-destructive/5 transition-colors"
          onClick={() => onFilterStatus("critical")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Critical Stock</p>
                <h3 className="text-2xl font-bold mt-1 text-destructive">{criticalStockList.length}</h3>
              </div>
              <div className="p-2 bg-destructive/10 rounded-full text-destructive animate-pulse">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 italic">Items below {criticalStockThreshold} units</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm border-primary/5">
          <CardHeader className="py-3 shrink-0">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Stock Levels Visualization
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[120px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  cursor={{ fill: "rgba(0,0,0,0.02)" }}
                />
                <Bar dataKey="quantity" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm border-destructive/10">
          <CardHeader className="py-3">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 text-left"
              onClick={() => setIsCriticalDetailsOpen((prev) => !prev)}
              aria-expanded={isCriticalDetailsOpen}
            >
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Critical Stock Details
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${isCriticalDetailsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CardHeader>
          {isCriticalDetailsOpen && (
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criticalDisplay.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No critical stock items right now
                      </TableCell>
                    </TableRow>
                  ) : (
                    criticalDisplay.map((item) => {
                      const threshold = item.min_stock_level || criticalStockThreshold;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-semibold">{item.productName}</TableCell>
                          <TableCell className="text-right font-bold text-destructive">
                            {item.quantity || 0}
                          </TableCell>
                          <TableCell className="text-right">{threshold}</TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="text-[10px] px-2 py-0">
                              Critical
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>

        <Card className="shadow-sm border-warning/10">
          <CardHeader className="py-3">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 text-left"
              onClick={() => setIsLowStockDetailsOpen((prev) => !prev)}
              aria-expanded={isLowStockDetailsOpen}
            >
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Boxes className="h-4 w-4 text-warning" />
                Low Stock Watchlist
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${isLowStockDetailsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CardHeader>
          {isLowStockDetailsOpen && (
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Low Threshold</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowDisplay.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        Inventory levels are stable
                      </TableCell>
                    </TableRow>
                  ) : (
                    lowDisplay.map((item) => {
                      const low = item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-semibold">{item.productName}</TableCell>
                          <TableCell className="text-right font-semibold">{item.quantity || 0}</TableCell>
                          <TableCell className="text-right">{Math.round(low)}</TableCell>
                          <TableCell>
                            <Badge variant="warning" className="text-[10px] px-2 py-0">
                              Low
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
};
