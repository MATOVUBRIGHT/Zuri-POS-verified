import { useState } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, TrendingUp, Package, DollarSign, ShoppingBag } from "lucide-react";
import { SaleItem, StockItem, ExpenseItem } from "@/types";

interface DailyProfitModalProps {
  salesData: SaleItem[];
  stockData: StockItem[];
  expensesData: ExpenseItem[];
  trigger: React.ReactNode;
}

const DailyProfitModal = ({ salesData, stockData, expensesData, trigger }: DailyProfitModalProps) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Deduplicate sales by ID to prevent double counting
  const uniqueSalesData = salesData.filter((sale, index, self) => 
    index === self.findIndex((s) => s.id === sale.id)
  );

  // Filter sales for selected date
  const dailySales = uniqueSalesData.filter(sale => {
    const saleDate = new Date(sale.dateOfSale).toISOString().split('T')[0];
    return saleDate === selectedDate;
  });

  // Filter expenses for selected date
  const dailyExpenses = expensesData.filter(expense => {
    const expenseDate = new Date(expense.date).toISOString().split('T')[0];
    return expenseDate === selectedDate;
  });

  // Calculate daily metrics
  const dailyRevenue = dailySales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const dailyExpenseAmount = dailyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  
  // Calculate cost of goods sold for the day
  const dailyCostOfGoods = dailySales.reduce((totalCost, sale) => {
    const saleCost = sale.products.reduce((cost: number, product) => {
      const stockItem = stockData.find(s => s.productName === product.productName);
      if (stockItem) {
        return cost + ((stockItem.costPerUnit || stockItem.cost_per_unit || 0) * product.quantity);
      }
      return cost;
    }, 0);
    return totalCost + saleCost;
  }, 0);

  const dailyProfit = dailyRevenue - dailyCostOfGoods - dailyExpenseAmount;

  // Get products sold today
  const productsSoldToday = dailySales.reduce((products: { productName: string, quantity: number, revenue: number, unitPrice: number }[], sale) => {
    sale.products.forEach((product) => {
      const existing = products.find(p => p.productName === product.productName);
      if (existing) {
        existing.quantity += product.quantity;
        existing.revenue += product.quantity * product.sellingPrice;
      } else {
        products.push({
          productName: product.productName,
          quantity: product.quantity,
          revenue: product.quantity * product.sellingPrice,
          unitPrice: product.sellingPrice
        });
      }
    });
    return products;
  }, []);

  // Calculate total sachets/units sold
  const totalUnitsSold = productsSoldToday.reduce((sum, product) => sum + product.quantity, 0);

  // Get payment method breakdown for the day
  const paymentMethodBreakdown = dailySales.reduce((acc: Record<string, { count: number, amount: number }>, sale) => {
    const method = sale.paymentDetails?.paymentMethod || (sale.paidInCash ? 'Cash' : 'Credit');
    if (!acc[method]) {
      acc[method] = { count: 0, amount: 0 };
    }
    acc[method].count += 1;
    acc[method].amount += sale.totalAmount;
    return acc;
  }, {});

  // Get recent sales history (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().split('T')[0];
  }).reverse();

  const salesHistory = last7Days.map(date => {
    const daySales = uniqueSalesData.filter(sale => {
      const saleDate = new Date(sale.dateOfSale).toISOString().split('T')[0];
      return saleDate === date;
    });
    
    const dayExpenses = expensesData.filter(expense => {
      const expenseDate = new Date(expense.date).toISOString().split('T')[0];
      return expenseDate === date;
    });

    const revenue = daySales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const expenses = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    const costOfGoods = daySales.reduce((totalCost, sale) => {
      const saleCost = sale.products.reduce((cost: number, product) => {
        const stockItem = stockData.find(s => s.productName === product.productName);
        if (stockItem) {
          return cost + ((stockItem.costPerUnit || stockItem.cost_per_unit || 0) * product.quantity);
        }
        return cost;
      }, 0);
      return totalCost + saleCost;
    }, 0);

    const profit = revenue - costOfGoods - expenses;
    const unitsSold = daySales.reduce((sum, sale) => 
      sum + sale.products.reduce((productSum: number, product) => productSum + product.quantity, 0), 0
    );

    return {
      date,
      revenue,
      expenses,
      profit,
      unitsSold,
      salesCount: daySales.length
    };
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Daily Profit Analysis
          </DialogTitle>
        </DialogHeader>

        {/* Date Selector */}
        <div className="flex items-center gap-4 mb-6">
          <CalendarDays className="h-4 w-4" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="px-3 py-2 border rounded-md"
          />
          <Badge variant="outline">
            {new Date(selectedDate).toLocaleDateString('en-US', { 
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Badge>
        </div>

        {/* Daily Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {fmtCurrency(dailyRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                {dailySales.length} sales
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${dailyProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                {fmtCurrency(dailyProfit)}
              </div>
              <p className="text-xs text-muted-foreground">
                After all costs
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Units Sold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-info">
                {totalUnitsSold}
              </div>
              <p className="text-xs text-muted-foreground">
                Total sachets/units
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {productsSoldToday.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Different products
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Methods Summary */}
        {Object.keys(paymentMethodBreakdown).length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Payment Methods Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(paymentMethodBreakdown).map(([method, data]) => {
                  const methodLower = method.toLowerCase();
                  let cardClass = "bg-gradient-to-br from-gray-500/10 to-gray-500/5 border-gray-500/20";
                  
                  if (methodLower.includes('pesapal')) {
                    cardClass = "bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20";
                  } else if (methodLower.includes('mtn') || methodLower.includes('mobile money')) {
                    cardClass = "bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20";
                  } else if (methodLower.includes('airtel')) {
                    cardClass = "bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20";
                  } else if (methodLower.includes('card') || methodLower.includes('credit') || methodLower.includes('debit')) {
                    cardClass = "bg-gradient-to-br from-blue-600/10 to-blue-600/5 border-blue-600/20";
                  } else if (methodLower.includes('bank')) {
                    cardClass = "bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20";
                  } else if (methodLower.includes('cash')) {
                    cardClass = "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20";
                  }
                  
                  return (
                    <div key={method} className={`rounded-md border p-3 ${cardClass}`}>
                      <div className="font-medium text-sm">{method}</div>
                      <div className="text-lg font-bold">{data.count} sales</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtCurrency(data.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Sold Today */}
        {productsSoldToday.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Products Sold Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {productsSoldToday.map((product) => (
                  <div key={product.productName} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{product.productName}</h4>
                      <p className="text-sm text-muted-foreground">
                        {fmtCurrency(product.unitPrice)} per unit
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{product.quantity} units</div>
                      <div className="text-sm text-success">
                        {fmtCurrency(product.revenue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sales History (Last 7 Days) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">7-Day Sales History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {salesHistory.map((day) => (
                <div 
                  key={day.date} 
                  className={`flex items-center justify-between p-3 border rounded-lg ${
                    day.date === selectedDate ? 'bg-primary/10 border-primary/30' : ''
                  }`}
                >
                  <div>
                    <h4 className="font-medium">
                      {new Date(day.date).toLocaleDateString('en-US', { 
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {day.salesCount} sales • {day.unitsSold} units
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {fmtCurrency(day.revenue)}
                    </div>
                    <div className={`text-sm ${day.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      Profit: {fmtCurrency(day.profit)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* No Sales Message */}
        {dailySales.length === 0 && (
          <Card className="text-center py-8">
            <CardContent>
              <p className="text-muted-foreground">No sales recorded for this date.</p>
              <Button variant="outline" className="mt-4" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
                View Today's Sales
              </Button>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DailyProfitModal;