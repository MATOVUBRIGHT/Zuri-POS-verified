import React, { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Warehouse,
  FileText,
  Receipt,
  Menu,
  X,
  Settings as SettingsIcon,
  Store,
  RefreshCw,
  Wifi,
  WifiOff,
  Boxes,
  Users,
  LogOut,
  Clock,
  RotateCcw,
  Search,
  Shield,
  Truck,
  Barcode,
  HandCoins,
  Printer as PrinterIcon,
  Play,
  ArrowLeft
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import StoreChat from "@/components/StoreChat";
import UserProfile from "@/components/UserProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildProductSearchIndex, searchProductIndex } from "@/lib/productSearch";
import type { StockItem } from "@/types";
import { useInstantClearDeferredValue } from "@/hooks/useInstantClearDeferredValue";
import { usePrinter } from "@/providers/PrinterProvider";
import PrinterSetupDialog from "@/components/PrinterSetupDialog";
import { useShift } from "@/providers/ShiftProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { playCashRegister, playSuccess } from "@/lib/sounds";
import { dataSyncService } from "@/lib/data-sync";
import { useNavigate } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
  stockData: StockItem[];
  currentStoreId?: string | null;
  onRefresh?: () => void;
  onOpenCashManagement?: () => void;
  userRole?: string;
  allowedPages?: string[];
  dataLoading?: boolean;
  /** Desktop: go to previous in-app page */
  onNavigateBack?: () => void;
  canNavigateBack?: boolean;
}

