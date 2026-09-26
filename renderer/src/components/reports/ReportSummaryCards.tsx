import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, TrendingUp } from "lucide-react";

interface ReportSummaryCardsProps {
  totalSalesValue: number;
  totalSalesCount: number;
  averageSale: number;
  cashSalesTotal: number;
}

const ReportSummaryCards = ({
  totalSalesValue,
  totalSalesCount,
  averageSale,
  cashSalesTotal,
}: ReportSummaryCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Sales Value */}
      <Card className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
          <DollarSign className="h-4 w-4 text-primary opacity-60" />
        </CardHeader>
        <CardContent className="relative">
          <div className="text-2xl font-bold">
            UGX {totalSalesValue.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalSalesCount} transactions
          </p>
        </CardContent>
      </Card>

      {/* Transactions Count */}
      <Card className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
          <ShoppingCart className="h-4 w-4 text-accent opacity-60" />
        </CardHeader>
        <CardContent className="relative">
          <div className="text-2xl font-bold">
            {totalSalesCount}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalSalesCount > 0 ? `Avg ${averageSale.toLocaleString()}` : 'No sales'}
          </p>
        </CardContent>
      </Card>

      {/* Average Sale */}
      <Card className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-success/10 to-transparent pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="text-sm font-medium text-muted-foreground">Average Sale</CardTitle>
          <TrendingUp className="h-4 w-4 text-success opacity-60" />
        </CardHeader>
        <CardContent className="relative">
          <div className="text-2xl font-bold">
            UGX {averageSale.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Per transaction
          </p>
        </CardContent>
      </Card>

      {/* Cash Sales */}
      <Card className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-warning/10 to-transparent pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="text-sm font-medium text-muted-foreground">Cash Sales</CardTitle>
          <DollarSign className="h-4 w-4 text-warning opacity-60" />
        </CardHeader>
        <CardContent className="relative">
          <div className="text-2xl font-bold">
            UGX {cashSalesTotal.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalSalesValue > 0 ? `${((cashSalesTotal / totalSalesValue) * 100).toFixed(1)}%` : '0%'} of total
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportSummaryCards;
