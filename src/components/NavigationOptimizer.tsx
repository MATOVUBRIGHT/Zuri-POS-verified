import { useEffect, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

// Navigation optimizer for smooth transitions and prefetching
const NavigationOptimizer = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const queryClient = useQueryClient();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [previousLocation, setPreviousLocation] = useState(location);

  // Prefetch data for likely next routes
  useEffect(() => {
    const prefetchRoutes = async () => {
      try {
        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: ["dashboard-data"],
            queryFn: async () => []
          }),
          queryClient.prefetchQuery({
            queryKey: ["sales-history"],
            queryFn: async () => []
          })
        ]);
      } catch (error) {
        console.error("Prefetch error:", error);
      }
    };

    // Start prefetching after initial load
    const timer = setTimeout(prefetchRoutes, 2000);
    return () => clearTimeout(timer);
  }, [queryClient]);

  // Handle navigation transitions
  useEffect(() => {
    if (navigationType === "POP") {
      // Browser back/forward navigation
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    } else if (location.pathname !== previousLocation.pathname) {
      // Regular navigation
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    }
  }, [location, navigationType, previousLocation]);

  // Update previous location
  useEffect(() => {
    if (location.pathname !== previousLocation.pathname) {
      setPreviousLocation(location);
    }
  }, [location, previousLocation]);

  // Page transition animations
  const pageVariants = {
    initial: {
      opacity: 0,
      y: 20
    },
    enter: {
      opacity: 1,
      y: 0
    },
    exit: {
      opacity: 0,
      y: -10
    }
  };

  // Route-based prefetching component
  const RoutePrefetcher = () => {
    const location = useLocation();
    const queryClient = useQueryClient();

    useEffect(() => {
      // Prefetch data based on current route
      const prefetchForRoute = async () => {
        try {
          switch (location.pathname) {
            case "/":
              await queryClient.prefetchQuery({
                queryKey: ["dashboard-data"],
                queryFn: async () => []
              });
              break;

            case "/sales":
              await queryClient.prefetchQuery({
                queryKey: ["sales-data"],
                queryFn: async () => []
              });
              break;

            case "/inventory":
              await queryClient.prefetchQuery({
                queryKey: ["inventory-data"],
                queryFn: async () => []
              });
              break;
          }
        } catch (error) {
          console.error("Route prefetch error:", error);
        }
      };

      // Delay prefetching slightly to avoid blocking initial render
      const timer = setTimeout(prefetchForRoute, 1000);
      return () => clearTimeout(timer);
    }, [location, queryClient]);

    return null;
  };

  // Scroll position manager
  const ScrollPositionManager = ({ children }: { children: React.ReactNode }) => {
    const location = useLocation();

    useEffect(() => {
      // Restore scroll position when navigating back
      const handlePopState = () => {
        const scrollY = sessionStorage.getItem(`scrollPosition_${location.pathname}`);
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY));
        }
      };

      window.addEventListener("popstate", handlePopState);

      // Save scroll position when leaving page
      const handleBeforeUnload = () => {
        sessionStorage.setItem(`scrollPosition_${location.pathname}`, window.scrollY.toString());
      };

      window.addEventListener("beforeunload", handleBeforeUnload);

      return () => {
        window.removeEventListener("popstate", handlePopState);
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }, [location]);

    return <>{children}</>;
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        className="min-h-screen"
      >
        <RoutePrefetcher />
        <ScrollPositionManager>{children}</ScrollPositionManager>
      </motion.div>
    </AnimatePresence>
  );
};

export default NavigationOptimizer;
