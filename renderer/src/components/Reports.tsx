import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Filter, DollarSign, Package, AlertCircle, BarChart3, TrendingUp, Share2, Calculator, User } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { Product, StockItem, SaleItem, ExpenseItem } from "@/types";
import { endOfLocalDay, parseAnyDateToLocalDate, parseDateOnlyToLocalDate, startOfLocalDay } from "@/lib/date";
import { formatCurrency } from "@/services/posCalculator";
import DailyCashReconciliation from "./DailyCashReconciliation";
import NonCashReconciliation from "./NonCashReconciliation";

interface ReportsProps {
  stockData: StockItem[];
  salesData: SaleItem[];
  expensesData: ExpenseItem[];
  currentStoreId?: string;
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

const Reports = ({ 
  stockData: initialStockData, 
  salesData: initialSalesData, 
  expensesData: initialExpensesData, 
  currentStoreId 
}: ReportsProps) => {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [autoShareReports, setAutoShareReports] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  
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
      .channel('report-changes')
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
          costPerUnit: item.cost_per_unit || 0,
          cost_per_unit: item.cost_per_unit || 0,
          totalValue: item.total_value || 0,
          dateOfPurchase: item.date_of_purchase,
          min_stock_level: item.min_stock_level || 0,
          reorder_quantity: item.reorder_quantity || 10,
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

  const handleAutoShare = async (enabled: boolean) => {
    setAutoShareReports(enabled);
    
    if (enabled && currentStoreId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get all users with access to this store
        const { data: accessList } = await supabase
          .from("store_access")
          .select("user_id")
          .eq("store_id", currentStoreId);

        if (!accessList || accessList.length === 0) {
          toast({
            title: "No shared users",
            description: "There are no users with access to share reports with",
          });
          return;
        }

        // Calculate accurate report summary
        const totalRevenue = uniqueSalesData.reduce((sum, sale) => sum + sale.totalAmount, 0);
        const totalExpenses = uniqueExpensesData.reduce((sum, exp) => sum + exp.amount, 0);
        
        // Calculate COGS from sales products
        let totalCOGS = 0;
        for (const sale of uniqueSalesData) {
          for (const p of sale.products) {
            const profile = resolveCostProfile(p.productName);
            const unitCost = p.sellType === 'sachet' ? profile.costPerUnit * profile.itemsPerSachet : profile.costPerUnit;
            totalCOGS += (p.quantity || 0) * unitCost;
          }
        }
        const netProfit = totalRevenue - totalCOGS - totalExpenses;

        // Send notifications to all shared users
        for (const access of accessList) {
          await supabase.from("notifications").insert({
            user_id: access.user_id,
            type: "report_shared",
            title: "Automatic Report Shared",
            message: `Store report: Revenue: UGX ${totalRevenue.toLocaleString()}, COGS: UGX ${totalCOGS.toLocaleString()}, Expenses: UGX ${totalExpenses.toLocaleString()}, Net Profit: UGX ${netProfit.toLocaleString()}`,
            data: { 
              from_user_id: user.id,
              store_id: currentStoreId,
              total_revenue: totalRevenue,
              total_cogs: totalCOGS,
              total_expenses: totalExpenses,
              net_profit: netProfit
            },
          });
        }

        toast({
          title: "Reports Shared",
          description: `Automatically shared reports with ${accessList.length} user(s)`,
        });
      } catch (error) {
        console.error("Error sharing reports:", error);
        toast({
          title: "Error",
          description: "Failed to share reports automatically",
          variant: "destructive",
        });
      }
    }
  };

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
          `"${labelFor(r.key)}",${r.txCount},${Math.round(r.total)},${Math.round(r.paid)},${Math.round(r.credit)},${Math.round(r.cash)},${Math.round(r.nonCash)}`
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">Reports & Analytics</h2>
        <Badge variant="outline" className="text-sm">
          Business Intelligence
        </Badge>
      </div>

      <Tabs defaultValue={sessionStorage.getItem('highlightSection') === 'profit' ? 'profit' : 'reconciliation'} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="reconciliation">Cash Reconciliation</TabsTrigger>
          <TabsTrigger value="noncash">Non-Cash Recon</TabsTrigger>
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
          <TabsTrigger value="stock">Stock & Charts</TabsTrigger>
          <TabsTrigger value="profit">Profit Analysis</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid Sales</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
        </TabsList>

        {/* Daily Cash Reconciliation */}
        <TabsContent value="reconciliation">
          <DailyCashReconciliation currentStoreId={currentStoreId} />
        </TabsContent>

