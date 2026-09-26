import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import Dashboard from "@/components/Dashboard";
import StockEntry from "@/components/StockEntry";
import SalesEntry from "@/components/SalesEntry";
import InventoryManagement from "@/components/InventoryManagement";
import BarcodeManager from "@/components/BarcodeManager";
import Expenses from "@/components/Expenses";
import Stores from "@/components/Stores";
import Products from "@/components/Products";
import Customers from "@/components/Customers";
import Shifts from "@/components/Shifts";
import StaffManagement from "@/components/StaffManagement";
import OnboardingIntro from "@/components/OnboardingIntro";
import AuditLogs from "@/components/AuditLogs";
import Suppliers from "@/components/Suppliers";
import CashManagement from "@/components/CashManagement";
import AdminDashboard from "@/components/AdminDashboard";
import RecentCashSalesReport from "@/components/RecentCashSalesReport";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { StockItem, SaleItem, ExpenseItem, Product, Category, Staff } from "@/types";

import { useOptimizedInventory, useOptimizedSales, useOptimizedExpenses, useOptimizedCashTransactions } from "@/hooks/useOptimizedData";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeSync, useVisibilityRefresh } from "@/hooks/useRealtimeSync";
import { parseAnyDateToLocalDate, saleDateToLocalKey, startOfLocalDay, endOfLocalDay, toLocalDateKey } from "@/lib/date";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cache, CACHE_KEYS } from "@/lib/cache";
import { dataSyncService } from "@/lib/data-sync";
import { useStoreData } from "@/hooks/useStoreData";
import { useDataStore } from "@/store/useDataStore";
import { RefreshSuccessToast } from "@/components/RefreshSuccessToast";

const Reports = lazy(() => import("@/components/Reports"));
const Settings = lazy(() => import("@/components/Settings"));

const useCacheFirstStore = typeof window !== "undefined" && !!(window as any).api?.getAll;

const dedupeRowsById = <T extends { id?: unknown }>(rows: T[] | null | undefined): T[] => {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(row);
  }

  return deduped;
};

const parseSaleProducts = (raw: unknown): Product[] => {
  if (Array.isArray(raw)) return raw as Product[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Product[]) : [];
  } catch {
    return [];
  }
};

