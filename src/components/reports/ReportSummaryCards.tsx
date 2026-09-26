import { fmtCurrency } from "@/lib/currency";
import { DollarSign, ShoppingCart, TrendingUp } from "lucide-react";
import StatCard from "@/components/StatCard";

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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Total Sales"
        value={fmtCurrency(totalSalesValue)}
        sub={`${totalSalesCount} transactions`}
        icon={DollarSign}
        color="text-primary"
        bg="bg-primary/10"
      />
      <StatCard
        label="Transactions"
        value={totalSalesCount}
        sub={totalSalesCount > 0 ? `Avg ${fmtCurrency(averageSale)}` : "No sales"}
        icon={ShoppingCart}
        color="text-blue-600"
        bg="bg-blue-50 dark:bg-blue-950"
      />
      <StatCard
        label="Average Sale"
        value={fmtCurrency(averageSale)}
        sub="Per transaction"
        icon={TrendingUp}
        color="text-emerald-600"
        bg="bg-emerald-50 dark:bg-emerald-950"
      />
      <StatCard
        label="Cash Sales"
        value={fmtCurrency(cashSalesTotal)}
        sub={`${totalSalesValue > 0 ? ((cashSalesTotal / totalSalesValue) * 100).toFixed(1) : "0"}% of total`}
        icon={DollarSign}
        color="text-amber-600"
        bg="bg-amber-50 dark:bg-amber-950"
      />
    </div>
  );
};

export default ReportSummaryCards;
