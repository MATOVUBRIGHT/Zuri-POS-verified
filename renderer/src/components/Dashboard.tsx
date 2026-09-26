import { useState, useMemo } from "react";
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Package,
    ShoppingCart,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Wallet,
    Activity,
    Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { StockItem, SaleItem, ExpenseItem } from "@/types";
import { endOfLocalDay, parseAnyDateToLocalDate, saleDateToLocalKey, startOfLocalDay, toLocalDateKey } from "@/lib/date";
import { useToast } from "@/hooks/use-toast";

interface DashboardProps {
    stockData: StockItem[];
    salesData: SaleItem[];
    expensesData: ExpenseItem[];
    userRole?: string;
    financialData: {
        cashOnHand: number;
        stockValue: number;
        dailySales: number;
        weeklySales: number;
        monthlySales: number;
        totalPurchaseCost: number;
        totalRevenue: number;
        totalProfit: number;
        availableCash: number;
    };
    onUpdateCash: (amount: number) => void;
    onUpdateSale: (id: string, updates: Partial<SaleItem>) => void;
    onDeleteSale: (id: string) => void;
    onPageChange: (page: string, params?: any) => void;
    onOpenCashManagement?: () => void;
}

const Dashboard = ({
    stockData,
    salesData,
    expensesData,
    userRole = "owner",
    financialData,
    onPageChange,
    onOpenCashManagement
}: DashboardProps) => {
    const [timeRange, setTimeRange] = useState("week");
    const [mostSoldTimeRange, setMostSoldTimeRange] = useState("today");
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
    const [showRecentSalesDialog, setShowRecentSalesDialog] = useState(false);
    const { toast } = useToast();

    // Calculate low stock items with enterprise thresholds
    const stockAlerts = useMemo(() => {
        const critical = stockData.filter(item => {
            const quantity = item.quantity || 0;
            const threshold = item.min_stock_level || 5;
            return quantity < threshold;
        });

        const low = stockData.filter(item => {
            const quantity = item.quantity || 0;
            const minLevel = item.min_stock_level || 5;
            const threshold = minLevel * 1.5;
            return quantity >= minLevel && quantity < threshold;
        });

        return { critical, low, all: [...critical, ...low] };
    }, [stockData]);

    const lowStockItems = stockAlerts.all;

    // Calculate recent sales
    const recentSales = useMemo(() => {
        // `salesData` is already ordered by most-recent first (see fetch order in the app).
        // Include all payment methods (cash + non-cash + credit) in the recent list.
        return salesData.slice(0, 5);
    }, [salesData]);

    const mostSoldProducts = useMemo(() => {
        const now = new Date();
        const todayStart = startOfLocalDay(now);
        const todayEnd = endOfLocalDay(now);

        const filteredSales = salesData.filter(sale => {
            const saleDate = sale.dateOfSale ? parseAnyDateToLocalDate(sale.dateOfSale) : null;
            if (!saleDate) return false;
            switch (mostSoldTimeRange) {
                case 'today':
                    return saleDate >= todayStart && saleDate <= todayEnd;
                case 'week':
                    const oneWeekAgo = new Date(todayStart);
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 6); // last 7 local days inclusive
                    return saleDate >= oneWeekAgo && saleDate <= todayEnd;
                case 'month':
                    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    return saleDate >= firstDayOfMonth && saleDate <= todayEnd;
                case 'custom':
                    if (dateRange.from) {
                        const from = startOfLocalDay(dateRange.from);
                        const to = dateRange.to ? endOfLocalDay(dateRange.to) : todayEnd;
                        return saleDate >= from && saleDate <= to;
                    }
                    return true; // If custom but no date, show all, or handle differently?
                case 'all':
                    return true;
                default:
                    return true;
            }
        });

        const productMap: Record<string, { name: string; quantity: number, totalAmount: number }> = {};

        filteredSales.forEach(sale => {
            sale.products?.forEach((product) => {
                const name = product.productName;
                if (!name) return;

                if (productMap[name]) {
                    productMap[name].quantity += product.quantity || 0;
                    productMap[name].totalAmount += (product.quantity || 0) * (product.sellingPrice || product.price || 0);
                } else {
                    productMap[name] = {
                        name,
                        quantity: product.quantity || 0,
                        totalAmount: (product.quantity || 0) * (product.sellingPrice || product.price || 0),
                    };
                }
            });
        });

        return Object.values(productMap)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);
    }, [salesData, mostSoldTimeRange, dateRange]);

    // Prepare chart data
    const chartData = useMemo(() => {
        const salesByDate: Record<string, number> = {};
        const today = startOfLocalDay(new Date());
        const todayKey = toLocalDateKey(today);
        const last7Keys = [...Array(7)].map((_, idx) => {
            const d = new Date(today);
            d.setDate(d.getDate() - (6 - idx));
            return toLocalDateKey(d);
        });

        for (const sale of salesData) {
            const key = saleDateToLocalKey(sale.dateOfSale);
            if (!key) continue;
            salesByDate[key] = (salesByDate[key] || 0) + (sale.totalAmount || 0);
        }

        const keyToDate = (key: string) => {
            const [y, m, d] = key.split('-').map(Number);
            return new Date(y, (m || 1) - 1, d || 1);
        };

        return last7Keys.map(key => ({
            date: keyToDate(key).toLocaleDateString('en-US', { weekday: 'short' }),
            sales: salesByDate[key] || 0,
            isToday: key === todayKey
        }));
    }, [salesData]);

    // Monthly sales prediction based on recent trend
    const monthlyPrediction = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Get sales grouped by month for last 3 months
        const monthlySales: Record<string, number> = {};
        salesData.forEach(sale => {
            const saleDate = sale.dateOfSale ? parseAnyDateToLocalDate(sale.dateOfSale) : null;
            if (!saleDate) return;
            const key = `${saleDate.getFullYear()}-${saleDate.getMonth()}`;
            monthlySales[key] = (monthlySales[key] || 0) + (sale.totalAmount || 0);
        });

        const months: { key: string; label: string; total: number }[] = [];
        for (let i = 3; i >= 1; i--) {
            const d = new Date(currentYear, currentMonth - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            months.push({ key, label, total: monthlySales[key] || 0 });
        }

        // Current month progress
        const currentKey = `${currentYear}-${currentMonth}`;
        const currentMonthSales = monthlySales[currentKey] || 0;
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const projectedCurrentMonth = dayOfMonth > 0 ? (currentMonthSales / dayOfMonth) * daysInMonth : 0;

        // Simple linear trend from past months
        const pastTotals = months.map(m => m.total).filter(t => t > 0);
        let predicted = projectedCurrentMonth;
        if (pastTotals.length >= 2) {
            const avgGrowth = pastTotals.reduce((sum, val, idx) => {
                if (idx === 0) return 0;
                return sum + (val - pastTotals[idx - 1]);
            }, 0) / (pastTotals.length - 1);
            predicted = Math.max(0, (pastTotals[pastTotals.length - 1] || 0) + avgGrowth);
        } else if (pastTotals.length === 1) {
            predicted = pastTotals[0];
        }

        // Trend direction
        const lastMonth = months[months.length - 1]?.total || 0;
        const trendPercent = lastMonth > 0 ? ((predicted - lastMonth) / lastMonth) * 100 : 0;

        return {
            months,
            currentMonthSales,
            projectedCurrentMonth: Math.round(projectedCurrentMonth),
            predictedNextMonth: Math.round(predicted),
            trendPercent: Math.round(trendPercent),
            isUpTrend: trendPercent >= 0,
            dayOfMonth,
            daysInMonth,
            nextMonthLabel: new Date(currentYear, currentMonth + 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        };
    }, [salesData]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground">
                        Overview of your store's performance
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => onPageChange('sales-entry')} className="bg-primary hover:bg-primary/90">
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        New Sale
                    </Button>
                    <Button variant="outline" onClick={() => onPageChange('stock-entry')}>
                        <Package className="mr-2 h-4 w-4" />
                        Add Stock
                    </Button>
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card
                    className="metric-card metric-card-sales rounded-2xl"
                    onClick={() => onPageChange('sales-entry')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white/80">Daily Sales</CardTitle>
                        <DollarSign className="h-4 w-4 text-white/70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">UGX {financialData.dailySales.toLocaleString()}</div>
                        <p className="text-xs text-white/70 flex items-center mt-1">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Today's revenue - Click to view
                        </p>
                    </CardContent>
                </Card>

                <Card
                    className="metric-card metric-card-cash rounded-2xl"
                    onClick={() => onOpenCashManagement ? onOpenCashManagement() : onPageChange('reports')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white/80">Cash on Hand</CardTitle>
                        <Wallet className="h-4 w-4 text-white/70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">UGX {financialData.availableCash.toLocaleString()}</div>
                        <p className="text-xs text-white/70 flex items-center mt-1">
                            <Activity className="h-3 w-3 mr-1" />
                            Cash flow - Click to view
                        </p>
                    </CardContent>
                </Card>

                <Card
                    className="metric-card metric-card-stock rounded-2xl"
                    onClick={() => onPageChange('inventory')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white/80">Stock Value</CardTitle>
                        <Package className="h-4 w-4 text-white/70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">UGX {financialData.stockValue.toLocaleString()}</div>
                        <p className="text-xs text-white/70 flex items-center mt-1">
                            {stockData.length} items - Click to view
                        </p>
                    </CardContent>
                </Card>

                <Card
                    className="metric-card metric-card-profit rounded-2xl"
                    onClick={() => onPageChange('reports')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white/80">Net Profit</CardTitle>
                        <TrendingUp className="h-4 w-4 text-white/70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">UGX {financialData.totalProfit.toLocaleString()}</div>
                        <p className="text-xs text-white/70 flex items-center mt-1">
                            Profit report - Click to view
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Sales Chart */}
                <Card className="col-span-4 rounded-2xl overflow-hidden border-none shadow-sm">
                    <CardHeader className="bg-primary/10 py-3">
                        <CardTitle>Sales Overview</CardTitle>
                        <CardDescription>
                            Weekly sales performance
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={chartData}
                                    margin={{ top: 16, right: 12, bottom: 0, left: 22 }}
                                >
                                    <defs>
                                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={({ x, y, payload }) => {
                                            const entry = chartData.find((d) => d.date === payload.value);
                                            const isToday = !!entry?.isToday;
                                            return (
                                                <g transform={`translate(${x},${y})`}>
                                                    <text
                                                        x={0}
                                                        y={0}
                                                        dy={16}
                                                        textAnchor="middle"
                                                        fill={isToday ? 'hsl(var(--primary))' : '#888888'}
                                                        fontWeight={isToday ? 800 : 500}
                                                        fontSize={isToday ? 13 : 12}
                                                    >
                                                        {payload.value}
                                                    </text>
                                                </g>
                                            );
                                        }}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        width={72}
                                        tickFormatter={(value) => `UGX ${value >= 1000 ? `${value / 1000}k` : value}`}
                                    />
                                    <Tooltip
                                        formatter={(value: number) => [`UGX ${value.toLocaleString()}`, 'Sales']}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="sales"
                                        stroke="#3b82f6"
                                        fillOpacity={1}
                                        fill="url(#colorSales)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>

                    {/* Monthly Sales Prediction */}
                    <div className="px-6 py-4 bg-muted/30 rounded-b-xl">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold">Next Month Prediction</span>
                                <Badge variant="outline" className="text-xs">{monthlyPrediction.nextMonthLabel}</Badge>
                            </div>
                            <div className={`flex items-center gap-1 text-sm font-bold ${monthlyPrediction.isUpTrend ? 'text-emerald-600' : 'text-destructive'}`}>
                                {monthlyPrediction.isUpTrend ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                {monthlyPrediction.trendPercent > 0 ? '+' : ''}{monthlyPrediction.trendPercent}%
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                            {monthlyPrediction.months.map((m) => (
                                <div key={m.key} className="rounded-lg bg-background p-2">
                                    <p className="text-[10px] text-muted-foreground">{m.label}</p>
                                    <p className="text-sm font-bold">UGX {m.total.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 rounded-lg bg-primary/10 p-3 text-center">
                                <p className="text-[10px] text-muted-foreground">This Month (Day {monthlyPrediction.dayOfMonth}/{monthlyPrediction.daysInMonth})</p>
                                <p className="text-sm font-bold text-primary">UGX {monthlyPrediction.currentMonthSales.toLocaleString()}</p>
                                <p className="text-[10px] text-muted-foreground">Projected: UGX {monthlyPrediction.projectedCurrentMonth.toLocaleString()}</p>
                            </div>
                            <div className="flex-1 rounded-lg bg-accent/20 p-3 text-center">
                                <p className="text-[10px] text-muted-foreground">Predicted Next Month</p>
                                <p className="text-lg font-extrabold text-accent-foreground">UGX {monthlyPrediction.predictedNextMonth.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Low Stock Alerts & Recent Sales */}
                <div className="col-span-3 space-y-4">
                    {/* New Stock Added (Last 7 Days) */}
                    <Card className="rounded-2xl overflow-hidden border-none shadow-sm">
                        <CardHeader className="pb-2 bg-blue-500/10 py-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-medium flex items-center gap-2">
                                    <Package className="h-4 w-4 text-blue-500" />
                                    New Stock Added
                                </CardTitle>
                                <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">
                                    Last 7 days
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(() => {
                                const sevenDaysAgo = new Date();
                                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                                const newStock = stockData.filter(item => {
                                    const entryDate = item.dateOfEntry ? new Date(item.dateOfEntry) : null;
                                    return entryDate && entryDate >= sevenDaysAgo;
                                }).slice(0, 5);

                                return newStock.length === 0 ? (
                                    <div className="text-center py-6 text-muted-foreground text-sm">
                                        <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                        No new stock added recently
                                    </div>
                                ) : (
                                    <ScrollArea className="h-[120px]">
                                        <div className="space-y-2">
                                            {newStock.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between p-2 rounded-md bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-sm">{item.productName}</p>
                                                        <div className="flex gap-2 text-xs text-muted-foreground">
                                                            <span>{item.category}</span>
                                                            <span>•</span>
                                                            <span>{item.quantity} units</span>
                                                            {item.dateOfEntry && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>{new Date(item.dateOfEntry).toLocaleDateString()}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className="text-xs">
                                                        UGX {(item.totalValue || 0).toLocaleString()}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                );
                            })()}
                        </CardContent>
                    </Card>

                    {/* Low Stock */}
                    <Card className="rounded-2xl overflow-hidden border-none shadow-sm">
                        <CardHeader className="pb-2 bg-warning/10 py-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-medium flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-warning" />
                                    Low Stock Alerts
                                </CardTitle>

                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-warning/10 text-warning hover:bg-warning/20">
                                        {lowStockItems.length} items
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => onPageChange('inventory')}
                                    >
                                        View all
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {lowStockItems.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    Inventory looks healthy
                                </div>
                            ) : (
                                <ScrollArea className="h-[150px]">
                                    <div className="space-y-2">
                                        {lowStockItems.slice(0, 50).map((item) => (
                                            <div key={item.id} className="flex items-center justify-between p-2 rounded-md bg-warning/5">
                                                <div>
                                                    <p className="font-medium text-sm">{item.productName}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Qty: <span className="font-bold text-warning">{item.quantity}</span> units
                                                    </p>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs"
                                                    onClick={() => {
                                                        const pkg = (item.packaging_type || item.packagingType || '').toString();
                                                        if (pkg === 'individual') {
                                                            toast({ title: 'Cannot restock', description: 'Item is marked individual — open product details to edit.', variant: 'destructive' });
                                                            return;
                                                        }

                                                        onPageChange('stock-entry', { 
                                                            autoFill: true, 
                                                            productName: item.productName, 
                                                            category: item.category, 
                                                            costPrice: item.costPerUnit || item.cost_per_unit, 
                                                            sellingPrice: item.retailPrice || item.retail_price,
                                                            image: item.productImage,
                                                            barcode: item.barcode
                                                        });
                                                    }}
                                                >
                                                    Restock
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            )}
                        </CardContent>
                    </Card>

                    {/* Recent Sales Mini List */}
                    <Card className="flex-1 rounded-2xl overflow-hidden border-none shadow-sm">
                        <CardHeader className="pb-2 bg-success/10 py-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-medium flex items-center gap-2">
                                    <ShoppingCart className="h-4 w-4 text-success" />
                                    Recent Sales
                                </CardTitle>
                                <Dialog open={showRecentSalesDialog} onOpenChange={setShowRecentSalesDialog}>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                            <Eye className="h-3 w-3" />
                                            View Details
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl max-h-[80vh]">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2">
                                                <ShoppingCart className="h-5 w-5 text-success" />
                                                Recent Sales - Full Details
                                            </DialogTitle>
                                        </DialogHeader>
                                        <ScrollArea className="h-[600px] pr-4">
                                            <div className="space-y-3">
                                                {salesData.slice(0, 20).map((sale) => (
                                                    <Card key={sale.id} className="shadow-sm">
                                                        <CardContent className="pt-4">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-success font-bold">
                                                                        {sale.customerName ? sale.customerName[0] : 'C'}
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-semibold">{sale.customerName || "Cash Customer"}</p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {saleDateToLocalKey(sale.dateOfSale) || sale.dateOfSale}
                                                                        </p>
                                                                        {sale.paidInCash && (sale.paymentDetails?.mobileMoneyNumber || sale.paymentDetails?.tillNumber || sale.paymentDetails?.paybillNumber || sale.paymentDetails?.accountNumber) && (
                                                                            <p className="text-[11px] text-muted-foreground">
                                                                                To {sale.paymentDetails?.mobileMoneyNumber || sale.paymentDetails?.tillNumber || sale.paymentDetails?.paybillNumber || sale.paymentDetails?.accountNumber}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-xl font-bold text-success">UGX {sale.totalAmount.toLocaleString()}</p>
                                                                    <Badge variant={sale.paidInCash ? "default" : "secondary"} className={sale.paidInCash ? "bg-success" : ""}>
                                                                        {sale.paidInCash ? (sale.paymentDetails?.paymentMethod || "Cash") : "Credit"}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1 pl-13">
                                                                {sale.products?.map((product, idx) => (
                                                                    <div key={`${sale.id}-${product.productName}-${idx}`} className="flex justify-between text-sm pt-1">
                                                                        <span className="text-muted-foreground">{product.quantity}x {product.productName}</span>
                                                                        <span className="font-medium">UGX {((product.quantity || 0) * (product.sellingPrice || 0)).toLocaleString()}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                        <div className="flex justify-end gap-2 pt-4">
                                            <Button variant="outline" onClick={() => setShowRecentSalesDialog(false)}>
                                                Close
                                            </Button>
                                            <Button onClick={() => {
                                                setShowRecentSalesDialog(false);
                                                onPageChange('sales-entry');
                                            }}>
                                                View All Sales
                                            </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {recentSales.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    No recent sales
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {recentSales.map((sale) => (
                                        <div key={sale.id} className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors" onClick={() => setShowRecentSalesDialog(true)}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success font-bold text-xs">
                                                    {sale.customerName ? sale.customerName[0] : 'C'}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{sale.customerName || "Cash Customer"}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {saleDateToLocalKey(sale.dateOfSale) || sale.dateOfSale}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-sm">UGX {sale.totalAmount.toLocaleString()}</p>
                                                <p className={`text-[10px] ${sale.paidInCash ? 'text-success' : 'text-warning'}`}>
                                                    {sale.paidInCash ? (sale.paymentDetails?.paymentMethod || "Cash") : "Credit"}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Most Sold Products */}
            <Card>
                <CardHeader className="bg-indigo-500/10 py-3">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                        <div>
                            <CardTitle>Most Sold Products</CardTitle>
                            <CardDescription>Top selling products based on quantity sold.</CardDescription>
                        </div>
                        <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
                            <Button size="sm" variant={mostSoldTimeRange === 'today' ? 'default' : 'ghost'} onClick={() => { setMostSoldTimeRange('today'); setDateRange({ from: undefined, to: undefined }); }}>Today</Button>
                            <Button size="sm" variant={mostSoldTimeRange === 'week' ? 'default' : 'ghost'} onClick={() => { setMostSoldTimeRange('week'); setDateRange({ from: undefined, to: undefined }); }}>This Week</Button>
                            <Button size="sm" variant={mostSoldTimeRange === 'month' ? 'default' : 'ghost'} onClick={() => { setMostSoldTimeRange('month'); setDateRange({ from: undefined, to: undefined }); }}>This Month</Button>
                            <Button size="sm" variant={mostSoldTimeRange === 'all' ? 'default' : 'ghost'} onClick={() => { setMostSoldTimeRange('all'); setDateRange({ from: undefined, to: undefined }); }}>All Time</Button>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button size="sm" variant={mostSoldTimeRange === 'custom' ? 'default' : 'ghost'}>
                                        <Calendar className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <CalendarComponent
                                        mode="range"
                                        selected={dateRange}
                                        onSelect={(range) => {
                                            setDateRange(range ? { from: range.from, to: range.to } : { from: undefined, to: undefined });
                                            setMostSoldTimeRange('custom');
                                        }}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {mostSoldProducts.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                            No sales data for this period.
                        </div>
                    ) : (
                        <ScrollArea className="h-[200px] pr-4">
                            <div className="space-y-4">
                                {mostSoldProducts.map((product) => (
                                    <div key={product.name} className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                                {mostSoldProducts.indexOf(product) + 1}
                                            </div>
                                            <div>
                                                <p className="font-medium">{product.name}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    <span className="font-bold text-primary">{product.quantity}</span> units sold
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-lg text-success">UGX {product.totalAmount.toLocaleString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Dashboard;
