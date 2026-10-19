import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

// Navigation optimizer for smooth transitions and prefetching
const NavigationOptimizer = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  // Route data is loaded by each page. Avoid fake empty prefetch queries and
  // timer-based transition state, which caused extra renders during navigation.

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

  const RoutePrefetcher = () => null;

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
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="min-h-screen"
      >
        <RoutePrefetcher />
        <ScrollPositionManager>{children}</ScrollPositionManager>
      </motion.div>
    </AnimatePresence>
  );
};

export default NavigationOptimizer;
