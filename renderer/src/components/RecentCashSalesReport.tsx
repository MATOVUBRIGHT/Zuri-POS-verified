import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Calendar, Eye, DollarSign, BarChart3, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/services/posCalculator";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { format, parseISO } from "date-fns";

interface CashSaleRecord {
  id: string;
  customerName: string;
  staffName: string;
  totalAmount: number;
  dateOfSale: string;
  paymentMethod: string;
  products: string[];
}

interface Salesummary {
  totalCashSales: number;
  totalTransactions: number;
  averageTransactionValue: number;
  staffBreakdown: {
    name: string;
    totalSales: number;
    transactionCount: number;
    averagePerTransaction: number;
  }[];
}

interface RecentCashSalesReportProps {
  currentStoreId?: string;
}

const RecentCashSalesReport = ({ currentStoreId }: RecentCashSalesReportProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [cashSalesData, setCashSalesData] = useState<CashSaleRecord[]>([]);
  const [summary, setSummary] = useState<Salesummary | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

  const fetchCashSalesData = async () => {
    if (!currentStoreId) return;

    setIsLoading(true);
    try {
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("*")
        .eq("store_id", currentStoreId)
        .eq("paid_in_cash", true)
        .order("created_at", { ascending: false });

      if (salesError) throw salesError;

      // Fetch staff information
      const staffIds = sales
        ?.map((s) => s.staff_id)
        .filter((id): id is string => !!id) || [];
      
      const uniqueStaffIds = [...new Set(staffIds)];

      const { data: staffData, error: staffError } = await supabase
        .from("staff")
        .select("id, full_name")
        .in("id", uniqueStaffIds);

      if (staffError) throw staffError;

      const staffMap = new Map(staffData?.map((s) => [s.id, s.full_name]) || []);

      // Process sales data
      const records = sales?.map((sale: any) => {
        const productList = Array.isArray(sale.products)
          ? sale.products.map((p: any) => `${p.productName} (${p.quantity || 1})`)
          : [];
        
        return {
          id: sale.id,
          customerName: sale.customer_name || "Walk-in Customer",
          staffName: sale.staff_id ? staffMap.get(sale.staff_id) || "Unknown" : "Owner",
          totalAmount: Number(sale.total_amount) || 0,
          dateOfSale: sale.date_of_sale || sale.created_at || "",
          paymentMethod: "Cash",
          products: productList.slice(0, 3), // Show first 3 products
        };
      }) || [];

      // Calculate summary
      const totalCashSales = records.reduce((sum, r) => sum + r.totalAmount, 0);
      const totalTransactions = records.length;
      const averageTransactionValue =
        totalTransactions > 0 ? totalCashSales / totalTransactions : 0;

      // Group by staff
      const staffBreakdownMap = new Map<string, { sales: number; count: number }>();
      records.forEach((record) => {
        const current = staffBreakdownMap.get(record.staffName) || { sales: 0, count: 0 };
        current.sales += record.totalAmount;
        current.count += 1;
        staffBreakdownMap.set(record.staffName, current);
      });

      const staffBreakdown = Array.from(staffBreakdownMap.entries())
        .map(([name, data]) => ({
          name,
          totalSales: Math.round(data.sales * 100) / 100,
          transactionCount: data.count,
          averagePerTransaction: Math.round((data.sales / data.count) * 100) / 100,
        }))
        .sort((a, b) => b.totalSales - a.totalSales);

      setCashSalesData(records);
      setSummary({
        totalCashSales: Math.round(totalCashSales),
        totalTransactions,
        averageTransactionValue: Math.round(averageTransactionValue),
        staffBreakdown,
      });

      toast({
        title: "Success",
        description: `Loaded ${records.length} cash sales records`,
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message || "Failed to fetch cash sales data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCashSalesData();
  }, [currentStoreId]);

  const handleExportToCSV = () => {
    if (!cashSalesData || !summary) return;

    let csvContent = "Cash Sales Report\n";
    csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    csvContent += "SUMMARY\n";
    csvContent += `Total Cash Sales,${summary.totalCashSales}\n`;
    csvContent += `Total Transactions,${summary.totalTransactions}\n`;
    csvContent += `Average Per Transaction,${summary.averageTransactionValue}\n\n`;

    csvContent += "STAFF BREAKDOWN\n";
    csvContent += "Staff Name,Total Sales,Transaction Count,Average Per Transaction\n";
    summary.staffBreakdown.forEach((staff) => {
      csvContent += `${staff.name},${staff.totalSales},${staff.transactionCount},${staff.averagePerTransaction}\n`;
    });

    csvContent += "\nDETAILED TRANSACTIONS\n";
    csvContent += "Customer,Staff,Date,Time,Amount,Payment Method,Products\n";
    cashSalesData.forEach((sale) => {
      const dateTime = new Date(sale.dateOfSale);
      const dateStr = format(dateTime, "yyyy-MM-dd");
      const timeStr = format(dateTime, "HH:mm:ss");
      csvContent += `"${sale.customerName}","${sale.staffName}","${dateStr}","${timeStr}",${sale.totalAmount},"${sale.paymentMethod}","${sale.products.join("; ")}"\n`;
    });

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent));
    element.setAttribute("download", `cash_sales_report_${new Date().toISOString().split("T")[0]}.csv`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    toast({
      title: "Success",
      description: "Report exported to CSV",
    });
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Recent Cash Sales Report</h1>
        <Button onClick={handleExportToCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Export to CSV
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-emerald-700">
                Total Cash Sales
              </CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-900">
                {formatCurrency(summary.totalCashSales)}
              </div>
              <p className="text-xs text-emerald-600 mt-1 font-medium">Drawer physical cash</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-blue-700">
                Total Transactions
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">{summary.totalTransactions}</div>
              <p className="text-xs text-blue-600 mt-1 font-medium">Since last sync</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-amber-700">
                Average Per Transaction
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-900">
                {formatCurrency(summary.averageTransactionValue)}
              </div>
              <p className="text-xs text-amber-600 mt-1 font-medium">Per sale average</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Staff Breakdown */}
      {summary && summary.staffBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Staff Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Name</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
                  <TableHead className="text-right">Transaction Count</TableHead>
                  <TableHead className="text-right">Avg Per Transaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.staffBreakdown.map((staff, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{staff.name}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(staff.totalSales)}
                    </TableCell>
                    <TableCell className="text-right">{staff.transactionCount}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(staff.averagePerTransaction)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detailed Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Cash Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Products (Sample)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashSalesData.length > 0 ? (
                  cashSalesData.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{sale.customerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{sale.staffName}</Badge>
                      </TableCell>
                      <TableCell>
                        {sale.dateOfSale
                          ? format(parseISO(sale.dateOfSale), "MMM dd, yyyy HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(sale.totalAmount)}
                      </TableCell>
                      <TableCell>{sale.paymentMethod}</TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-600">
                          {sale.products.join(", ")}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-gray-500">
                      No cash sales records found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RecentCashSalesReport;
