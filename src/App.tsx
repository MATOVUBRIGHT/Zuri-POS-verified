// App.tsx - Optimized and Fixed Version
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { Clock, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast as notify } from "sonner";
import { PrinterProvider } from "@/providers/PrinterProvider";
import { ShiftProvider, useShift } from "@/providers/ShiftProvider";
import { SubscriptionProvider, useSubscription } from "@/providers/SubscriptionProvider";
import { PageLoader } from "@/components/ui/loading-spinner";
import { startupOptimizer } from "./lib/startupOptimizer";
import { DeveloperBroadcastListener } from "@/components/DeveloperBroadcastListener";
import { useAppStateStore } from "@/store/appStateStore";

// Lazy loading for all routes to improve initial load time
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));
const StoreView = lazy(() => import("./pages/StoreView"));
const Install = lazy(() => import("./pages/Install"));
const Plans = lazy(() => import("./pages/Plans"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminVerification = lazy(() => import("./pages/AdminVerification"));
const AdminPortalLayout = lazy(() => import("./pages/AdminPortalLayout"));
const AdminPortalHome = lazy(() => import("./pages/AdminPortalHome"));
const AdminPortalPayments = lazy(() => import("./pages/AdminPortalPayments"));
const AdminPortalModeration = lazy(() => import("./pages/AdminPortalModeration"));
const MasterDeveloper = lazy(() => import("./pages/MasterDeveloper"));
const DeveloperAccess = lazy(() => import("./pages/DeveloperAccess"));
const BranchPos = lazy(() => import("./pages/BranchPos"));
const BranchLogin = lazy(() => import("./pages/BranchLogin"));
const MobileAction = lazy(() => import("./pages/MobileAction"));

// Temporary demo component for the new loader
const LoaderDemo = lazy(() => import("./components/LoaderDemo").then(m => ({ default: m.LoaderDemo })));

const enterMovesToNextInput = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || event.defaultPrevented) return;

  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.enterSubmit === "true" || target.closest("[data-enter-navigation='off']")) return;
  if (["hidden", "button", "submit", "reset", "checkbox", "radio", "file", "range"].includes(target.type)) return;

  const form = target.form;
  if (!form) return;

  const fields = Array.from(form.querySelectorAll<HTMLInputElement>(
    'input:not([disabled]):not([readonly]):not([aria-hidden="true"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"])'
  )).filter((field) => field.getClientRects().length > 0 && !field.closest("[aria-hidden='true']"));
  const currentIndex = fields.indexOf(target);
  const nextField = fields[currentIndex + 1];

  // Let the browser submit when this is the last input in the form.
  if (!nextField) return;

  event.preventDefault();
  event.stopPropagation();
  window.requestAnimationFrame(() => {
    nextField.focus({ preventScroll: true });
    nextField.select?.();
  });
};

// Configure React Query for optimal performance
const isNonRetryable = (error: any) => {
  const status = Number(error?.status || error?.cause?.status || 0);
  const code = String(error?.code || "");

  // Don't retry 4xx (except 429) or schema/validation/unique errors.
  const isClientError = status >= 400 && status < 500 && status !== 429;
  const isSchemaError = code.startsWith("PGRST2"); // e.g., missing column in schema cache
  const isUniqueViolation = code === "23505";

  return isClientError || isSchemaError || isUniqueViolation;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60 * 4,   // 4 hours - even longer staleness for better performance
      gcTime: 1000 * 60 * 60 * 72,     // 72 hours - extended cache retention
      refetchOnWindowFocus: false,     // Never refetch on focus
      refetchOnReconnect: false,       // Only manual refetch or mutation invalidation
      refetchOnMount: false,           // Always use cache first
      refetchInterval: false,          // Disable automatic refetching
      retry: (failureCount, error) => {
        if (isNonRetryable(error)) return false;
        return failureCount < 1; // Reduce retries for faster failures
      },
      retryDelay: (attemptIndex) => Math.min(300 * 2 ** attemptIndex, 10000), // Faster retry delays
      networkMode: 'offlineFirst',     // Prioritize cache over network
    },
    mutations: {
      retry: (failureCount, error) => {
        if (isNonRetryable(error)) return false;
        return failureCount < 1; // Single retry only for mutations
      },
      networkMode: 'offlineFirst',     // Prioritize cache for mutations too
    },
  },
});

