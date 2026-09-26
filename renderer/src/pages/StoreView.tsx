import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft, Link2, Loader2 } from "lucide-react";
import Reports from "@/components/Reports";
import StockTransfer from "@/components/StockTransfer";
import { useOptimizedStoresData } from "@/hooks/useOptimizedData";
import { useShift } from "@/providers/ShiftProvider";
import { Store, StockItem, SaleItem, ExpenseItem, Product } from "@/types";

const StoreView = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useShift();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkStoreId, setLinkStoreId] = useState("");
  const [linking, setLinking] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [linkedStoreIds, setLinkedStoreIds] = useState<string[]>([]);

  const fetchStore = useCallback(async () => {
    try {
      if (!user) {
        /* navigate removed */
        return;
      }

      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", storeId)
        .single();

      if (error) throw error;

      setStore(data);
      setIsOwner(data.user_id === user.id);
    } catch (error: unknown) {
      console.error("Error fetching store:", error);
      toast({
        title: "Error",
        description: "Failed to load store",
        variant: "destructive",
      });
      /* navigate removed */
    } finally {
      setLoading(false);
    }
  }, [storeId, navigate, toast, user]);

  useEffect(() => { fetchStore(); }, []);

  // Fetch linked stores access to aggregate data
  const fetchAccess = useCallback(async () => {
    if (!user) return;
    const { data: accessibleStores } = await supabase
      .from("store_access")
      .select("store_id")
      .eq("user_id", user.id);
    
    const ids = accessibleStores?.map(s => s.store_id) || [];
    setLinkedStoreIds(ids);
  }, [user]);

  useEffect(() => { fetchAccess(); }, []);

  const allStoreIds = useMemo(() => {
    if (!storeId) return linkedStoreIds;
    return Array.from(new Set([storeId, ...linkedStoreIds]));
  }, [storeId, linkedStoreIds]);

  // Optimized hook for fetching aggregated reporting data
  const { data: aggregatedData, isLoading: dataLoading } = useOptimizedStoresData(
    allStoreIds, 
    user?.id || null
  );

  // SECURE: Mapping logic with careful defaults for UI robustness
  const stockData = useMemo(() => (
    aggregatedData?.inventory.map((item: any) => ({
      id: item.id,
      productName: item.product_name || item.productName,
      category: item.category,
      quantity: item.quantity,
      costPerUnit: item.cost_per_unit,
      totalValue: item.total_value,
      dateOfPurchase: item.date_of_purchase,
      sachets_count: item.sachets_count,
      loose_items: item.loose_items,
      opened_sachets: item.opened_sachets,
      items_per_sachet: item.items_per_sachet,
      retail_price: item.retail_price,
      wholesale_price: item.wholesale_price,
      store_id: item.store_id,
      min_stock_level: item.min_stock_level,
      reorder_quantity: item.reorder_quantity,
    })) || []
  ), [aggregatedData]);

  const salesData = useMemo(() => (
    aggregatedData?.sales.map((sale: any) => ({
      id: sale.id,
      customerName: sale.customer_name,
      dateOfSale: sale.date_of_sale,
      totalAmount: sale.total_amount,
      paidInCash: sale.paid_in_cash || false,
      products: sale.products as unknown as Product[],
    })) || []
  ), [aggregatedData]);

  const expensesData = useMemo(() => (
    aggregatedData?.expenses.map((exp: any) => ({
      id: exp.id,
      description: exp.description,
      amount: exp.amount,
      category: exp.category,
      date: exp.date_of_expense,
      paymentMethod: exp.payment_method,
    })) || []
  ), [aggregatedData]);

  const handleLinkStore = async () => {
    const trimmedId = linkStoreId.trim();
    if (!trimmedId) {
      toast({ title: "Error", description: "Please enter a store ID", variant: "destructive" });
      return;
    }

    setLinking(true);
    try {
      if (!user) throw new Error("Not authenticated");

      const { data: storeResults, error: storeError } = await supabase
        .rpc("lookup_store_for_linking", { _store_id: trimmedId });

      const targetStore = storeResults?.[0];
      if (storeError || !targetStore) {
        toast({ title: "Error", description: "Invalid store ID or access denied", variant: "destructive" });
        return;
      }

      if (targetStore.id === storeId) {
        toast({ title: "Error", description: "Cannot link to the current store", variant: "destructive" });
        return;
      }

      const { data: existing } = await supabase
        .from("store_access")
        .select("id")
        .eq("store_id", trimmedId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        toast({ title: "Already Linked", description: "You already have access to this store" });
        return;
      }

      const { error: accessError } = await supabase.from("store_access").insert({
        store_id: trimmedId,
        user_id: user.id,
        role: "viewer",
        granted_by: user.id,
      });

      if (accessError) throw accessError;

      toast({ title: "Store Linked", description: `Successfully linked to "${targetStore.store_name}".` });
      setLinkStoreId("");
      setIsDialogOpen(false);
      fetchAccess(); 
    } catch (error: unknown) {
      toast({ title: "Error", description: (error as Error).message || "Failed to link store", variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  if (loading) return <LoadingSpinner size="xl" fullScreen />;

  if (!store) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground">
        <p className="text-xl font-medium">Store not found</p>
        <Button variant="link" onClick={() => navigate("/")}>Go back home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background/50 p-4 transition-all duration-300">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-2 border-b">
          <Button variant="ghost" onClick={() => navigate("/")} className="hover:bg-background shadow-sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="shadow-sm border-primary/20 hover:border-primary/40">
                <Link2 className="h-4 w-4 mr-2" />
                Link Another Store
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link Another Store</DialogTitle>
                <DialogDescription>
                  Enter the Store ID shared by the store owner to view their reports.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="storeId">Store ID</Label>
                  <Input
                    id="storeId"
                    type="text"
                    value={linkStoreId}
                    onChange={(e) => setLinkStoreId(e.target.value)}
                    placeholder="Enter store ID from owner"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                    Ask the store owner for their Store ID from Settings → Store Info
                  </p>
                </div>
                <Button 
                  onClick={handleLinkStore} 
                  disabled={linking}
                  className="w-full h-11"
                >
                  {linking ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    "Link Store"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-none shadow-sm overflow-hidden bg-white/80 backdrop-blur-sm">
          <div className="h-1 bg-primary/20 w-full" />
          <CardHeader className="flex flex-row items-baseline justify-between">
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight">{store.store_name}</CardTitle>
              <CardDescription className="text-base">
                {isOwner ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">Owner Account</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">Shared View Access</span>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <StockTransfer currentStoreId={storeId!} />
          </CardContent>
        </Card>

        {dataLoading ? (
          <div className="min-h-[400px] flex flex-col items-center justify-center space-y-4">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-muted-foreground animate-pulse">Gathering intelligence from connected stores...</p>
          </div>
        ) : (
          <Reports 
            stockData={stockData as unknown as StockItem[]}
            salesData={salesData as unknown as SaleItem[]}
            expensesData={expensesData as unknown as ExpenseItem[]}
            currentStoreId={storeId!}
          />
        )}
      </div>
    </div>
  );
};

export default StoreView;
