import { useCallback, useRef } from 'react';

/**
 * Custom hook to prevent duplicate operations from multiple clicks
 */
export function useDebounceSubmit<T extends unknown[]>(
  callback: (...args: T) => Promise<void>,
  delay: number = 1000
) {
  const isProcessing = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const debouncedCallback = useCallback(
    async (...args: T) => {
      // Prevent duplicate calls
      if (isProcessing.current) {
        return;
      }

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set processing flag
      isProcessing.current = true;

      try {
        await callback(...args);
      } finally {
        // Reset flag after delay
        timeoutRef.current = setTimeout(() => {
          isProcessing.current = false;
        }, delay);
      }
    },
    [callback, delay]
  );

  return { execute: debouncedCallback, isProcessing: () => isProcessing.current };
}

import { useState, useEffect } from 'react';

/**
 * Standard debounce hook for search terms
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