// Wrapper component to provide userId to SubscriptionProvider
const AppWithSubscription = ({ children }: { children: React.ReactNode }) => {
  const { user } = useShift();
  const currentStoreId = useAppStateStore((state) => state.currentStoreId);

  useEffect(() => {
    const applyModernUi = () => {
      try {
        const key = currentStoreId ? `app_modern_ui_${currentStoreId}` : "app_modern_ui";
        document.documentElement.classList.toggle("modern-ui", localStorage.getItem(key) === "true");
      } catch {
        document.documentElement.classList.remove("modern-ui");
      }
    };
    applyModernUi();
    window.addEventListener("modern-ui-change", applyModernUi);
    return () => window.removeEventListener("modern-ui-change", applyModernUi);
  }, [currentStoreId]);

  return (
    <SubscriptionProvider userId={user?.id || null}>
      {children}
      <DeveloperBroadcastListener />
    </SubscriptionProvider>
  );
};

// Guard component - enforces login + active subscription (admins bypass)
const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading: shiftLoading, user, isAdmin, isStable } = useShift();
  const { subscription, loading: subLoading } = useSubscription();
  const location = useLocation();

  // Only show loading if we're not stable yet (prevents blinking during auth)
  if (!isStable && shiftLoading && !user) return <PageLoader text="Checking your session…" className="min-h-screen" />;

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (isAdmin) return <>{children}</>;

  if (subscription?.status === 'active') return <>{children}</>;

  if (subLoading) return <PageLoader text="Checking subscription verification" className="min-h-screen" />;

  if (subscription?.status === 'pending') return <PendingVerificationScreen />;

  return <Navigate to="/plans" state={{ from: location }} replace />;
};

const PendingVerificationScreen = () => {
  const { refreshSubscription } = useSubscription();
  const [refreshing, setRefreshing] = useState(false);

  const checkStatus = async () => {
    setRefreshing(true);
    try { await refreshSubscription(); } finally { setRefreshing(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <main className="flex min-h-screen items-center justify-center overflow-y-auto bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm sm:p-9">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Clock className="h-8 w-8" /></div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Verification required</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Payment verification is pending</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">Your transaction is waiting for the developer to review and approve it. Access will open automatically after approval.</p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-sm text-slate-600"><p className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-amber-600" />No workspace access is available yet</p><p className="mt-2">This page stays in place until the subscription changes to approved. You cannot skip ahead to the workspace.</p></div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center"><button type="button" onClick={() => void checkStatus()} disabled={refreshing} className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Checking..." : "Check verification status"}</button><button type="button" onClick={() => void signOut()} className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><LogOut className="mr-2 h-4 w-4" />Sign out</button></div>
      </section>
    </main>
  );
};

// Guard component - enforces login using centralized useShift hook
const AuthShiftGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading: shiftLoading, user, isStable } = useShift();
  const location = useLocation();

  // Only show loading if we're not stable yet (prevents blinking)
  if (!isStable && shiftLoading && !user) return <PageLoader text="Checking your session…" className="min-h-screen" />;

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// Branch URLs must not become a shortcut around subscription verification.
// Keep the child mounted for an unauthenticated branch link so BranchPos can
// still redirect to its branch-specific login screen.
const BranchSubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading: shiftLoading, user, isAdmin, isStable } = useShift();
  const { subscription, loading: subLoading } = useSubscription();
  const location = useLocation();
  if (!isStable && shiftLoading && !user) return <PageLoader text="Checking your session" className="min-h-screen" />;
  if (!user) return <>{children}</>;
  if (isAdmin || subscription?.status === "active") return <>{children}</>;
  if (subLoading) return <PageLoader text="Checking subscription verification" className="min-h-screen" />;
  if (subscription?.status === "pending") return <PendingVerificationScreen />;
  return <Navigate to="/plans" state={{ from: location }} replace />;
};

const shouldUseAuthShell = (pathname: string) => {
  if (pathname === "/") return true;
  if (pathname.startsWith("/store/")) return true;
  if (pathname.startsWith("/pos/")) return true;
  if (pathname.startsWith("/admin-portal")) return true;
  if (pathname.startsWith("/master-developer")) return true;
  if (pathname.startsWith("/portal")) return true;
  if (pathname.startsWith("/developer.portal")) return true;
  if (pathname.startsWith("/developer")) return true;
  if (pathname.startsWith("/plans")) return true;
  return false;
};

