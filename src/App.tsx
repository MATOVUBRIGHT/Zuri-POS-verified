// App.tsx - Optimized and Fixed Version
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast as notify } from "sonner";
import { PrinterProvider } from "@/providers/PrinterProvider";
import { ShiftProvider, useShift } from "@/providers/ShiftProvider";
import { SubscriptionProvider, useSubscription } from "@/providers/SubscriptionProvider";
import { QuickAppSkeleton } from "@/components/AppSkeleton";
import { startupOptimizer } from "./lib/startupOptimizer";

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
const BranchPos = lazy(() => import("./pages/BranchPos"));
const BranchLogin = lazy(() => import("./pages/BranchLogin"));
const MobileAction = lazy(() => import("./pages/MobileAction"));

// Temporary demo component for the new loader
const LoaderDemo = lazy(() => import("./components/LoaderDemo").then(m => ({ default: m.LoaderDemo })));

const enterMovesToNextInput = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || event.defaultPrevented) return;

  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (["hidden", "button", "submit", "reset", "checkbox", "radio", "file", "range"].includes(target.type)) return;

  const form = target.form;
  if (!form) return;

  const fields = Array.from(form.querySelectorAll<HTMLInputElement>(
    'input:not([disabled]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"])'
  )).filter((field) => field.offsetParent !== null);
  const currentIndex = fields.indexOf(target);
  const nextField = fields[currentIndex + 1];

  // Let the browser submit when this is the last input in the form.
  if (!nextField) return;

  event.preventDefault();
  nextField.focus();
  nextField.select?.();
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

  return (
    <SubscriptionProvider userId={user?.id || null}>
      {children}
    </SubscriptionProvider>
  );
};

// Guard component - enforces login + active subscription (admins bypass)
const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading: shiftLoading, user, isAdmin, isStable } = useShift();
  const { subscription, loading: subLoading } = useSubscription();
  const location = useLocation();

  // Only show loading if we're not stable yet (prevents blinking during auth)
  if (!isStable && shiftLoading && !user) return <QuickAppSkeleton />;

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (isAdmin) return <>{children}</>;

  if (subscription?.status === 'active') return <>{children}</>;

  // Still loading subscription in background but we have a user — render children optimistically
  if (subLoading) return <>{children}</>;

  return <Navigate to="/plans" state={{ from: location }} replace />;
};

// Guard component - enforces login using centralized useShift hook
const AuthShiftGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading: shiftLoading, user, isStable } = useShift();
  const location = useLocation();

  // Only show loading if we're not stable yet (prevents blinking)
  if (!isStable && shiftLoading && !user) return <QuickAppSkeleton />;

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const shouldUseAuthShell = (pathname: string) => {
  if (pathname === "/") return true;
  if (pathname.startsWith("/store/")) return true;
  if (pathname.startsWith("/pos/")) return true;
  if (pathname.startsWith("/admin-portal")) return true;
  if (pathname.startsWith("/master-developer")) return true;
  if (pathname.startsWith("/plans")) return true;
  return false;
};

const AppRoutes = () => {
  const location = useLocation();
  const useAuthShell = shouldUseAuthShell(location.pathname);

  const routes = (
    <Suspense fallback={<QuickAppSkeleton />}>
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
        {/* Temporary loader demo route */}
        <Route path="/loader-demo" element={<LoaderDemo />} />
        {/* Main app routes - require subscription */}
        <Route path="/" element={<SubscriptionGuard><Index /></SubscriptionGuard>} />
        {/* BranchPos performs its own branch-aware session check so an
            unauthenticated direct POS link can return to the
            matching branch login instead of generic /auth. */}
        <Route path="/pos/:storeId" element={<BranchPos />} />
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
          <Suspense fallback={<QuickAppSkeleton />}>
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
    const isAggressiveCache = localStorage.getItem('pos_aggressive_cache') === 'true';
    if (isAggressiveCache) {
      console.log('Aggressive caching enabled');
    }
    
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
