import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, Send, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

import { StockTransfer as StockTransferType, StockItem, PairedStore } from "@/types";

interface StockTransferProps {
  currentStoreId: string;
}

const StockTransfer = ({ currentStoreId }: StockTransferProps) => {
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<StockTransferType[]>([]);
  const [pairedStores, setPairedStores] = useState<PairedStore[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    initialize();
  }, [currentStoreId]);

  const initialize = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);
      await Promise.all([
        fetchPairedStores(user.id),
        fetchStockItems(),
        fetchTransfers(user.id),
      ]);
      setupRealtimeSubscription(user.id);
    } catch (error: unknown) {
      console.error("Error initializing:", error);
    }
  };

  const fetchPairedStores = async (userId: string) => {
    try {
      const { data: accessData, error: accessError } = await supabase
        .from("store_access")
        .select("store_id")
        .eq("user_id", userId);

      if (accessError) throw accessError;
      if (!accessData || accessData.length === 0) return;

      const storeIds = accessData.map(a => a.store_id);
      const { data: storesData, error: storesError } = await supabase
        .from("stores")
        .select("id, store_name, user_id")
        .in("id", storeIds);

      if (storesError) throw storesError;

      setPairedStores(
        storesData?.map(s => ({
          id: s.id,
          store_name: s.store_name,
          owner_id: s.user_id,
        })) || []
      );
    } catch (error: unknown) {
      console.error("Error fetching paired stores:", error);
    }
  };

  const fetchStockItems = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, product_name, quantity, cost_per_unit, category, total_value, date_of_purchase, min_stock_level, reorder_quantity")
        .eq("store_id", currentStoreId)
        .gt("quantity", 0);

      if (error) throw error;
      setStockItems((data || []).map(item => ({
        id: item.id,
        productName: item.product_name,
        quantity: item.quantity,
        costPerUnit: item.cost_per_unit,
        category: item.category,
        totalValue: item.total_value,
        dateOfPurchase: item.date_of_purchase,
        min_stock_level: item.min_stock_level,
        reorder_quantity: item.reorder_quantity
      })) as StockItem[]);
    } catch (error: unknown) {
      console.error("Error fetching stock:", error);
    }
  };

  const fetchTransfers = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("*")
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTransfers(data as unknown as StockTransferType[]);
    } catch (error: unknown) {
      console.error("Error fetching transfers:", error);
    }
  };

  const setupRealtimeSubscription = (userId: string) => {
    const channel = supabase
      .channel("stock_transfers")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_transfers",
        },
        () => {
          fetchTransfers(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendTransfer = async () => {
    if (!selectedStore || !selectedProduct || !quantity) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please fill all fields",
      });
      return;
    }

    const stockItem = stockItems.find(s => s.productName === selectedProduct);
    if (!stockItem) return;

    const transferQty = parseInt(quantity);
    if (transferQty > stockItem.quantity) {
      toast({
        variant: "destructive",
        title: "Insufficient stock",
        description: `Only ${stockItem.quantity} units available`,
      });
      return;
    }

    try {
      const store = pairedStores.find(s => s.id === selectedStore);
      if (!store) return;

      const { error } = await supabase.from("stock_transfers").insert({
        from_store_id: currentStoreId,
        to_store_id: selectedStore,
        from_user_id: currentUserId,
        to_user_id: store.owner_id,
        product_name: selectedProduct,
        quantity: transferQty,
        cost_per_unit: stockItem.cost_per_unit,
        status: "pending",
      });

      if (error) throw error;

      // Send notification
      await supabase.from("notifications").insert({
        user_id: store.owner_id,
        type: "stock_transfer",
        title: "New Stock Transfer Request",
        message: `You have a pending stock transfer: ${transferQty} units of ${selectedProduct}`,
        data: { transfer_id: "", store_id: currentStoreId },
      });

      toast({
        title: "Transfer sent",
        description: "Stock transfer request sent successfully",
      });

      setIsDialogOpen(false);
      setSelectedStore("");
      setSelectedProduct("");
      setQuantity("");
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error sending transfer",
        description: err.message,
      });
    }
  };

  const approveTransfer = async (transfer: StockTransferType) => {
    try {
      // Update transfer status
      const { error: updateError } = await supabase
        .from("stock_transfers")
        .update({ status: "approved" })
        .eq("id", transfer.id);

      if (updateError) throw updateError;

      // Add to receiver's inventory
      const { error: inventoryError } = await supabase
        .from("inventory")
        .insert({
          store_id: transfer.to_store_id,
          user_id: currentUserId,
          product_name: transfer.product_name,
          quantity: transfer.quantity,
          cost_per_unit: transfer.cost_per_unit,
          total_value: transfer.quantity * transfer.cost_per_unit,
          category: "Transfer",
          date_of_purchase: new Date().toISOString(),
        });

      if (inventoryError) throw inventoryError;

      // Remove from sender's inventory
      const { data: senderStock } = await supabase
        .from("inventory")
        .select("*")
        .eq("store_id", transfer.from_store_id)
        .eq("product_name", transfer.product_name)
        .single();

      if (senderStock) {
        const newQty = senderStock.quantity - transfer.quantity;
        if (newQty > 0) {
          await supabase
            .from("inventory")
            .update({ quantity: newQty })
            .eq("id", senderStock.id);
        } else {
          await supabase
            .from("inventory")
            .delete()
            .eq("id", senderStock.id);
        }
      }

      // Notify sender
      await supabase.from("notifications").insert({
        user_id: transfer.from_user_id,
        type: "stock_transfer_approved",
        title: "Stock Transfer Approved",
        message: `Your transfer of ${transfer.quantity} units of ${transfer.product_name} has been approved`,
      });

      toast({
        title: "Transfer approved",
        description: "Stock has been added to your inventory",
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error approving transfer",
        description: err.message,
      });
    }
  };

  const rejectTransfer = async (transfer: StockTransferType) => {
    try {
      const { error } = await supabase
        .from("stock_transfers")
        .update({ status: "rejected" })
        .eq("id", transfer.id);

      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: transfer.from_user_id,
        type: "stock_transfer_rejected",
        title: "Stock Transfer Rejected",
        message: `Your transfer of ${transfer.quantity} units of ${transfer.product_name} was rejected`,
      });

      toast({
        title: "Transfer rejected",
        description: "The transfer has been declined",
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error rejecting transfer",
        description: err.message,
      });
    }
  };

  const pendingReceived = transfers.filter(
    t => t.to_user_id === currentUserId && t.status === "pending"
  );

  const pendingSent = transfers.filter(
    t => t.from_user_id === currentUserId && t.status === "pending"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Stock Transfers</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Send className="h-4 w-4" />
              Send Stock
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Stock Transfer</DialogTitle>
              <DialogDescription>
                Share stock with a paired store (pending approval)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Store</Label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose paired store" />
                  </SelectTrigger>
                  <SelectContent>
                    {pairedStores.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Select Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose product" />
                  </SelectTrigger>
                  <SelectContent>
                    {stockItems.map(item => (
                      <SelectItem key={item.product_name} value={item.product_name}>
                        {item.product_name} ({item.quantity} available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={sendTransfer}>Send Transfer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pendingReceived.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-3">
                {pendingReceived.map(transfer => (
                  <div
                    key={transfer.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{transfer.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Qty: {transfer.quantity}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => approveTransfer(transfer)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rejectTransfer(transfer)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {pendingSent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sent Transfers (Pending)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingSent.map(transfer => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{transfer.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Qty: {transfer.quantity}
                    </p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StockTransfer;