import { useState, useMemo } from "react";
import { fmtCurrency } from "@/lib/currency";
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
    Eye,
    Maximize2,
    BarChart2,
    TrendingUp as LineIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { StockItem, SaleItem, ExpenseItem } from "@/types";
import { endOfLocalDay, parseAnyDateToLocalDate, saleDateToLocalKey, startOfLocalDay, toLocalDateKey } from "@/lib/date";

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
    const [chartPeriod, setChartPeriod] = useState<"week" | "month" | "year">("year");
    const [chartType, setChartType] = useState<"bar" | "line">("bar");
    const [chartExpanded, setChartExpanded] = useState(false);
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

    // Single pass: build salesByDate and salesByMonth maps for all downstream memos
    const salesAggregates = useMemo(() => {
        const byDate: Record<string, number> = {};
        const byMonth: Record<string, number> = {};
        for (const sale of salesData) {
            const amount = sale.totalAmount || 0;
            const key = saleDateToLocalKey(sale.dateOfSale);
            if (key) byDate[key] = (byDate[key] || 0) + amount;
            const d = sale.dateOfSale ? parseAnyDateToLocalDate(sale.dateOfSale) : null;
            if (d) {
                const mk = `${d.getFullYear()}-${d.getMonth()}`;
                byMonth[mk] = (byMonth[mk] || 0) + amount;
            }
        }
        return { byDate, byMonth };
    }, [salesData]);

    // Prepare chart data
    const chartData = useMemo(() => {
        const { byDate: salesByDate } = salesAggregates;
        const today = startOfLocalDay(new Date());
        const todayKey = toLocalDateKey(today);

        const keyToDate = (key: string) => {
            const [y, m, d] = key.split('-').map(Number);
            return new Date(y, (m || 1) - 1, d || 1);
        };

        if (chartPeriod === "week") {
            const last7Keys = [...Array(7)].map((_, idx) => {
                const d = new Date(today);
                d.setDate(d.getDate() - (6 - idx));
                return toLocalDateKey(d);
            });
            return last7Keys.map(key => ({
                date: keyToDate(key).toLocaleDateString('en-US', { weekday: 'short' }),
                sales: salesByDate[key] || 0,
                isToday: key === todayKey
            }));
        }

        if (chartPeriod === "month") {
            const weeks: { label: string; sales: number }[] = [];
            for (let w = 3; w >= 0; w--) {
                const weekStart = new Date(today);
                weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
                const weekEnd = new Date(today);
                weekEnd.setDate(weekEnd.getDate() - w * 7);
                let total = 0;
                for (const [key, val] of Object.entries(salesByDate)) {
                    const d = keyToDate(key);
                    if (d >= weekStart && d < weekEnd) total += val;
                }
                weeks.push({ label: `Wk ${4 - w}`, sales: total });
            }
            return weeks.map(w => ({ date: w.label, sales: w.sales, isToday: false }));
        }

        const months: { label: string; sales: number }[] = [];
        for (let m = 11; m >= 0; m--) {
            const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const total = Object.entries(salesByDate)
                .filter(([k]) => k.startsWith(key))
                .reduce((s, [, v]) => s + v, 0);
            months.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), sales: total });
        }
        return months.map(m => ({ date: m.label, sales: m.sales, isToday: false }));
    }, [salesAggregates, chartPeriod]);

    // Monthly sales prediction based on recent trend
    const monthlyPrediction = useMemo(() => {
        const { byMonth: monthlySales } = salesAggregates;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const months: { key: string; label: string; total: number }[] = [];
        for (let i = 6; i >= 1; i--) {
            const d = new Date(currentYear, currentMonth - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            months.push({ key, label, total: monthlySales[key] || 0 });
        }

        const currentKey = `${currentYear}-${currentMonth}`;
        const currentMonthSales = monthlySales[currentKey] || 0;
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const projectedCurrentMonth = dayOfMonth > 0 ? Math.round((currentMonthSales / dayOfMonth) * daysInMonth) : 0;

        const pastTotals = months.map(m => m.total);
        const nonZero = pastTotals.filter(t => t > 0);
        let predicted = projectedCurrentMonth;
        if (nonZero.length >= 2) {
            const weights = pastTotals.map((_, i) => i + 1);
            const weightedSum = pastTotals.reduce((s, v, i) => s + v * weights[i], 0);
            const totalWeight = weights.reduce((s, w) => s + w, 0);
            const weightedAvg = weightedSum / totalWeight;
            const last = nonZero[nonZero.length - 1];
            const prev = nonZero[nonZero.length - 2];
            const growthRate = prev > 0 ? (last - prev) / prev : 0;
            const growthProjection = last * (1 + growthRate);
            predicted = Math.round(weightedAvg * 0.6 + growthProjection * 0.4);
        } else if (nonZero.length === 1) {
            predicted = nonZero[0];
        }

        const lastMonth = months[months.length - 1]?.total || 0;
        const trendPercent = lastMonth > 0 ? ((predicted - lastMonth) / lastMonth) * 100 : 0;

        const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'short' });
        const historyAverage = pastTotals.length > 0 ? Math.round(pastTotals.reduce((sum, total) => sum + total, 0) / pastTotals.length) : 0;
        const confidence = Math.max(45, Math.min(96, Math.round(((dayOfMonth / Math.max(daysInMonth, 1)) * 35) + (nonZero.length * 8))));
        const chartData = [
            ...months.map((m) => ({ label: m.label.split(" ")[0], sales: m.total, stage: "history" })),
            { label: `${currentMonthLabel}*`, sales: projectedCurrentMonth, stage: "projected" },
            { label: "Next", sales: Math.max(0, predicted), stage: "forecast" },
        ];

        return {
            months,
            currentMonthSales,
            projectedCurrentMonth,
            predictedNextMonth: Math.max(0, predicted),
            trendPercent: Math.round(trendPercent),
            isUpTrend: trendPercent >= 0,
            historyAverage,
            confidence,
            chartData,
            dayOfMonth,
            daysInMonth,
            nextMonthLabel: new Date(currentYear, currentMonth + 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        };
    }, [salesAggregates]);

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
                        <div className="text-2xl font-bold">{fmtCurrency(financialData.dailySales)}</div>
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
                        <div className="text-2xl font-bold">{fmtCurrency(financialData.availableCash)}</div>
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
                        <div className="text-2xl font-bold">{fmtCurrency(financialData.stockValue)}</div>
                        <p className="text-xs text-white/70 flex items-center mt-1">
                            {stockData.length} items - Click to view
                        </p>
                    </CardContent>
                </Card>

                <Card
                    className="metric-card metric-card-profit rounded-2xl"
                    onClick={() => {
                        sessionStorage.setItem('highlightSection', 'profit');
                        sessionStorage.setItem('profitPeriod', 'today');
                        onPageChange('reports');
                    }}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white/80">Net Profit</CardTitle>
                        <TrendingUp className="h-4 w-4 text-white/70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{fmtCurrency(financialData.totalProfit)}</div>
                        <p className="text-xs text-white/70 flex items-center mt-1">
                            Profit report - Click to view
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Sales Chart */}
                <Card className="col-span-4 rounded-2xl border-none shadow-sm flex flex-col min-w-0">
                    <CardHeader className="bg-primary/10 py-3 shrink-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                                <CardTitle className="text-lg">Sales Overview</CardTitle>
                                <CardDescription className="text-sm mt-0.5">
                                    {chartPeriod === "week" ? "Last 7 days" : chartPeriod === "month" ? "Last 4 weeks" : "Last 12 months"}
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1 bg-background/60 rounded-lg p-1">
                                    {(["week", "month", "year"] as const).map(p => (
                                        <button key={p} onClick={() => setChartPeriod(p)}
                                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${chartPeriod === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                            {p.charAt(0).toUpperCase() + p.slice(1)}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-1 bg-background/60 rounded-lg p-1">
                                    <button onClick={() => setChartType("bar")} title="Bar chart"
                                        className={`p-1.5 rounded-md transition-colors ${chartType === "bar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                        <BarChart2 className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => setChartType("line")} title="Line chart"
                                        className={`p-1.5 rounded-md transition-colors ${chartType === "line" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                        <TrendingUp className="h-4 w-4" />
                                    </button>
                                </div>
                                <button onClick={() => setChartExpanded(true)} title="Expand"
                                    className="p-1.5 rounded-md bg-background/60 text-muted-foreground hover:text-foreground transition-colors">
                                    <Maximize2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-4 min-h-0">
                        <div className="h-full min-h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === "bar" ? (
                                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                                        <XAxis dataKey="date" stroke="#888" fontSize={13} tickLine={false} axisLine={false}
                                            tick={({ x, y, payload }) => {
                                                const isToday = !!chartData.find(d => d.date === payload.value)?.isToday;
                                                return <g transform={`translate(${x},${y})`}><text x={0} y={0} dy={16} textAnchor="middle" fill={isToday ? 'hsl(var(--primary))' : '#888'} fontWeight={isToday ? 800 : 500} fontSize={isToday ? 14 : 13}>{payload.value}</text></g>;
                                            }} />
                                        <YAxis stroke="#888" fontSize={13} tickLine={false} axisLine={false} width={80}
                                            tickFormatter={v => v.toLocaleString()} />
                                        <Tooltip formatter={(v: number) => [`${fmtCurrency(v)}`, 'Sales']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0/0.1)', fontSize: 13 }}
                                            cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
                                        <Bar dataKey="sales" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={48} />
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                        <defs>
                                            <linearGradient id="colorSalesLine" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                        <XAxis dataKey="date" stroke="#888" fontSize={13} tickLine={false} axisLine={false}
                                            tick={({ x, y, payload }) => {
                                                const isToday = !!chartData.find(d => d.date === payload.value)?.isToday;
                                                return <g transform={`translate(${x},${y})`}><text x={0} y={0} dy={16} textAnchor="middle" fill={isToday ? 'hsl(var(--primary))' : '#888'} fontWeight={isToday ? 800 : 500} fontSize={isToday ? 14 : 13}>{payload.value}</text></g>;
                                            }} />
                                        <YAxis stroke="#888" fontSize={13} tickLine={false} axisLine={false} width={80}
                                            tickFormatter={v => v.toLocaleString()} />
                                        <Tooltip formatter={(v: number) => [`${fmtCurrency(v)}`, 'Sales']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0/0.1)', fontSize: 13 }} />
                                        <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                ) as any}
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Expanded chart dialog */}
                <Dialog open={chartExpanded} onOpenChange={setChartExpanded}>
                    <DialogContent className="max-w-5xl w-[95vw]">
                        <DialogHeader>
                            <DialogTitle>Sales Overview — {chartPeriod === "week" ? "Last 7 days" : chartPeriod === "month" ? "Last 4 weeks" : "Last 12 months"}</DialogTitle>
                        </DialogHeader>
                        <div className="h-[500px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === "bar" ? (
                                    <BarChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                                        <XAxis dataKey="date" stroke="#888" fontSize={14} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888" fontSize={14} tickLine={false} axisLine={false} width={90}
                                            tickFormatter={v => v.toLocaleString()} />
                                        <Tooltip formatter={(v: number) => [`${fmtCurrency(v)}`, 'Sales']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0/0.1)', fontSize: 14 }}
                                            cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
                                        <Bar dataKey="sales" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={56} />
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                        <XAxis dataKey="date" stroke="#888" fontSize={14} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888" fontSize={14} tickLine={false} axisLine={false} width={90}
                                            tickFormatter={v => v.toLocaleString()} />
                                        <Tooltip formatter={(v: number) => [`${fmtCurrency(v)}`, 'Sales']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0/0.1)', fontSize: 14 }} />
                                        <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5, fill: '#3b82f6' }} activeDot={{ r: 7 }} />
                                    </LineChart>
                                ) as any}
                            </ResponsiveContainer>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Payment Methods — right of sales chart, same height */}
                {(() => {
                    const methodTotals: Record<string, number> = {};
                    salesData.forEach(sale => {
                        const method = (sale as any).paymentDetails?.paymentMethod
                            || (sale.paidInCash ? "Cash" : "Credit/Other");
                        methodTotals[method] = (methodTotals[method] || 0) + (sale.totalAmount || 0);
                    });
                    const pieData = Object.entries(methodTotals)
                        .map(([name, value]) => ({ name, value }))
                        .sort((a, b) => b.value - a.value);
                    const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316"];
                    const total = pieData.reduce((s, d) => s + d.value, 0);
                    if (pieData.length === 0) return <div className="col-span-3" />;
                    return (
                        <Card className="col-span-3 rounded-2xl overflow-hidden border-none shadow-sm flex flex-col">
                            <CardHeader className="bg-primary/10 py-3 shrink-0">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-primary" />
                                    Payment Methods
                                </CardTitle>
                                <CardDescription className="text-sm">Revenue by payment type</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col justify-center pt-4 pb-4 gap-4">
                                <div className="flex justify-center">
                                    <svg width="150" height="150" viewBox="0 0 150 150">
                                        {(() => {
                                            let offset = 0;
                                            const r = 55, cx = 75, cy = 75;
                                            const circumference = 2 * Math.PI * r;
                                            return pieData.map((d, i) => {
                                                const pct = d.value / total;
                                                const dash = pct * circumference;
                                                const gap = circumference - dash;
                                                const rotation = offset * 360 - 90;
                                                offset += pct;
                                                return (
                                                    <circle key={d.name} cx={cx} cy={cy} r={r}
                                                        fill="none" stroke={COLORS[i % COLORS.length]}
                                                        strokeWidth="26"
                                                        strokeDasharray={`${dash} ${gap}`}
                                                        strokeDashoffset={0}
                                                        transform={`rotate(${rotation} ${cx} ${cy})`}
                                                    />
                                                );
                                            });
                                        })()}
                                        <circle cx="75" cy="75" r="42" fill="white" />
                                        <text x="75" y="71" textAnchor="middle" fontSize="11" fill="#6b7280">Total</text>
                                        <text x="75" y="86" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#111827">
                                            {fmtCurrency(total)}
                                        </text>
                                    </svg>
                                </div>
                                <div className="space-y-2.5 px-2">
                                    {pieData.map((d, i) => (
                                        <div key={d.name} className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                                <span className="text-sm truncate">{d.name}</span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-sm font-bold">{Math.round((d.value/total)*100)}%</span>
                                                <span className="text-xs text-muted-foreground ml-1">{fmtCurrency(d.value)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })()}
            </div>

            {/* Monthly Sales Prediction — full width separate card */}
            <Card className="rounded-2xl overflow-hidden border-none shadow-sm bg-gradient-to-r from-primary/5 via-background to-emerald-50/50">
                <CardContent className="py-5 px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-primary/10">
                                <LineIcon className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-base font-semibold">Monthly Sales Prediction</span>
                            <Badge variant="outline" className="text-xs">{monthlyPrediction.nextMonthLabel}</Badge>
                        </div>
                        <div className={`flex items-center gap-1 text-sm font-semibold ${monthlyPrediction.isUpTrend ? 'text-emerald-700' : 'text-destructive'}`}>
                            {monthlyPrediction.isUpTrend ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                            {monthlyPrediction.trendPercent > 0 ? '+' : ''}{monthlyPrediction.trendPercent}% vs last month
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-5">
                        <div className="lg:col-span-3 rounded-xl border bg-background/80 p-3">
                            <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={monthlyPrediction.chartData} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="monthlyForecastFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                                        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                                        <YAxis tickLine={false} axisLine={false} width={82} fontSize={11} tickFormatter={(v) => v.toLocaleString()} />
                                        <Tooltip
                                            formatter={(v: number) => [fmtCurrency(v), 'Sales']}
                                            contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="sales"
                                            stroke="#2563eb"
                                            strokeWidth={2.5}
                                            fill="url(#monthlyForecastFill)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="lg:col-span-2 space-y-3">
                            <div className="rounded-xl border bg-emerald-50/70 p-4">
                                <p className="text-xs text-muted-foreground">Predicted Next Month</p>
                                <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                                    {fmtCurrency(monthlyPrediction.predictedNextMonth)}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-1">Confidence: {monthlyPrediction.confidence}%</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border bg-background p-3">
                                    <p className="text-[11px] text-muted-foreground">This Month</p>
                                    <p className="font-bold text-primary mt-1">{fmtCurrency(monthlyPrediction.currentMonthSales)}</p>
                                    <p className="text-[10px] text-muted-foreground">Day {monthlyPrediction.dayOfMonth}/{monthlyPrediction.daysInMonth}</p>
                                </div>
                                <div className="rounded-lg border bg-background p-3">
                                    <p className="text-[11px] text-muted-foreground">Projected Close</p>
                                    <p className="font-bold mt-1">{fmtCurrency(monthlyPrediction.projectedCurrentMonth)}</p>
                                    <p className="text-[10px] text-muted-foreground">Trend-adjusted</p>
                                </div>
                            </div>

                            <div className="rounded-lg border bg-background p-3">
                                <p className="text-[11px] text-muted-foreground">6-Month Average</p>
                                <p className="font-bold mt-1">{fmtCurrency(monthlyPrediction.historyAverage)}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bottom row — New Stock, Low Stock, Recent Sales inline */}
            <div className="grid gap-4 md:grid-cols-3">
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
                                                        {fmtCurrency((item.totalValue || 0))}
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
                                                        const pkg = (item.packaging_type || (item as any).packagingType || '').toString();
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
                                                            wholesalePrice: item.wholesale_price || item.wholesalePrice,
                                                            image: item.productImage,
                                                            barcode: item.barcode,
                                                            quantity: item.quantity,
                                                            supplier: item.supplier || item.supplier_name,
                                                            size: item.size,
                                                            unitName: item.unit_name,
                                                            packagingType: item.packaging_type,
                                                            minStockLevel: item.min_stock_level,
                                                            reorderQuantity: item.reorder_quantity,
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
                                                                    <p className="text-xl font-bold text-success">{fmtCurrency(sale.totalAmount)}</p>
                                                                    <Badge variant={sale.paidInCash ? "default" : "secondary"} className={sale.paidInCash ? "bg-success" : ""}>
                                                                        {sale.paidInCash ? (sale.paymentDetails?.paymentMethod || "Cash") : "Credit"}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1 pl-13">
                                                                {sale.products?.map((product, idx) => (
                                                                    <div key={`${sale.id}-${product.productName}-${idx}`} className="flex justify-between text-sm pt-1">
                                                                        <span className="text-muted-foreground">{product.quantity}x {product.productName}</span>
                                                                        <span className="font-medium">{fmtCurrency(((product.quantity || 0) * (product.sellingPrice || 0)))}</span>
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
                                        <div key={sale.id} className="flex items-center justify-between hover:bg-muted/50 p-2 rounded-md transition-colors">
                                            <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onClick={() => setShowRecentSalesDialog(true)}>
                                                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success font-bold text-xs shrink-0">
                                                    {sale.customerName ? sale.customerName[0] : 'C'}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm truncate">{sale.customerName || "Cash Customer"}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {saleDateToLocalKey(sale.dateOfSale) || sale.dateOfSale}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="text-right">
                                                    <p className="font-bold text-sm">{fmtCurrency(sale.totalAmount)}</p>
                                                    <p className={`text-[10px] ${sale.paidInCash ? 'text-success' : 'text-warning'}`}>
                                                        {sale.paidInCash ? (sale.paymentDetails?.paymentMethod || "Cash") : "Credit"}
                                                    </p>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                                    onClick={() => onPageChange('returns', { saleId: sale.id })}>
                                                    ↩ Return
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
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
                                            <p className="font-bold text-lg text-success">{fmtCurrency(product.totalAmount)}</p>
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
