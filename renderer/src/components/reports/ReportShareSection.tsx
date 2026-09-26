import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Share2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { StockItem, SaleItem, ExpenseItem } from "@/types";
import { Loader2 } from "lucide-react";

interface ReportShareSectionProps {
  currentStoreId?: string;
  isOwner: boolean;
  stockData: StockItem[];
  salesData: SaleItem[];
  expensesData: ExpenseItem[];
}

const ReportShareSection = ({
  currentStoreId,
  isOwner,
  stockData,
  salesData,
  expensesData,
}: ReportShareSectionProps) => {
  const { toast } = useToast();
  const [autoShareReports, setAutoShareReports] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [sharedCount, setSharedCount] = useState(0);

  if (!isOwner || !currentStoreId) {
    return null;
  }

  const calculateAndShareReport = async () => {
    setIsSharing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get all users with access to this store
      const { data: accessList } = await supabase
        .from("store_access")
        .select("user_id")
        .eq("store_id", currentStoreId);

      if (!accessList || accessList.length === 0) {
        toast({
          title: "No shared users",
          description: "There are no users with access to share reports with",
        });
        setIsSharing(false);
        return;
      }

      // Calculate report metrics
      const totalRevenue = salesData.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
      const totalExpenses = expensesData.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

      let totalCOGS = 0;
      for (const sale of salesData) {
        for (const p of sale.products ?? []) {
          const stockItem = stockData.find(s => s.productName === p.productName);
          if (stockItem) {
            const costPerUnit = stockItem.costPerUnit || stockItem.cost_per_unit || 0;
            const itemsPerSachet = stockItem.items_per_sachet || 1;
            const unitCost = p.sellType === 'sachet' ? costPerUnit * itemsPerSachet : costPerUnit;
            totalCOGS += (p.quantity || 0) * unitCost;
          }
        }
      }

      const netProfit = totalRevenue - totalCOGS - totalExpenses;

      // Send notifications to all shared users
      const notificationPromises = accessList.map((access) =>
        supabase.from("notifications").insert({
          user_id: access.user_id,
          type: "report_shared",
          title: "Store Report Shared",
          message: `Revenue: UGX ${totalRevenue.toLocaleString()}, COGS: UGX ${totalCOGS.toLocaleString()}, Expenses: UGX ${totalExpenses.toLocaleString()}, Net Profit: UGX ${netProfit.toLocaleString()}`,
          data: {
            from_user_id: user.id,
            store_id: currentStoreId,
            total_revenue: totalRevenue,
            total_cogs: totalCOGS,
            total_expenses: totalExpenses,
            net_profit: netProfit,
          },
        })
      );

      await Promise.all(notificationPromises);
      setSharedCount(accessList.length);

      toast({
        title: "Success",
        description: `Reports shared with ${accessList.length} user${accessList.length !== 1 ? 's' : ''}`,
      });
    } catch (error) {
      console.error("Error sharing reports:", error);
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message || "Failed to share reports",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleAutoShare = async (enabled: boolean) => {
    setAutoShareReports(enabled);
    if (enabled) {
      await calculateAndShareReport();
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Report Sharing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Share Toggle */}
        <div className="flex items-center justify-between pb-4 border-b">
          <div className="space-y-1 flex-1">
            <Label htmlFor="auto-share" className="text-base font-medium cursor-pointer">
              Auto-Share Reports
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatically share reports with linked users
            </p>
          </div>
          <Switch
            id="auto-share"
            checked={autoShareReports}
            onCheckedChange={handleAutoShare}
            disabled={isSharing}
          />
        </div>

        {/* Share Now Button */}
        <div className="space-y-3">
          <Button
            onClick={calculateAndShareReport}
            disabled={isSharing}
            className="w-full"
            size="lg"
          >
            {isSharing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 mr-2" />
                Share Report Now
              </>
            )}
          </Button>

          {sharedCount > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="outline" className="bg-success/10 border-success/20 text-success">
                <Users className="h-3 w-3 mr-1" />
                Shared with {sharedCount} user{sharedCount !== 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportShareSection;
