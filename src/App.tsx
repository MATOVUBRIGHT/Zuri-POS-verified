// App.tsx - Updated with React Query Provider
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { perf } from "./lib/performance";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast as notify } from "sonner";
import { performanceMonitor } from "./lib/performance-monitor";
import { PrinterProvider } from "@/providers/PrinterProvider";
import { ShiftProvider, useShift } from "@/providers/ShiftProvider";
import { SubscriptionProvider, useSubscription } from "@/providers/SubscriptionProvider";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { setupSyncDebug } from "./lib/sync-status";
import { persistActiveQueries, replayCachedQueries } from "./lib/queryCachePersistence";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";

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
      staleTime: 1000 * 60 * 60,   // 1 hour - keep data fresh for much longer
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache even when unused
      refetchOnWindowFocus: false, // Don't refetch just because user switched back
      refetchOnReconnect: true,    // But do refetch if network was lost
      refetchOnMount: false,       // Use cache first, don't refetch on every mount
      retry: (failureCount, error) => {
        if (isNonRetryable(error)) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: (failureCount, error) => {
        if (isNonRetryable(error)) return false;
        return failureCount < 2;
      },
    },
  },
});

const QueryCacheSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    replayCachedQueries(queryClient);
  }, [queryClient]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        persistActiveQueries(queryClient);
      }
    };

    const handleBeforeUnload = () => {
      persistActiveQueries(queryClient);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [queryClient]);

  return null;
};

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
  const { loading: shiftLoading, user, isAdmin } = useShift();
  const { subscription, loading: subLoading } = useSubscription();
  const location = useLocation();

  // Only block render if we have NO cached user at all (first ever load)
  // If we have a user from cache, render immediately and let background refresh happen silently
  const isHardLoading = (shiftLoading && !user) || (subLoading && !subscription && !user);
  if (isHardLoading) return <LoadingSpinner size="xl" fullScreen />;

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
  const { loading: shiftLoading, user } = useShift();
  const location = useLocation();

  if (shiftLoading && !user) return <LoadingSpinner size="xl" fullScreen />;

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

  interface NetworkInformation extends EventTarget {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
    onchange: EventListener;
  }

  interface NavigatorWithConnection extends Navigator {
    connection?: NetworkInformation;
  }



  // Network monitoring component
  const NetworkMonitor = () => {
    const [networkStatus, setNetworkStatus] = useState({
      online: navigator.onLine,
      effectiveType: "unknown",
      downlink: 0,
      rtt: 0
    });

    useEffect(() => {
      const updateNetworkStatus = () => {
        const connection = (navigator as NavigatorWithConnection).connection;
        setNetworkStatus({
          online: navigator.onLine,
          effectiveType: connection?.effectiveType || "unknown",
          downlink: connection?.downlink || 0,
          rtt: connection?.rtt || 0
        });
      };

      updateNetworkStatus();

      const handleOnline = () => {
        setNetworkStatus(prev => ({ ...prev, online: true }));
      };

      const handleOffline = () => {
        setNetworkStatus(prev => ({ ...prev, online: false }));
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // Check for network information changes
      const connection = (navigator as NavigatorWithConnection).connection;
      if (connection) {
        connection.addEventListener("change", updateNetworkStatus);
      }

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        if (connection) {
          connection.removeEventListener("change", updateNetworkStatus);
        }
      };
    }, []);

    if (!networkStatus.online) {
      return (
        <div className="fixed bottom-4 left-4 bg-yellow-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm z-50 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white"></div>
            <span className="font-medium">Offline Mode</span>
          </div>
          <div className="text-xs mt-1">Changes will sync when back online</div>
        </div>
      );
    }

    return null;
  };

const App = () => {
  // If this is the mobile upload entrypoint, render a minimal app shell
  // to avoid initializing heavy providers that make cross-origin calls
  // (which can fail on LAN/dev environments and lead to white screens).
  const isMobileEntry = typeof window !== 'undefined' && window.location.pathname.startsWith('/mobile');
  if (isMobileEntry) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner size="xl" fullScreen />}>
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
    // Start performance monitoring
    perf.observePerformance();
    perf.logLoadTime('App');
    
    // Setup sync debug tools
    setupSyncDebug();
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
      <QueryCacheSync />
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ShiftProvider>
          <PrinterProvider>
            <AppWithSubscription>
              <ErrorBoundary>
                <BrowserRouter
                  future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
                >
                  <Suspense fallback={<LoadingSpinner size="xl" fullScreen />}>
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
                </BrowserRouter>
              </ErrorBoundary>
            </AppWithSubscription>
          </PrinterProvider>
        </ShiftProvider>
      </TooltipProvider>
      <SyncStatusIndicator />
      <NetworkMonitor />
    </QueryClientProvider>
  );
};

export default App;
