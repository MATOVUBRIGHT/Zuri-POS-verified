import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaleItem } from "@/types";
import { parseAnyDateToLocalDate } from "@/lib/date";

interface SalesTransactionsListProps {
  sales: SaleItem[];
  isLoading?: boolean;
}

const SalesTransactionsList = ({ sales, isLoading = false }: SalesTransactionsListProps) => {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg">Recent Sales Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading transactions...
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No sales found for the selected criteria.
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {sales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium truncate">{sale.customerName}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {sale.paidInCash ? "Paid" : "Credit"} • {sale.products.length} item{sale.products.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(parseAnyDateToLocalDate(sale.dateOfSale) || new Date(sale.dateOfSale)).toLocaleDateString('en-US', {
                      year: '2-digit',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-3 ml-4">
                  <div className="text-right">
                    <div className="font-semibold text-sm">
                      UGX {Number(sale.totalAmount).toLocaleString()}
                    </div>
                  </div>
                  <Badge
                    variant={sale.paidInCash ? "default" : "secondary"}
                    className="whitespace-nowrap"
                  >
                    {sale.paidInCash ? "PAID" : "CREDIT"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SalesTransactionsList;
