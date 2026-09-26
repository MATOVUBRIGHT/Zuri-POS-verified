// App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { HashRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import MobileAction from "@/pages/MobileAction";
import { useEffect, useState, lazy, Suspense } from "react";
import { perf } from "./lib/performance";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MissingSupabaseConfig } from "@/components/MissingSupabaseConfig";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast as notify } from "sonner";
import { PrinterProvider } from "@/providers/PrinterProvider";
import { ShiftProvider, useShift } from "@/providers/ShiftProvider";
import { SubscriptionProvider, useSubscription } from "@/providers/SubscriptionProvider";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { UpdateBanner } from "@/components/UpdateBanner";
import { startBackgroundSync } from "@/lib/backgroundSync";

// Lazy loading for all routes
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 60 * 4, // 4 hours - never lose cached data while app is backgrounded
      refetchOnWindowFocus: false, // prevent minimize/restore from triggering blocking UI refreshes
      refetchOnReconnect: true,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

const AppWithSubscription = ({ children }: { children: React.ReactNode }) => {
  const { user } = useShift();
  return (
    <SubscriptionProvider userId={user?.id || null}>
      {children}
    </SubscriptionProvider>
  );
};

const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading: shiftLoading, user, isAdmin } = useShift();
  const { subscription, loading: subLoading } = useSubscription();
  const location = useLocation();
  const isOfflineUser = typeof window !== 'undefined' && !!localStorage.getItem('zuripos_offline_session');

  if (shiftLoading || subLoading) return <LoadingSpinner size="xl" fullScreen />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  const freeBasicForAll = import.meta.env.VITE_REQUIRE_PAID_SUBSCRIPTION !== 'true';
  if (
    isOfflineUser ||
    isAdmin ||
    freeBasicForAll ||
    subscription?.status === 'active' ||
    subscription?.status === 'pending'
  ) {
    return (
      <>
        <BackgroundSyncTrigger />
        {children}
      </>
    );
  }
  return <Navigate to="/plans" state={{ from: location }} replace />;
};

const AuthShiftGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading: shiftLoading, user } = useShift();
  const location = useLocation();
  if (shiftLoading) return <LoadingSpinner size="xl" fullScreen />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  return <>{children}</>;
};

const BackgroundSyncTrigger = () => {
  const { user, store } = useShift();
  useEffect(() => {
    if (user && store?.id && navigator.onLine) {
      startBackgroundSync(store.id);
    }
  }, [user?.id, store?.id]);
  return null;
};

const NetworkMonitor = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      className={`fixed bottom-4 right-4 px-3 py-2 rounded-lg shadow-lg text-sm z-50 flex items-center gap-2 ${
        online ? 'bg-green-600 text-white' : 'bg-red-600 text-white animate-pulse'
      }`}
    >
      <div className="w-2.5 h-2.5 rounded-full bg-white" />
      <span className="font-medium">{online ? 'Online' : 'Offline'}</span>
    </div>
  );
};

/** Browser dev: Ctrl+R reload (Electron main handles reload when packaged) */
const ReloadShortcut = () => {
  useEffect(() => {
    const isElectron = typeof window !== "undefined" && !!(window as any).api?.closeApp;
    if (isElectron) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
};

const App = () => {
  useEffect(() => {
    perf.observePerformance();
    perf.logLoadTime('App');
  }, []);

  if (!isSupabaseConfigured) {
    return <MissingSupabaseConfig />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ReloadShortcut />
        <UpdateBanner />
        <Toaster />
        <Sonner />
        <ShiftProvider>
          <PrinterProvider>
            <AppWithSubscription>
              <ErrorBoundary>
                <Router>
                  <Suspense fallback={<LoadingSpinner size="xl" fullScreen />}>
                    <Routes>
                      <Route path="/admin-login" element={<AdminLogin />} />
                      <Route path="/admin-verification" element={<AdminVerification />} />
                      <Route path="/admin-portal" element={<AdminPortalLayout />}>
                        <Route index element={<AdminPortalHome />} />
                        <Route path="payments" element={<AdminPortalPayments />} />
                        <Route path="moderation" element={<AdminPortalModeration />} />
                      </Route>
                      <Route path="/" element={<SubscriptionGuard><Index /></SubscriptionGuard>} />
                      <Route path="/store/:storeId" element={<SubscriptionGuard><StoreView /></SubscriptionGuard>} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/mobile" element={<MobileAction />} />
                      <Route path="/install" element={<Install />} />
                      <Route path="/plans" element={<AuthShiftGuard><Plans /></AuthShiftGuard>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </Router>
              </ErrorBoundary>
            </AppWithSubscription>
          </PrinterProvider>
        </ShiftProvider>
      </TooltipProvider>
      <NetworkMonitor />
    </QueryClientProvider>
  );
};

export default App;