const Layout = ({ children, currentPage, onPageChange, stockData, currentStoreId, onRefresh, onOpenCashManagement, userRole = "owner", allowedPages, dataLoading, onNavigateBack, canNavigateBack }: LayoutProps) => {
  const navigate = useNavigate();
  const isElectron = typeof window !== "undefined" && typeof (window as any).api?.closeApp === "function";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const deferredSearchQuery = useInstantClearDeferredValue(searchQuery);
  const { toast } = useToast();
  const { status: printerStatus, printer } = usePrinter();
  const { activeShift, startShift, endShift, user, store } = useShift();
  const [printerSetupOpen, setPrinterSetupOpen] = useState(false);
  const [startingCash, setStartingCash] = useState(store?.last_closing_balance?.toString() || "");
  const [showStartShiftModal, setShowStartShiftModal] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSync = async () => {
    if (!currentStoreId || !user?.id || !isOnline) return;
    
    setIsSyncing(true);
    try {
      await dataSyncService.syncAllData(currentStoreId, user.id);
      if (onRefresh) await Promise.resolve(onRefresh());
      toast({ title: "Sync Complete", description: "All data has been synced successfully." });
    } catch (e: any) {
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefresh = async (e?: React.MouseEvent) => {
    // If Shift is pressed, do a hard reload of the window
    if (e?.shiftKey) {
      window.location.reload();
      return;
    }

    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await Promise.resolve(onRefresh());
      } finally {
        setIsRefreshing(false);
      }
    }
  };


  const [shiftDuration, setShiftDuration] = useState("");

  useEffect(() => {
    if (!activeShift && user && store && currentPage !== 'reports' && currentPage !== 'settings') {
      setShowStartShiftModal(true);
    } else {
      setShowStartShiftModal(false);
    }
  }, [activeShift, user, store, currentPage]);

  useEffect(() => {
    if (!activeShift) return;
    const update = () => {
      const start = new Date(activeShift.start_time);
      const now = new Date();
      const diff = now.getTime() - start.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setShiftDuration(`${hours}h ${minutes}m`);
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [activeShift]);

  // Clear search query when changing pages
  useEffect(() => {
    setSearchQuery("");
    setSearchOpen(false);
  }, [currentPage]);

  // Keep browser tab title in sync with the current business/store.
  useEffect(() => {
    const businessName = store?.store_name || "Zuri POS";
    document.title = `${businessName} - Powered by Zuri POS`;
  }, [store?.store_name]);

  const handleStartShift = async () => {
    const cash = parseFloat(startingCash);
    if (isNaN(cash) || cash < 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid starting cash amount", variant: "destructive" });
      return;
    }
    await startShift(cash);
    setShowStartShiftModal(false);
    playCashRegister();
  };

  const [payablesOpen, setPayablesOpen] = useState(false);
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [supplierPayables, setSupplierPayables] = useState<
    Array<{ id: string; name: string; company: string | null; outstanding_balance: number; updated_at: string }>
  >([]);
  const payablesRef = useRef<HTMLDivElement | null>(null);

  const resolvedStoreId = currentStoreId || localStorage.getItem("brec_current_store") || null;
  const totalOutstanding = useMemo(() => {
    return supplierPayables.reduce((sum, s) => sum + (Number(s.outstanding_balance) || 0), 0);
  }, [supplierPayables]);

  const fetchSupplierPayables = async () => {
    if (!resolvedStoreId) return;
    setPayablesLoading(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, company, outstanding_balance, updated_at")
        .eq("store_id", resolvedStoreId)
        .gt("outstanding_balance", 0)
        .order("updated_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      setSupplierPayables((data as unknown as Array<{ id: string; name: string; company: string | null; outstanding_balance: number; updated_at: string }>) || []);
    } catch {
      // Fallback: derive payables from stock_loans when suppliers table/columns are missing.
      try {
        const { data } = await supabase
          .from("stock_loans")
          .select("supplier, balance, updated_at, created_at")
          .eq("store_id", resolvedStoreId)
          .eq("status", "unpaid")
          .order("created_at", { ascending: false })
          .limit(100);

        const map = new Map<string, { name: string; outstanding: number; updated_at: string }>();
        for (const row of (data as unknown as Array<{ supplier: string; balance: number; updated_at: string; created_at: string }>) || []) {
          const name = String(row?.supplier || "").trim() || "Supplier";
          const bal = Number(row?.balance || 0) || 0;
          const ts = String(row?.updated_at || row?.created_at || new Date().toISOString());
          const prev = map.get(name) || { name, outstanding: 0, updated_at: ts };
          prev.outstanding += bal;
          if (new Date(ts).getTime() > new Date(prev.updated_at).getTime()) prev.updated_at = ts;
          map.set(name, prev);
        }

        const derived = Array.from(map.values())
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 8)
          .map((s) => ({
            id: `loan-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            name: s.name,
            company: null,
            outstanding_balance: s.outstanding,
            updated_at: s.updated_at,
          }));

        setSupplierPayables(derived);
      } catch {
        setSupplierPayables([]);
      }
    } finally {
      setPayablesLoading(false);
    }
  };

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Supplier payables indicator (real-time)
  useEffect(() => {
    setSupplierPayables([]);
    if (!resolvedStoreId) return;

    fetchSupplierPayables();

    const channel = supabase
      .channel(`supplier-payables-${resolvedStoreId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "suppliers", filter: `store_id=eq.${resolvedStoreId}` },
        () => {
          fetchSupplierPayables();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_loans", filter: `store_id=eq.${resolvedStoreId}` },
        () => {
          fetchSupplierPayables();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedStoreId]);

  // Close payables popover on outside click
  useEffect(() => {
    if (!payablesOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = payablesRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setPayablesOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [payablesOpen]);

  const productIndex = useMemo(() => buildProductSearchIndex(stockData || []), [stockData]);
  const productResults = useMemo(() => {
    if (deferredSearchQuery.trim().length < 2) return [];
    return searchProductIndex(productIndex, deferredSearchQuery, { limit: 10 }).map((p) => ({
      id: p.id,
      product_name: (p as StockItem).product_name || (p as StockItem).productName,
      barcode: p.barcode,
      supplier: (p as StockItem).supplier,
      category: (p as StockItem).category,
      quantity: (p as StockItem).quantity,
      retail_price: (p as StockItem).retail_price,
      store_id: (p as StockItem).store_id,
    }));
  }, [productIndex, deferredSearchQuery]);

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["owner", "admin", "manager"] },
    { id: "admin", label: "Admin Panel", icon: Shield, roles: ["admin"] },
    { id: "stores", label: "Stores", icon: Store, roles: ["owner", "admin"] },
    { id: "products", label: "Products", icon: Boxes, roles: ["owner", "admin", "manager"] },
    { id: "suppliers", label: "Suppliers", icon: Truck, roles: ["owner", "admin", "manager"] },
    { id: "stock-entry", label: "Stock Entry", icon: Package, roles: ["owner", "admin", "manager"] },
    { id: "sales-entry", label: "Sales Entry", icon: ShoppingCart, roles: ["owner", "admin", "manager", "cashier"] },
    { id: "inventory", label: "Inventory", icon: Warehouse, roles: ["owner", "admin", "manager"] },
    { id: "barcode-manager", label: "Barcode Manager", icon: Barcode, roles: ["owner", "admin", "manager"] },
    { id: "customers", label: "Customers", icon: Users, roles: ["owner", "admin", "manager"] },
    { id: "expenses", label: "Expenses", icon: Receipt, roles: ["owner", "admin", "manager"] },
    { id: "staff", label: "Staff & HR", icon: Users, roles: ["owner", "admin", "manager"] },
    { id: "shifts", label: "Shifts", icon: Clock, roles: ["owner", "admin", "manager", "cashier"] },
    { id: "reports", label: "Reports", icon: FileText, roles: ["owner", "admin", "manager"] },
    { id: "cash-sales-report", label: "Cash Sales Report", icon: HandCoins, roles: ["owner", "admin", "manager"] },
    { id: "security", label: "Security", icon: Shield, roles: ["owner", "admin"] },
    { id: "settings", label: "Settings", icon: SettingsIcon, roles: ["owner", "admin"] },
  ];

  const filteredNavItems = navigationItems.filter(item => {
    // First filter by role
    if (item.roles && !item.roles.includes(userRole.toLowerCase())) return false;
    // If staff has specific allowed_pages, further restrict to those pages
    // Owner and admin bypass this check
    if (allowedPages && allowedPages.length > 0 && userRole !== "owner" && userRole !== "admin") {
      return allowedPages.includes(item.id);
    }
    return true;
  });

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Glassmorphic transparent navbar */}
      <header
        className="sticky top-0 z-50 backdrop-blur-xl"
        style={{
          backgroundColor: 'hsla(var(--background), 0.7)',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden hover:bg-foreground/10"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>
            {isElectron && onNavigateBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onNavigateBack}
                disabled={!canNavigateBack}
                className="flex hover:bg-foreground/10"
                title="Back"
                aria-label="Back to previous page"
              >
                <ArrowLeft size={20} />
              </Button>
            )}
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-foreground">{store?.store_name || 'Business'}</h1>
              <p className="text-xs text-muted-foreground">Powered by Zuri POS</p>
            </div>

            {/* Time and Date - Left side */}
            <div className="hidden lg:flex items-center gap-3 ml-4 text-foreground">
              <div className="flex items-center gap-1.5 bg-foreground/10 backdrop-blur-sm px-3 py-1 rounded-full">
                <Clock size={14} className="text-foreground" />
                <span className="text-sm font-mono font-medium text-foreground">{formatTime(currentTime)}</span>
              </div>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{formatDate(currentTime)}</span>
            </div>
          </div>

          {/* Center - Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products (name, barcode, category, supplier)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => {
                  // Delay so click on result registers
                  setTimeout(() => setSearchOpen(false), 150);
                }}
                className="w-full h-9 pl-10 pr-4 rounded-full bg-background/50 focus:bg-background focus:ring-2 focus:ring-primary/30 focus:outline-none text-sm transition-all"
              />

              {/* Search results dropdown */}
              {searchOpen && searchQuery.trim().length >= 2 && (
                <div 
                  className="absolute left-0 right-0 mt-2 rounded-lg border bg-background shadow-md overflow-hidden max-h-[500px] overflow-y-auto"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="p-2">
                    <>
                      {/* Products */}
                      {productResults.length > 0 && (
                          <div className="mb-3">
                            <div className="text-[11px] text-muted-foreground px-2 pb-1 font-semibold uppercase">
                              Products ({productResults.length})
                            </div>
                            <div className="space-y-1">
                              {productResults.map((product) => (
                                <button
                                  key={`product-${product.id}`}
                                  type="button"
                                  className="w-full text-left px-3 py-4 rounded-lg hover:bg-primary/20 hover:border-primary/40 border border-transparent transition-all group hover:scale-[1.01]"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setSearchOpen(false);
                                    setSearchQuery("");
                                    const params = new URLSearchParams({
                                      q: product.product_name,
                                      highlight: product.id,
                                    });
                                    // Stay on main route `/#/` — `#/inventory?...` is a different React Router path and hits 404
                                    window.location.hash = `/#/?${params.toString()}`;
                                    onPageChange('inventory');
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                                          PRODUCT
                                        </span>
                                        <span className="text-sm font-medium truncate">{product.product_name}</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                        {product.barcode && (
                                          <span className="flex items-center gap-1 font-mono bg-muted px-1.5 py-0.5 rounded">
                                            <Barcode size={10} />
                                            {product.barcode}
                                          </span>
                                        )}
                                        {product.supplier && (
                                          <span className="flex items-center gap-1">
                                            <Truck size={10} />
                                            {product.supplier}
                                          </span>
                                        )}
                                        {product.category && (
                                          <span className="bg-muted px-1.5 py-0.5 rounded">
                                            {product.category}
                                          </span>
                                        )}
                                        <span className="font-semibold">
                                          Qty: {product.quantity}
                                        </span>
                                        {product.retail_price && (
                                          <span className="text-success font-semibold">
                                            UGX {product.retail_price.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground group-hover:text-primary ml-2">
                                      Open →
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* No results */}
                      {productResults.length === 0 && (
                          <div className="px-3 py-8 text-center">
                            <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                            <p className="text-sm text-muted-foreground">
                              No results found for "{searchQuery}"
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Try a different search term
                            </p>
                          </div>
                        )}

                        {/* Quick navigation */}
                        <div className="pt-2 border-t mt-2">
                          <div className="text-[11px] text-muted-foreground px-2 pb-1 font-semibold uppercase">
                            Quick Navigation
                          </div>
                          <div className="space-y-1">
                            {filteredNavItems
                              .filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
                              .slice(0, 3)
                              .map((n) => (
                                <button
                                  key={`nav-${n.id}`}
                                  type="button"
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted flex items-center justify-between"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setSearchOpen(false);
                                    setSearchQuery("");
                                    onPageChange(n.id);
                                  }}
                                >
                                  <span className="text-sm flex items-center gap-2">
                                    <n.icon size={14} />
                                    {n.label}
                                  </span>
                                  <span className="text-xs text-muted-foreground">Go →</span>
                                </button>
                              ))}
                          </div>
                        </div>
                    </>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Close Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window as any).api.closeApp()}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Close app (session stays signed in)"
            >
              <X size={18} />
            </Button>

            {/* Online Status */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full backdrop-blur-sm ${isOnline ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="text-xs font-medium">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Sync Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || !isOnline}
              className="gap-2 hover:bg-foreground/10"
              title="Sync data"
            >
              <RotateCcw size={16} className={isSyncing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Sync</span>
            </Button>

            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="gap-2 hover:bg-foreground/10"
              >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
            
            {(isSyncing || isRefreshing || dataLoading) && (
              <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-full animate-pulse border border-primary/20">
                <RefreshCw size={12} className="animate-spin text-primary" />
                <span className="text-[10px] font-medium text-primary uppercase tracking-wider hidden lg:inline">Background Syncing</span>
              </div>
            )}
            
            <StoreChat />

            {/* Printer status (real-time) */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPrinterSetupOpen(true)}
                className="gap-2 hover:bg-foreground/10"
                title={printer ? `Printer: ${printer.name}` : "Printer: not connected"}
              >
                <span className="relative inline-flex">
                  <PrinterIcon size={18} />
                  <span
                    className={[
                      "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                      printerStatus === "connected"
                        ? "bg-emerald-500"
                        : printerStatus === "printing" || printerStatus === "connecting"
                          ? "bg-amber-500"
                          : printerStatus === "error"
                            ? "bg-red-500"
                            : "bg-zinc-400",
                    ].join(" ")}
                  />
                </span>
                <span className="hidden sm:inline">
                  {printerStatus === "connected" ? "Printer" : "No Printer"}
                </span>
              </Button>
            </div>

            {/* Supplier Payables (Debts) */}
            <div className="relative" ref={payablesRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPayablesOpen((v) => !v)}
                className="gap-2 hover:bg-foreground/10 text-warning"
                title="Supplier payables"
              >
                <HandCoins size={18} />
                <span className="hidden sm:inline">Debts</span>
                {totalOutstanding > 0 && (
                  <span className="ml-1 text-[11px] font-semibold">
                    UGX {Math.round(totalOutstanding).toLocaleString()}
                  </span>
                )}
              </Button>

              {payablesOpen && (
                <div className="absolute right-0 mt-2 w-[360px] rounded-lg border bg-background shadow-md overflow-hidden">
                  <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-muted-foreground font-semibold uppercase">Supplier Payables</div>
                        <div className="text-lg font-bold">
                          UGX {Math.round(totalOutstanding).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPayablesOpen(false);
                          onPageChange("suppliers");
                        }}
                      >
                        View
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {payablesLoading ? "Loading..." : `${supplierPayables.length} supplier${supplierPayables.length === 1 ? "" : "s"} pending`}
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto">
                    {(!payablesLoading && supplierPayables.length === 0) ? (
                      <div className="p-4 text-sm text-muted-foreground">No pending supplier payments.</div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {supplierPayables.map((s) => (
                          <button
                            key={`payable-${s.id}`}
                            type="button"
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPayablesOpen(false);
                              onPageChange("suppliers");
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{s.name}</div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {s.company || "Supplier"} • {new Date(s.updated_at).toLocaleString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-warning">
                                  UGX {Math.round(Number(s.outstanding_balance) || 0).toLocaleString()}
                                </div>
                                <div className="text-[10px] text-muted-foreground">pending</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>



            <NotificationCenter onPageChange={onPageChange} />
            <div className="pl-2 ml-1">
              <UserProfile onPageChange={onPageChange} userRole={userRole} />
            </div>
          </div>
        </div>
      </header>

      <PrinterSetupDialog open={printerSetupOpen} onOpenChange={setPrinterSetupOpen} />

      {/* Start Shift Modal */}
      <Dialog open={showStartShiftModal} onOpenChange={setShowStartShiftModal}>
        <DialogContent className="sm:max-w-[400px]" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              Start New Shift
            </DialogTitle>
            <DialogDescription>
              You must start a shift before you can make any sales or transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="startingCash">Opening Cash Balance (UGX)</Label>
              <Input
                id="startingCash"
                type="number"
                placeholder="Enter starting cash amount"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                autoFocus
                className="text-lg font-mono"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              className="w-full flex items-center gap-2"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/auth", { replace: true });
              }}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
            <Button className="w-full flex items-center gap-2" onClick={handleStartShift}>
              <Play className="w-4 h-4" />
              Start Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <div className="flex">
        {/* Sidebar - Dark themed */}
        <aside
          className={`
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? "w-64" : "w-0 lg:w-16"}
            ${sidebarOpen ? "block" : "hidden lg:block"}
            sticky top-16 h-[calc(100vh-4rem)]
            bg-sidebar-dark
          `}
        >
          <nav className="p-4 space-y-2 h-full overflow-y-auto">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={`w-full justify-start gap-3 text-sidebar-dark-foreground transition-all duration-200 ${!sidebarOpen && "lg:justify-center lg:px-2"
                    } ${isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "hover:bg-primary/20 hover:text-white hover:pl-5"
                    }`}
                  onClick={() => onPageChange(item.id)}
                >
                  <Icon size={20} />
                  <span className={`${!sidebarOpen && "lg:hidden"}`}>
                    {item.label}
                  </span>
                </Button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default React.memo(Layout);