const parsePaymentDetails = (raw: unknown): SaleItem["paymentDetails"] => {
  if (!raw) return null;
  if (typeof raw !== "string") return raw as SaleItem["paymentDetails"];
  try {
    return JSON.parse(raw) as SaleItem["paymentDetails"];
  } catch {
    return null;
  }
};

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false); // full screen blocking spinner
  // Check localStorage for onboarding completion to persist across refresh
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('brec_onboarding_complete') !== 'true';
  });
  // Always open dashboard first on every load
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [pageParams, setPageParams] = useState<unknown>(null);
  const [showCashPopup, setShowCashPopup] = useState(false);

  /** In-app navigation stack for header Back (desktop) */
  const [pageStack, setPageStack] = useState<string[]>(['dashboard']);

  const handlePageChange = useCallback((page: string, params?: unknown) => {
    setPageStack((prev) => {
      if (prev[prev.length - 1] === page) return prev;
      const next = [...prev, page];
      return next.length > 50 ? next.slice(-50) : next;
    });
    setCurrentPage(page);
    setPageParams(params || null);
  }, []);

  const handleNavigateBack = useCallback(() => {
    setPageStack((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      const target = next[next.length - 1];
      setCurrentPage(target);
      setPageParams(null);
      return next;
    });
  }, []);
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(() => {
    return localStorage.getItem('brec_current_store') || null;
  });
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [salesData, setSalesData] = useState<SaleItem[]>([]);
  const [expensesData, setExpensesData] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableCash, setAvailableCash] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeStaff, setActiveStaff] = useState<Staff | null>(() => {
    const saved = localStorage.getItem('brec_active_staff');
    return saved ? JSON.parse(saved) : null;
  });
  const [userRole, setUserRole] = useState<string>(() => {
    return localStorage.getItem('brec_user_role') || "owner";
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isInitialSyncing, setIsInitialSyncing] = useState(true);
  const initialSyncDone = useRef<Record<string, boolean>>({});
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const storeData = useStoreData(currentStoreId);

  // Cache-first: load from SQLite once when storeId available (Electron)
  useEffect(() => {
    if (!useCacheFirstStore || !currentStoreId) return;
    storeData.loadAll(currentStoreId);
  }, [currentStoreId, useCacheFirstStore]);

  // Initial full data sync for "load once" behavior (non-Electron / Supabase sync)
  useEffect(() => {
    if (useCacheFirstStore || !userId || !currentStoreId) return;
    
    if (initialSyncDone.current[currentStoreId]) {
      setIsInitialSyncing(false);
      return;
    }

    let mounted = true;
    const performInitialSync = async () => {
      try {
        if (initialSyncDone.current[currentStoreId]) {
          queryClient.invalidateQueries();
          return;
        }
        await dataSyncService.syncAllData(currentStoreId, userId);
        if (mounted) {
          initialSyncDone.current[currentStoreId] = true;
          queryClient.invalidateQueries();
        }
      } catch (error) {
        console.error("Initial sync error:", error);
      }
    };
    performInitialSync();
    return () => { mounted = false; };
  }, [userId, currentStoreId, queryClient, useCacheFirstStore]);

  const { data: rawInventory, isLoading: invLoading } = useOptimizedInventory(currentStoreId, userId);
  const { data: rawSales, isLoading: salesLoading } = useOptimizedSales(currentStoreId, userId);
  const { data: rawExpenses, isLoading: expensesLoading } = useOptimizedExpenses(currentStoreId, userId);
  const { data: rawCashTransactions } = useOptimizedCashTransactions(currentStoreId, userId);

  // Real-time sync: listen for changes from other devices
  useRealtimeSync(currentStoreId);
  // Visibility refresh: refetch stale data when returning from minimized state
  useVisibilityRefresh(currentStoreId);

  useEffect(() => {
    if (useCacheFirstStore) return;
    const dedupedInventory = dedupeRowsById(rawInventory as Array<{ id?: string }> | null | undefined);
    if (dedupedInventory.length === 0) {
      setStockData([]);
      return;
    }

    setStockData(dedupedInventory.map((item: any) => ({
      id: item.id,
      productName: item.product_name || "Untitled Product",
      product_name: item.product_name || "Untitled Product",
      category: item.category || "General",
      quantity: Number(item.quantity) || 0,
      costPerUnit: Number(item.cost_per_unit) || 0,
      cost_per_unit: Number(item.cost_per_unit) || 0,
      totalValue: Number(item.total_value) || 0,
      dateOfPurchase: item.date_of_purchase,
      sachets_count: Number(item.sachets_count) || 0,
      loose_items: Number(item.loose_items) || 0,
      opened_sachets: Number(item.opened_sachets) || 0,
      items_per_sachet: Number(item.items_per_sachet) || 1,
      retail_price: Number(item.retail_price) || 0,
      wholesale_price: Number(item.wholesale_price) || 0,
      retailPrice: Number(item.retail_price) || 0,
      wholesalePrice: Number(item.wholesale_price) || 0,
      store_id: item.store_id || currentStoreId || "",
      size: item.size,
      min_stock_level: Number(item.min_stock_level) || 5,
      reorder_quantity: Number(item.reorder_quantity) || 10,
      notes: item.notes,
      packaging_type: item.packaging_type,
      unit_name: item.unit_name,
      supplier: item.supplier,
      barcode: item.barcode,
      barcode_type: item.barcode_type,
      barcode_mode: (item.barcode_mode as any) || "standard",
      productImage: item.product_image,
      dateOfEntry: item.created_at || item.date_of_purchase
    })));
  }, [rawInventory, currentStoreId, useCacheFirstStore]);

  useEffect(() => {
    if (useCacheFirstStore) return;
    const dedupedSales = dedupeRowsById(rawSales as Array<{ id?: string }> | null | undefined);
    if (dedupedSales.length === 0) {
      setSalesData([]);
      return;
    }

    setSalesData(dedupedSales.map((sale: any) => ({
      id: sale.id,
      customerName: sale.customer_name || "Unknown",
      dateOfSale: sale.date_of_sale,
      totalAmount: sale.total_amount,
      paidInCash: sale.paid_in_cash || false,
      products: parseSaleProducts(sale.products),
      staff_id: sale.staff_id,
      paymentMethodId: sale.payment_method_id ?? null,
      paymentDetails: parsePaymentDetails(sale.payment_details),
    })));
  }, [rawSales, useCacheFirstStore]);

  useEffect(() => {
    if (useCacheFirstStore) return;
    const dedupedExpenses = dedupeRowsById(rawExpenses as Array<{ id?: string }> | null | undefined);
    if (dedupedExpenses.length === 0) {
      setExpensesData([]);
      return;
    }

    setExpensesData(dedupedExpenses.map((exp: any) => ({
      id: exp.id,
      description: exp.description || "Expense",
      amount: exp.amount,
      category: exp.category || "General",
      date: exp.date_of_expense,
      paymentMethod: exp.payment_method || "Cash",
    })));
  }, [rawExpenses, useCacheFirstStore]);

  const effectiveStockData = useCacheFirstStore ? storeData.stockData : stockData;
  const effectiveSalesData = useCacheFirstStore ? storeData.salesData : salesData;
  const effectiveExpensesData = useCacheFirstStore ? storeData.expensesData : expensesData;
  const effectiveAvailableCash = useCacheFirstStore ? storeData.availableCash : availableCash;
  const effectiveCategories = useCacheFirstStore ? storeData.categories : categories;

  useEffect(() => {
    if (!userId || !currentStoreId || !rawCashTransactions || useCacheFirstStore) return;

    const totalCash = dedupeRowsById(rawCashTransactions as Array<{ id?: string; type?: string; amount?: number }>).reduce((sum, tx) => {
        const t = String((tx as { type?: string })?.type ?? "").toLowerCase();
        const amount = Number((tx as { amount?: number })?.amount) || 0;
        const isIn = t === "in" || t === "deposit" || t === "income";
        const isOut = t === "out" || t === "withdrawal" || t === "expense";
        if (isIn) return sum + amount;
        if (isOut) return sum - amount;
        return sum; // ignore unknown types
      }, 0);

    setAvailableCash(Math.max(0, totalCash));
  }, [rawCashTransactions, userId, currentStoreId]);

  const dataLoadingState = useCacheFirstStore ? storeData.isRefreshing : (invLoading || salesLoading || expensesLoading);
  useEffect(() => {
    setDataLoading(dataLoadingState);
  }, [dataLoadingState]);

  // When the active store changes for a logged-in user, clear in-memory data
  // immediately and show a loading state while the new store's data loads.
  // Data handles clearing naturally via hooks; no manual state clear needed on navigation
  useEffect(() => {
    if (!userId || !currentStoreId) return;
    // Removed clearing logic to prevent products disappearing on navigation
  }, [currentStoreId, userId]);

  // Categories: keep a stable list even when no inventory items are currently in a category.
  useEffect(() => {
    if (useCacheFirstStore || !userId || !currentStoreId) return;

    let cancelled = false;
    const key = CACHE_KEYS.STORE_INFO(currentStoreId) + "_categories";

    const load = async () => {
      try {
        const cached = await cache.get<Category[]>(key);
        if (!cancelled && cached && Array.isArray(cached)) setCategories(cached);
      } catch {
        // ignore
      }

      try {
        const { data, error } = await (supabase as any)
          .from("categories")
          .select("id, name, store_id")
          .eq("store_id", currentStoreId)
          .order("name", { ascending: true });

        if (error) throw error;
        const rows = (data || []) as unknown as Array<{ id: string | number; name: string | null; store_id: string | number }>;
        const mapped: Category[] = rows.map((r) => ({
          id: String(r.id),
          name: String(r.name || "").trim(),
          store_id: String(r.store_id),
        })).filter((c) => c.name);

        if (!cancelled) setCategories(mapped);
        void cache.set(key, mapped, 1000 * 60 * 10);
      } catch {
        // If categories table isn't present, keep it derived from stockData.
        if (!cancelled) {
          const derived = Array.from(new Set(stockData.map((s) => String(s.category || "").trim()).filter(Boolean))).map((name) => ({
            id: name,
            name,
            store_id: currentStoreId,
          }));
          setCategories(derived);
        }
      }
    };

    load();

    const channel = supabase
      .channel(`categories-${currentStoreId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `store_id=eq.${currentStoreId}` }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStoreId, userId]);

  const applyTheme = (themeValue: string) => {
    const root = window.document.documentElement;
    // Always use light theme
    root.classList.remove('dark');
  };

  const applyColorScheme = (scheme: string) => {
    const root = window.document.documentElement;
    root.classList.remove('theme-ocean', 'theme-purple', 'theme-forest', 'theme-sunset', 'theme-royal', 'theme-midnight', 'theme-rose', 'theme-teal');
    if (scheme !== 'default') {
      root.classList.add(`theme-${scheme}`);
    }
  };

  // Browser only: warn before closing tab (Electron uses Ctrl+R / Back; beforeunload blocks reload)
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && !!(window as any).api?.closeApp;
    if (isElectron) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave? Any unsaved changes will be lost.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Check session on mount - persist session across reloads
  useEffect(() => {
    let mounted = true;
    
    const checkSession = async () => {
      const maxAttempts = 4;

      const run = async (attempt: number) => {
        if (!mounted) return;

        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (!mounted) return;

          if (error) {
            console.error("Session check error:", error);
            const msg = String((error as any)?.message || "");

            if (msg.includes("refresh_token_not_found") || msg.includes("Refresh Token Not Found")) {
              await supabase.auth.signOut();
              navigate("/auth");
              return;
            }

            if (attempt < maxAttempts) {
              // Retry transient errors (tab switching/background wakeups).
              setTimeout(() => void run(attempt + 1), 850);
              return;
            }

            // Don't navigate on transient errors; just stop so user can continue.
            setIsLoading(false);
            return;
          }

          if (!session) {
            localStorage.removeItem('brec_is_admin');
            navigate("/auth");
            return;
          }

          setUserId(session.user.id);

          // Check admin role from user_roles table server-side
          const { data: hasAdminRole } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
          const adminStatus = !!hasAdminRole;
          setIsAdmin(adminStatus);
          localStorage.setItem('brec_is_admin', adminStatus.toString());
          setIsLoading(false);

          // Always apply light theme
          applyTheme('light');

          // Apply saved color scheme
          const { data: profile, error: profileError } = await (supabase as any)
            .from("profiles")
            .select("color_scheme, full_name")
            .eq("user_id", session.user.id)
            .maybeSingle();

          // Create profile if it doesn't exist (safety for new accounts)
          if (!profile && !profileError) {
            await supabase.from("profiles").insert({
              user_id: session.user.id,
              full_name: session.user.user_metadata?.name || "User",
              theme: "light",
              color_scheme: "default"
            } as any);
          }

          const savedColorScheme = (profile as any)?.color_scheme || 'default';
          applyColorScheme(savedColorScheme);

          // Auto-select first store after session is established
          const { data: ownedStores, error: ownedError } = await (supabase as any)
            .from("stores")
            .select("id, store_name")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: true });

          if (!ownedError && ownedStores && ownedStores.length > 0) {
            setCurrentStoreId((ownedStores as any)[0].id);
          }
        } catch (error) {
          console.error("Unexpected error during session check:", error);
          const msg = String((error as any)?.message || "");

          if (msg.includes("refresh_token_not_found") || msg.includes("Refresh Token Not Found")) {
            await supabase.auth.signOut();
            navigate("/auth");
            return;
          }

          if (attempt < maxAttempts) {
            setTimeout(() => void run(attempt + 1), 850);
            return;
          }

          setIsLoading(false);
        }
      };

      void run(1);
    };

    checkSession();
    
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Listen to auth state changes
  useEffect(() => {
    let mounted = true;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // Only navigate to auth on explicit SIGNED_OUT event, not on TOKEN_REFRESHED or other events
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('brec_is_admin');
        localStorage.removeItem('brec_current_page');
        navigate("/auth");
        // Clear all data on logout
        setStockData([]);
        setSalesData([]);
        setExpensesData([]);
        setAvailableCash(0);
        setUserId(null);
        setCurrentStoreId(null);
      } else if (session) {
        // Clear data when switching users
        if (userId && session.user.id !== userId) {
          setStockData([]);
          setSalesData([]);
          setExpensesData([]);
          setAvailableCash(0);
          setCurrentStoreId(null);
        }
        setUserId(session.user.id);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, userId]);


  // Auto-select first OWNED store when user logs in (dashboard only shows owned stores)
  useEffect(() => {
    if (!userId || currentStoreId) return;

    const selectFirstStore = async () => {
      try {
        // Only get user's OWNED stores for dashboard
        const { data: ownedStores, error: ownedError } = await (supabase as any)
          .from("stores")
          .select("id, store_name, user_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (ownedError) {
          console.error("Error fetching owned stores:", ownedError);
        }

        if (ownedStores && ownedStores.length > 0) {
          setCurrentStoreId((ownedStores as any)[0].id);
          setUserRole("owner");
        } else {
          // Check access for shared stores if no owned stores
          const { data: accessData } = await (supabase as any)
            .from("store_access")
            .select("store_id, role")
            .eq("user_id", userId)
            .limit(1);

          if (accessData && accessData.length > 0) {
            setCurrentStoreId((accessData as any)[0].store_id);
            setUserRole((accessData as any)[0].role);
          }
        }
      } catch (error) {
        console.error("Error selecting first store:", error);
      }
    };

    selectFirstStore();
  }, [userId, currentStoreId]);

  const refreshData = useCallback(async () => {
    if (!currentStoreId) return;

    if (useCacheFirstStore) {
      const ok = await storeData.refreshData();
      if (ok) setShowRefreshToast(true);
      return;
    }

    if (!userId) {
      queryClient.invalidateQueries();
      return;
    }

    try {
      await dataSyncService.syncAllData(currentStoreId, userId);
    } catch (e) {
      console.warn("Failed to sync during refresh:", e);
    } finally {
      queryClient.invalidateQueries();
    }
  }, [queryClient, currentStoreId, userId, useCacheFirstStore, storeData]);

  // Load data from Supabase when userId or currentStoreId changes
  useEffect(() => {
    // The hooks handle initial loading based on currentStoreId and userId
  }, [currentStoreId, userId]);

  // Set up realtime subscriptions for automatic updates across devices
  useEffect(() => {
    if (!userId || !currentStoreId) return;

    let channel: any = null;
    const timeoutId = setTimeout(() => {
      channel = supabase
        .channel('db-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'inventory',
            filter: `store_id=eq.${currentStoreId}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['inventory', currentStoreId] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sales',
            filter: `store_id=eq.${currentStoreId}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['sales', currentStoreId] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'expenses',
            filter: `store_id=eq.${currentStoreId}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['expenses', currentStoreId] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cash_transactions',
            filter: `store_id=eq.${currentStoreId}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['cash_transactions', currentStoreId] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shifts',
            filter: `store_id=eq.${currentStoreId}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['shifts', currentStoreId] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'customers',
            filter: `store_id=eq.${currentStoreId}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['customers', currentStoreId] });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'staff',
            filter: `store_id=eq.${currentStoreId}`
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['staff', currentStoreId] });
          }
        )
        .subscribe();
    }, 1000); // Delay subscription setup to let state stabilize

    return () => {
      clearTimeout(timeoutId);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId, currentStoreId, queryClient]);

  const handleAddStock = (stockItem: StockItem) => {
    if (useCacheFirstStore) {
      useDataStore.getState().setProducts([stockItem as any, ...useDataStore.getState().products]);
    } else {
      setStockData(prev => [stockItem, ...prev]);
    }
    refreshData();
  };

  const handleAddSale = (saleItem: SaleItem) => {
    if (useCacheFirstStore) {
      if (!useDataStore.getState().sales.some((s: any) => s.id === saleItem.id)) {
        storeData.addSale(saleItem as any);
      }
    } else {
      setSalesData(prev => (prev.some(s => s.id === saleItem.id) ? prev : [saleItem, ...prev]));
    }
    refreshData();
  };

  const handleUpdateSale = (saleId: string, updates: Partial<SaleItem>) => {
    if (useCacheFirstStore) {
      useDataStore.setState((s) => ({
        sales: s.sales.map((sale: any) => sale.id === saleId ? { ...sale, ...updates } : sale),
      }));
    } else {
      setSalesData(prev => prev.map(sale => sale.id === saleId ? { ...sale, ...updates } : sale));
    }
  };

  const handleDeleteSale = (saleId: string) => {
    if (useCacheFirstStore) storeData.removeSale(saleId);
    else setSalesData(prev => prev.filter(s => s.id !== saleId));
  };

  const handleAddExpense = (expense: ExpenseItem) => {
    if (useCacheFirstStore) storeData.addExpense(expense as any);
    else setExpensesData(prev => [expense, ...prev]);
    refreshData();
  };

  const handleDeleteExpense = (expenseId: string) => {
    if (useCacheFirstStore) storeData.removeExpense(expenseId);
    else setExpensesData(prev => prev.filter(exp => exp.id !== expenseId));
  };

  const handleUpdateCash = (amount: number) => {
    if (!useCacheFirstStore) {
      setAvailableCash((prev) => Math.max(0, (prev || 0) + (Number(amount) || 0)));
    }
    refreshData();
  };

  const handleDataImport = (data: { stock: StockItem[], sales: SaleItem[], expenses: ExpenseItem[] }) => {
    if (useCacheFirstStore && storeData) {
      storeData.setStockData(data.stock);
      storeData.setSalesData(data.sales);
      storeData.setExpensesData(data.expenses);
    } else {
      setStockData(data.stock);
      setSalesData(data.sales);
      setExpensesData(data.expenses);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem('brec_onboarding_complete', 'true');
  };

  const handleStaffLogin = (staff: Staff) => {
    setActiveStaff(staff);
    localStorage.setItem('brec_active_staff', JSON.stringify(staff));
    setUserRole(staff.role);
    localStorage.setItem('brec_user_role', staff.role);
    toast({
      title: "Staff Login Successful",
      description: `Welcome back, ${staff.full_name}`,
    });
  };

  const handleStaffLogout = () => {
    setActiveStaff(null);
    localStorage.removeItem('brec_active_staff');
    setUserRole("owner");
    localStorage.setItem('brec_user_role', "owner");
    toast({
      title: "Staff Logged Out",
      description: "Returned to owner mode",
    });
  };

  // Persist current page to localStorage
  useEffect(() => {
    localStorage.setItem('brec_current_page', currentPage);
  }, [currentPage]);

  // Persist current store to localStorage
  useEffect(() => {
    if (currentStoreId) {
      localStorage.setItem('brec_current_store', currentStoreId);
    }
  }, [currentStoreId]);

  // Financial calculations for the dashboard
  const totalRevenue = useMemo(() => {
    return effectiveSalesData.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
  }, [effectiveSalesData]);

  // COGS = sum of (quantity sold × cost_per_unit) for each product in each sale.
  // Prefer matching by product id; fall back to a normalized name match.
  const totalCOGS = useMemo(() => {
    const normalize = (s: string) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const byId = new Map(effectiveStockData.map((s) => [s.id, s] as const));
    const byName = new Map(effectiveStockData.map((s) => [normalize(s.productName), s] as const));

    let sum = 0;
    for (const sale of effectiveSalesData) {
      for (const p of sale.products || []) {
        const stockItem = (p.id ? byId.get(p.id) : undefined) || byName.get(normalize(p.productName));

        const costPerUnit = Number(stockItem?.cost_per_unit ?? stockItem?.costPerUnit ?? 0) || 0;
        const itemsPerSachet = Number(stockItem?.items_per_sachet ?? 1) || 1;
        const qty = Number(p.quantity) || 0;
        const unitCost = p.sellType === "sachet" ? costPerUnit * itemsPerSachet : costPerUnit;

        sum += qty * unitCost;
      }
    }

    return sum;
  }, [effectiveSalesData, effectiveStockData]);

  const totalExpenses = useMemo(() => {
    return effectiveExpensesData.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  }, [effectiveExpensesData]);

  const totalProfit = useMemo(() => {
    return totalRevenue - totalCOGS - totalExpenses;
  }, [totalRevenue, totalCOGS, totalExpenses]);

  const stockValue = useMemo(() => {
    return effectiveStockData.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const cost = Number(item.cost_per_unit ?? item.costPerUnit ?? 0) || 0;
      return sum + qty * cost;
    }, 0);
  }, [effectiveStockData]);

  const financialData = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());

    const todayEnd = endOfLocalDay(new Date());
    const weekStart = startOfLocalDay(new Date());
    weekStart.setDate(weekStart.getDate() - 6);

    const monthStart = startOfLocalDay(new Date());
    monthStart.setMonth(monthStart.getMonth() - 1);

    // Deduplicate sales by ID to prevent double counting
    const uniqueSalesData = effectiveSalesData.filter((sale, index, self) =>
      index === self.findIndex((s) => s.id === sale.id)
    );

    const dailySales = uniqueSalesData.reduce((sum, sale) => {
      if (!sale.dateOfSale) return sum;
      const localKey = saleDateToLocalKey(sale.dateOfSale) || "";
      if (localKey !== todayKey) return sum;
      return sum + (sale.totalAmount || 0);
    }, 0);

    const weeklySales = uniqueSalesData.reduce((sum, sale) => {
      if (!sale.dateOfSale) return sum;
      const d = parseAnyDateToLocalDate(sale.dateOfSale);
      if (!d) return sum;
      if (d < weekStart || d > todayEnd) return sum;
      return sum + (sale.totalAmount || 0);
    }, 0);

    const monthlySales = uniqueSalesData.reduce((sum, sale) => {
      if (!sale.dateOfSale) return sum;
      const d = parseAnyDateToLocalDate(sale.dateOfSale);
      if (!d) return sum;
      if (d < monthStart || d > todayEnd) return sum;
      return sum + (sale.totalAmount || 0);
    }, 0);

    return {
      cashOnHand: effectiveAvailableCash,
      stockValue,
      dailySales,
      weeklySales,
      monthlySales,
      totalPurchaseCost: totalCOGS,
      totalRevenue,
      totalProfit,
      availableCash: effectiveAvailableCash,
      totalExpenses,
    };
  }, [effectiveAvailableCash, effectiveSalesData, stockValue, totalCOGS, totalRevenue, totalProfit, totalExpenses]);
  const renderPage = () => {
    if (isAdmin && currentPage === "admin") {
      return <AdminDashboard />;
    }

    // Pages open instantly – no loading gate

    // Show error state
    if (dataError) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4 max-w-md">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
              <div className="text-destructive font-semibold mb-2">Data Loading Error</div>
              <p className="text-destructive/80 text-sm mb-4">{dataError}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={refreshData}
                  className="px-4 py-2 bg-destructive text-white rounded-md hover:bg-destructive/90"
                >
                  Try Again
                </button>

<button
                  onClick={async () => {
                    queryClient.invalidateQueries({ queryKey: ['inventory'] });
                    queryClient.invalidateQueries({ queryKey: ['sales'] });
                    queryClient.invalidateQueries({ queryKey: ['expenses'] });
                    queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
                    setDataError(null);
                    toast({ title: 'Refreshing data...' });
                    setTimeout(() => toast({ title: 'Data refreshed' }), 1500);
                  }}
                  className="px-4 py-2 border border-muted-foreground/30 rounded-md hover:bg-muted/50"
                >
                  Refresh Data

                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            stockData={effectiveStockData}
            salesData={effectiveSalesData}
            expensesData={effectiveExpensesData}
            financialData={financialData}
            onUpdateCash={handleUpdateCash}
            onUpdateSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
            onPageChange={handlePageChange}
            onOpenCashManagement={() => setShowCashPopup(true)}
          />
        );
      case "stores":
        return <Stores currentStoreId={currentStoreId} onStoreChange={setCurrentStoreId} />;
      case "products":
        return <Products stockData={effectiveStockData} onUpdateStock={(updated) => useCacheFirstStore ? storeData.onUpdateStock(updated) : setStockData(stockData.map(s => s.id === updated.id ? updated : s))} />;
      case "suppliers":
        return <Suppliers />;
      case "stock-entry":
        return <StockEntry />;
      case "sales-entry":
        return <SalesEntry stockData={effectiveStockData} onAddSale={handleAddSale} currentStoreId={currentStoreId} />;
      case "inventory":
        return <InventoryManagement
          stockData={effectiveStockData}
          setStockData={useCacheFirstStore ? storeData.setStockData : setStockData}
          categories={effectiveCategories}
          currentPage={currentPage}
        />;
      case "barcode-manager":
        return <BarcodeManager stockData={effectiveStockData} currentStoreId={currentStoreId || undefined} />;
      case "reports":
        return <Suspense fallback={<div className="p-4 flex items-center justify-center"><LoadingSpinner size="lg" /></div>}><Reports stockData={effectiveStockData} salesData={effectiveSalesData} expensesData={effectiveExpensesData} currentStoreId={currentStoreId || undefined} /></Suspense>;
      case "cash-sales-report":
        return <RecentCashSalesReport currentStoreId={currentStoreId || undefined} />;
      case "expenses":
        return <Expenses expensesData={effectiveExpensesData} onAddExpense={handleAddExpense} onDeleteExpense={handleDeleteExpense} />;
      case "customers":
        return <Customers />;
      case "shifts":
        return <Shifts onUpdateCash={handleUpdateCash} onRefresh={refreshData} onStaffLogin={handleStaffLogin} onStaffLogout={handleStaffLogout} />;
      case "staff":
        return <StaffManagement />;
      case "security":
        return <AuditLogs />;
      case "settings":
        return <Suspense fallback={<div className="p-4 flex items-center justify-center"><LoadingSpinner size="lg" /></div>}><Settings stockData={effectiveStockData} salesData={effectiveSalesData} expensesData={effectiveExpensesData} currentStoreId={currentStoreId} onDataImport={handleDataImport} /></Suspense>;
      default:
        return (
          <Dashboard
            stockData={effectiveStockData}
            salesData={effectiveSalesData}
            expensesData={effectiveExpensesData}
            financialData={financialData}
            onUpdateCash={handleUpdateCash}
            onUpdateSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
            onPageChange={handlePageChange}
            onOpenCashManagement={() => setShowCashPopup(true)}
          />
        );
    }
  };

  // Determine allowed pages for active staff (stable reference)
  const staffAllowedPages: string[] = useMemo(() => {
    if (!activeStaff?.allowed_pages) return [];
    return Array.isArray(activeStaff.allowed_pages) ? activeStaff.allowed_pages as string[] : [];
  }, [activeStaff?.allowed_pages]);

  // Enforce page restrictions: if staff tries to access unauthorized page, redirect
  const effectivePage = useMemo(() => {
    if (!activeStaff || isAdmin || userRole === "owner") return currentPage;
    if (staffAllowedPages.length === 0) return currentPage;
    if (staffAllowedPages.includes(currentPage)) return currentPage;
    return staffAllowedPages[0] || "sales-entry";
  }, [activeStaff, isAdmin, userRole, currentPage, staffAllowedPages]);

  // Sync if page was redirected (e.g. staff access) — reset nav stack to avoid invalid Back targets
  useEffect(() => {
    if (effectivePage !== currentPage) {
      setCurrentPage(effectivePage);
      setPageStack([effectivePage]);
    }
  }, [effectivePage, currentPage]);

  // Removed full-screen loading guard – open instantly

  if (showOnboarding) {
    return <OnboardingIntro onComplete={handleOnboardingComplete} />;
  }

  return (
    <Layout
      currentPage={effectivePage}
      onPageChange={(page) => {
        if (activeStaff && !isAdmin && userRole !== "owner" && staffAllowedPages.length > 0 && !staffAllowedPages.includes(page)) {
          toast({ title: "Access Denied", description: "You don't have permission to access this page.", variant: "destructive" });
          return;
        }
        handlePageChange(page);
      }}
      onNavigateBack={handleNavigateBack}
      canNavigateBack={pageStack.length > 1}
      stockData={effectiveStockData}
      currentStoreId={currentStoreId}
      onRefresh={refreshData}
      onOpenCashManagement={() => setShowCashPopup(true)}
      userRole={isAdmin ? "admin" : userRole}
      allowedPages={staffAllowedPages}
      dataLoading={dataLoading}
    >
      {renderPage()}

      {/* Cash Management Popup */}
      <Dialog open={showCashPopup} onOpenChange={setShowCashPopup}>
        <DialogContent className="max-w-2xl p-0 overflow-y-auto overscroll-contain border-none bg-transparent">
          <CashManagement
            availableCash={effectiveAvailableCash}
            onUpdateCash={handleUpdateCash}
            onClose={() => setShowCashPopup(false)}
          />
        </DialogContent>
      </Dialog>

      <RefreshSuccessToast visible={showRefreshToast} onDismiss={() => setShowRefreshToast(false)} />
    </Layout>
  );
};

export default Index;
