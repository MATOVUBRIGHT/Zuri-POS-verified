import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Download, DollarSign, Package, AlertCircle,
  BarChart3, TrendingUp, Calculator, Search, X,
  TrendingDown, ShoppingBag, Layers, PieChart as PieChartIcon, Clock, AlertTriangle
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { Product, StockItem, SaleItem, ExpenseItem } from "@/types";
import { endOfLocalDay, parseAnyDateToLocalDate, parseDateOnlyToLocalDate, startOfLocalDay } from "@/lib/date";
import DailyCashReconciliation from "./DailyCashReconciliation";
import NonCashReconciliation from "./NonCashReconciliation";
import SalesReport from "./SalesReport";
import ReportSummaryCards from "./reports/ReportSummaryCards";
import WalkInTracker from "./WalkInTracker";

interface ReportsProps {
  stockData: StockItem[];
  salesData: SaleItem[];
  expensesData: ExpenseItem[];
  currentStoreId?: string;
  onPageChange?: (page: string, params?: any) => void;
}

type ProductCostProfile = {
  costPerUnit: number;
  itemsPerSachet: number;
  category: string;
};

const dedupeRowsById = <T extends { id?: unknown }>(rows: T[] | null | undefined): T[] => {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(row);
  }

  return deduped;
};

const normalizeProductName = (value: string | null | undefined) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const buildProductCostCatalog = (items: StockItem[]) => {
  const bucket = new Map<string, { qty: number; costWeighted: number; itemsPerSachet: number; category: string }>();

  for (const item of items) {
    const key = normalizeProductName(item.productName || item.product_name);
    if (!key) continue;

    const qty = Math.max(0, Number(item.quantity) || 0);
    const costPerUnit = Number(item.costPerUnit || item.cost_per_unit || 0);
    const itemsPerSachet = Math.max(1, Number(item.items_per_sachet) || 1);

    const existing = bucket.get(key) || { qty: 0, costWeighted: 0, itemsPerSachet: 1, category: item.category || "General" };
    existing.qty += qty;
    existing.costWeighted += costPerUnit * Math.max(1, qty);
    existing.itemsPerSachet = Math.max(existing.itemsPerSachet, itemsPerSachet);
    if (!existing.category && item.category) existing.category = item.category;
    bucket.set(key, existing);
  }

  const catalog = new Map<string, ProductCostProfile>();
  for (const [key, entry] of bucket.entries()) {
    const avgCostPerUnit = entry.qty > 0 ? entry.costWeighted / entry.qty : 0;
    catalog.set(key, {
      costPerUnit: avgCostPerUnit,
      itemsPerSachet: entry.itemsPerSachet || 1,
      category: entry.category || "General",
    });
  }

  return catalog;
};

