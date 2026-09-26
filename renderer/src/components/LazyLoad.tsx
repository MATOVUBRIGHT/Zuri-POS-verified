import { useEffect, useState } from "react";

// Lazy load component
const LazyLoad = ({
  children,
  placeholder = null,
  delay = 200
}: {
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  delay?: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  if (!isVisible) {
    return placeholder || <div className="animate-pulse bg-gray-100 h-16 w-full rounded"></div>;
  }

  return <>{children}</>;
};

export default LazyLoad;