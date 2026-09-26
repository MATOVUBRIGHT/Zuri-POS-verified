import { useState, useEffect, useRef, useCallback } from "react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Store as StoreIcon, Plus, Trash2, Building2, Link2, Loader2, RefreshCcw, Lock, LockOpen, Eye,   EyeOff, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import Reports from "./Reports";

import { Store, SaleItem, StockItem, ExpenseItem, Product } from "@/types";

interface StoresProps {
  currentStoreId: string | null;
  onStoreChange: (storeId: string) => void;
  branchRestricted?: boolean;
}

const StoresContent = ({ currentStoreId, onStoreChange }: StoresProps) => {
  const { toast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoading(loading, 350);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStorePassword, setNewStorePassword] = useState("");
  const [showNewStorePassword, setShowNewStorePassword] = useState(false);
  const [linkStoreId, setLinkStoreId] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [linkRequiresPassword, setLinkRequiresPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Password management per store
  const [pwDialogStoreId, setPwDialogStoreId] = useState<string | null>(null);
  const [pwDialogValue, setPwDialogValue] = useState("");
  const [pwDialogConfirm, setPwDialogConfirm] = useState("");
  const [showPwDialogValue, setShowPwDialogValue] = useState(false);
  const [showPwDialogConfirm, setShowPwDialogConfirm] = useState(false);
  const [pwDialogError, setPwDialogError] = useState("");
  const [showPwDialog, setShowPwDialog] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [storeHasPassword, setStoreHasPassword] = useState<Record<string, boolean>>({});
  // Open-store password prompt
  const [openStoreTarget, setOpenStoreTarget] = useState<Store | null>(null);
  const [openStorePw, setOpenStorePw] = useState("");
  const [showOpenStorePw, setShowOpenStorePw] = useState(false);
  const [openStorePwError, setOpenStorePwError] = useState("");
  const [verifyingPw, setVerifyingPw] = useState(false);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStores = async () => {
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

      setStores(ownedStores || []);

      // Track which stores have a password set
      const pwMap: Record<string, boolean> = {};
      (ownedStores || []).forEach((s: any) => {
        pwMap[s.id] = !!s.access_password_hash;
      });
      setStoreHasPassword(pwMap);
      
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
  };

  const fetchLinkedStores = async () => {
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
              stockData: (inventoryRes.data || []).map((item) => ({
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
                barcode_type: (item as any).barcode_type,
                barcode_mode: (item as any).barcode_mode,
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
  };

  const createStore = async () => {
    if (!newStoreName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a store name" });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("stores")
        .insert({ store_name: newStoreName.trim(), user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      // If a password was provided, set it via edge function
      if (newStorePassword.trim() && data) {
        await supabase.functions.invoke('set-store-password', {
          body: { store_id: data.id, password: newStorePassword.trim() },
        });
      }

      toast({ title: "Store created", description: `${newStoreName} has been created successfully.`, variant: "success" });
      setNewStoreName("");
      setNewStorePassword("");
      setIsCreateDialogOpen(false);
      fetchStores();
      if (data) onStoreChange(data.id);
    } catch (error: unknown) {
      const err = error as Error;
      toast({ variant: "destructive", title: "Error creating store", description: err.message });
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

  // Link store by store ID - password required if store has one set
  const handleLinkStore = async () => {
    if (!linkStoreId.trim()) {
      toast({ title: "Error", description: "Please enter a store ID", variant: "destructive" });
      return;
    }

    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke('link-store', {
        body: { store_id: linkStoreId.trim(), password: linkPassword.trim() || undefined },
      });

      if (error) throw new Error("Failed to link store. Please try again.");

      if (data?.error) {
        // Store requires a password — show the password field
        if (data.requires_password) {
          setLinkRequiresPassword(true);
          toast({ title: "Password required", description: data.error, variant: "destructive" });
          setLinking(false);
          return;
        }
        throw new Error(data.error);
      }

      toast({ title: "Success", description: `Linked to "${data.store_name}". View reports below.`, variant: "success" });
      if (data?.id) removeUnlinkedStoreId(data.id);
      setLinkStoreId("");
      setLinkPassword("");
      setLinkRequiresPassword(false);
      setIsLinkDialogOpen(false);
      fetchLinkedStores();
    } catch (error: unknown) {
      const err = error as Error;
      toast({ title: "Error", description: err.message || "Failed to link store", variant: "destructive" });
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

  const handleStoreCardClick = (store: Store) => {
    // Always prompt when switching to a different store
    if (store.id !== currentStoreId) {
      setOpenStoreTarget(store);
      setOpenStorePw("");
      setOpenStorePwError("");
      setShowOpenStorePw(false);
    } else if (storeHasPassword[store.id]) {
      // Re-clicking the active store — still prompt if it has a password
      setOpenStoreTarget(store);
      setOpenStorePw("");
      setOpenStorePwError("");
      setShowOpenStorePw(false);
    } else {
      toast({ title: `${store.store_name} is already active` });
    }
  };

  const verifyAndOpenStore = async () => {
    if (!openStoreTarget) return;
    setVerifyingPw(true);
    setOpenStorePwError("");
    try {
      // If store has a password set, verify it
      if (storeHasPassword[openStoreTarget.id]) {
        if (!openStorePw.trim()) {
          setOpenStorePwError("Please enter the password");
          setVerifyingPw(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke('verify-store-password', {
          body: { store_id: openStoreTarget.id, password: openStorePw.trim() },
        });
        if (error || data?.error) {
          setOpenStorePwError(data?.error || "Incorrect password");
          setVerifyingPw(false);
          return;
        }
      }
      onStoreChange(openStoreTarget.id);
      toast({ title: `${openStoreTarget.store_name} is now active` });
      setOpenStoreTarget(null);
      setOpenStorePw("");
    } catch {
      setOpenStorePwError("Incorrect password");
    } finally {
      setVerifyingPw(false);
    }
  };

  const saveStorePassword = async () => {
    if (!pwDialogStoreId) return;
    // Validate
    if (pwDialogValue.trim()) {
      if (pwDialogValue.trim().length < 4) {
        setPwDialogError("Password must be at least 4 characters");
        return;
      }
      if (pwDialogValue !== pwDialogConfirm) {
        setPwDialogError("Passwords do not match");
        return;
      }
    }
    setPwDialogError("");
    setSavingPw(true);
    try {
      const { data, error } = await supabase.functions.invoke('set-store-password', {
        body: { store_id: pwDialogStoreId, password: pwDialogValue.trim() || null },
      });
      if (error || data?.error) throw new Error(data?.error || "Failed to save password");
      setStoreHasPassword(prev => ({ ...prev, [pwDialogStoreId]: data.has_password }));
      toast({
        title: data.has_password ? "Password set" : "Password removed",
        description: data.has_password
          ? "Branches must enter this password to link to your store."
          : "Anyone with the store ID can now link without a password.",
      });
      setPwDialogValue("");
      setPwDialogConfirm("");
      setPwDialogError("");
      setShowPwDialog(false);
      setPwDialogStoreId(null);
    } catch (e: any) {
      setPwDialogError(e.message || "Failed to save password");
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) {
    return <PageLoader text="Loading stores..." />;
  }

  if (showLoader) {
    return <PageLoader text="Loading stores..." />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col space-y-6">
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
                <div className="space-y-2">
                  <Label htmlFor="storePassword" className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Access Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="storePassword"
                      type={showNewStorePassword ? "text" : "password"}
                      placeholder="Set a password for this store"
                      value={newStorePassword}
                      onChange={(e) => setNewStorePassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewStorePassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewStorePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Required each time you switch to this store.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={createStore} disabled={creating}>
                  {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Store"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isLinkDialogOpen} onOpenChange={(open) => { setIsLinkDialogOpen(open); if (!open) { setLinkRequiresPassword(false); setLinkPassword(""); setLinkStoreId(""); } }}>
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
                    onChange={(e) => { setLinkStoreId(e.target.value); setLinkRequiresPassword(false); }}
                  />
                  <p className="text-xs text-muted-foreground">
                    The store owner can find their Store ID in the store card below.
                  </p>
                </div>
                {linkRequiresPassword && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <Label htmlFor="linkPassword" className="flex items-center gap-1.5 text-amber-700">
                      <Lock className="h-3.5 w-3.5" />
                      Store Password Required
                    </Label>
                    <div className="relative">
                      <Input
                        id="linkPassword"
                        type={showLinkPassword ? "text" : "password"}
                        placeholder="Enter store access password"
                        value={linkPassword}
                        onChange={(e) => setLinkPassword(e.target.value)}
                        className="pr-10 border-amber-300 focus:ring-amber-400"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowLinkPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showLinkPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-amber-700">This store requires a password. Ask the store owner.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleLinkStore} disabled={linking}>
                  {linking ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Linking...</> : "Link Store"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

            <div className="flex flex-col items-center justify-center space-y-6 py-12">
        <div className="bg-primary/5 p-6 rounded-full">
          <StoreIcon className="h-16 w-16 text-primary opacity-80" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h3 className="text-2xl font-semibold">Branch Communication</h3>
          <p className="text-muted-foreground text-sm">
            Link with other branches to exchange data, or communicate with them securely via Store Chat.
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mt-8">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => {
            navigator.clipboard.writeText(currentStoreId || "");
            toast({ title: "Copied!", description: "Branch ID copied to clipboard. Share this with other branches." });
          }}>
            <CardContent className="flex flex-col items-center justify-center p-6 space-y-4 h-full">
              <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Copy My Branch ID</p>
                <p className="text-xs text-muted-foreground mt-1">Share with others to let them link</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => setIsLinkDialogOpen(true)}>
            <CardContent className="flex flex-col items-center justify-center p-6 space-y-4 h-full">
              <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                <Link2 className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Link New Branch</p>
                <p className="text-xs text-muted-foreground mt-1">Enter a branch ID to connect</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors flex items-center justify-center group overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 backdrop-blur-[1px]">
               <p className="text-sm font-semibold pointer-events-none text-center px-2">Open Chat from Top Bar</p>
            </div>
            <div className="flex flex-col items-center justify-center p-6 space-y-4 w-full h-full relative">
              <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                <StoreIcon className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Store Chat</p>
                <p className="text-xs text-muted-foreground mt-1">Exchange messages & data</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
{/* Open Store Password Prompt */}
      <Dialog open={!!openStoreTarget} onOpenChange={(open) => { if (!open) { setOpenStoreTarget(null); setOpenStorePw(""); setOpenStorePwError(""); setShowOpenStorePw(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Switch Store
            </DialogTitle>
            <DialogDescription>
              {storeHasPassword[openStoreTarget?.id || ""]
                ? <>Enter the password for <span className="font-semibold">{openStoreTarget?.store_name}</span> to switch.</>
                : <>Switching to <span className="font-semibold">{openStoreTarget?.store_name}</span>. Click Open Store to confirm.</>
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showOpenStorePw ? "text" : "password"}
                  placeholder={storeHasPassword[openStoreTarget?.id || ""] ? "Store access password" : "No password set — click Open Store"}
                  value={openStorePw}
                  onChange={(e) => { setOpenStorePw(e.target.value); setOpenStorePwError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && verifyAndOpenStore()}
                  autoFocus
                  disabled={!storeHasPassword[openStoreTarget?.id || ""]}
                  className={`pr-10 ${openStorePwError ? "border-destructive" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenStorePw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOpenStorePw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {openStorePwError && <p className="text-xs text-destructive">{openStorePwError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenStoreTarget(null)}>Cancel</Button>
            <Button onClick={verifyAndOpenStore} disabled={verifyingPw}>
              {verifyingPw ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : "Open Store"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Store Password Management Dialog */}
      <Dialog open={showPwDialog} onOpenChange={(open) => { setShowPwDialog(open); if (!open) { setPwDialogValue(""); setPwDialogConfirm(""); setPwDialogError(""); setShowPwDialogValue(false); setShowPwDialogConfirm(false); setPwDialogStoreId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {storeHasPassword[pwDialogStoreId || ""] ? "Change / Remove Password" : "Set Access Password"}
            </DialogTitle>
            <DialogDescription>
              Branches must enter this password to link to your store. Leave blank to remove the password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showPwDialogValue ? "text" : "password"}
                  placeholder={storeHasPassword[pwDialogStoreId || ""] ? "Leave blank to remove password" : "Enter a password"}
                  value={pwDialogValue}
                  onChange={(e) => { setPwDialogValue(e.target.value); setPwDialogError(""); }}
                  autoFocus
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowPwDialogValue(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPwDialogValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {pwDialogValue.trim() && (
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <div className="relative">
                  <Input
                    type={showPwDialogConfirm ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={pwDialogConfirm}
                    onChange={(e) => { setPwDialogConfirm(e.target.value); setPwDialogError(""); }}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPwDialogConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwDialogConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            {pwDialogError && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{pwDialogError}</p>
            )}
            {storeHasPassword[pwDialogStoreId || ""] && !pwDialogValue && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This store currently has a password. Saving blank will remove it.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPwDialog(false)}>Cancel</Button>
            <Button onClick={saveStorePassword} disabled={savingPw}>
              {savingPw ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const BranchStoreEntry = ({ currentStoreId }: Pick<StoresProps, "currentStoreId">) => {
  const { toast } = useToast();
  const [store, setStore] = useState<Pick<Store, "store_name" | "address" | "phone" | "email"> | null>(null);
  const [assigned, setAssigned] = useState<Array<{ id: string; store_name: string }>>([]);
  useEffect(() => {
    if (!currentStoreId) return;
    void supabase.from("stores").select("store_name, address, phone, email").eq("id", currentStoreId).maybeSingle()
      .then(({ data }) => setStore(data as unknown as typeof store));
  }, [currentStoreId]);
  useEffect(() => {
    const loadAssigned = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: owned }, { data: access }] = await Promise.all([
        supabase.from("stores").select("id, store_name").eq("user_id", user.id),
        supabase.from("store_access").select("stores(id, store_name)").eq("user_id", user.id),
      ]);
      const rows = [...(owned || []), ...(access || []).map((row: any) => row.stores).filter(Boolean)] as Array<{ id: string; store_name: string }>;
      setAssigned(Array.from(new Map(rows.map((item) => [item.id, item])).values()));
    };
    void loadAssigned();
  }, []);
  if (!currentStoreId) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-950">Your branch is still loading. Return to the POS and try again.</div>;
  return <section className="mx-auto max-w-3xl space-y-5"><header><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Selected branch</p><h2 className="mt-1 text-3xl font-bold">{store?.store_name || "Store"}</h2><p className="mt-2 text-sm text-muted-foreground">This is the branch linked to your POS session. Stock alerts, notifications, and operational data stay within this branch.</p></header><Card className="border-primary/20"><CardHeader><CardTitle className="flex items-center gap-2"><StoreIcon className="h-5 w-5 text-primary" />Branch details</CardTitle><CardDescription>Share this ID only with an authorized executive when they need to identify this branch.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-md bg-muted p-3"><p className="text-xs font-medium text-muted-foreground">Store ID</p><div className="mt-1 flex items-center justify-between gap-3"><code className="min-w-0 break-all text-sm font-semibold">{currentStoreId}</code><Button variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(currentStoreId); toast({ title: "Store ID copied" }); }}>Copy</Button></div></div>{store?.address && <p className="text-sm"><span className="font-medium">Address:</span> {store.address}</p>}{store?.phone && <p className="text-sm"><span className="font-medium">Phone:</span> {store.phone}</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Assigned branch directory</CardTitle><CardDescription>These are the branches this account can identify or communicate with. This directory does not switch the active POS branch.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{assigned.length ? assigned.map((branch) => <div key={branch.id} className={`rounded-lg border p-3 ${branch.id === currentStoreId ? "border-primary/40 bg-primary/5" : "bg-muted/30"}`}><div className="flex items-center justify-between gap-2"><p className="font-medium">{branch.store_name}</p><Badge variant={branch.id === currentStoreId ? "default" : "secondary"}>{branch.id === currentStoreId ? "Selected" : "Assigned"}</Badge></div><code className="mt-2 block break-all text-xs text-muted-foreground">{branch.id}</code></div>) : <p className="text-sm text-muted-foreground">No additional assigned branches are available.</p>}</CardContent></Card><Card className="border-dashed"><CardContent className="p-5 text-sm text-muted-foreground">Branch switching, linking, and account configuration are managed by your executive. This page is read-only so this login cannot move to another store.</CardContent></Card></section>;
};

const Stores = ({ branchRestricted = false, ...props }: StoresProps) => {
  if (branchRestricted) {
    return <BranchStoreEntry currentStoreId={props.currentStoreId} />;
  }
  return <StoresContent {...props} />;
};

export default Stores;
