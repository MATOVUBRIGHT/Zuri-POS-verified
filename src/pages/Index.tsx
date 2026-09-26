import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import Dashboard from "@/components/Dashboard";
import StockEntry from "@/components/StockEntry";
import SalesEntry from "@/components/SalesEntry";
import InventoryManagement from "@/components/InventoryManagement";
import BarcodeManager from "@/components/BarcodeManager";
import Reports from "@/components/Reports";
import Expenses from "@/components/Expenses";
import Settings from "@/components/Settings";
import Stores from "@/components/Stores";
import Products from "@/components/Products";
import Customers from "@/components/Customers";
import Shifts from "@/components/Shifts";
import OnboardingIntro from "@/components/OnboardingIntro";
import AuditLogs from "@/components/AuditLogs";
import Suppliers from "@/components/Suppliers";
import SupplierReports from "@/components/SupplierReports";
import ReturnsAndDamaged from "@/components/ReturnsAndDamaged";
import AdminDashboard from "@/components/AdminDashboard";
import CashManagement from "@/components/CashManagement";
import RoleDashboards from "@/components/RoleDashboards";
import ExecutiveWorkspace from "@/components/ExecutiveWorkspace";
import ExecutiveLayout from "@/components/ExecutiveLayout";
import ExecutiveTeamAccess from "@/components/ExecutiveTeamAccess";
import PaymentAccounts from "@/components/PaymentAccounts";
import BankCash from "@/components/BankCash";
import ScheduledPayments from "@/components/ScheduledPayments";
import ExecutiveExpenses from "@/components/ExecutiveExpenses";
import Tracker from "@/components/Tracker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { StockItem, SaleItem, ExpenseItem, Product, Category, Staff } from "@/types";

import { useOptimizedInventory, useOptimizedSales, useOptimizedExpenses, useOptimizedCashTransactions } from "@/hooks/useOptimizedData";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeSync, useVisibilityRefresh } from "@/hooks/useRealtimeSync";
import { parseAnyDateToLocalDate, saleDateToLocalKey, startOfLocalDay, endOfLocalDay, toLocalDateKey } from "@/lib/date";
import { LoadingSpinner, PageLoader } from "@/components/ui/loading-spinner";
import { cache, CACHE_KEYS } from "@/lib/cache";
import { useAppStateStore } from "@/store/appStateStore";
import { useShift } from "@/providers/ShiftProvider";
import { isBranchAssignablePosPage } from "@/lib/posPageRegistry";

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

type ResolvedWorkspaceRole = "owner" | "boss" | "accountant" | "admin" | null;

