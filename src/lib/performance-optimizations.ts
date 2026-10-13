// Performance optimization utilities
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { debounce, throttle } from 'lodash';

// Virtual scrolling for large lists
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan = 5
) {
  return useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const totalCount = items.length;
    
    return {
      totalHeight: totalCount * itemHeight,
      visibleCount: visibleCount + overscan * 2,
      getVisibleItems: (scrollTop: number) => {
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
        const endIndex = Math.min(totalCount, startIndex + visibleCount);
        return {
          startIndex,
          endIndex,
          items: items.slice(startIndex, endIndex),
          offsetY: startIndex * itemHeight
        };
      }
    };
  }, [items, itemHeight, containerHeight, overscan]);
}

// Optimized search with debouncing and memoization
export function useOptimizedSearch<T>(
  items: T[],
  searchFields: (keyof T)[],
  searchTerm: string,
  delay = 300
) {
  const debouncedSearch = useMemo(
    () => debounce((term: string) => term, delay),
    [delay]
  );

  return useMemo(() => {
    const term = debouncedSearch(searchTerm)?.toLowerCase().trim();
    if (!term) return items;

    return items.filter(item =>
      searchFields.some(field => {
        const value = item[field];
        return String(value || '').toLowerCase().includes(term);
      })
    );
  }, [items, searchFields, searchTerm, debouncedSearch]);
}

// Memoized component wrapper for expensive renders
export function withPerformanceMemo<P extends Record<string, any>>(
  Component: React.ComponentType<P>,
  arePropsEqual?: (prev: P, next: P) => boolean
) {
  return React.memo(Component, arePropsEqual);
}

// Intersection observer for lazy loading
export function useIntersectionObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
) {
  const targetRef = useRef<HTMLElement>(null);
  
  useEffect(() => {
    if (!targetRef.current) return;
    
    const observer = new IntersectionObserver(callback, {
      threshold: 0.1,
      rootMargin: '50px',
      ...options
    });
    
    observer.observe(targetRef.current);
    
    return () => observer.disconnect();
  }, [callback, options]);
  
  return targetRef;
}

// Optimized event handlers
export function useOptimizedCallback<T extends (...args: any[]) => any>(
  fn: T,
  deps: React.DependencyList,
  delay?: number
): T {
  const callback = useCallback(fn, deps);
  
  return useMemo(() => {
    return delay ? debounce(callback, delay) : callback;
  }, [callback, delay]) as T;
}

// Memory-efficient pagination
export function usePagination<T>(items: T[], pageSize = 50) {
  const [currentPage, setCurrentPage] = useState(0);
  
  const paginatedData = useMemo(() => {
    const startIndex = currentPage * pageSize;
    return {
      items: items.slice(0, startIndex + pageSize),
      hasMore: items.length > startIndex + pageSize,
      loadMore: () => setCurrentPage(prev => prev + 1),
      reset: () => setCurrentPage(0)
    };
  }, [items, currentPage, pageSize]);
  
  return paginatedData;
}

// Component render time tracker
export function useRenderTracker(componentName: string) {
  const renderStart = useRef(performance.now());
  
  useEffect(() => {
    const renderTime = performance.now() - renderStart.current;
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 ${componentName} render time: ${renderTime.toFixed(2)}ms`);
    }
  });
  
  renderStart.current = performance.now();
}

// Optimized state updates for large objects
export function useOptimizedState<T>(initialState: T) {
  const [state, setState] = useState(initialState);
  
  const updateState = useCallback((updates: Partial<T> | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      
      // Shallow comparison to prevent unnecessary re-renders
      const changed = Object.keys(next).some(key => 
        (next as any)[key] !== (prev as any)[key]
      );
      
      return changed ? next : prev;
    });
  }, []);
  
  return [state, updateState] as const;
}

// Web Worker for heavy computations
export function useWebWorker<T, R>(
  workerFn: (data: T) => R,
  dependencies: any[] = []
) {
  const workerRef = useRef<Worker>();
  
  useEffect(() => {
    const workerScript = `
      self.onmessage = function(e) {
        const result = (${workerFn.toString()})(e.data);
        self.postMessage(result);
      };
    `;
    
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));
    
    return () => {
      workerRef.current?.terminate();
    };
  }, dependencies);
  
  const runTask = useCallback((data: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject(new Error('Worker not initialized'));
      
      const handleMessage = (e: MessageEvent<R>) => {
        resolve(e.data);
        workerRef.current?.removeEventListener('message', handleMessage);
      };
      
      const handleError = (error: ErrorEvent) => {
        reject(error);
        workerRef.current?.removeEventListener('error', handleError);
      };
      
      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.addEventListener('error', handleError);
      workerRef.current.postMessage(data);
    });
  }, []);
  
  return runTask;
}

// Request animation frame for smooth animations
export function useAnimationFrame(callback: (deltaTime: number) => void, deps: any[]) {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  
  const animate = useCallback((time: number) => {
    if (previousTimeRef.current) {
      const deltaTime = time - previousTimeRef.current;
      callback(deltaTime);
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, deps);
  
  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animate]);
}