const ShiftDiscrepancyReport = ({ currentStoreId }: { currentStoreId?: string }) => {
  const [shifts, setShifts] = useState<any[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentStoreId) return;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch closed shifts with discrepancy data
        const { data: shiftData } = await supabase
          .from('shifts')
          .select('id, staff_id, starting_cash, ending_cash_actual, ending_cash_expected, start_time, end_time, status')
          .eq('store_id', currentStoreId)
          .eq('status', 'closed')
          .not('ending_cash_actual', 'is', null)
          .order('end_time', { ascending: false })
          .limit(50);

        // Fetch staff names
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, full_name')
          .eq('store_id', currentStoreId);

        const map: Record<string, string> = {};
        for (const s of staffData || []) map[s.id] = s.full_name;
        setStaffMap(map);
        setShifts(shiftData || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [currentStoreId]);

  const totalDiscrepancy = shifts.reduce((sum, s) => sum + (Number(s.ending_cash_actual ?? 0) - Number(s.ending_cash_expected ?? 0)), 0);
  const withDiscrepancy = shifts.filter(s => Math.abs(Number(s.ending_cash_actual ?? 0) - Number(s.ending_cash_expected ?? 0)) > 0.01);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />Shift Discrepancy Report
        </h3>
        <div className="flex gap-3">
          <div className="rounded-xl border bg-card p-3 flex items-center gap-2 min-w-[140px]">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Total Discrepancy</p>
              <p className={`font-bold text-sm ${Math.abs(totalDiscrepancy) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                {totalDiscrepancy >= 0 ? '+' : ''}{fmtCurrency(totalDiscrepancy)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3 flex items-center gap-2 min-w-[140px]">
            <Clock className="h-4 w-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Shifts w/ Issues</p>
              <p className="font-bold text-sm text-blue-600">{withDiscrepancy.length} / {shifts.length}</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading shift data...</div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">No closed shifts found</p>
        </div>
      ) : (
        <ScrollArea className="h-[500px] pr-2">
          <div className="space-y-3">
            {shifts.map(shift => {
              const actual = Number(shift.ending_cash_actual ?? 0);
              const expected = Number(shift.ending_cash_expected ?? 0);
              const discrepancy = actual - expected;
              const hasIssue = Math.abs(discrepancy) > 0.01;
              const staffName = shift.staff_id ? (staffMap[shift.staff_id] || 'Unknown Staff') : 'Owner';
              const dur = shift.end_time && shift.start_time
                ? Math.floor((new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime()) / 60000)
                : null;

              return (
                <div key={shift.id} className={`p-4 border rounded-xl ${hasIssue ? 'border-red-200 bg-red-50/30' : 'border-green-200 bg-green-50/20'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${hasIssue ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {staffName[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{staffName}</span>
                          {hasIssue
                            ? <Badge variant="destructive" className="text-[10px]">Discrepancy</Badge>
                            : <Badge className="text-[10px] bg-green-600">Balanced</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {shift.end_time ? new Date(shift.end_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          {dur !== null && ` • ${Math.floor(dur/60)}h ${dur%60}m`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-right">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Opening</p>
                        <p className="text-sm font-semibold">{fmtCurrency(shift.starting_cash)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Expected</p>
                        <p className="text-sm font-semibold text-blue-600">{fmtCurrency(expected)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Counted</p>
                        <p className="text-sm font-semibold text-orange-600">{fmtCurrency(actual)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Difference</p>
                        <p className={`text-sm font-bold ${hasIssue ? 'text-red-600' : 'text-green-600'}`}>
                          {discrepancy >= 0 ? '+' : ''}{fmtCurrency(discrepancy)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

const Reports = ({ 
  stockData: initialStockData, 
  salesData: initialSalesData, 
  expensesData: initialExpensesData, 
  currentStoreId,
  onPageChange,
}: ReportsProps) => {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [isOwner, setIsOwner] = useState(false);
  const [activeTab, setActiveTab] = useState(
    sessionStorage.getItem('highlightSection') === 'profit' ? 'profit' : 'reconciliation'
  );
  const [profitPeriod, setProfitPeriod] = useState<"today" | "week" | "month" | "all">(
    (sessionStorage.getItem('profitPeriod') as any) || "today"
  );

  // Per-tab search state — instant, no debounce
  const [stockSearch, setStockSearch] = useState("");
  const [stockChartType, setStockChartType] = useState<"bar" | "pie">("pie");
  const [profitSearch, setProfitSearch] = useState("");
  const [unpaidSearch, setUnpaidSearch] = useState("");
  const [lowStockSearch, setLowStockSearch] = useState("");

  // Auto-clear search when switching tabs
  useEffect(() => {
    setStockSearch("");
    setProfitSearch("");
    setUnpaidSearch("");
    setLowStockSearch("");
    if (activeTab !== 'profit') {
      sessionStorage.removeItem('highlightSection');
      sessionStorage.removeItem('profitPeriod');
    }
  }, [activeTab]);
  
  const [stockData, setStockData] = useState<StockItem[]>(dedupeRowsById(initialStockData || []));
  const [salesData, setSalesData] = useState<SaleItem[]>(dedupeRowsById(initialSalesData || []));
  const [expensesData, setExpensesData] = useState<ExpenseItem[]>(dedupeRowsById(initialExpensesData || []));
 
  useEffect(() => {
    if (initialStockData) setStockData(dedupeRowsById(initialStockData));
    if (initialSalesData) setSalesData(dedupeRowsById(initialSalesData));
    if (initialExpensesData) setExpensesData(dedupeRowsById(initialExpensesData));
  }, [initialStockData, initialSalesData, initialExpensesData]);

  useEffect(() => {
    const checkOwnership = async () => {
      if (!currentStoreId) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: store } = await supabase
        .from("stores")
        .select("user_id")
        .eq("id", currentStoreId)
        .single();

      setIsOwner(store?.user_id === user.id);
    };

    checkOwnership();
  }, [currentStoreId]);

  // Real-time subscriptions for data updates
  useEffect(() => {
    if (!currentStoreId) return;

    const channel = supabase
      .channel(`report-changes-${currentStoreId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory',
          filter: `store_id=eq.${currentStoreId}`
        },
        async () => {
          const { data } = await supabase
            .from("inventory")
            .select("*")
            .eq("store_id", currentStoreId)
            .order("created_at", { ascending: false });
          
      if (data) {
        setStockData(dedupeRowsById(data.map((item) => ({
          id: item.id,
          productName: item.product_name,
          category: item.category,
          quantity: item.quantity,
          costPerUnit: item.cost_per_unit,
          cost_per_unit: item.cost_per_unit,
          totalValue: item.total_value,
          dateOfPurchase: item.date_of_purchase,
          min_stock_level: item.min_stock_level,
          reorder_quantity: item.reorder_quantity,
          items_per_sachet: item.items_per_sachet || 1,
          product_name: item.product_name,
          store_id: item.store_id,
          retail_price: item.retail_price || 0,
          wholesale_price: item.wholesale_price || 0,
          sachets_count: item.sachets_count || 0,
          loose_items: item.loose_items || 0,
          opened_sachets: item.opened_sachets || 0,
        }))));
      }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
          filter: `store_id=eq.${currentStoreId}`
        },
        async () => {
          const { data } = await supabase
            .from("sales")
            .select("*")
            .eq("store_id", currentStoreId)
            .order("date_of_sale", { ascending: false });
          
          if (data) {
            setSalesData(dedupeRowsById(data.map((sale) => ({
              id: sale.id,
              customerName: sale.customer_name,
              dateOfSale: sale.date_of_sale,
              totalAmount: sale.total_amount,
              paidInCash: sale.paid_in_cash || false,
              products: sale.products as unknown as Product[],
              staff_id: sale.staff_id ?? null,
              paymentMethodId: (sale as any).payment_method_id ?? null,
              paymentDetails: (sale as any).payment_details ?? null,
            }))));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `store_id=eq.${currentStoreId}`
        },
        async () => {
          const { data } = await supabase
            .from("expenses")
            .select("*")
            .eq("store_id", currentStoreId)
            .order("date_of_expense", { ascending: false });
          
          if (data) {
            setExpensesData(dedupeRowsById(data.map((exp) => ({
              id: exp.id,
              description: exp.description,
              amount: exp.amount,
              category: exp.category,
              date: exp.date_of_expense,
              paymentMethod: exp.payment_method,
            }))));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStoreId]);


  const uniqueStockData = dedupeRowsById(stockData);
  const uniqueSalesData = dedupeRowsById(salesData);
  const uniqueExpensesData = dedupeRowsById(expensesData);
  const productCostCatalog = buildProductCostCatalog(uniqueStockData);

  const resolveCostProfile = (productName: string): ProductCostProfile => {
    const key = normalizeProductName(productName);
    return productCostCatalog.get(key) || { costPerUnit: 0, itemsPerSachet: 1, category: "General" };
  };

  // Filter sales by date range
  const filteredSales = uniqueSalesData.filter(sale => {
    const saleDate = sale.dateOfSale ? parseAnyDateToLocalDate(sale.dateOfSale) : null;
    if (!saleDate) return false;

    const fromBase = dateFrom ? (parseDateOnlyToLocalDate(dateFrom) || parseAnyDateToLocalDate(dateFrom)) : null;
    const toBase = dateTo ? (parseDateOnlyToLocalDate(dateTo) || parseAnyDateToLocalDate(dateTo)) : null;

    const fromDate = fromBase ? startOfLocalDay(fromBase) : new Date(0);
    const toDateVal = toBase ? endOfLocalDay(toBase) : endOfLocalDay(new Date());

    return saleDate >= fromDate && saleDate <= toDateVal;
  });

  // Filter by product if selected
  const productFilteredSales = selectedProduct === "all" 
    ? filteredSales 
    : filteredSales.filter(sale => 
        sale.products.some((p) => p.productName === selectedProduct)
      );

  // Unpaid sales
  const unpaidSales = uniqueSalesData.filter(sale => !sale.paidInCash);

  // Calculate summary statistics
  const totalSalesValue = productFilteredSales.reduce((sum, sale) => sum + (Number(sale.totalAmount) || 0), 0);
  const totalSalesCount = productFilteredSales.length;
  const averageSale = totalSalesCount > 0 ? totalSalesValue / totalSalesCount : 0;
  const cashSalesTotal = productFilteredSales
    .filter((sale) => sale.paidInCash)
    .reduce((sum, sale) => sum + (Number(sale.totalAmount) || 0), 0);
  const totalUnpaidValue = unpaidSales.reduce((sum, sale) => sum + (Number(sale.totalAmount) || 0), 0);

  // Get unique product names for filter
  const allProducts = [...new Set(uniqueStockData.map(item => item.productName))];

  // Filter expenses by date range
  const filterExpensesByPeriod = (startDate: Date, endDate: Date) => {
    return uniqueExpensesData.filter(exp => {
      const expDate = exp.date ? parseAnyDateToLocalDate(exp.date) : null;
      if (!expDate) return false;
      return expDate >= startDate && expDate <= endDate;
    });
  };

  // Calculate profit analysis with time periods
  const calculateProfitForPeriod = (startDate: Date, endDate: Date) => {
    const periodSales = uniqueSalesData.filter((sale) => {
      const saleDate = sale.dateOfSale ? parseAnyDateToLocalDate(sale.dateOfSale) : null;
      if (!saleDate) return false;
      return saleDate >= startDate && saleDate <= endDate;
    });

    const byProduct = new Map<string, { productName: string; soldQuantity: number; revenue: number; cost: number; category: string }>();

    periodSales.forEach((sale) => {
      sale.products?.forEach((p) => {
        const key = normalizeProductName(p.productName);
        if (!key) return;

        const qty = Number(p.quantity) || 0;
        const sellingPrice = Number(p.sellingPrice) || 0;
        const profile = resolveCostProfile(p.productName);
        const unitCost = p.sellType === "sachet" ? profile.costPerUnit * profile.itemsPerSachet : profile.costPerUnit;

        const existing = byProduct.get(key) || {
          productName: p.productName || "Unnamed Product",
          soldQuantity: 0,
          revenue: 0,
          cost: 0,
          category: profile.category || "General",
        };

        existing.soldQuantity += qty;
        existing.revenue += qty * sellingPrice;
        existing.cost += qty * unitCost;
        byProduct.set(key, existing);
      });
    });

    return Array.from(byProduct.values())
      .map((item) => {
        const profit = item.revenue - item.cost;
        const profitMargin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
        return {
          ...item,
          profit,
          profitMargin: parseFloat(profitMargin.toFixed(2)),
        };
      })
      .filter((item) => item.soldQuantity > 0);
  };

  // Calculate profits for different periods
  const today = new Date();
  const todayStart = startOfLocalDay(today);
  const todayEnd = endOfLocalDay(today);
  
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6); // last 7 local days inclusive
  
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29); // last 30 local days inclusive

  const dailyProfits = calculateProfitForPeriod(todayStart, today);
  const weeklyProfits = calculateProfitForPeriod(weekStart, today);
  const monthlyProfits = calculateProfitForPeriod(monthStart, today);
  
  // Default to all profits for main display
  const profitAnalysis = calculateProfitForPeriod(new Date(0), today);

  // Separate retail and wholesale profits with correct COGS
  const retailByProduct = new Map<string, { productName: string; soldQuantity: number; revenue: number; cost: number; category: string }>();
  const wholesaleByProduct = new Map<string, { productName: string; soldQuantity: number; revenue: number; cost: number; category: string }>();

  for (const sale of uniqueSalesData) {
    for (const p of sale.products || []) {
      const key = normalizeProductName(p.productName);
      if (!key) continue;

      const qty = Number(p.quantity) || 0;
      const sellingPrice = Number(p.sellingPrice) || 0;
      const profile = resolveCostProfile(p.productName);
      const target = p.sellType === "sachet" ? wholesaleByProduct : retailByProduct;
      const unitCost = p.sellType === "sachet" ? profile.costPerUnit * profile.itemsPerSachet : profile.costPerUnit;

      const existing = target.get(key) || {
        productName: p.productName || "Unnamed Product",
        soldQuantity: 0,
        revenue: 0,
        cost: 0,
        category: profile.category || "General",
      };

      existing.soldQuantity += qty;
      existing.revenue += qty * sellingPrice;
      existing.cost += qty * unitCost;
      target.set(key, existing);
    }
  }

  const mapProfitRows = (
    source: Map<string, { productName: string; soldQuantity: number; revenue: number; cost: number; category: string }>,
    type: "retail" | "wholesale"
  ) =>
    Array.from(source.values())
      .filter((item) => item.soldQuantity > 0)
      .map((item) => {
        const profit = item.revenue - item.cost;
        const profitMargin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
        return {
          ...item,
          profit,
          profitMargin: parseFloat(profitMargin.toFixed(2)),
          type,
        };
      });

  const retailProfits = mapProfitRows(retailByProduct, "retail");
  const wholesaleProfits = mapProfitRows(wholesaleByProduct, "wholesale");

  // Stock distribution for chart
  const stockChartData = uniqueStockData.reduce((acc: { name: string; value: number }[], item) => {
    const category = item.category;
    const existing = acc.find(c => c.name === category);
    if (existing) {
      existing.value += item.quantity;
    } else {
      acc.push({ name: category, value: item.quantity });
    }
    return acc;
  }, []);

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

  // Calculate period-specific expenses for net profit
  const dailyExpenses = filterExpensesByPeriod(todayStart, today).reduce((sum, exp) => sum + exp.amount, 0);
  const weeklyExpenses = filterExpensesByPeriod(weekStart, today).reduce((sum, exp) => sum + exp.amount, 0);
  const monthlyExpenses = filterExpensesByPeriod(monthStart, today).reduce((sum, exp) => sum + exp.amount, 0);

  const totalExpensesAmount = uniqueExpensesData.reduce((sum, exp) => sum + exp.amount, 0);
  const totalCOGS = profitAnalysis.reduce((sum, item) => sum + item.cost, 0);
  const totalRevenue = profitAnalysis.reduce((sum, item) => sum + item.revenue, 0);
  // Total returned amounts reduce revenue (already reflected in sale total_amount, but show separately)
  const totalReturned = uniqueSalesData.reduce((sum, s) => sum + (Number((s as any).returned_amount) || 0), 0);
  const overallNetProfit = totalRevenue - totalCOGS - totalExpensesAmount;

  // Export function - generates CSV download
  const exportReport = (reportType: string) => {
    // ALWAYS ASK BEFORE EXPORTING
    if (!window.confirm(`Do you want to export the ${reportType} report as a CSV file?`)) {
      return;
    }

    let csvContent = "";
    let filename = "";
    
    switch (reportType) {
      case "Sales":
        csvContent = "Customer,Date,Amount,Status,Method,PaidTo,Reference,Products\n" +
          productFilteredSales.map((sale) => {
            const status = sale.paidInCash ? 'PAID' : 'CREDIT';
            const method = sale.paidInCash ? (sale.paymentDetails?.paymentMethod || 'PAID') : 'CREDIT';
            const paidTo = sale.paymentDetails?.mobileMoneyNumber
              || sale.paymentDetails?.tillNumber
              || sale.paymentDetails?.paybillNumber
              || sale.paymentDetails?.accountNumber
              || "";
            const reference = sale.paymentDetails?.transactionReference || "";
            return `"${sale.customerName}","${sale.dateOfSale}",${sale.totalAmount},${status},"${method}","${paidTo}","${reference}","${sale.products.map(p => `${p.productName} x${p.quantity}`).join('; ')}"`;
          }).join("\n");
        filename = "sales-report";
        break;
      case "Stock":
        csvContent = "Product,Category,Quantity,Cost/Unit,Total Value,Min Level,Reorder Qty\n" +
          stockData.map(item =>
            `"${item.productName}","${item.category}",${item.quantity},${item.costPerUnit},${item.quantity * item.costPerUnit},${item.min_stock_level || 10},${item.reorder_quantity || 20}`
          ).join("\n");
        filename = "stock-report";
        break;
      case "Profit Analysis":
        csvContent = "Product,Category,Sold,Revenue,Cost,Profit,Margin%\n" +
          profitAnalysis.sort((a, b) => b.profit - a.profit).map(item =>
            `"${item.productName}","${item.category}",${item.soldQuantity},${item.revenue},${item.cost},${item.profit},${item.profitMargin}`
          ).join("\n");
        filename = "profit-report";
        break;
      case "Low Stock":
        csvContent = "Product,Category,Quantity,Min Level,Reorder Qty,Status\n" +
          stockData.filter(item => item.quantity < (item.min_stock_level || 10) * 2)
            .sort((a, b) => a.quantity - b.quantity)
            .map(item =>
              `"${item.productName}","${item.category}",${item.quantity},${item.min_stock_level || 10},${item.reorder_quantity || 20},${item.quantity < (item.min_stock_level || 10) ? 'Critical' : 'Low'}`
            ).join("\n");
        filename = "low-stock-report";
        break;
      case "Unpaid Sales":
        csvContent = "Customer,Date,Amount,Products\n" +
          unpaidSales.map(sale =>
            `"${sale.customerName}","${sale.dateOfSale}",${sale.totalAmount},"${sale.products.map(p => `${p.productName} x${p.quantity}`).join('; ')}"`
          ).join("\n");
        filename = "unpaid-sales-report";
        break;
      default:
        return;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Report Exported",
      description: `${reportType} report downloaded as CSV`,
    });
  };

  const exportSalesSummary = (groupBy: "daily" | "monthly") => {
    if (!window.confirm(`Do you want to export the ${groupBy === "daily" ? "Daily" : "Monthly"} sales summary as a CSV file?`)) {
      return;
    }
    const isCashMethod = (sale: SaleItem) => {
      const method = String(sale.paymentDetails?.paymentMethod || "").trim().toLowerCase();
      return method === "cash" || method.includes("cash");
    };

    const rows = productFilteredSales
      .map((s) => ({
        sale: s,
        d: s.dateOfSale ? parseAnyDateToLocalDate(s.dateOfSale) : null,
      }))
      .filter((x) => !!x.d) as { sale: SaleItem; d: Date }[];

    const keyFor = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return groupBy === "daily" ? `${y}-${m}-${day}` : `${y}-${m}`;
    };

    const labelFor = (key: string) => {
      if (groupBy === "daily") return key;
      const [y, m] = key.split("-").map(Number);
      const d = new Date(y || 1970, (m || 1) - 1, 1);
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    };

    const summary: Record<
      string,
      { key: string; txCount: number; total: number; paid: number; credit: number; cash: number; nonCash: number }
    > = {};

    for (const { sale, d } of rows) {
      const key = keyFor(d);
      const total = Number(sale.totalAmount) || 0;
      const isPaid = !!sale.paidInCash;
      const cash = isPaid && isCashMethod(sale) ? total : 0;
      const nonCash = isPaid && !isCashMethod(sale) ? total : 0;

      if (!summary[key]) {
        summary[key] = { key, txCount: 0, total: 0, paid: 0, credit: 0, cash: 0, nonCash: 0 };
      }

      summary[key].txCount += 1;
      summary[key].total += total;
      summary[key].paid += isPaid ? total : 0;
      summary[key].credit += isPaid ? 0 : total;
      summary[key].cash += cash;
      summary[key].nonCash += nonCash;
    }

    const ordered = Object.values(summary).sort((a, b) => a.key.localeCompare(b.key));

    const header = groupBy === "daily" ? "Date" : "Month";
    const csvContent =
      `${header},Transactions,Total Sales,Paid Total,Credit Total,Cash Paid,Non-Cash Paid\n` +
      ordered
        .map((r) =>
          `"${labelFor(r.key)}",${r.txCount},${Math.round(r.total * 100) / 100},${Math.round(r.paid * 100) / 100},${Math.round(r.credit * 100) / 100},${Math.round(r.cash * 100) / 100},${Math.round(r.nonCash * 100) / 100}`
        )
        .join("\n");

    const filename = groupBy === "daily" ? "daily-sales-summary" : "monthly-sales-summary";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Report Exported",
      description: `${groupBy === "daily" ? "Daily" : "Monthly"} sales summary downloaded as CSV`,
    });
  };

  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Reports & Analytics
          </h2>
          <p className="text-muted-foreground mt-1">Business intelligence and financial overview</p>
        </div>
        <Badge variant="outline" className="text-xs px-3 py-1">Business Intelligence</Badge>
      </div>

      <ReportSummaryCards
        totalSalesValue={totalSalesValue}
        totalSalesCount={totalSalesCount}
        averageSale={averageSale}
        cashSalesTotal={cashSalesTotal}
      />

      <WalkInTracker currentStoreId={currentStoreId} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="flex w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="reconciliation" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Cash Recon</TabsTrigger>
          <TabsTrigger value="noncash" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Non-Cash</TabsTrigger>
          <TabsTrigger value="sales" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Sales</TabsTrigger>
          <TabsTrigger value="stock" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Stock</TabsTrigger>
          <TabsTrigger value="profit" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Profit</TabsTrigger>
          <TabsTrigger value="unpaid" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Unpaid</TabsTrigger>
          <TabsTrigger value="low-stock" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Low Stock</TabsTrigger>
          <TabsTrigger value="shifts" className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Shifts</TabsTrigger>
        </TabsList>

        <TabsContent value="reconciliation">
          <DailyCashReconciliation currentStoreId={currentStoreId} />
        </TabsContent>

        <TabsContent value="noncash">
          <NonCashReconciliation currentStoreId={currentStoreId} />
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <SalesReport salesData={productFilteredSales} stockData={stockData} title="Sales Report"
            onReturn={(sale) => onPageChange?.('returns', { saleId: sale.id })} />
        </TabsContent>



        {/* ── STOCK ── */}
        <TabsContent value="stock" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Layers className="h-5 w-5 text-primary" />Stock Overview</h3>
            <Button size="sm" variant="outline" onClick={() => exportReport("Stock")}><Download className="h-4 w-4 mr-1" />Export</Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Products", value: stockData.length, sub: `${stockData.reduce((s, i) => s + i.quantity, 0).toLocaleString()} units`, color: "text-blue-600", bg: "bg-blue-50", icon: Package },
              { label: "Stock Value", value: `UGX ${stockData.reduce((s, i) => s + i.quantity * (i.costPerUnit || i.cost_per_unit || 0), 0).toLocaleString()}`, sub: "at cost", color: "text-green-600", bg: "bg-green-50", icon: DollarSign },
              { label: "Low Stock", value: stockData.filter(i => i.quantity < (i.min_stock_level || 10)).length, sub: "below minimum", color: "text-amber-600", bg: "bg-amber-50", icon: AlertCircle },
            ].map(({ label, value, sub, color, bg, icon: Icon }) => (
              <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg} shrink-0`}><Icon className={`h-5 w-5 ${color}`} /></div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>
          {stockChartData.length > 0 && (() => {
            const rcd = stockChartData.map(item => ({ ...item, fullName: item.name }));
            const BAR_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];
            const cw = Math.max(560, rcd.length * 64);
            return (
              <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-lg"><BarChart3 className="h-4 w-4 text-primary" /></div>
                    <span className="text-sm font-semibold">Stock Distribution</span>
                  </div>
                  <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                    <button onClick={() => setStockChartType("bar")} title="Bar chart" className={`p-1.5 rounded-md transition-colors ${stockChartType === "bar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}><BarChart3 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setStockChartType("pie")} title="Pie chart" className={`p-1.5 rounded-md transition-colors ${stockChartType === "pie" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}><PieChartIcon className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="p-3">
                  {stockChartType === "bar" ? (
                    <div className="overflow-x-auto pb-2" style={{ overflowX: "scroll" }}>
                      <div style={{ width: cw, height: 200, minWidth: cw }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rcd} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                            <XAxis
                              dataKey="name"
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                              interval={0}
                              angle={-30}
                              textAnchor="end"
                              height={70}
                              tickMargin={10}
                              tick={{ fill: "hsl(var(--muted-foreground))" }}
                              tickFormatter={(v: string) => v.length > 16 ? v.substring(0, 14) + "..." : v}
                            />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => v.toLocaleString()} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip formatter={(v: number, _: string, p: any) => [v.toLocaleString()+" units", p?.payload?.fullName||"Qty"]} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgb(0 0 0/0.1)", fontSize: 11 }} />
                            <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={40}>
                              {rcd.map((_: any, i: number) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row items-center gap-4">
                      <div style={{ width: 200, height: 200 }} className="shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={rcd} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                              {rcd.map((_: any, i: number) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: number, _: string, p: any) => [v.toLocaleString()+" units", p?.payload?.fullName||"Qty"]} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgb(0 0 0/0.1)", fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">
                        {rcd.slice(0, 12).map((item: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                            <span className="truncate text-muted-foreground flex-1" title={item.fullName}>{item.fullName.length > 20 ? item.fullName.substring(0,18)+"..." : item.fullName}</span>
                            <span className="font-semibold shrink-0">{item.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="Search products or stock ID..." autoComplete="off" className="pl-9 pr-9" />
            {stockSearch && <button onClick={() => setStockSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <ScrollArea className="h-[400px]" type="auto">
            <div className="space-y-2 pr-2">
              {stockData.filter(i => !stockSearch || i.id.toLowerCase().includes(stockSearch.toLowerCase()) || i.productName.toLowerCase().includes(stockSearch.toLowerCase()) || (i.category || "").toLowerCase().includes(stockSearch.toLowerCase())).map((item, idx) => {
                const val = item.quantity * (item.costPerUnit || item.cost_per_unit || 0);
                const isLow = item.quantity < (item.min_stock_level || 10);
                return (
                  <div key={`${item.id}-${idx}`} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 flex-1 mr-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{item.productName}</p>
                        {isLow && <Badge variant="destructive" className="text-[10px] h-4 px-1 shrink-0">Low</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.category}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div className="w-10"><p className="text-[10px] text-muted-foreground">Qty</p><p className={`font-bold text-sm ${isLow ? "text-amber-600" : ""}`}>{item.quantity}</p></div>
                      <div className="w-20 hidden sm:block"><p className="text-[10px] text-muted-foreground">Cost/Unit</p><p className="font-medium text-xs truncate">UGX {(item.costPerUnit || item.cost_per_unit || 0).toLocaleString()}</p></div>
                      <div className="w-20"><p className="text-[10px] text-muted-foreground">Value</p><p className="font-bold text-xs text-primary truncate">UGX {val.toLocaleString()}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── PROFIT ── */}
        <TabsContent value="profit" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Profit Analysis</h3>
            <Button size="sm" variant="outline" onClick={() => exportReport("Profit Analysis")}><Download className="h-4 w-4 mr-1" />Export</Button>
          </div>
          {/* Period selector cards — clicking one filters the product list below */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { key: "today" as const, label: "Today", net: dailyProfits.reduce((s, i) => s + i.profit, 0) - dailyExpenses, rev: dailyProfits.reduce((s, i) => s + i.revenue, 0), exp: dailyExpenses },
              { key: "week" as const, label: "This Week", net: weeklyProfits.reduce((s, i) => s + i.profit, 0) - weeklyExpenses, rev: weeklyProfits.reduce((s, i) => s + i.revenue, 0), exp: weeklyExpenses },
              { key: "month" as const, label: "This Month", net: monthlyProfits.reduce((s, i) => s + i.profit, 0) - monthlyExpenses, rev: monthlyProfits.reduce((s, i) => s + i.revenue, 0), exp: monthlyExpenses },
              { key: "all" as const, label: "All Time", net: overallNetProfit, rev: totalRevenue, exp: totalExpensesAmount },
            ]).map(({ key, label, net, rev, exp }) => (
              <div
                key={key}
                onClick={() => setProfitPeriod(key)}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${profitPeriod === key ? "ring-2 ring-primary border-primary bg-primary/5" : "bg-card hover:bg-muted/30"}`}
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-bold mt-1 ${net >= 0 ? "text-emerald-700" : "text-red-600"}`}>UGX {net.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Rev: {rev.toLocaleString()} · Exp: {exp.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-blue-50 p-4">
              <p className="text-xs text-muted-foreground">Retail Profit</p>
              <p className="text-xl font-bold text-blue-700 mt-1">UGX {retailProfits.reduce((s, i) => s + i.profit, 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{retailProfits.length} products</p>
            </div>
            <div className="rounded-xl border bg-purple-50 p-4">
              <p className="text-xs text-muted-foreground">Wholesale Profit</p>
              <p className="text-xl font-bold text-purple-700 mt-1">UGX {wholesaleProfits.reduce((s, i) => s + i.profit, 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{wholesaleProfits.length} products</p>
            </div>
          </div>
          {totalReturned > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Returns Impact</p>
                  <p className="text-xs text-amber-700">{uniqueSalesData.filter(s => (s as any).return_status).length} sales with returns — revenue already reduced</p>
                </div>
              </div>
              <p className="text-base font-bold text-amber-700">-{fmtCurrency(totalReturned)}</p>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={profitSearch} onChange={e => setProfitSearch(e.target.value)} placeholder="Search products..." autoComplete="off" className="pl-9 pr-9" />
            {profitSearch && <button onClick={() => setProfitSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <ScrollArea className="h-[400px]" type="auto">
            <div className="space-y-2 pr-2">
              {(() => {
                const periodData = profitPeriod === "today" ? dailyProfits : profitPeriod === "week" ? weeklyProfits : profitPeriod === "month" ? monthlyProfits : profitAnalysis;
                const filtered = periodData.filter(i => !profitSearch || i.productName.toLowerCase().includes(profitSearch.toLowerCase())).sort((a, b) => b.profit - a.profit);
                if (filtered.length === 0) return <div className="text-center py-12 text-muted-foreground"><TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>No sales data for this period</p></div>;
                return filtered.map((item, idx) => (
                  <div key={`${item.productName}-${idx}`} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="font-medium text-sm truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.category} · {item.soldQuantity} sold</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div className="hidden sm:block"><p className="text-[10px] text-muted-foreground">Revenue</p><p className="font-medium text-xs">UGX {item.revenue.toLocaleString()}</p></div>
                      <div className="hidden sm:block"><p className="text-[10px] text-muted-foreground">Cost</p><p className="font-medium text-xs text-muted-foreground">UGX {item.cost.toLocaleString()}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">Profit</p><p className={`font-bold text-sm ${item.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>UGX {item.profit.toLocaleString()}</p></div>
                      <Badge variant="outline" className={`text-xs ${item.profitMargin >= 0 ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-red-300 text-red-700 bg-red-50"}`}>{item.profitMargin}%</Badge>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── UNPAID ── */}
        <TabsContent value="unpaid" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2"><AlertCircle className="h-5 w-5 text-destructive" />Accounts Receivable</h3>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Outstanding</p>
                <p className="text-xl font-bold text-destructive">UGX {totalUnpaidValue.toLocaleString()}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => exportReport("Unpaid Sales")}><Download className="h-4 w-4 mr-1" />Export</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-red-50 p-4">
              <p className="text-xs text-muted-foreground">Unpaid Transactions</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{unpaidSales.length}</p>
            </div>
            <div className="rounded-xl border bg-orange-50 p-4">
              <p className="text-xs text-muted-foreground">Avg Outstanding</p>
              <p className="text-2xl font-bold text-orange-700 mt-1">UGX {unpaidSales.length > 0 ? Math.round(totalUnpaidValue / unpaidSales.length).toLocaleString() : 0}</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={unpaidSearch} onChange={e => setUnpaidSearch(e.target.value)} placeholder="Search by customer, product, or sale ID..." autoComplete="off" className="pl-9 pr-9" />
            {unpaidSearch && <button onClick={() => setUnpaidSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <ScrollArea className="h-[450px]" type="auto">
            <div className="space-y-2 pr-2">
              {unpaidSales.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><ShoppingBag className="h-10 w-10 mx-auto mb-2 opacity-20" /><p className="font-medium">All sales are paid</p></div>
              ) : unpaidSales.filter(s => !unpaidSearch || s.id.toLowerCase().includes(unpaidSearch.toLowerCase()) || s.customerName?.toLowerCase().includes(unpaidSearch.toLowerCase()) || s.products.some(p => p.productName.toLowerCase().includes(unpaidSearch.toLowerCase()))).map(sale => (
                <div key={sale.id} className="p-3 rounded-xl border bg-red-50/50 hover:bg-red-50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm">{sale.customerName || "Walk-in"}</p>
                      <p className="text-xs text-muted-foreground">{(parseAnyDateToLocalDate(sale.dateOfSale) || new Date(sale.dateOfSale)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-base text-destructive">UGX {sale.totalAmount.toLocaleString()}</p>
                      <Badge variant="destructive" className="text-[10px]">UNPAID</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sale.products.map((p, i) => <Badge key={i} variant="outline" className="text-[10px]">{p.quantity}× {p.productName}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── LOW STOCK ── */}
        <TabsContent value="low-stock" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Package className="h-5 w-5 text-amber-600" />Low Stock Alerts</h3>
            <Button size="sm" variant="outline" onClick={() => exportReport("Low Stock")}><Download className="h-4 w-4 mr-1" />Export</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-red-50 p-4">
              <p className="text-xs text-muted-foreground">Critical (below min)</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{stockData.filter(i => i.quantity < (i.min_stock_level || 10)).length}</p>
            </div>
            <div className="rounded-xl border bg-amber-50 p-4">
              <p className="text-xs text-muted-foreground">Low (approaching min)</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{stockData.filter(i => { const min = i.min_stock_level || 10; return i.quantity >= min && i.quantity < min * 2; }).length}</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={lowStockSearch} onChange={e => setLowStockSearch(e.target.value)} placeholder="Search products..." autoComplete="off" className="pl-9 pr-9" />
            {lowStockSearch && <button onClick={() => setLowStockSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <ScrollArea className="h-[450px]" type="auto">
            <div className="space-y-2 pr-2">
              {stockData.filter(i => i.quantity < (i.min_stock_level || 10) * 2)
                .filter(i => !lowStockSearch || i.productName.toLowerCase().includes(lowStockSearch.toLowerCase()) || (i.category || "").toLowerCase().includes(lowStockSearch.toLowerCase()))
                .sort((a, b) => a.quantity - b.quantity)
                .map(item => {
                  const min = item.min_stock_level || 10;
                  const isCritical = item.quantity < min;
                  return (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isCritical ? "bg-red-50/60 border-red-200 hover:bg-red-50" : "bg-amber-50/60 border-amber-200 hover:bg-amber-50"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{item.productName}</p>
                          <Badge variant={isCritical ? "destructive" : "outline"} className={`text-[10px] h-4 px-1 shrink-0 ${!isCritical ? "border-amber-400 text-amber-700 bg-amber-50" : ""}`}>{isCritical ? "Critical" : "Low"}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-5 shrink-0 text-right">
                        <div><p className="text-[10px] text-muted-foreground">Current</p><p className={`font-bold text-sm ${isCritical ? "text-red-600" : "text-amber-600"}`}>{item.quantity}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Min</p><p className="font-medium text-sm">{min}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Reorder</p><p className="font-medium text-sm text-primary">{item.reorder_quantity || 20}</p></div>
                      </div>
                    </div>
                  );
                })}
              {stockData.filter(i => i.quantity < (i.min_stock_level || 10) * 2).length === 0 && (
                <div className="text-center py-12 text-muted-foreground"><Package className="h-10 w-10 mx-auto mb-2 opacity-20" /><p className="font-medium">All inventory levels are healthy</p></div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        {/* ── SHIFTS DISCREPANCY ── */}
        <TabsContent value="shifts" className="space-y-4">
          <ShiftDiscrepancyReport currentStoreId={currentStoreId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
