import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Filter, Download } from "lucide-react";

interface SalesReportFiltersProps {
  dateFrom: string;
  dateTo: string;
  selectedProduct: string;
  availableProducts: string[];
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onProductChange: (product: string) => void;
  onExportRows: () => void;
  onExportDaily: () => void;
  onExportMonthly: () => void;
}

const SalesReportFilters = ({
  dateFrom,
  dateTo,
  selectedProduct,
  availableProducts,
  onDateFromChange,
  onDateToChange,
  onProductChange,
  onExportRows,
  onExportDaily,
  onExportMonthly,
}: SalesReportFiltersProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Sales Filters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dateFrom" className="text-sm">From Date</Label>
            <Input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateTo" className="text-sm">To Date</Label>
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product" className="text-sm">Product</Label>
            <select
              id="product"
              value={selectedProduct}
              onChange={(e) => onProductChange(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Products</option>
              {availableProducts.map(product => (
                <option key={product} value={product}>{product}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button 
              onClick={onExportRows}
              size="sm"
              className="w-full"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          </div>

          <div className="flex items-end">
            <Button 
              onClick={onExportDaily}
              size="sm"
              variant="outline"
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              Daily
            </Button>
          </div>

          <div className="flex items-end">
            <Button 
              onClick={onExportMonthly}
              size="sm"
              variant="outline"
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              Monthly
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SalesReportFilters;
