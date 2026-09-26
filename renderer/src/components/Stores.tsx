import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Store as StoreIcon, Plus, Trash2, Building2, Link2, Loader2, RefreshCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import Reports from "./Reports";

import { Store, SaleItem, StockItem, ExpenseItem, Product } from "@/types";

interface StoresProps {
  currentStoreId: string | null;
  onStoreChange: (storeId: string) => void;
}

const Stores = ({ currentStoreId, onStoreChange }: StoresProps) => {
  const { toast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState("");
  const [linkStoreId, setLinkStoreId] = useState("");
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [linkedStores, setLinkedStores] = useState<{
    storeId: string;
    storeName: string;
    stockData: StockItem[];
    salesData: SaleItem[];
    expensesData: ExpenseItem[];
  }[]>([]);
  const hasFetched = useRef(false);

  // Persistently remember stores the user chose to unlink to avoid reappearing due to eventual consistency
  const getUnlinkedStoreIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem("unlinked_store_ids");
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  };

  const addUnlinkedStoreId = (id: string) => {
    const set = getUnlinkedStoreIds();
    set.add(id);
    localStorage.setItem("unlinked_store_ids", JSON.stringify(Array.from(set)));
  };

  const removeUnlinkedStoreId = (id: string) => {
    const set = getUnlinkedStoreIds();
    set.delete(id);
    localStorage.setItem("unlinked_store_ids", JSON.stringify(Array.from(set)));
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          if (error.message.includes("refresh_token_not_found") || error.message.includes("Refresh Token Not Found")) {
            await supabase.auth.signOut();
          }
          return;
        }
        setCurrentUserId(user?.id || null);
      } catch (err) {
        console.error("Error fetching user in Stores:", err);
      }
    };
    fetchUser();
  }, []);

  const fetchStores = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch only OWNED stores (not linked ones)
      const { data: ownedStores, error: ownedError } = await supabase
        .from("stores")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (ownedError) throw ownedError;

      const formattedStores = (ownedStores || []).map((s: any) => ({
        ...s,
        last_closing_balance: s.last_closing_balance ?? undefined,
      }));

      setStores(formattedStores);

      
      // If no current store and stores exist, set the first one
      if (!currentStoreId && ownedStores && ownedStores.length > 0) {
        onStoreChange(ownedStores[0].id);
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error loading stores",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, onStoreChange, toast]);

  const fetchLinkedStores = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all stores the user has access to (but doesn't own)
      const { data: accessData, error: accessError } = await supabase
        .from("store_access")
        .select("store_id, stores(id, store_name, user_id)")
        .eq("user_id", user.id);

      if (accessError) throw accessError;

      if (!accessData || accessData.length === 0) {
        setLinkedStores([]);
        return;
      }

      // Fetch data for each linked store - each store's data stays separate
      const linkedStoresData = await Promise.all(
        accessData
          .filter(access => access.stores && access.stores.user_id !== user.id)
          .map(async (access) => {
            const store = access.stores;
            if (!store) return null;

            const [inventoryRes, salesRes, expensesRes] = await Promise.all([
              supabase.from("inventory").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
              supabase.from("sales").select("*").eq("store_id", store.id).order("date_of_sale", { ascending: false }),
              supabase.from("expenses").select("*").eq("store_id", store.id).order("date_of_expense", { ascending: false })
            ]);

            return {
              storeId: store.id,
              storeName: store.store_name,
              stockData: (inventoryRes.data || []).map((item: any) => ({
                id: item.id,
                productName: item.product_name,
                category: item.category,
                quantity: item.quantity,
                costPerUnit: item.cost_per_unit,
                totalValue: item.total_value,
                dateOfPurchase: item.date_of_purchase,
                sachets_count: item.sachets_count || 0,
                loose_items: item.loose_items || 0,
                opened_sachets: item.opened_sachets || 0,
                items_per_sachet: item.items_per_sachet || 1,
                retail_price: item.retail_price || 0,
                wholesale_price: item.wholesale_price || 0,
                // Barcode fields from inventory
                barcode: item.barcode,
                barcode_type: item.barcode_type,
                barcode_mode: item.barcode_mode,
                product_name: item.product_name,
                store_id: item.store_id,
                min_stock_level: item.min_stock_level || 5,
                reorder_quantity: item.reorder_quantity || 10,
              })) as StockItem[],

              salesData: (salesRes.data || []).map((sale) => ({
                id: sale.id,
                customerName: sale.customer_name,
                dateOfSale: sale.date_of_sale,
                totalAmount: sale.total_amount,
                paidInCash: sale.paid_in_cash || false,
                products: sale.products as unknown as Product[],
              })) as SaleItem[],
              expensesData: (expensesRes.data || []).map((exp) => ({
                id: exp.id,
                description: exp.description,
                amount: exp.amount,
                category: exp.category,
                date: exp.date_of_expense,
                paymentMethod: exp.payment_method,
              })) as ExpenseItem[],
            };
          })
      );

      const filteredLinkedStores = linkedStoresData.filter((s): s is NonNullable<typeof s> => s !== null);
      // Filter out any stores the user explicitly unlinked (client-side guard)
      const unlinkedIds = getUnlinkedStoreIds();
      const finalLinkedStores = filteredLinkedStores.filter((s) => !unlinkedIds.has(s.storeId));
      setLinkedStores(finalLinkedStores);
    } catch (error) {
      console.error("Error fetching linked stores:", error);
    }
  }, [toast]);

  useEffect(() => {
    // Ref guard prevents double fetch in StrictMode
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetchStores();
    fetchLinkedStores();
    
    // Subscribe to real-time changes in store_access
    const channel = supabase
      .channel('store-access-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_access'
        },
        () => {
          // Debounced refetch to prevent rapid repeated calls
          setTimeout(() => {
            fetchStores();
            fetchLinkedStores();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStores, fetchLinkedStores]);


  const createStore = async () => {
    if (!newStoreName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a store name",
      });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("stores")
        .insert({
          store_name: newStoreName.trim(),
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Store created",
        description: `${newStoreName} has been created successfully.`,
        variant: "success",
      });

      setNewStoreName("");
      setIsCreateDialogOpen(false);
      fetchStores();
      
      // Switch to the new store
      if (data) {
        onStoreChange(data.id);
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error creating store",
        description: err.message,
      });
    } finally {
      setCreating(false);
    }
  };

  const deleteStore = async (storeId: string) => {
    if (stores.length === 1) {
      toast({
        variant: "destructive",
        title: "Cannot delete",
        description: "You must have at least one store.",
      });
      return;
    }

    if (!confirm("Are you sure you want to delete this store? All associated data will be permanently deleted.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("stores")
        .delete()
        .eq("id", storeId);

      if (error) throw error;

      const updatedStores = stores.filter(s => s.id !== storeId);
      setStores(updatedStores);

      // If deleted current store, switch to first available
      if (storeId === currentStoreId && updatedStores.length > 0) {
        onStoreChange(updatedStores[0].id);
      }

      toast({
        title: "Store deleted",
        description: "The store and all its data have been deleted.",
        variant: "success",
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error deleting store",
        description: err.message,
      });
    }
  };

  // Link store by store ID - no login required
  const handleLinkStore = async () => {
    if (!linkStoreId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a store ID",
        variant: "destructive",
      });
      return;
    }

    setLinking(true);
    try {
      // Use secure edge function for store linking
      const { data, error } = await supabase.functions.invoke('link-store', {
        body: { store_id: linkStoreId.trim() },
      });

      if (error) {
        throw new Error("Failed to link store. Please try again.");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Success",
        description: `Linked to "${data.store_name}". View reports below.`,
        variant: "success",
      });

      // Allow re-linking previously unlinked stores
      if (data?.id) removeUnlinkedStoreId(data.id);

      setLinkStoreId("");
      setIsLinkDialogOpen(false);
      fetchLinkedStores();

    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error linking store:", error);
      toast({
        title: "Error",
        description: err.message || "Failed to link store",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  const unlinkStore = async (storeId: string) => {
    if (!confirm("Are you sure you want to unlink this store? You will lose access to its reports.")) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("store_access")
        .delete()
        .eq("store_id", storeId)
        .eq("user_id", user.id);

      if (error) throw error;

      // Persist this unlink to prevent flashbacks if realtime/events lag
      addUnlinkedStoreId(storeId);
      setLinkedStores(linkedStores.filter(s => s.storeId !== storeId));

      toast({
        title: "Store unlinked",
        description: "You no longer have access to this store's reports.",
        variant: "success",
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error unlinking store",
        description: err.message,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Store Management</h2>
          <p className="text-muted-foreground mt-1">Manage your stores and view linked store reports</p>
        </div>
        <div className="flex gap-2">
          {/* Create Store Dialog */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Store
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Store</DialogTitle>
                <DialogDescription>
                  Create a new store to manage inventory and sales
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="storeName">Store Name</Label>
                  <Input
                    id="storeName"
                    placeholder="My Store"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createStore} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Store"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Link Store Dialog */}
          <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Link2 className="h-4 w-4" />
                Link Store
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link Another Store</DialogTitle>
                <DialogDescription>
                  Enter the store ID to view their reports (read-only access). Ask the store owner for their store ID.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="linkStoreId">Store ID</Label>
                  <Input
                    id="linkStoreId"
                    placeholder="e.g., abc123-def456-..."
                    value={linkStoreId}
                    onChange={(e) => setLinkStoreId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The store owner can find their Store ID in the store card below.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleLinkStore} disabled={linking}>
                  {linking ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    "Link Store"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* My Owned Stores */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">My Stores</h3>
        {stores.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Stores Yet</h3>
              <p className="text-muted-foreground mb-4">Create your first store to get started</p>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Store
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <Card 
                key={store.id} 
                className={`relative cursor-pointer transition-all hover:shadow-lg ${
                  currentStoreId === store.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onStoreChange(store.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <StoreIcon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{store.store_name}</CardTitle>
                        <CardDescription>
                          Created {new Date(store.created_at || "").toLocaleDateString()}
                        </CardDescription>
                      </div>
                    </div>
                    {currentStoreId === store.id && (
                      <Badge variant="default" className="text-xs">Active</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                      <span className="font-medium">Store ID:</span> {store.id}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStore(store.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Linked Store Reports - Each store displayed separately */}
      {linkedStores.length > 0 && (
        <div className="space-y-6 mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Linked Store Reports (View Only)
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRefreshing(true);
                fetchLinkedStores().finally(() => setRefreshing(false));
              }}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>

          {linkedStores.map((linkedStore) => (
            <Card key={linkedStore.storeId} className="border-2 border-dashed">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg">
                      <StoreIcon className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{linkedStore.storeName}</CardTitle>
                      <CardDescription>Linked store - Read only access</CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => unlinkStore(linkedStore.storeId)}
                  >
                    Unlink
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Reports 
                  stockData={linkedStore.stockData}
                  salesData={linkedStore.salesData}
                  expensesData={linkedStore.expensesData}
                  currentStoreId={linkedStore.storeId}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Stores;
