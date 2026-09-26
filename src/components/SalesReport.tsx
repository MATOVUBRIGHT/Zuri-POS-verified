import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Download, Calendar, Receipt, Package,
  TrendingUp, DollarSign, ShoppingCart, CreditCard, Undo2
} from "lucide-react";
import { SaleItem, StockItem } from "@/types";
import { toLocalDateKey, saleDateToLocalKey, parseAnyDateToLocalDate } from "@/lib/date";
import { getCurrencySymbol } from "@/lib/currency";
import * as XLSX from "xlsx";
import { LoadingMark } from "@/components/ui/loading-spinner";

interface SalesReportProps {
  salesData: SaleItem[];
  stockData?: StockItem[];
  isLoading?: boolean;
  onReturn?: (sale: SaleItem) => void;
  title?: string;
}

const fmt = (n: number) => `${getCurrencySymbol()} ${n.toLocaleString()}`;
const fmtDate = (d: string | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};
const receiptLabel = (sale: SaleItem) => sale.receiptNumber || `LEGACY-${sale.id.slice(-8).toUpperCase()}`;

export default function SalesReport({ salesData, stockData = [], isLoading, onReturn, title = "Sales History" }: SalesReportProps) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(toLocalDateKey(new Date())); // default today
  const [showAllDates, setShowAllDates] = useState(false);

  // Build cost catalog from stockData
  const costCatalog = useMemo(() => {
    const map = new Map<string, number>();
    stockData.forEach(item => {
      const key = (item.productName || item.product_name || "").trim().toLowerCase();
      if (key) map.set(key, Number(item.cost_per_unit || item.costPerUnit || 0));
    });
    return map;
  }, [stockData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return salesData.filter(sale => {
      const dateKey = saleDateToLocalKey(sale.dateOfSale) || saleDateToLocalKey(sale.created_at || "");
      if (!showAllDates && dateKey !== dateFilter) return false;
      if (!q) return true;
      return (
        sale.customerName?.toLowerCase().includes(q) ||
        sale.id?.toLowerCase().includes(q) ||
        sale.id?.slice(-8).toLowerCase().includes(q) ||
        sale.receiptNumber?.toLowerCase().includes(q) ||
        sale.products?.some(p => p.productName?.toLowerCase().includes(q)) ||
        (sale as any).staffName?.toLowerCase().includes(q) ||
        sale.paymentDetails?.paymentMethod?.toLowerCase().includes(q)
      );
    });
  }, [salesData, search, dateFilter, showAllDates]);

  // Summary stats
  const stats = useMemo(() => {
    const totalSales = filtered.reduce((s, sale) => s + (sale.totalAmount || 0), 0);
    const totalTransactions = filtered.length;
    let totalProductsSold = 0;
    let totalCost = 0;
    const methodTotals: Record<string, number> = {};

    filtered.forEach(sale => {
      (sale.products || []).forEach(p => {
        totalProductsSold += p.quantity || 0;
        const cost = costCatalog.get((p.productName || "").trim().toLowerCase()) || 0;
        totalCost += cost * (p.quantity || 0);
      });
      const method = sale.paymentDetails?.paymentMethod || (sale.paidInCash ? "Cash" : "Credit");
      methodTotals[method] = (methodTotals[method] || 0) + (sale.totalAmount || 0);
    });

    const profit = totalSales - totalCost;
    return { totalSales, totalTransactions, totalProductsSold, totalCost, profit, methodTotals };
  }, [filtered, costCatalog]);

  const exportToExcel = () => {
    const rows = filtered.map(sale => ({
      "Receipt #": receiptLabel(sale),
      "Sale ID": sale.id,
      "Customer": sale.customerName || "Walk-in",
      "Sold By": (sale as any).staffName || "Owner",
      "Date": fmtDate(sale.created_at || sale.dateOfSale),
      "Products": (sale.products || []).map(p => `${p.quantity}x ${p.productName}`).join(", "),
      "Payment Method": sale.paymentDetails?.paymentMethod || (sale.paidInCash ? "Cash" : "Credit"),
      "Status": sale.paidInCash ? "Paid" : "Credit",
      [`Total (${getCurrencySymbol()})`]: sale.totalAmount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, `sales_${dateFilter}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          {title}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date picker */}
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1 bg-background">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setShowAllDates(false); }}
              className="text-sm bg-transparent outline-none w-32"
            />
          </div>
          <Button variant={showAllDates ? "default" : "outline"} size="sm" onClick={() => setShowAllDates(v => !v)}>
            {showAllDates ? "All Dates" : "Today"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { icon: ShoppingCart, label: "Sales Today", value: fmt(stats.totalSales), color: "text-blue-600", bg: "bg-blue-50" },
          { icon: Receipt, label: "Transactions", value: stats.totalTransactions.toString(), color: "text-purple-600", bg: "bg-purple-50" },
          { icon: Package, label: "Products Sold", value: stats.totalProductsSold.toString(), color: "text-orange-600", bg: "bg-orange-50" },
          { icon: DollarSign, label: "Cost Total", value: fmt(stats.totalCost), color: "text-red-600", bg: "bg-red-50" },
          { icon: TrendingUp, label: "Selling Total", value: fmt(stats.totalSales), color: "text-green-600", bg: "bg-green-50" },
          { icon: TrendingUp, label: "Profit", value: fmt(stats.profit), color: stats.profit >= 0 ? "text-emerald-600" : "text-red-600", bg: stats.profit >= 0 ? "bg-emerald-50" : "bg-red-50" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className={`rounded-xl border p-3 flex items-center gap-2 ${bg}`}>
            <Icon className={`h-4 w-4 shrink-0 ${color}`} />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground truncate">{label}</p>
              <p className={`text-sm font-bold truncate ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payment methods breakdown */}
      {Object.keys(stats.methodTotals).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.methodTotals).map(([method, total]) => (
            <Badge key={method} variant="outline" className="gap-1 text-xs">
              <CreditCard className="h-3 w-3" />
              {method}: {fmt(total)}
            </Badge>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by customer, product, receipt #, staff..." autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Sales list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingMark size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No sales found</p>
          <p className="text-sm">{showAllDates ? "Try a different search" : "No sales on this date"}</p>
        </div>
      ) : (
        <ScrollArea className="h-[520px]" type="auto">
          <div className="overflow-x-auto rounded-xl border bg-card pr-2">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items sold</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(sale => {
                  const returned = (sale as any).return_status;
                  const method = sale.paymentDetails?.paymentMethod || (sale.paidInCash ? "Cash" : "Credit");
                  return <tr key={sale.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-semibold text-primary">#{receiptLabel(sale)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDate(sale.created_at || sale.dateOfSale)}</td>
                    <td className="px-4 py-3 font-medium">{sale.customerName || "Walk-in"}<div className="text-xs text-muted-foreground">{(sale as any).staffName || "Owner"}</div></td>
                    <td className="max-w-[250px] px-4 py-3"><div className="flex flex-wrap gap-1">{(sale.products || []).map((p, index) => <Badge key={`${sale.id}-${index}`} variant="outline" className="max-w-[210px] truncate text-xs">{p.quantity}× {p.productName}</Badge>)}</div></td>
                    <td className="px-4 py-3"><Badge variant={sale.paidInCash ? "default" : "secondary"}>{method}</Badge></td>
                    <td className="px-4 py-3">{returned === "returned" ? <Badge variant="destructive">Returned</Badge> : returned === "partial_return" ? <Badge className="bg-amber-500">Partial return</Badge> : <Badge variant="outline">Completed</Badge>}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmt(sale.totalAmount)}</td>
                    <td className="px-4 py-3 text-right">{onReturn && <Button type="button" variant="ghost" size="sm" className="gap-1 text-amber-600 hover:text-amber-700" onClick={() => onReturn(sale)}><Undo2 className="h-4 w-4" />Return</Button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