const Index = ({ posStoreId, branchName }: { posStoreId?: string; branchName?: string } = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshShift } = useShift();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false); // no blocking spinner
  const currentPage = useAppStateStore((state) => state.currentPage);
  const showOnboarding = useAppStateStore((state) => state.showOnboarding);
  const currentStoreId = useAppStateStore((state) => state.currentStoreId);
  const pageParams = useAppStateStore((state) => state.pageParams);
  const activeStaff = useAppStateStore((state) => state.activeStaff);
  const userRole = useAppStateStore((state) => state.userRole);
  const setCurrentPage = useAppStateStore((state) => state.setCurrentPage);
  const setPageParams = useAppStateStore((state) => state.setPageParams);
  const setShowOnboarding = useAppStateStore((state) => state.setShowOnboarding);
  const setCurrentStoreId = useAppStateStore((state) => state.setCurrentStoreId);
  const setActiveStaff = useAppStateStore((state) => state.setActiveStaff);
  const setUserRole = useAppStateStore((state) => state.setUserRole);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  // This is deliberately session-scoped. `userRole` is persisted for the POS,
  // so it must not decide which workspace renders at the application root.
  const [resolvedWorkspaceRole, setResolvedWorkspaceRole] = useState<ResolvedWorkspaceRole>(null);
  const [roleResolutionError, setRoleResolutionError] = useState(false);
  const [branchStaffAccessState, setBranchStaffAccessState] = useState<"not-required" | "loading" | "ready" | "missing">("loading");
  const [showCashPopup, setShowCashPopup] = useState(false);

  // The executive workspace is a route-level experience. Persisted Zustand
  // state is useful inside a POS branch, but must never decide what an owner
  // sees at the application root after a refresh or browser-back navigation.
  const isRootRoute = location.pathname === "/";
  // Executive authority takes precedence over a separate admin grant at `/`.
  // Admin-only tooling remains available through its explicit routes.
  const isExecutiveUser = resolvedWorkspaceRole === "owner" || resolvedWorkspaceRole === "boss" || resolvedWorkspaceRole === "accountant" || resolvedWorkspaceRole === "admin" || isAdmin;
  const isExecutiveRoot = isRootRoute && !posStoreId && roleResolved && isExecutiveUser;
  // An owner/boss deliberately entering /pos/:storeId from Executive keeps the
  // full POS navigation. Page grants are for direct branch-staff logins only.
  const hasExecutivePosAccess = Boolean(posStoreId && (isExecutiveUser || isAdmin));
  const executivePages = new Set(["boss-dashboard", "accountant-dashboard", "executive-branches", "executive-finance", "executive-expenses", "executive-accounts", "executive-team", "executive-reports", "executive-settings", "scheduled-payments"]);
  const executivePage = executivePages.has(currentPage) ? currentPage : resolvedWorkspaceRole === "accountant" ? "accountant-dashboard" : "boss-dashboard";

  const handlePageChange = (page: string, params?: unknown) => {
    setCurrentPage(page);
    setPageParams(params || null);
  };
  const openBranchPos = (branchId: string) => {
    // Mark that this navigation originated from the executive workspace so
    // a subsequent browser-back can be interpreted as "return to executive"
    // intent — instead, we will sign the user out on back to avoid exposing
    // the executive workspace to the branch session.
    try {
      sessionStorage.setItem('open_from_executive', '1');
    } catch {}
    navigate(`/pos/${branchId}`);
  };

  // If this tab was opened into a branch POS via the executive workspace,
  // treat a browser Back navigation as a logout (do not return to executive UI).
  useEffect(() => {
    if (!posStoreId) return;
    let fromExec = false;
    try { fromExec = sessionStorage.getItem('open_from_executive') === '1'; } catch {}
    if (!fromExec) return;

    const handlePop = async () => {
      try {
        await supabase.auth.signOut();
      } catch {}
      try { sessionStorage.removeItem('open_from_executive'); } catch {}
      navigate('/auth', { replace: true });
    };

    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
      try { sessionStorage.removeItem('open_from_executive'); } catch {}
    };
  }, [posStoreId, navigate]);

  // POS selection belongs to the URL, never to persisted executive state.
  useEffect(() => {
    if (!posStoreId) return;
    localStorage.setItem("brec_current_store", posStoreId);
    setCurrentStoreId(posStoreId);
    setCurrentPage("dashboard");
    setPageParams(null);
    void refreshShift();
  }, [posStoreId, refreshShift, setCurrentPage, setCurrentStoreId, setPageParams]);

  // Discard stale operational page IDs (sales, inventory, legacy dashboard,
  // etc.) whenever an executive is at `/`. Rendering also uses executivePage
  // below, so there is no one-frame fallback while this effect is scheduled.
  useEffect(() => {
    if (isExecutiveRoot && currentPage !== executivePage) {
      setCurrentPage(executivePage);
      setPageParams(null);
    }
  }, [currentPage, executivePage, isExecutiveRoot, setCurrentPage, setPageParams]);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const snapshot = useAppStateStore.getState();
        try {
          localStorage.setItem(
            "zuripos-app-state",
            JSON.stringify({
              currentPage: snapshot.currentPage,
              pageParams: snapshot.pageParams,
              showOnboarding: snapshot.showOnboarding,
              currentStoreId: snapshot.currentStoreId,
              activeStaff: snapshot.activeStaff,
              userRole: snapshot.userRole,
            })
          );
        } catch {
          // localStorage may be busy in browsers with strict privacy settings
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [salesData, setSalesData] = useState<SaleItem[]>([]);
  const [expensesData, setExpensesData] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableCash, setAvailableCash] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isInitialSyncing, setIsInitialSyncing] = useState(false);

  // Direct branch logins are real Supabase users, not the legacy shift PIN
  // picker. Load their staff assignment from the selected route so both the
  // layout and page guard use the server-stored role and page permissions.
  useEffect(() => {
    if (!posStoreId || hasExecutivePosAccess) {
      setBranchStaffAccessState("not-required");
      setActiveStaff(null);
      try { const key = posStoreId ? `brec_active_staff_${posStoreId}` : (localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'); localStorage.removeItem(key); } catch {}
      return;
    }
    if (!userId) {
      setBranchStaffAccessState("loading");
      return;
    }
    let active = true;
    const loadBranchStaff = async () => {
      setBranchStaffAccessState("loading");
      setActiveStaff(null);
      const { data, error } = await supabase
        .from("staff")
        .select("id, store_id, user_id, full_name, employee_id, role, status, allowed_pages")
        .eq("store_id", posStoreId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setBranchStaffAccessState("missing");
        return;
      }
      const staff = data as unknown as Staff;
      setActiveStaff(staff);
      setUserRole(String((data as any).role || "cashier"));
      try { const key = posStoreId ? `brec_active_staff_${posStoreId}` : (localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'); localStorage.setItem(key, JSON.stringify(staff)); } catch {}
      localStorage.setItem("brec_user_role", String((data as any).role || "cashier"));
      setBranchStaffAccessState("ready");
    };
    void loadBranchStaff();
    return () => { active = false; };
  }, [hasExecutivePosAccess, posStoreId, setActiveStaff, setUserRole, userId]);

  // Use optimized hooks for data fetching
  const { data: rawInventory, isLoading: invLoading } = useOptimizedInventory(currentStoreId, userId);
  const { data: rawSales, isLoading: salesLoading } = useOptimizedSales(currentStoreId, userId);
  const { data: rawExpenses, isLoading: expensesLoading } = useOptimizedExpenses(currentStoreId, userId);
  const { data: rawCashTransactions } = useOptimizedCashTransactions(currentStoreId, userId);

  // Real-time sync: listen for changes from other devices
  useRealtimeSync(currentStoreId);
  // Visibility refresh: refetch stale data when returning from minimized state
  useVisibilityRefresh(currentStoreId);

  // Sync hook data to state (to maintain compatibility with existing handlers)
  useEffect(() => {
    const dedupedInventory = dedupeRowsById(rawInventory as Array<{ id?: string }> | null | undefined);
    if (dedupedInventory.length === 0) {
      setStockData([]);
      return;
    }

    setStockData(dedupedInventory.map((item: { 
      id: string; product_name: string; category: string | null; quantity: number; cost_per_unit: number; 
      total_value: number; date_of_purchase: string; sachets_count?: number; loose_items?: number; 
      opened_sachets?: number; items_per_sachet?: number; retail_price?: number; wholesale_price?: number; 
      barcode?: string; barcode_type?: string; barcode_mode?: string; store_id: string; size?: string; 
      min_stock_level?: number; reorder_quantity?: number; notes?: string; packaging_type?: string; 
      unit_name?: string; supplier?: string; product_image?: string; created_at: string 
    }) => ({
      id: item.id,
      productName: item.product_name,
      category: item.category,
      quantity: item.quantity,
      costPerUnit: item.cost_per_unit,
      cost_per_unit: item.cost_per_unit,
      totalValue: item.total_value,
      dateOfPurchase: item.date_of_purchase,
      sachets_count: item.sachets_count || 0,
      loose_items: item.loose_items || 0,
      opened_sachets: item.opened_sachets || 0,
      items_per_sachet: item.items_per_sachet || 1,
      retail_price: item.retail_price || 0,
      wholesale_price: item.wholesale_price || 0,
      barcode: item.barcode,
      barcode_type: item.barcode_type,
      barcode_mode: item.barcode_mode as "standard" | "each_item" | "loose",
      product_name: item.product_name,
      store_id: item.store_id,
      size: item.size,
      min_stock_level: item.min_stock_level || 10,
      reorder_quantity: item.reorder_quantity || 20,
      notes: item.notes,
      packaging_type: item.packaging_type,
      unit_name: item.unit_name,
      supplier: item.supplier,
      productImage: item.product_image,
      dateOfEntry: item.created_at
    })));
  }, [rawInventory]);

  useEffect(() => {
    const dedupedSales = dedupeRowsById(rawSales as Array<{ id?: string }> | null | undefined);
    if (dedupedSales.length === 0) {
      setSalesData([]);
      return;
    }

    setSalesData(dedupedSales.map((sale: { 
      id: string; customer_name: string | null; date_of_sale: string; total_amount: number; 
      paid_in_cash?: boolean; products: unknown; staff_id: string | null; 
      payment_method_id?: string | null; payment_details?: unknown 
    }) => ({
      id: sale.id,
      customerName: sale.customer_name,
      dateOfSale: sale.date_of_sale,
      totalAmount: sale.total_amount,
      paidInCash: sale.paid_in_cash || false,
      products: parseSaleProducts(sale.products),
      staff_id: sale.staff_id,
      paymentMethodId: sale.payment_method_id ?? null,
      paymentDetails: sale.payment_details ?? null,
    })));
  }, [rawSales]);

  useEffect(() => {
    const dedupedExpenses = dedupeRowsById(rawExpenses as Array<{ id?: string }> | null | undefined);
    if (dedupedExpenses.length === 0) {
      setExpensesData([]);
      return;
    }

    setExpensesData(dedupedExpenses.map((exp: { 
      id: string; description: string | null; amount: number; category: string | null; 
      date_of_expense: string; payment_method: string | null 
    }) => ({
      id: exp.id,
      description: exp.description,
      amount: exp.amount,
      category: exp.category,
      date: exp.date_of_expense,
      paymentMethod: exp.payment_method,
    })));
  }, [rawExpenses]);

  // Recalculate available cash from cash_transactions only (avoids double-counting).
  useEffect(() => {
    if (!userId || !currentStoreId || !rawCashTransactions) return;

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

  // Update loading state based on hooks — only show loading on true first fetch (no cached data)
  const dataLoadingState = (invLoading && !stockData.length) || (salesLoading && !salesData.length);
  useEffect(() => {
    setDataLoading(dataLoadingState);
  }, [dataLoadingState]);

  // When the active store changes, keepPreviousData handles the transition —
  // don't set dataLoading=true as it causes unnecessary flicker
  // useEffect removed: was setDataLoading(true) on currentStoreId change

  // Categories: keep a stable list even when no inventory items are currently in a category.
  useEffect(() => {
    if (!userId || !currentStoreId) return;

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
        const { data, error } = await (supabase
          .from("categories") as any)
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
    if (themeValue === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  const applyColorScheme = (scheme: string) => {
    const root = window.document.documentElement;
    root.classList.remove('theme-ocean', 'theme-purple', 'theme-forest', 'theme-sunset', 'theme-royal', 'theme-midnight', 'theme-rose', 'theme-teal');
    if (scheme !== 'default') {
      root.classList.add(`theme-${scheme}`);
    }
  };

  // Colour themes are stored per branch so a branch's theme cannot bleed into
  // the others. The active store is persisted as `brec_current_store`.
  const colorSchemeKey = (storeId: string | null | undefined) =>
    storeId ? `app_color_scheme_${storeId}` : 'app_color_scheme';

  const applyScopedColorScheme = (storeId: string | null | undefined, fallback: string) => {
    try {
      const scoped = localStorage.getItem(colorSchemeKey(storeId));
      applyColorScheme(scoped || fallback || 'default');
    } catch {
      applyColorScheme(fallback || 'default');
    }
  };

  // Prevent accidental page exit with confirmation
  useEffect(() => {
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
    setRoleResolved(false);
    setResolvedWorkspaceRole(null);
    setRoleResolutionError(false);
    
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

            // Keep the root neutral if identity cannot be verified. Falling back
            // to persisted POS state here would expose the wrong workspace.
            setIsLoading(false);
            setRoleResolutionError(true);
            return;
          }

          if (!session) {
            localStorage.removeItem('brec_is_admin');
            setRoleResolved(false);
            setResolvedWorkspaceRole(null);
            navigate("/auth");
            return;
          }

          setRoleResolutionError(false);
          setUserId(session.user.id);

          // Only `admin` is a global app_role in installations that predate the
          // executive migration. Branch-level accountant/boss access lives in
          // store_access, so do not pass those values to has_role: older enum
          // definitions reject them and turn a normal login into a 400 loop.
          const [adminResult, ownedStoresResult, accessResult] = await Promise.all([
            supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' }),
            supabase.from("stores").select("id").eq("user_id", session.user.id).limit(1),
            supabase.from("store_access").select("store_id, role").eq("user_id", session.user.id),
          ]);
          if (adminResult.error || ownedStoresResult.error || accessResult.error) {
            throw adminResult.error || ownedStoresResult.error || accessResult.error;
          }

          const hasAdminRole = adminResult.data;
          const hasOwnedStore = Boolean(ownedStoresResult.data?.length);
          const hasBossAccess = accessResult.data?.some((access) => access.role === "boss");
          const hasAccountantAccess = accessResult.data?.some((access) => access.role === "accountant");
          const adminStatus = !!hasAdminRole;
          // Store ownership is the authoritative executive signal. A user who
          // is not an owner can still receive executive/boss or accountant
          // access through an explicit branch assignment.
          const branchRole = accessResult.data?.find((access) => !["boss", "accountant"].includes(access.role))?.role;
          const workspaceRole: string = hasOwnedStore
            ? "owner"
            : hasBossAccess
              ? "boss"
              : hasAccountantAccess
              ? "accountant"
              : branchRole || "owner";
          setIsAdmin(adminStatus);
          localStorage.setItem('brec_is_admin', adminStatus.toString());
          setIsLoading(false);
          setUserRole(workspaceRole);
          setResolvedWorkspaceRole(["owner", "boss", "accountant"].includes(workspaceRole) ? workspaceRole as ResolvedWorkspaceRole : null);
          // Executive users always begin at the executive workspace on root.
          if (!posStoreId && (workspaceRole === "owner" || workspaceRole === "boss" || workspaceRole === "accountant")) setCurrentPage(workspaceRole === "accountant" ? "accountant-dashboard" : "boss-dashboard");
          // Do not allow persisted role/page state to select a shell before the
          // server-side persona checks above have completed.
          setRoleResolved(true);

          // Apply saved theme (light or dark)
          const key = localStorage.getItem('brec_current_store') ? `app_theme_${localStorage.getItem('brec_current_store')}` : 'app_theme';
          applyTheme(localStorage.getItem(key) || 'light');

          // Apply saved color scheme for the active branch
          const { data: profile, error: profileError } = await supabase
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
            });
          }

          const savedColorScheme = profile?.color_scheme || 'default';
          applyScopedColorScheme(
            localStorage.getItem('brec_current_store') || posStoreId || null,
            savedColorScheme,
          );

          // Auto-select first store after session is established
          const { data: ownedStores, error: ownedError } = await supabase
            .from("stores")
            .select("id, store_name")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: true });

          if (!posStoreId && !ownedError && ownedStores && ownedStores.length > 0) {
            setCurrentStoreId(ownedStores[0].id);
          }
        } catch (error) {
          console.error("Unexpected error during session check:", error);
          const msg = String((error as any)?.message || "");

          if (msg.includes("refresh_token_not_found") || msg.includes("Refresh Token Not Found")) {
            await supabase.auth.signOut();
            setRoleResolved(false);
            setResolvedWorkspaceRole(null);
            navigate("/auth");
            return;
          }

          if (attempt < maxAttempts) {
            setTimeout(() => void run(attempt + 1), 850);
            return;
          }

          setIsLoading(false);
          setRoleResolutionError(true);
        }
      };

      void run(1);
    };

    checkSession();
    
    return () => {
      mounted = false;
    };
  }, [navigate, posStoreId]);

  // Listen to auth state changes
  useEffect(() => {
    let mounted = true;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // Only navigate to auth on explicit SIGNED_OUT event, not on TOKEN_REFRESHED or other events
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('brec_is_admin');
        localStorage.removeItem('brec_current_page');
        setRoleResolved(false);
        setResolvedWorkspaceRole(null);
        setRoleResolutionError(false);
        let returnToBranchLogin: string | null = null;
        try {
          returnToBranchLogin = sessionStorage.getItem('brec_return_to_branch_login');
          sessionStorage.removeItem('brec_return_to_branch_login');
        } catch {}
        navigate(returnToBranchLogin ? `/branch-login?branch=${encodeURIComponent(returnToBranchLogin)}` : "/auth");
        // Clear all data on logout
        setStockData([]);
        setSalesData([]);
        setExpensesData([]);
        setAvailableCash(0);
        setUserId(null);
        setCurrentStoreId(null);
        setCurrentPage("dashboard");
        setPageParams(null);
        setActiveStaff(null);
        setUserRole("owner");
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
    if (!userId || currentStoreId || posStoreId) return;

    const selectFirstStore = async () => {
      try {
        // Only get user's OWNED stores for dashboard
        const { data: ownedStores, error: ownedError } = await supabase
          .from("stores")
          .select("id, store_name, user_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (ownedError) {
          console.error("Error fetching owned stores:", ownedError);
        }

        if (ownedStores && ownedStores.length > 0) {
          setCurrentStoreId(ownedStores[0].id);
          // Ownership always receives the executive owner workspace. Boss is a
          // branch assignment, not a global role RPC, for backwards-compatible
          // deployments where app_role does not contain `boss`.
          setUserRole("owner");
        } else {
          // Check access for shared stores if no owned stores
          const { data: accessData } = await supabase
            .from("store_access")
            .select("store_id, role")
            .eq("user_id", userId)
            .limit(1);

          if (accessData && accessData.length > 0) {
            setCurrentStoreId(accessData[0].store_id);
            const role = accessData[0].role;
            setUserRole(role);
          }
        }
      } catch (error) {
        console.error("Error selecting first store:", error);
      }
    };

    selectFirstStore();
  }, [userId, currentStoreId, posStoreId]);

  // Refresh data from Supabase
  const refreshData = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
  }, [queryClient]);

  // Load data from Supabase when userId or currentStoreId changes
  useEffect(() => {
    // The hooks handle initial loading based on currentStoreId and userId
  }, [currentStoreId, userId]);

  // Set up realtime subscriptions for automatic updates across devices
  useEffect(() => {
    if (!userId || !currentStoreId) return;

    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, currentStoreId, queryClient]);

  const handleAddStock = (stockItem: StockItem) => {
    setStockData(prev => [stockItem, ...prev]);
    refreshData();
  };

  const handleAddSale = (saleItem: SaleItem) => {
    // Don't add optimistic entries to salesData — the sale is already persisted
    // by the time onAddSale is called (mutation is awaited). Just refresh so the
    // real server data (with the correct ID) replaces any stale cache.
    void refreshData();
  };

  const handleUpdateSale = (saleId: string, updates: Partial<SaleItem>) => {
    setSalesData(prev => prev.map(sale =>
      sale.id === saleId ? { ...sale, ...updates } : sale
    ));
  };

  const handleDeleteSale = (saleId: string) => {
    setSalesData(prev => prev.filter(s => s.id !== saleId));
  };

  const handleAddExpense = (expense: ExpenseItem) => {
    setExpensesData(prev => [expense, ...prev]);
    refreshData();
  };

  const handleDeleteExpense = (expenseId: string) => {
    setExpensesData(prev => prev.filter(exp => exp.id !== expenseId));
  };

  const handleUpdateCash = (amount: number) => {
    // onUpdateCash is used as a delta across the app (positive=in, negative=out).
    setAvailableCash((prev) => Math.max(0, (prev || 0) + (Number(amount) || 0)));
  };

  const handleDataImport = (data: { stock: StockItem[], sales: SaleItem[], expenses: ExpenseItem[] }) => {
    setStockData(data.stock);
    setSalesData(data.sales);
    setExpensesData(data.expenses);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem('brec_onboarding_complete', 'true');
  };

  const handleStaffLogin = (staff: Staff) => {
    setActiveStaff(staff);
    try { const key = posStoreId ? `brec_active_staff_${posStoreId}` : (localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'); localStorage.setItem(key, JSON.stringify(staff)); } catch {}
    setUserRole(staff.role);
    localStorage.setItem('brec_user_role', staff.role);
    toast({
      title: "Staff Login Successful",
      description: `Welcome back, ${staff.full_name}`,
    });
  };

  const handleStaffLogout = () => {
    setActiveStaff(null);
    try { const key = posStoreId ? `brec_active_staff_${posStoreId}` : (localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'); localStorage.removeItem(key); } catch {}
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

  // Re-apply the colour theme whenever the active branch changes, so each
  // branch keeps its own theme instead of inheriting the previous one's.
  useEffect(() => {
    if (!roleResolved || !userId) return;
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("color_scheme")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      applyScopedColorScheme(currentStoreId, profile?.color_scheme || 'default');
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStoreId, roleResolved, userId]);

  // Financial calculations for the dashboard
  const totalRevenue = useMemo(() => {
    return salesData.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
  }, [salesData]);

  // COGS = sum of (quantity sold × cost_per_unit) for each product in each sale.
  // Prefer matching by product id; fall back to a normalized name match.
  const totalCOGS = useMemo(() => {
    const normalize = (s: string) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const byId = new Map(stockData.map((s) => [s.id, s] as const));
    const byName = new Map(stockData.map((s) => [normalize(s.productName), s] as const));

    let sum = 0;
    for (const sale of salesData) {
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
  }, [salesData, stockData]);

  const totalExpenses = useMemo(() => {
    return expensesData.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  }, [expensesData]);

  // Net profit = Revenue - Cost of Goods Sold - Operating Expenses
  const totalProfit = useMemo(() => {
    return totalRevenue - totalCOGS - totalExpenses;
  }, [totalRevenue, totalCOGS, totalExpenses]);

  // Stock value = current inventory at cost (what's left in stock)
  const stockValue = useMemo(() => {
    return stockData.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const cost = Number(item.cost_per_unit ?? item.costPerUnit ?? 0) || 0;
      return sum + qty * cost;
    }, 0);
  }, [stockData]);

  const financialData = useMemo(() => {
    const now = new Date();
    const todayKey = toLocalDateKey(now);
    const todayEnd = endOfLocalDay(now);
    const weekStart = startOfLocalDay(now);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = startOfLocalDay(now);
    monthStart.setMonth(monthStart.getMonth() - 1);

    // Single pass over salesData for all period totals
    let dailySales = 0, weeklySales = 0, monthlySales = 0;
    for (const sale of salesData) {
      if (!sale.dateOfSale) continue;
      const amount = sale.totalAmount || 0;
      const d = parseAnyDateToLocalDate(sale.dateOfSale);
      if (!d) continue;
      if (d >= monthStart && d <= todayEnd) {
        monthlySales += amount;
        if (d >= weekStart) {
          weeklySales += amount;
          if (toLocalDateKey(d) === todayKey) dailySales += amount;
        }
      }
    }

    return {
      cashOnHand: availableCash,
      stockValue,
      dailySales,
      weeklySales,
      monthlySales,
      totalPurchaseCost: totalCOGS,
      totalRevenue,
      totalProfit,
      availableCash,
      totalExpenses,
    };
  }, [availableCash, salesData, stockValue, totalCOGS, totalRevenue, totalProfit, totalExpenses]);
  const renderPage = () => {
    // At the root, executive users never render an operational POS page. This
    // guard intentionally precedes legacy page/error handling, whose state may
    // have been restored from a previous branch POS session.
    if (isExecutiveRoot) {
      switch (executivePage) {
        case "accountant-dashboard":
          return <RoleDashboards mode="accountant" userId={userId} onOpenReports={() => handlePageChange("executive-reports")} />;
        case "executive-branches":
          return <ExecutiveWorkspace page="executive-branches" userId={userId} onOpenBranch={openBranchPos} />;
        case "executive-finance":
          return <ExecutiveWorkspace page="executive-finance" userId={userId} onOpenBranch={openBranchPos} />;
        case "executive-expenses":
          return <ExecutiveExpenses userId={userId} />;
        case "executive-accounts":
          return <PaymentAccounts executive userId={userId} />;
        case "executive-team":
          return <ExecutiveTeamAccess userId={userId} />;
        case "executive-reports":
          return userRole === "accountant"
            ? <RoleDashboards mode="accountant" userId={userId} onOpenReports={() => {}} />
            : <ExecutiveWorkspace page="executive-reports" userId={userId} onOpenBranch={openBranchPos} />;
        case "executive-settings":
          return <ExecutiveWorkspace page="executive-settings" userId={userId} onOpenBranch={openBranchPos} />;
        case "scheduled-payments":
          return <ScheduledPayments currentStoreId={null} executive />;
        default:
          return <ExecutiveWorkspace page="boss-dashboard" userId={userId} onOpenBranch={openBranchPos} />;
      }
    }

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
        if (userRole === "accountant") return <RoleDashboards mode="accountant" userId={userId} onOpenReports={() => handlePageChange("reports")} />;
        return (
          <Dashboard
            stockData={stockData}
            salesData={salesData}
            expensesData={expensesData}
            financialData={financialData}
            onUpdateCash={handleUpdateCash}
            onUpdateSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
            onPageChange={handlePageChange}
            onOpenCashManagement={() => setShowCashPopup(true)}
          />
        );
      case "returns":
        return <ReturnsAndDamaged
          stockData={stockData}
          salesData={salesData}
          currentStoreId={currentStoreId}
          onStockUpdate={(updated) => setStockData(stockData.map(s => s.id === updated.id ? updated : s))}
          onSaleUpdate={(updatedSale) => {
            setSalesData(prev => prev.map(s => s.id === updatedSale.id ? { ...s, ...updatedSale } : s));
            void refreshData();
          }}
          pageParams={pageParams as any}
        />;
      case "stores":
        return <Stores currentStoreId={currentStoreId} onStoreChange={setCurrentStoreId} branchRestricted={Boolean(posStoreId && activeStaff && !hasExecutivePosAccess)} />;
      case "accountant-dashboard":
        return <RoleDashboards mode="accountant" userId={userId} onOpenReports={() => handlePageChange("reports")} />;
      case "products":
        return <Products stockData={stockData} onUpdateStock={(updated) => setStockData((current) => current.map(s => s.id === updated.id ? updated : s))} onDeleteStock={(id) => setStockData((current) => current.filter((item) => item.id !== id))} currentStoreId={currentStoreId} />;
      case "suppliers":
        return <Suppliers currentStoreId={currentStoreId} onOpenReports={() => handlePageChange("supplier-reports")} onOpenScheduledPayments={() => handlePageChange("scheduled-payments")} />;
      case "supplier-reports":
        return <SupplierReports currentStoreId={currentStoreId} onBack={() => handlePageChange("suppliers")} />;
      case "stock-entry":
        return <StockEntry pageParams={pageParams} availableCash={availableCash} currentStoreId={currentStoreId} />;
      case "sales-entry":
        return <SalesEntry stockData={stockData} onAddSale={handleAddSale} currentStoreId={currentStoreId} />;
      case "inventory":
        return <InventoryManagement
          stockData={stockData}
          setStockData={setStockData}
          categories={categories}
          currentPage={currentPage}
          isLoading={invLoading}
        />;
      case "scheduled-payments":
        return <ScheduledPayments currentStoreId={currentStoreId} />;
      case "tracker":
        return <Tracker />;
      case "barcode-manager":
        return <BarcodeManager stockData={stockData} currentStoreId={currentStoreId} />;
      case "reports":
        return <Reports stockData={stockData} salesData={salesData} expensesData={expensesData} currentStoreId={currentStoreId || undefined} onPageChange={handlePageChange} />;
      case "expenses":
        return <Expenses expensesData={expensesData} onAddExpense={handleAddExpense} onDeleteExpense={handleDeleteExpense} currentStoreId={currentStoreId} isLoading={expensesLoading} />;
      case "accounts":
        return <PaymentAccounts currentStoreId={currentStoreId} />;
      case "banking":
        return <BankCash currentStoreId={currentStoreId} availableCash={availableCash} onCashDelta={handleUpdateCash} />;
      case "customers":
        return <Customers currentStoreId={currentStoreId} />;
      case "shifts":
        return <Shifts onUpdateCash={handleUpdateCash} onRefresh={refreshData} onStaffLogin={handleStaffLogin} onStaffLogout={handleStaffLogout} />;
      case "security":
        return <AuditLogs />;
      case "settings":
        return <Settings stockData={stockData} salesData={salesData} expensesData={expensesData} currentStoreId={currentStoreId} onDataImport={handleDataImport} branchRestricted={Boolean(posStoreId && !hasExecutivePosAccess)} />;
      default:
        return (
          <Dashboard
            stockData={stockData}
            salesData={salesData}
            expensesData={expensesData}
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
    if (hasExecutivePosAccess) return [];
    if (!activeStaff?.allowed_pages) return [];
    return Array.isArray(activeStaff.allowed_pages) ? (activeStaff.allowed_pages as string[]).filter(isBranchAssignablePosPage) : [];
  }, [activeStaff?.allowed_pages, hasExecutivePosAccess]);

  // Enforce page restrictions: if staff tries to access unauthorized page, redirect
  const effectivePage = useMemo(() => {
    if (hasExecutivePosAccess || isAdmin || userRole === "owner" || userRole === "boss") return currentPage;
    // A direct branch session never receives an implicit POS allow-list. The
    // branch access state below blocks rendering until its staff assignment is
    // loaded, and an empty server allow-list remains deliberately unusable.
    if (posStoreId && (!activeStaff || staffAllowedPages.length === 0)) return currentPage;
    if (currentPage === "stores") return currentPage;
    if (staffAllowedPages.includes(currentPage)) return currentPage;
    return staffAllowedPages[0] || "sales-entry";
  }, [activeStaff, hasExecutivePosAccess, isAdmin, userRole, currentPage, posStoreId, staffAllowedPages]);

  // Sync if page was redirected
  useEffect(() => {
    if (effectivePage !== currentPage) {
      setCurrentPage(effectivePage);
    }
  }, [effectivePage, currentPage]);

  // Removed full-screen loading guard – open instantly

  // Root routing must not trust the persisted Zustand role while the current
  // authenticated session is still being resolved. A neutral shell prevents a
  // stale manager/cashier page from flashing before an owner/boss is placed in
  // the executive workspace.
  if (isRootRoute && !posStoreId && !roleResolved && roleResolutionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Workspace check unavailable</h1>
          <p className="mt-2 text-sm text-slate-300">We could not verify your account workspace. Please reload to try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            Reload workspace
          </button>
        </div>
      </div>
    );
  }

  if (isRootRoute && !posStoreId && !roleResolved) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,rgba(74,222,128,0.11),transparent_32rem)]" />
        <div
          className="relative grid h-16 w-16 place-items-center border border-white/10 bg-slate-900/80 shadow-[0_0_0_10px_rgba(255,255,255,0.025)]"
          role="status"
          aria-live="polite"
          aria-label="Preparing your workspace"
        >
          <div className="absolute inset-2 border border-emerald-400/25 motion-safe:animate-[spin_2.4s_linear_infinite] motion-reduce:animate-none" />
          <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.85)] motion-safe:animate-pulse motion-reduce:animate-none" />
            <span className="h-2.5 w-2.5 bg-white/80" />
            <span className="h-2.5 w-2.5 bg-white/35" />
            <span className="h-2.5 w-2.5 bg-emerald-300/55" />
          </div>
          <span className="sr-only">Preparing your workspace</span>
        </div>
      </div>
    );
  }

  // Direct operational URLs must never inherit access from a persisted POS
  // session. Wait for the matching authenticated staff assignment, then fail
  // closed if the account is unassigned or has no pages granted.
  if (posStoreId && (!roleResolved || (!hasExecutivePosAccess && branchStaffAccessState === "loading"))) {
    return <PageLoader text="Confirming your branch access" className="min-h-screen" />;
  }

  if (posStoreId && !hasExecutivePosAccess && (branchStaffAccessState === "missing" || staffAllowedPages.length === 0)) {
    const noPages = branchStaffAccessState === "ready" && staffAllowedPages.length === 0;
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md border border-amber-200 bg-white p-7 text-center shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Branch access required</p><h1 className="mt-2 text-xl font-semibold text-slate-950">{noPages ? "No POS pages assigned" : "Branch account not found"}</h1><p className="mt-2 text-sm text-slate-600">{noPages ? "Your executive needs to assign at least one POS page before you can use this branch." : "Sign in with the branch user account assigned by your executive."}</p><button type="button" onClick={() => navigate(`/branch-login?branch=${encodeURIComponent(posStoreId)}`)} className="mt-5 w-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2">Return to branch sign in</button></div></main>;
  }

  // Owners and bosses should always land in the executive workspace first.
  // Operational onboarding remains available to non-executive POS users.
  if (showOnboarding && !posStoreId && !isExecutiveRoot && userRole !== "owner" && userRole !== "boss") {
    return <OnboardingIntro onComplete={handleOnboardingComplete} />;
  }

  if (isInitialSyncing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <LoadingSpinner size="xl" />
        <div className="mt-4 text-center">
          <h2 className="text-xl font-semibold">Preparing your store...</h2>
          <p className="text-muted-foreground text-sm">Loading your latest data</p>
        </div>
      </div>
    );
  }

  if (isExecutiveRoot) {
    return (
      <ExecutiveLayout
        currentPage={executivePage}
        onPageChange={(page) => {
          if (!executivePages.has(page)) {
            setCurrentPage("boss-dashboard");
            setPageParams(null);
            return;
          }
          handlePageChange(page);
        }}
        userRole={userRole}
        userId={userId}
      >
        {renderPage()}
      </ExecutiveLayout>
    );
  }

  return (
    <Layout
      currentPage={effectivePage}
      onPageChange={(page) => {
        if (isExecutiveRoot && !executivePages.has(page)) {
          setCurrentPage("boss-dashboard");
          setPageParams(null);
          return;
        }
        // Block unauthorized page access for staff
        if (posStoreId && !hasExecutivePosAccess && !isAdmin && (!["owner", "boss"].includes(userRole)) && (!activeStaff || (page !== "stores" && !staffAllowedPages.includes(page)))) {
          toast({ title: "Access Denied", description: "You don't have permission to access this page.", variant: "destructive" });
          return;
        }
        handlePageChange(page);
      }}
      stockData={stockData}
      currentStoreId={currentStoreId}
      onRefresh={refreshData}
      onOpenCashManagement={() => setShowCashPopup(true)}
      userRole={isAdmin ? "admin" : hasExecutivePosAccess ? "owner" : userRole}
      allowedPages={staffAllowedPages}
      onReturnToExecutive={posStoreId ? () => navigate("/") : undefined}
      branchName={posStoreId ? branchName : undefined}
    >
      {renderPage()}

      {/* Cash Management Popup */}
      <Dialog open={showCashPopup} onOpenChange={setShowCashPopup}>
        <DialogContent className="max-w-2xl p-0 overflow-y-auto overscroll-contain border-none bg-transparent">
          <CashManagement
            availableCash={availableCash}
            storeId={currentStoreId ?? undefined}
            onUpdateCash={handleUpdateCash}
            onClose={() => setShowCashPopup(false)}
          />
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Index;
