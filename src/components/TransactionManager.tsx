import { useState } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, CreditCard, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SaleItem } from "@/types";

interface TransactionManagerProps {
  salesData: SaleItem[];
  onUpdateSale: (saleId: string, updates: Partial<SaleItem>) => void;
  onDeleteSale: (saleId: string) => void;
  onClose: () => void;
}

const TransactionManager = ({ salesData, onUpdateSale, onDeleteSale, onClose }: TransactionManagerProps) => {
  const [selectedSale, setSelectedSale] = useState<SaleItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedSale, setEditedSale] = useState<SaleItem | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  const unpaidSales = salesData.filter(sale => !sale.paidInCash);

  const handleMarkAsPaid = async (sale: SaleItem) => {
    setIsUpdating(sale.id);
    try {
      // Update in Supabase
      const { error } = await supabase
        .from('sales')
        .update({ paid_in_cash: true })
        .eq('id', sale.id);

      if (error) throw error;

      onUpdateSale(sale.id, { ...sale, paidInCash: true });
      toast({
        title: "Success",
        description: `Sale to ${sale.customerName} marked as paid. Cash updated!`,
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message || "Failed to update sale",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleEdit = (sale: SaleItem) => {
    setSelectedSale(sale);
    setEditedSale({ ...sale });
    setEditMode(true);
  };

  const handleSaveEdit = () => {
    if (!editedSale) return;
    
    onUpdateSale(editedSale.id, editedSale);
    toast({
      title: "Success",
      description: "Transaction updated successfully",
    });
    setEditMode(false);
    setSelectedSale(null);
    setEditedSale(null);
  };

  const handleDelete = (sale: SaleItem) => {
    if (window.confirm(`Delete sale to ${sale.customerName}?`)) {
      onDeleteSale(sale.id);
      toast({
        title: "Success",
        description: "Transaction deleted successfully",
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl mx-4 max-h-[80vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Transaction Management
            <Button variant="outline" onClick={onClose}>Close</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editMode && editedSale ? (
            <div className="space-y-4 p-4 border rounded-lg mb-4">
              <h3 className="text-lg font-semibold">Edit Transaction</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Customer Name</label>
                  <Input
                    value={editedSale.customerName}
                    onChange={(e) => setEditedSale({...editedSale, customerName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Date</label>
                  <Input
                    type="date"
                    value={editedSale.dateOfSale}
                    onChange={(e) => setEditedSale({...editedSale, dateOfSale: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit}>Save Changes</Button>
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Unpaid Sales ({unpaidSales.length})</h3>
            {unpaidSales.length === 0 ? (
              <p className="text-muted-foreground">No unpaid sales</p>
            ) : (
              unpaidSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">{sale.customerName}</h4>
                    <p className="text-sm text-muted-foreground">
                      {sale.dateOfSale} • {sale.products?.length || 0} items
                    </p>
                    <p className="text-lg font-semibold text-destructive">
                      {fmtCurrency(sale.totalAmount)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleMarkAsPaid(sale)}
                      className="bg-success hover:bg-success/90"
                      disabled={isUpdating === sale.id}
                    >
                      {isUpdating === sale.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Mark Paid
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(sale)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(sale)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}

            <h3 className="text-lg font-semibold pt-6">All Transactions ({salesData.length})</h3>
            {salesData.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">{sale.customerName}</h4>
                  <p className="text-sm text-muted-foreground">
                    {sale.dateOfSale} • {sale.products?.length || 0} items
                  </p>
                  <p className="text-lg font-semibold">
                    {fmtCurrency(sale.totalAmount)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={sale.paidInCash ? "default" : "destructive"}>
                    {sale.paidInCash ? "PAID" : "UNPAID"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(sale)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(sale)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TransactionManager;