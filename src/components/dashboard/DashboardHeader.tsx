import { Button } from "@/components/ui/button";
import { ShoppingCart, Package } from "lucide-react";

interface DashboardHeaderProps {
  onClickNewSale: () => void;
  onClickAddStock: () => void;
}

const DashboardHeader = ({ onClickNewSale, onClickAddStock }: DashboardHeaderProps) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">
          Overview of your store's performance
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          onClick={onClickNewSale} 
          className="bg-primary hover:bg-primary/90 active:bg-primary/80 transition-colors"
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          New Sale
        </Button>
        <Button 
          variant="outline" 
          onClick={onClickAddStock}
          className="hover:bg-accent transition-colors"
        >
          <Package className="mr-2 h-4 w-4" />
          Add Stock
        </Button>
      </div>
    </div>
  );
};

export default DashboardHeader;
