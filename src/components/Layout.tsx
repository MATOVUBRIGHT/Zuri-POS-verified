import { useMemo, useState, useEffect, useRef } from "react";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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
  Moon,
  Sun,
  Undo2,
  BarChart3,
  Landmark,
  Wallet,
  Banknote,
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import StoreChat from "@/components/StoreChat";
import ExecChat from "@/components/ExecChat";
import ScheduledPaymentPrompt from "@/components/ScheduledPaymentPrompt";
import UserProfile from "@/components/UserProfile";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildProductSearchIndex, searchProductIndex } from "@/lib/productSearch";
import type { StockItem } from "@/types";
import { usePrinter } from "@/providers/PrinterProvider";
import PrinterSetupDialog from "@/components/PrinterSetupDialog";
import { useShift } from "@/providers/ShiftProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { playCashRegister, playSuccess } from "@/lib/sounds";
import { useAppStateStore } from "@/store/appStateStore";
import { useNavigate } from "react-router-dom";
import { POS_PAGE_REGISTRY } from "@/lib/posPageRegistry";

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
  executiveMode?: boolean;
  onReturnToExecutive?: () => void;
  branchName?: string;
  /** Authenticated user ID — required for ExecChat in executive mode */
  userId?: string | null;
}

const Layout = ({ children, currentPage, onPageChange, stockData, currentStoreId, onRefresh, onOpenCashManagement, userRole = "owner", allowedPages, dataLoading, executiveMode = false, onReturnToExecutive, branchName, userId }: LayoutProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Desktop keeps the persistent rail (open by default); on mobile the same nav
  // is a full-screen overlay so it can never push the page sideways.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      // Expanded on desktop, dismissed on mobile, so resizing never leaves the
      // overlay covering the page or the rail collapsed on a wide screen.
      setSidebarOpen(event.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [isDark, setIsDark] = useState(() => {
    try {
      const key = currentStoreId ? `app_theme_${currentStoreId}` : 'app_theme';
      return localStorage.getItem(key) === 'dark' || document.documentElement.classList.contains('dark');
    } catch { return document.documentElement.classList.contains('dark'); }
  });

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    const root = document.documentElement;
    if (next) { root.classList.add('dark'); } else { root.classList.remove('dark'); }
    try { const key = currentStoreId ? `app_theme_${currentStoreId}` : 'app_theme'; localStorage.setItem(key, next ? 'dark' : 'light'); } catch {}
  };
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { toast } = useToast();
  const { status: printerStatus, printer } = usePrinter();
  const { activeShift, startShift, endShift, user, store, loading: shiftLoading, refreshShift } = useShift();
  const setActiveStaff = useAppStateStore(s => s.setActiveStaff);
  const setUserRole = useAppStateStore(s => s.setUserRole);
  const [printerSetupOpen, setPrinterSetupOpen] = useState(false);
  const [startingCash, setStartingCash] = useState(store?.last_closing_balance?.toString() || "0");

  // Update starting cash suggestion when store loads
  useEffect(() => {
    if (store?.last_closing_balance != null) {
      setStartingCash(String(store.last_closing_balance));
    }
  }, [store?.last_closing_balance]);
  const [showStartShiftModal, setShowStartShiftModal] = useState(false);
  const [shiftStaffId, setShiftStaffId] = useState("owner");
  const [shiftPin, setShiftPin] = useState("");
  const [shiftStaffList, setShiftStaffList] = useState<any[]>([]);
  const [shiftPinError, setShiftPinError] = useState("");

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSync = async () => {
    if (!currentStoreId || !isOnline) return;
    setIsSyncing(true);
    try {
      // In web app, sync means full refetch of all relevant tables
      await queryClient.refetchQueries();
      if (onRefresh) await Promise.resolve(onRefresh());
      toast({ title: "✓ Sync Complete", description: "All data refreshed from Supabase" });
    } catch (error: any) {
      toast({ title: "Refresh Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await Promise.resolve(onRefresh());
        toast({ title: "Data Refreshed" });
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  const handleCloseApp = async () => {
    // Web app sign-out flow
    toast({ title: "Signing Out...", description: "Ending your session." });
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    }, 1000);
  };

  const [shiftDuration, setShiftDuration] = useState("");

  useEffect(() => {
    // Don't show modal while shift data is still loading (avoids flash)
    if (shiftLoading || executiveMode) { setShowStartShiftModal(false); return; }
    if (!activeShift && user && store) {
      setShowStartShiftModal(true);
      setShiftStaffId("owner");
      setShiftPin("");
      setShiftPinError("");
      // Load staff list for this store (include pin_hash for verification)
      supabase.from('staff').select('id, full_name, employee_id, role, pin_code, pin_hash, allowed_pages')
        .eq('store_id', store.id).eq('status', 'active')
        .then(({ data }) => setShiftStaffList(data || []));
    } else {
      setShowStartShiftModal(false);
    }
  }, [activeShift, user, store, shiftLoading, executiveMode]);

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

    // Verify staff PIN if not owner
    if (shiftStaffId !== "owner") {
      const staff = shiftStaffList.find(s => s.id === shiftStaffId);
      if (!staff) { toast({ title: "Staff not found", variant: "destructive" }); return; }
      if (!shiftPin.trim()) { setShiftPinError("Enter your PIN"); return; }
      // Check plain PIN first (legacy), then hash
      const pinOk = staff.pin_code && staff.pin_code === shiftPin.trim();
      if (!pinOk) {
        if (staff.pin_hash) {
          const { data: hashOk } = await supabase.rpc('verify_pin_hash' as any, {
            pin_input: shiftPin.trim(), pin_hash: staff.pin_hash
          }).maybeSingle();
          if (!hashOk) { setShiftPinError("Incorrect PIN"); return; }
        } else {
          setShiftPinError("Incorrect PIN"); return;
        }
      }
      setShiftPinError("");
    }

    // Pass staffId to startShift so it's recorded in the shift record
    await startShift(cash, shiftStaffId === "owner" ? undefined : shiftStaffId);
    // Immediately refresh shift state so modal closes and UI updates without reload
    await refreshShift();

    // Set active staff in global state so page restrictions apply
    if (shiftStaffId !== "owner") {
      const staff = shiftStaffList.find(s => s.id === shiftStaffId);
      if (staff) {
        setActiveStaff(staff);
        setUserRole(staff.role || "cashier");
        try { const key = currentStoreId ? `brec_active_staff_${currentStoreId}` : (localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'); localStorage.setItem(key, JSON.stringify(staff)); } catch {}
      }
    } else {
      setActiveStaff(null);
      setUserRole("owner");
      try { const key = currentStoreId ? `brec_active_staff_${currentStoreId}` : (localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'); localStorage.removeItem(key); } catch {}
    }

    setShowStartShiftModal(false);
    setShiftPin("");
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
    if (searchQuery.trim().length < 2) return [];
    return searchProductIndex(productIndex, searchQuery, { limit: 10 }).map((p) => ({
      id: p.id,
      product_name: (p as StockItem).product_name || (p as StockItem).productName,
      barcode: p.barcode,
      supplier: (p as StockItem).supplier,
      category: (p as StockItem).category,
      quantity: (p as StockItem).quantity,
      retail_price: (p as StockItem).retail_price,
      store_id: (p as StockItem).store_id,
    }));
  }, [productIndex, searchQuery]);

  const navigationIcons = { dashboard: LayoutDashboard, products: Boxes, suppliers: Truck, "stock-entry": Package, "sales-entry": ShoppingCart, inventory: Warehouse, "barcode-manager": Barcode, customers: Users, expenses: Receipt, accounts: Landmark, banking: Banknote, returns: Undo2, shifts: Clock, reports: FileText, stores: Store, security: Shield, settings: SettingsIcon, "scheduled-payments": Receipt, admin: Shield };
  const navigationItems = [
    // Executive-only entry points are intentionally not available to branch staff.

    { id: "accountant-dashboard", label: "Finance Overview", icon: HandCoins, roles: ["accountant"], branchAssignable: false },
    ...POS_PAGE_REGISTRY.map((page) => ({ ...page, icon: navigationIcons[page.id as keyof typeof navigationIcons] || LayoutDashboard })),
  ];

  const executiveNavigationItems = [
    { id: "boss-dashboard", label: "Overview", icon: BarChart3 },
    { id: "executive-branches", label: "Branches", icon: Store },
    { id: "executive-finance", label: "Finance", icon: HandCoins },
    { id: "executive-expenses", label: "My Expenses", icon: Wallet },
    { id: "executive-accounts", label: "Accounts", icon: Landmark },
    { id: "executive-team", label: "Team & Access", icon: Users },
    { id: "executive-reports", label: "Reports", icon: FileText },
    { id: "scheduled-payments", label: "Scheduled Payments", icon: Receipt },
    // Settings is deliberately last: it is configuration, not a daily workflow.
    { id: "executive-settings", label: "Settings", icon: SettingsIcon },
  ];
  const accountantNavigationItems = [
    { id: "accountant-dashboard", label: "Finance Overview", icon: HandCoins },
    { id: "executive-expenses", label: "My Expenses", icon: Wallet },
    { id: "executive-reports", label: "Reports", icon: FileText },
    { id: "executive-accounts", label: "Accounts", icon: Landmark },
    { id: "scheduled-payments", label: "Scheduled Payments", icon: Receipt },
    { id: "tracker", label: "Tracker", icon: FileText },
    { id: "executive-settings", label: "Settings", icon: SettingsIcon },
  ];

  const filteredNavItems = userRole === "accountant" && executiveMode ? accountantNavigationItems : executiveMode ? executiveNavigationItems : navigationItems.filter(item => {
    // Every direct branch session gets a read-only Store entry. It is not a
    // management or switching surface; the Stores component enforces that view.
    if (item.id === 'stores' && resolvedStoreId) return true;
    // Allow branch-level admins/managers to access their store Settings
    if (item.id === 'settings' && resolvedStoreId && ["owner", "admin", "manager"].includes(userRole)) return true;

    // Direct branch staff never receive business/store management, even if a
    // stale local role says admin. This is also enforced by the page guard.
    if (!item.branchAssignable && !["owner", "boss"].includes(userRole)) return false;
    // Assigned branch logins are scoped by the executive-selected page list.
    // This takes precedence over broad role defaults, while owner/boss/admin
    // retain their full operational navigation.
    // A branch administrator is still an assigned branch user. Only an owner
    // or executive boss bypasses the explicit page assignment.
    if (allowedPages && allowedPages.length > 0 && !["owner", "boss"].includes(userRole)) {
      return allowedPages.includes(item.id);
    }
    // First filter by role
    if (item.roles && !item.roles.includes(userRole.toLowerCase())) return false;
    // If staff has specific allowed_pages, further restrict to those pages
    // Owner and admin bypass this check
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

  // One nav renderer shared by the desktop rail and the mobile overlay, so the
  // two can never drift apart.
  const renderNavItems = (isOverlay: boolean) =>
    filteredNavItems.map((item) => {
      const Icon = item.icon;
      const isActive = currentPage === item.id;
      return (
        <Button
          key={item.id}
          variant="ghost"
          className={`w-full justify-start gap-3 text-sidebar-dark-foreground transition-all duration-200 ${
            !isOverlay && !sidebarOpen ? "lg:justify-center lg:px-2" : ""
          } ${
            isActive
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              : "hover:bg-primary/20 hover:text-white hover:pl-5"
          }`}
          onClick={() => {
            onPageChange(item.id);
            // The overlay is modal on mobile, so dismiss it once a page is chosen.
            if (isOverlay) setSidebarOpen(false);
          }}
        >
          <Icon size={20} className="shrink-0" />
          <span className={!isOverlay && !sidebarOpen ? "lg:hidden" : ""}>
            {item.label}
          </span>
        </Button>
      );
    });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Header - Glassmorphic transparent navbar */}
      <header
        className="sticky top-0 z-50 shrink-0 backdrop-blur-xl"
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
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-foreground">{executiveMode ? (userRole === "accountant" ? "Finance Space" : "Zuri Executive") : branchName || store?.store_name || 'Business'}</h1>
              <p className="text-xs text-muted-foreground">{executiveMode ? (userRole === "accountant" ? "Finance control room" : "Portfolio control room") : branchName ? "Branch POS" : "Powered by Zuri POS"}</p>
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
          {currentPage !== "shifts" && <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products (name, barcode, category, supplier)..."
                autoComplete="off"
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
                                      highlight: product.id 
                                    });
                                    window.location.hash = `#/inventory?${params.toString()}`;
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
                                            {fmtCurrency(product.retail_price)}
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
          </div>}

          <div className="flex items-center gap-2">
            {!executiveMode && onReturnToExecutive && (userRole === "owner" || userRole === "boss") && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReturnToExecutive}
                aria-label="Back to Executive Dashboard"
                title="Back to Executive Dashboard"
                className="inline-flex shrink-0 gap-2"
              >
                <BarChart3 size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Back to Executive Dashboard</span>
              </Button>
            )}
            {/* Online Status */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full backdrop-blur-sm ${isOnline ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="text-xs font-medium">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {executiveMode && <ExecChat userId={userId ?? null} />}

            {!executiveMode && (
<>
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
                <span className="text-[10px] font-medium text-primary uppercase tracking-wider hidden lg:inline">Updating</span>
              </div>
            )}
            
            <StoreChat currentStoreId={currentStoreId} />

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
                {supplierPayables.length > 0 && (
                  <span className="ml-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-warning text-warning-foreground text-[10px] font-bold px-1">
                    {supplierPayables.length}
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
                          {fmtCurrency(Math.round(totalOutstanding))}
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
                                  {fmtCurrency(Math.round(Number(s.outstanding_balance) || 0))}
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



            
</>
)}
<NotificationCenter onPageChange={onPageChange} currentStoreId={currentStoreId} />
            <div className="pl-2 ml-1">
              <UserProfile onPageChange={onPageChange} userRole={userRole} executiveMode={executiveMode} />
            </div>

            {/* Theme control moved to Settings */}
          </div>
        </div>
      </header>

      <PrinterSetupDialog open={printerSetupOpen} onOpenChange={setPrinterSetupOpen} />

      {/* Start Shift Modal */}
      <Dialog open={showStartShiftModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[420px]" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              Start New Shift
            </DialogTitle>
            <DialogDescription>
              Select your role and enter starting cash to begin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Who is starting this shift?</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={shiftStaffId}
                onChange={e => { setShiftStaffId(e.target.value); setShiftPin(""); setShiftPinError(""); }}
              >
                <option value="owner">Owner / Admin</option>
                {shiftStaffList.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</option>
                ))}
              </select>
            </div>
            {shiftStaffId !== "owner" && (
              <div className="space-y-2">
                <Label>Your PIN</Label>
                <Input
                  type="password"
                  placeholder="****"
                  value={shiftPin}
                  onChange={e => { setShiftPin(e.target.value); setShiftPinError(""); }}
                  maxLength={6}
                  className={shiftPinError ? "border-destructive" : ""}
                />
                {shiftPinError && <p className="text-xs text-destructive">{shiftPinError}</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="startingCash">Opening Cash Balance ({getCurrencySymbol()})</Label>
              {/* Show expected drawer balance prominently */}
              {(store?.last_closing_balance ?? 0) > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xs text-blue-700 font-medium">Expected in drawer</span>
                  <span className="text-base font-bold text-blue-700">{fmtCurrency(store?.last_closing_balance || 0)}</span>
                </div>
              )}
              <Input
                id="startingCash"
                type="number"
                placeholder="Enter counted cash amount"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                autoFocus={shiftStaffId === "owner"}
                className="text-lg font-mono"
              />
              <p className="text-xs text-muted-foreground">Count the cash in the drawer and enter the amount above.</p>
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



      <div className="flex flex-1 min-h-0">
        {/* Sidebar - desktop rail only. On mobile this is hidden entirely so it
            cannot take flex space and shift the main column. The shell is now a
            definite-height flex column, so the rail is exactly the height of the
            content area and never scrolls with the page. */}
        <aside
          className={`
            hidden lg:flex lg:flex-col
            transition-all duration-300 ease-in-out shrink-0
            ${sidebarOpen ? "lg:w-64" : "lg:w-16"}
            h-full min-h-0
            bg-sidebar-dark
          `}
        >
          <nav className="p-4 space-y-2 h-full overflow-y-auto overflow-x-hidden">
            {renderNavItems(false)}
          </nav>
        </aside>

        {/* Mobile: full-screen overlay, not a flex sibling */}
        <Sheet open={!isDesktop && sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="flex w-full flex-col gap-0 border-r-0 bg-sidebar-dark p-0 text-sidebar-dark-foreground sm:max-w-none"
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <span className="text-sm font-semibold">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                className="text-sidebar-dark-foreground hover:bg-primary/20 hover:text-white"
                onClick={() => setSidebarOpen(false)}
                title="Close menu"
              >
                <X size={20} />
              </Button>
            </div>
            <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-4 pt-3">
              {renderNavItems(true)}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Main Content - the single scroll container. Pages fill it with
            h-full + flex so no page has to guess chrome height with 100vh. */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-clip p-4 sm:p-6">
          <div key={currentPage} className="page-enter min-w-0 h-full">
          {children}
          </div>
        </main>
        {executiveMode && ["accountant", "boss", "owner"].includes(userRole) && <ScheduledPaymentPrompt onView={() => onPageChange("scheduled-payments")} />}
      </div>
    </div>
  );
};

export default Layout;
