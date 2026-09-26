import { useState, useMemo } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { Boxes, Package, AlertTriangle, ChevronDown, Filter, Tag, Users } from "lucide-react";
import { StockItem } from "@/types";

interface InventoryStatsProps {
  stockData: StockItem[];
  lowStockThreshold: number;
  criticalStockThreshold: number;
  onFilterStatus: (status: "low" | "critical" | null) => void;
}

type GroupMode = "product" | "supplier" | "category";

export const InventoryStats = ({
  stockData,
  lowStockThreshold,
  criticalStockThreshold,
  onFilterStatus,
}: InventoryStatsProps) => {
  const [groupMode, setGroupMode] = useState<GroupMode>("product");
  const [isCriticalDetailsOpen, setIsCriticalDetailsOpen] = useState(false);
  const [isLowStockDetailsOpen, setIsLowStockDetailsOpen] = useState(false);

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

  // Build chart data based on groupMode
  const chartData = useMemo(() => {
    if (groupMode === "product") {
      // All products, sorted high → low
      return stockData
        .map((item) => {
          const qty = item.quantity || 0;
          const critical = item.min_stock_level || criticalStockThreshold;
          const low = item.min_stock_level ? item.min_stock_level * 1.5 : lowStockThreshold;
          let color = "#22c55e"; // green
          if (qty < critical) color = "#ef4444"; // red
          else if (qty < low) color = "#f59e0b"; // amber
          return {
            name: item.productName.length > 14 ? item.productName.substring(0, 12) + "…" : item.productName,
            fullName: item.productName,
            quantity: qty,
            color,
          };
        })
        .sort((a, b) => b.quantity - a.quantity);
    }

    // Group by supplier or category
    const key = groupMode === "supplier"
      ? (item: StockItem) => (item.supplier_name || (item as any).supplier || item.category || "—")
      : (item: StockItem) => item.category || "—";

    const map = new Map<string, number>();
    stockData.forEach((item) => {
      const k = key(item);
      map.set(k, (map.get(k) || 0) + (item.quantity || 0));
    });

    return Array.from(map.entries())
      .map(([name, quantity]) => ({ name, fullName: name, quantity, color: "#3b82f6" }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [stockData, groupMode, criticalStockThreshold, lowStockThreshold]);

  // Dynamic chart width: min 600px, 48px per bar
  const chartWidth = Math.max(600, chartData.length * 48);

  const criticalDisplay = criticalStockList.slice(0, 8);
  const lowDisplay = lowStockList.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Products */}
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
              <span className="font-semibold text-primary">{fmtCurrency(totalValue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Critical Stock */}
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
            <p className="text-[10px] text-muted-foreground mt-2 italic">Click to filter · below {criticalStockThreshold} units</p>
          </CardContent>
        </Card>

        {/* Stock Levels Chart — scrollable */}
        <Card className="md:col-span-2 shadow-sm border-primary/5">
          <CardHeader className="py-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Boxes className="h-4 w-4" />
                Stock Levels
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={groupMode === "product" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setGroupMode("product")}
                >
                  All
                </Button>
                <Button
                  variant={groupMode === "supplier" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => setGroupMode("supplier")}
                >
                  <Users className="h-3 w-3" /> Supplier
                </Button>
                <Button
                  variant={groupMode === "category" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => setGroupMode("category")}
                >
                  <Tag className="h-3 w-3" /> Category
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-2">
            {/* Horizontally scrollable chart */}
            <div className="overflow-x-auto">
              <div style={{ width: chartWidth, height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9 }}
                      interval={0}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v: number, _: string, props: any) => [
                        `${v.toLocaleString()} units`,
                        props?.payload?.fullName || "Qty",
                      ]}
                      contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 11 }}
                      cursor={{ fill: "rgba(0,0,0,0.03)" }}
                    />
                    <Bar dataKey="quantity" radius={[3, 3, 0, 0]} maxBarSize={36}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground text-right pr-1 mt-0.5">← scroll →</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical & Low Stock Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Critical Stock Details */}
        <Card className="shadow-sm border-destructive/10">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex items-center gap-2 text-left flex-1"
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
              {isCriticalDetailsOpen && criticalStockList.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 gap-1.5 text-xs shrink-0"
                  onClick={() => onFilterStatus("critical")}
                >
                  <Filter className="h-3 w-3" /> Filter
                </Button>
              )}
            </div>
          </CardHeader>
          {isCriticalDetailsOpen && (
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criticalDisplay.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No critical stock items
                      </TableCell>
                    </TableRow>
                  ) : (
                    criticalDisplay.map((item) => {
                      const threshold = item.min_stock_level || criticalStockThreshold;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-semibold">{item.productName}</TableCell>
                          <TableCell className="text-right font-bold text-destructive">{item.quantity || 0}</TableCell>
                          <TableCell className="text-right">{threshold}</TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="text-[10px] px-2 py-0">Critical</Badge>
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

        {/* Low Stock Watchlist */}
        <Card className="shadow-sm border-warning/10">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex items-center gap-2 text-left flex-1"
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
              {isLowStockDetailsOpen && lowStockList.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs shrink-0 border-amber-400 text-amber-700 hover:bg-amber-50"
                  onClick={() => onFilterStatus("low")}
                >
                  <Filter className="h-3 w-3" /> Filter
                </Button>
              )}
            </div>
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
                            <Badge variant="warning" className="text-[10px] px-2 py-0">Low</Badge>
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
