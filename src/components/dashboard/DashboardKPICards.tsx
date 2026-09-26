import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCurrency } from "@/lib/currency";
import { DollarSign, Wallet, Package, TrendingUp, Activity } from "lucide-react";
import { StockItem } from "@/types";

interface FinancialData {
  cashOnHand: number;
  stockValue: number;
  dailySales: number;
  weeklySales: number;
  monthlySales: number;
  totalPurchaseCost: number;
  totalRevenue: number;
  totalProfit: number;
  availableCash: number;
}

interface DashboardKPICardsProps {
  financialData: FinancialData;
  stockCount: number;
  onClickSales: () => void;
  onClickCash: () => void;
  onClickInventory: () => void;
  onClickProfit: () => void;
}

const DashboardKPICards = ({
  financialData,
  stockCount,
  onClickSales,
  onClickCash,
  onClickInventory,
  onClickProfit,
}: DashboardKPICardsProps) => {
  const metrics = [
    {
      title: "Daily Sales",
      value: `${fmtCurrency(financialData.dailySales)}`,
      subtitle: "Today's revenue",
      icon: DollarSign,
      onClick: onClickSales,
      className: "metric-card metric-card-sales hover:shadow-lg transition-shadow cursor-pointer",
      valueClass: "text-2xl font-bold text-white",
      subtitleClass: "text-xs text-white/70 flex items-center mt-1",
      headerClass: "text-sm font-medium text-white/80",
    },
    {
      title: "Cash on Hand",
      value: `${fmtCurrency(financialData.availableCash)}`,
      subtitle: "Cash flow",
      icon: Wallet,
      onClick: onClickCash,
      className: "metric-card metric-card-cash hover:shadow-lg transition-shadow cursor-pointer",
      valueClass: "text-2xl font-bold text-white",
      subtitleClass: "text-xs text-white/70 flex items-center mt-1",
      headerClass: "text-sm font-medium text-white/80",
    },
    {
      title: "Stock Value",
      value: `${fmtCurrency(financialData.stockValue)}`,
      subtitle: `${stockCount} items`,
      icon: Package,
      onClick: onClickInventory,
      className: "metric-card metric-card-stock hover:shadow-lg transition-shadow cursor-pointer",
      valueClass: "text-2xl font-bold text-white",
      subtitleClass: "text-xs text-white/70 flex items-center mt-1",
      headerClass: "text-sm font-medium text-white/80",
    },
    {
      title: "Net Profit",
      value: `${fmtCurrency(financialData.totalProfit)}`,
      subtitle: "Profit report",
      icon: TrendingUp,
      onClick: onClickProfit,
      className: "metric-card metric-card-profit hover:shadow-lg transition-shadow cursor-pointer",
      valueClass: "text-2xl font-bold text-white",
      subtitleClass: "text-xs text-white/70 flex items-center mt-1",
      headerClass: "text-sm font-medium text-white/80",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => {
        const IconComponent = metric.icon;
        return (
          <Card
            key={index}
            className={metric.className}
            onClick={metric.onClick}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={metric.headerClass}>{metric.title}</CardTitle>
              <IconComponent className="h-4 w-4 text-white/70" />
            </CardHeader>
            <CardContent>
              <div className={metric.valueClass}>{metric.value}</div>
              <p className={metric.subtitleClass}>
                <Activity className="h-3 w-3 mr-1" />
                {metric.subtitle} - Click to view
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default DashboardKPICards;
