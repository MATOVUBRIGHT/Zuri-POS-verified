import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, RotateCcw } from "lucide-react";

interface InventoryFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  categoriesList: string[];
  showAllCategories: boolean;
  setShowAllCategories: (show: boolean) => void;
  hashStockFilter: "low" | "critical" | null;
  onClearFilters: () => void;
  onBulkUpdate: () => void;
  hasItems: boolean;
  supplierFilter?: string;
  setSupplierFilter?: (supplier: string) => void;
  suppliersList?: string[];
}

export const InventoryFilters = ({
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  categoriesList,
  showAllCategories,
  setShowAllCategories,
  hashStockFilter,
  onClearFilters,
  onBulkUpdate,
  hasItems,
  supplierFilter = "all",
  setSupplierFilter,
  suppliersList = [],
}: InventoryFiltersProps) => {
  return (
    <Card className="shadow-sm border-primary/5">
      <CardHeader className="py-4 border-b bg-muted/20">
        <CardTitle className="text-sm font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Search & Advanced Filters
          </div>
          {hashStockFilter && (
            <Badge variant={hashStockFilter === 'critical' ? 'destructive' : 'warning'} className="animate-pulse">
              Filtering: {hashStockFilter} stock
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by product, category, supplier, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11 px-4 gap-2"
              onClick={onBulkUpdate}
              disabled={!hasItems}
            >
              Bulk Quantity Update
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-foreground"
              onClick={onClearFilters}
              title="Reset Filters"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-bold text-muted-foreground uppercase mr-2 tracking-widest">Categories:</span>
          <Button
            variant={categoryFilter === "all" ? "default" : "secondary"}
            size="sm"
            className="h-7 px-3 text-[11px] font-bold"
            onClick={() => setCategoryFilter("all")}
          >
            All
          </Button>
          {(showAllCategories ? categoriesList : categoriesList.slice(0, 8)).map(category => (
            <Button
              key={category}
              variant={categoryFilter === category ? "default" : "secondary"}
              size="sm"
              className="h-7 px-3 text-[11px] font-bold"
              onClick={() => setCategoryFilter(category)}
            >
              {category}
            </Button>
          ))}
          {categoriesList.length > 8 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] text-primary hover:underline hover:bg-transparent"
              onClick={() => setShowAllCategories(!showAllCategories)}
            >
              {showAllCategories ? "Show Less" : `+${categoriesList.length - 8} More`}
            </Button>
          )}
        </div>

        {/* Supplier filter */}
        {suppliersList.length > 0 && setSupplierFilter && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase mr-2 tracking-widest">Suppliers:</span>
            <Button
              variant={supplierFilter === "all" ? "default" : "secondary"}
              size="sm"
              className="h-7 px-3 text-[11px] font-bold"
              onClick={() => setSupplierFilter("all")}
            >
              All
            </Button>
            {suppliersList.slice(0, 10).map(supplier => (
              <Button
                key={supplier}
                variant={supplierFilter === supplier ? "default" : "secondary"}
                size="sm"
                className="h-7 px-3 text-[11px] font-bold"
                onClick={() => setSupplierFilter(supplier)}
              >
                {supplier}
              </Button>
            ))}
            {suppliersList.length > 10 && (
              <span className="text-[10px] text-muted-foreground">+{suppliersList.length - 10} more (use search)</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