const AppRoutes = () => {
  const location = useLocation();
  const useAuthShell = shouldUseAuthShell(location.pathname);

  const routes = (
    <Suspense fallback={<PageLoader text="Loading page…" className="min-h-screen" />}>
      <Routes>
        {/* Admin routes - outside AuthShiftGuard */}
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/admin-verification" element={<AdminVerification />} />
        <Route path="/admin-portal" element={<AdminPortalLayout />}>
          <Route index element={<AdminPortalHome />} />
          <Route path="payments" element={<AdminPortalPayments />} />
          <Route path="moderation" element={<AdminPortalModeration />} />
        </Route>
        <Route path="/master-developer" element={<AuthShiftGuard><MasterDeveloper /></AuthShiftGuard>} />
        <Route path="/portal" element={<AuthShiftGuard><MasterDeveloper /></AuthShiftGuard>} />
        <Route path="/developer.portal" element={<AuthShiftGuard><MasterDeveloper /></AuthShiftGuard>} />
        <Route path="/developer" element={<DeveloperAccess />} />
        {/* Temporary loader demo route */}
        <Route path="/loader-demo" element={<LoaderDemo />} />
        {/* Main app routes - require subscription */}
        <Route path="/" element={<SubscriptionGuard><Index /></SubscriptionGuard>} />
        {/* BranchPos performs its own branch-aware session check so an
            unauthenticated direct POS link can return to the
            matching branch login instead of generic /auth. */}
        <Route path="/pos/:storeId" element={<BranchSubscriptionGuard><BranchPos /></BranchSubscriptionGuard>} />
        <Route path="/store/:storeId" element={<SubscriptionGuard><StoreView /></SubscriptionGuard>} />
        {/* Auth and plans routes - just need login, not subscription */}
        <Route path="/auth" element={<Auth />} />
        <Route path="/mobile" element={<MobileAction />} />
        <Route path="/branch-login" element={<BranchLogin />} />
        <Route path="/install" element={<Install />} />
        <Route path="/plans" element={<AuthShiftGuard><Plans /></AuthShiftGuard>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );

  if (!useAuthShell) {
    return <ErrorBoundary>{routes}</ErrorBoundary>;
  }

  return (
    <ShiftProvider>
      <PrinterProvider>
        <AppWithSubscription>
          <ErrorBoundary>{routes}</ErrorBoundary>
        </AppWithSubscription>
      </PrinterProvider>
    </ShiftProvider>
  );
};

const App = () => {
  // If this is the mobile upload entrypoint, render a minimal app shell
  // to avoid initializing heavy providers that make cross-origin calls
  // (which can fail on LAN/dev environments and lead to white screens).
  const isMobileEntry = typeof window !== 'undefined' && window.location.pathname.startsWith('/mobile');
  if (isMobileEntry) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Suspense fallback={<PageLoader text="Loading page…" className="min-h-screen" />}>
            <Routes>
              <Route path="/mobile" element={<MobileAction />} />
              <Route path="*" element={<MobileAction />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    );
  }

  useEffect(() => {
    // Start performance monitoring and optimization
    const startTime = performance.now();
    
    // Immediate optimization checks
    // Defer heavy operations to avoid blocking UI
    setTimeout(() => {
      startupOptimizer.measureStartupPerformance();
    }, 0);

    // Monitor memory and performance in dev mode only
    if (process.env.NODE_ENV === 'development') {
      const loadTime = Math.max(0, Date.now() - (window.performance?.timeOrigin || Date.now()));
      console.log('POS App loaded in:', Math.round(loadTime), 'ms');
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", enterMovesToNextInput, true);
    return () => document.removeEventListener("keydown", enterMovesToNextInput, true);
  }, []);

  // Global unhandled rejection handler to prevent white screens from async errors
  useEffect(() => {
    let lastToastAt = 0;
    const notifyOnce = (message: string) => {
      const now = Date.now();
      if (now - lastToastAt < 5000) return;
      lastToastAt = now;
      notify(message);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      notifyOnce("An unexpected error occurred. Please refresh the page.");
      event.preventDefault(); // Prevent crash
    };

    const handleError = (event: ErrorEvent) => {
      console.error("Global error:", event.error || event.message);
      notifyOnce("An unexpected error occurred. Please refresh the page.");
    };

    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