        {/* Non-Cash Reconciliation */}
        <TabsContent value="noncash">
          <NonCashReconciliation currentStoreId={currentStoreId} />
        </TabsContent>

        {/* Sales Report */}
        <TabsContent value="sales" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Sales Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <Label htmlFor="dateFrom">From Date</Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="dateTo">To Date</Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="product">Product</Label>
                  <select
                    id="product"
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="all">All Products</option>
                    {allProducts.map(product => (
                      <option key={product} value={product}>{product}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end md:col-span-1">
                  <Button onClick={() => exportReport("Sales")} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Export Rows
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => exportSalesSummary("daily")} variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Daily Summary
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => exportSalesSummary("monthly")} variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Monthly Summary
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Share Reports */}
          {isOwner && currentStoreId && (
            <Card className="bg-gradient-to-br from-accent/10 to-accent/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Share2 className="h-5 w-5" />
                  Report Sharing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label htmlFor="auto-share">Share reports automatically</Label>
                      <p className="text-sm text-muted-foreground">
                        When enabled, reports will be automatically shared with linked stores
                      </p>
                    </div>
                    <Switch
                      id="auto-share"
                      checked={autoShareReports}
                      onCheckedChange={handleAutoShare}
                    />
                  </div>
                  <div className="pt-2 border-t">
                    <Button
                      onClick={async () => {
                        try {
                          const { data: { user } } = await supabase.auth.getUser();
                          if (!user) return;

                          const { data: accessList } = await supabase
                            .from("store_access")
                            .select("user_id")
                            .eq("store_id", currentStoreId);

                          if (!accessList || accessList.length === 0) {
                            toast({
                              title: "No linked users",
                              description: "There are no users with access to share reports with",
                            });
                            return;
                          }

                          const totalRev = salesData.reduce((sum, sale) => sum + sale.totalAmount, 0);
                          const totalExp = expensesData.reduce((sum, exp) => sum + exp.amount, 0);
                          let cogs = 0;
                          for (const sale of salesData) {
                            for (const p of sale.products) {
                              const si = stockData.find(s => s.productName === p.productName);
                              if (si) {
                                const cpu = si.costPerUnit || si.cost_per_unit || 0;
                                const ips = si.items_per_sachet || 1;
                                cogs += (p.quantity || 0) * (p.sellType === 'sachet' ? cpu * ips : cpu);
                              }
                            }
                          }
                          const netProfit = totalRev - cogs - totalExp;

                          for (const access of accessList) {
                            await supabase.from("notifications").insert({
                              user_id: access.user_id,
                              type: "report_shared",
                              title: "Store Report Shared",
                              message: `Revenue: UGX ${totalRev.toLocaleString()}, COGS: UGX ${cogs.toLocaleString()}, Expenses: UGX ${totalExp.toLocaleString()}, Net Profit: UGX ${netProfit.toLocaleString()}`,
                              data: { 
                                from_user_id: user.id,
                                store_id: currentStoreId,
                                total_revenue: totalRev,
                                total_cogs: cogs,
                                total_expenses: totalExp,
                                net_profit: netProfit
                              },
                            });
                          }

                          toast({
                            title: "Reports Shared",
                            description: `Shared reports with ${accessList.length} user(s)`,
                          });
                        } catch (error) {
                          console.error("Error sharing reports:", error);
                          toast({
                            title: "Error",
                            description: "Failed to share reports",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="w-full"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share Report Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sales Summary - Enhanced Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800 hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Sales Value</CardTitle>
                <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {formatCurrency(totalSalesValue)}
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                  {totalSalesCount} transactions
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-900/20 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-800 hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Cash Sales</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                  {formatCurrency(productFilteredSales
                    .filter((sale) => sale.paidInCash)
                    .reduce((sum, sale) => sum + sale.totalAmount, 0))}
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                  Received in cash
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-50/50 dark:from-purple-900/20 dark:to-purple-900/10 border-purple-200 dark:border-purple-800 hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">Average Sale</CardTitle>
                <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {formatCurrency(averageSale)}
                </div>
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1">
                  Per transaction
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-50/50 dark:from-orange-900/20 dark:to-orange-900/10 border-orange-200 dark:border-orange-800 hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">Credit Sales</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                  {formatCurrency(totalUnpaidValue)}
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-1">
                  {unpaidSales.length} outstanding
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Staff Performance Summary */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-50/50 dark:from-slate-900/20 dark:to-slate-900/10 border-b border-slate-200 dark:border-slate-800">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Staff Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {productFilteredSales.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No sales data available for staff analysis.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b-2 border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-sm text-slate-700 dark:text-slate-300">Staff Member</th>
                        <th className="text-right py-3 px-4 font-semibold text-sm text-slate-700 dark:text-slate-300">Total Sales</th>
                        <th className="text-right py-3 px-4 font-semibold text-sm text-slate-700 dark:text-slate-300">Transactions</th>
                        <th className="text-right py-3 px-4 font-semibold text-sm text-slate-700 dark:text-slate-300">Avg per Tx</th>
                        <th className="text-right py-3 px-4 font-semibold text-sm text-slate-700 dark:text-slate-300">% of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {(() => {
                        const staffMap = new Map<string, { sales: number; count: number }>();
                        productFilteredSales.forEach(sale => {
                          const staffName = sale.staff_id ? "Staff" : "Owner"; // Replace with actual staff name if available
                          const current = staffMap.get(staffName) || { sales: 0, count: 0 };
                          current.sales += sale.totalAmount;
                          current.count += 1;
                          staffMap.set(staffName, current);
                        });

                        return Array.from(staffMap.entries())
                          .sort((a, b) => b[1].sales - a[1].sales)
                          .map(([name, data]) => {
                            const percentage = totalSalesValue > 0 ? ((data.sales / totalSalesValue) * 100).toFixed(1) : "0";
                            return (
                              <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                                <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-slate-100">{name}</td>
                                <td className="py-3 px-4 text-sm font-semibold text-right text-blue-600 dark:text-blue-400">
                                  {formatCurrency(data.sales)}
                                </td>
                                <td className="py-3 px-4 text-sm text-right text-slate-600 dark:text-slate-400">{data.count}</td>
                                <td className="py-3 px-4 text-sm font-medium text-right text-slate-700 dark:text-slate-300">
                                  {formatCurrency(data.sales / data.count)}
                                </td>
                                <td className="py-3 px-4 text-sm font-semibold text-right">
                                  <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                                    {percentage}%
                                  </Badge>
                                </td>
                              </tr>
                            );
                          });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sales Transactions List - Enhanced */}
          <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-50/50 dark:from-slate-900/20 dark:to-slate-900/10 border-b border-slate-200 dark:border-slate-800">
              <CardTitle className="text-lg">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {productFilteredSales.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No sales found for the selected criteria.
                </div>
              ) : (
                <div className="max-h-[700px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
                  {productFilteredSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{sale.customerName}</h4>
                          <Badge 
                            className={`whitespace-nowrap ${
                              sale.paidInCash 
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold" 
                                : "bg-orange-500/20 text-orange-700 dark:text-orange-300 font-semibold"
                            }`}
                          >
                            {sale.paidInCash ? "✓ Paid" : "Credit"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                          <span>{(parseAnyDateToLocalDate(sale.dateOfSale) || new Date(sale.dateOfSale)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          <span>•</span>
                          <span>{sale.products.length} item{sale.products.length !== 1 ? 's' : ''}</span>
                          {sale.paidInCash && sale.paymentDetails?.mobileMoneyNumber && (
                            <>
                              <span>•</span>
                              <span className="font-medium">To {sale.paymentDetails.mobileMoneyNumber}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right ml-4 min-w-max">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(Number(sale.totalAmount))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Low Stock Report */}
        <TabsContent value="low-stock" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Low Stock Alerts</h3>
            <Button onClick={() => exportReport("Low Stock")}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Stock Items</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {stockData.filter(item => item.quantity < (item.min_stock_level || 10)).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Below minimum stock level
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reorder Recommended</CardTitle>
                <Package className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  {stockData.filter(item => {
                    const threshold = (item.min_stock_level || 10) * 2;
                    return item.quantity < threshold && item.quantity >= (item.min_stock_level || 10);
                  }).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Approaching low stock levels
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Health Check</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stockData
                  .filter(item => item.quantity < (item.min_stock_level || 10) * 2)
                  .sort((a, b) => a.quantity - b.quantity)
                  .map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{item.productName}</h4>
                        <p className="text-xs text-muted-foreground">Category: {item.category}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Current</div>
                          <div className={`font-bold ${item.quantity < (item.min_stock_level || 10) ? 'text-destructive' : 'text-warning'}`}>
                            {item.quantity} units
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Min Level</div>
                          <div className="font-medium">{item.min_stock_level || 10}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Reorder Qty</div>
                          <div className="font-medium text-primary">{item.reorder_quantity || 20}</div>
                        </div>
                        <Badge variant={item.quantity < (item.min_stock_level || 10) ? "destructive" : "outline"} className={item.quantity < (item.min_stock_level || 10) ? "" : "border-warning/30 bg-warning/10 text-warning"}>
                          {item.quantity < (item.min_stock_level || 10) ? "Critical" : "Low"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                {stockData.filter(item => item.quantity < (item.min_stock_level || 10) * 2).length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    All inventory levels are healthy!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stock Report with Charts */}
        <TabsContent value="stock" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Stock Overview & Analytics</h3>
            <Button onClick={() => exportReport("Stock")}>
              <Download className="h-4 w-4 mr-2" />
              Export Stock Report
            </Button>
          </div>

          {/* Modern Stock Distribution Chart */}
          <Card className="overflow-hidden bg-gradient-to-br from-card via-card to-primary/5">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <BarChart3 className="h-6 w-6 text-primary" />
                Stock Distribution by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-80 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      <linearGradient id="gradient0" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="gradient3" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <Pie
                      data={stockChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={6}
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={1500}
                    >
                      {stockChartData.map((entry) => (
                        <Cell 
                          key={`cell-${entry.name}`} 
                          fill={`url(#gradient${stockChartData.indexOf(entry) % 4})`}
                          stroke="hsl(var(--background))"
                          strokeWidth={3}
                          style={{
                            filter: 'drop-shadow(0 4px 8px hsl(var(--primary) / 0.2))',
                            cursor: 'pointer'
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [
                        <span key="value" className="font-semibold text-primary">{value} units</span>, 
                        <span key="name" className="font-medium">{name}</span>
                      ]}
                      labelFormatter={(label) => `Category: ${label}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '12px',
                        boxShadow: '0 10px 30px hsl(var(--primary) / 0.15)',
                        backdropFilter: 'blur(8px)'
                      }}
                      cursor={{ fill: 'transparent' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Modern Legend */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-card/90 backdrop-blur-sm rounded-xl p-4 border border-border/50">
                    <div className="grid grid-cols-2 gap-3">
                      {stockChartData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-background"
                            style={{ 
                              background: `linear-gradient(135deg, hsl(var(--${
                                ['primary', 'accent', 'warning', 'success'][index % 4]
                              })) 0%, hsl(var(--${
                                ['primary', 'accent', 'warning', 'success'][index % 4]
                              })) 100%)`,
                              filter: 'drop-shadow(0 2px 4px hsl(var(--primary) / 0.2))'
                            }}
                          />
                          <span className="text-sm font-medium text-foreground">{entry.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {((entry.value / stockChartData.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
                <Package className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  UGX {stockData.reduce((sum, item) => sum + (item.quantity * (item.costPerUnit || item.cost_per_unit || 0)), 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                <AlertCircle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  {stockData.filter(item => item.quantity < (item.min_stock_level || 10)).length}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Package className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-accent">
                  {stockData.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stockData.reduce((sum, item) => sum + item.quantity, 0)} total units
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Stock Details</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              <div className="space-y-3">
                {stockData.map((item, index) => (
                  <div
                    key={`${item.id || item.productName}-${index}`}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium">{item.productName}</h4>
                      <p className="text-sm text-muted-foreground">
                        {item.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Quantity</div>
                        <div className="font-medium">{item.quantity} units</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Cost/Unit</div>
                        <div className="font-medium">{formatCurrency(item.costPerUnit || item.cost_per_unit || 0)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Total Value</div>
                        <div className="font-medium text-primary">
                          {formatCurrency(item.quantity * (item.costPerUnit || item.cost_per_unit || 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profit Analysis */}
        <TabsContent 
          value="profit" 
          className={`space-y-6 ${sessionStorage.getItem('highlightSection') === 'profit' ? 'profit-highlight' : ''}`}
        >
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Profit Analysis (Retail & Wholesale)</h3>
            <Button onClick={() => exportReport("Profit Analysis")}>
              <Download className="h-4 w-4 mr-2" />
              Export Profit Report
            </Button>
          </div>

          {/* Time Period Profit Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const dailyNet = dailyProfits.reduce((sum, item) => sum + item.profit, 0) - dailyExpenses;
              return (
                <Card className={`bg-gradient-to-br ${dailyNet >= 0 ? 'from-success/10 to-success/5 border-success/20' : 'from-destructive/10 to-destructive/5 border-destructive/20'} cursor-pointer hover:shadow-lg transition-shadow`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Daily Net Profit</CardTitle>
                    <TrendingUp className={`h-4 w-4 ${dailyNet >= 0 ? 'text-success' : 'text-destructive'}`} />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${dailyNet >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(dailyNet)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Revenue: {formatCurrency(dailyProfits.reduce((s, i) => s + i.revenue, 0))} • Expenses: {formatCurrency(dailyExpenses)}
                    </p>
                  </CardContent>
                </Card>
              );
            })()}

            {(() => {
              const weeklyNet = weeklyProfits.reduce((sum, item) => sum + item.profit, 0) - weeklyExpenses;
              return (
                <Card className={`bg-gradient-to-br ${weeklyNet >= 0 ? 'from-primary/10 to-primary/5 border-primary/20' : 'from-destructive/10 to-destructive/5 border-destructive/20'} cursor-pointer hover:shadow-lg transition-shadow`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Weekly Net Profit</CardTitle>
                    <TrendingUp className={`h-4 w-4 ${weeklyNet >= 0 ? 'text-primary' : 'text-destructive'}`} />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${weeklyNet >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatCurrency(weeklyNet)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last 7 days • Expenses: {formatCurrency(weeklyExpenses)}
                    </p>
                  </CardContent>
                </Card>
              );
            })()}

            {(() => {
              const monthlyNet = monthlyProfits.reduce((sum, item) => sum + item.profit, 0) - monthlyExpenses;
              return (
                <Card className={`bg-gradient-to-br ${monthlyNet >= 0 ? 'from-accent/10 to-accent/5 border-accent/20' : 'from-destructive/10 to-destructive/5 border-destructive/20'} cursor-pointer hover:shadow-lg transition-shadow`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monthly Net Profit</CardTitle>
                    <TrendingUp className={`h-4 w-4 ${monthlyNet >= 0 ? 'text-accent' : 'text-destructive'}`} />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${monthlyNet >= 0 ? 'text-accent' : 'text-destructive'}`}>
                      {formatCurrency(monthlyNet)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last 30 days • Expenses: {formatCurrency(monthlyExpenses)}
                    </p>
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* Overall Profit Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-success/15 to-success/5 border-success/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Retail Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">
                  {formatCurrency(retailProfits.reduce((sum, item) => sum + item.profit, 0))}
                </div>
                <p className="text-xs text-muted-foreground">
                  From {retailProfits.length} retail products
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Wholesale Profit</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(wholesaleProfits.reduce((sum, item) => sum + item.profit, 0))}
                </div>
                <p className="text-xs text-muted-foreground">
                  From {wholesaleProfits.length} wholesale products
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gross Profit (Revenue - COGS)</CardTitle>
                <FileText className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-accent">
                  {formatCurrency(retailProfits.reduce((sum, item) => sum + item.profit, 0) + wholesaleProfits.reduce((sum, item) => sum + item.profit, 0))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Retail + Wholesale
                </p>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br ${overallNetProfit >= 0 ? 'from-success/15 to-success/5 border-success/30' : 'from-destructive/15 to-destructive/5 border-destructive/30'}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Profit (Revenue - COGS - Expenses)</CardTitle>
                <Calculator className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${overallNetProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(overallNetProfit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  After {formatCurrency(totalExpensesAmount)} in expenses
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Profit by Product */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Profit by Product</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              <div className="space-y-3">
                {profitAnalysis.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No sales data available for profit analysis.
                  </div>
                ) : (
                  profitAnalysis
                    .sort((a, b) => b.profit - a.profit)
                    .map((item, index) => (
                      <div
                        key={`${item.productName}-${index}`}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <h4 className="font-medium">{item.productName}</h4>
                          <p className="text-sm text-muted-foreground">
                            {item.category} • Sold: {item.soldQuantity} units
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Revenue</div>
                            <div className="font-medium">{formatCurrency(item.revenue)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Profit</div>
                            <div className={`font-medium ${item.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {formatCurrency(item.profit)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Margin</div>
                            <div className={`font-medium ${item.profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {item.profitMargin}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Unpaid Sales */}
        <TabsContent value="unpaid" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Accounts Receivable</h3>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Outstanding</div>
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(totalUnpaidValue)}
                </div>
              </div>
              <Button onClick={() => exportReport("Unpaid Sales")}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Unpaid Transactions ({unpaidSales.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              {unpaidSales.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  All sales have been paid. Great job!
                </div>
              ) : (
                <div className="space-y-3">
                  {unpaidSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-destructive/5"
                    >
                      <div>
                        <h4 className="font-medium">{sale.customerName}</h4>
                        <p className="text-sm text-muted-foreground">
                          {(parseAnyDateToLocalDate(sale.dateOfSale) || new Date(sale.dateOfSale)).toLocaleDateString()} • {sale.products.length} items
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {sale.products.map((product) => (
                            <Badge key={`${sale.id}-${product.productName}-${product.sellType}`} variant="outline" className="text-xs">
                              {product.productName} x{product.quantity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-destructive">
                          {formatCurrency(sale.totalAmount)}
                        </div>
                        <Badge variant="destructive">UNPAID</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;

