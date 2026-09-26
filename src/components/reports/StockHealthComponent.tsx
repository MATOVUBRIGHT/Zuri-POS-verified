import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Package, CheckCircle2 } from "lucide-react";
import { StockItem } from "@/types";

interface StockHealthComponentProps {
  stockData: StockItem[];
}

const StockHealthComponent = ({ stockData }: StockHealthComponentProps) => {
  const criticalItems = stockData.filter(item => item.quantity < (item.min_stock_level || 10));
  const lowItems = stockData.filter(item => {
    const threshold = (item.min_stock_level || 10) * 2;
    return item.quantity < threshold && item.quantity >= (item.min_stock_level || 10);
  });
  const healthyItems = stockData.filter(item => {
    const threshold = (item.min_stock_level || 10) * 2;
    return item.quantity >= threshold;
  });

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Critical Items */}
        <Card className="border-destructive/50 bg-gradient-to-br from-destructive/10 to-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Stock</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{criticalItems.length}</div>
            <p className="text-xs text-muted-foreground">Below minimum level</p>
          </CardContent>
        </Card>

        {/* Low Items */}
        <Card className="border-warning/50 bg-gradient-to-br from-warning/10 to-warning/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <Package className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{lowItems.length}</div>
            <p className="text-xs text-muted-foreground">Approaching low levels</p>
          </CardContent>
        </Card>

        {/* Healthy Items */}
        <Card className="border-success/50 bg-gradient-to-br from-success/10 to-success/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy Stock</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{healthyItems.length}</div>
            <p className="text-xs text-muted-foreground">All good</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inventory Health Check</CardTitle>
        </CardHeader>
        <CardContent>
          {criticalItems.length === 0 && lowItems.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mr-2 text-success" />
              <span>All inventory levels are healthy!</span>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {[...criticalItems, ...lowItems]
                .sort((a, b) => a.quantity - b.quantity)
                .map((item) => {
                  const minLevel = item.min_stock_level || 10;
                  const status = item.quantity < minLevel ? "Critical" : "Low";
                  const statusColor = item.quantity < minLevel ? "destructive" : "outline";
                  
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.productName}</div>
                        <div className="text-xs text-muted-foreground">{item.category}</div>
                      </div>

                      <div className="flex items-center gap-6 ml-4">
                        {/* Current Stock */}
                        <div className="text-center min-w-[80px]">
                          <div className="text-xs text-muted-foreground mb-1">Current</div>
                          <div className={`font-bold text-sm ${item.quantity < minLevel ? 'text-destructive' : 'text-warning'}`}>
                            {item.quantity} units
                          </div>
                        </div>

                        {/* Min Level */}
                        <div className="text-center min-w-[80px]">
                          <div className="text-xs text-muted-foreground mb-1">Min Level</div>
                          <div className="font-medium text-sm">{minLevel}</div>
                        </div>

                        {/* Reorder Qty */}
                        <div className="text-center min-w-[80px]">
                          <div className="text-xs text-muted-foreground mb-1">Reorder</div>
                          <div className="font-medium text-sm text-primary">{item.reorder_quantity || 20}</div>
                        </div>

                        {/* Status Badge */}
                        <Badge variant={statusColor as 'destructive' | 'outline'} className="whitespace-nowrap">
                          {status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StockHealthComponent;
