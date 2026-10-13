// Performance monitoring utilities for development
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface PerformanceMetrics {
  componentName: string;
  renderTime: number;
  renderCount: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private isEnabled: boolean = process.env.NODE_ENV === 'development';

  logRender(componentName: string, renderTime: number) {
    if (!this.isEnabled) return;

    const existing = this.metrics.find(m => m.componentName === componentName);
    if (existing) {
      existing.renderCount++;
      existing.renderTime = renderTime;
      existing.timestamp = Date.now();
    } else {
      this.metrics.push({
        componentName,
        renderTime,
        renderCount: 1,
        timestamp: Date.now()
      });
    }

    // Log slow renders
    if (renderTime > 16) { // More than one frame at 60fps
      console.warn(`🐌 Slow render: ${componentName} took ${renderTime.toFixed(2)}ms`);
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getSlowComponents(): PerformanceMetrics[] {
    return this.metrics.filter(m => m.renderTime > 16);
  }

  clear() {
    this.metrics = [];
  }

  logToConsole() {
    if (!this.isEnabled) return;
    
    console.group('⚡ Performance Metrics');
    console.table(this.metrics.sort((a, b) => b.renderTime - a.renderTime));
    console.groupEnd();
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Hook to track component render performance
export function useRenderTracker(componentName: string) {
  const renderStart = useRef(performance.now());
  const renderCount = useRef(0);
  
  useEffect(() => {
    const renderTime = performance.now() - renderStart.current;
    renderCount.current++;
    
    performanceMonitor.logRender(componentName, renderTime);
    
    if (process.env.NODE_ENV === 'development') {
      if (renderTime > 50) {
        console.warn(`🔥 Very slow render: ${componentName} took ${renderTime.toFixed(2)}ms (render #${renderCount.current})`);
      } else if (renderCount.current > 10 && renderCount.current % 5 === 0) {
        console.log(`🔄 ${componentName} has rendered ${renderCount.current} times`);
      }
    }
  });
  
  renderStart.current = performance.now();
}

// Hook to measure function execution time
export function usePerformanceProfiler() {
  const profile = useCallback((fn: Function, name: string) => {
    return (...args: any[]) => {
      const start = performance.now();
      const result = fn(...args);
      const end = performance.now();
      
      if (process.env.NODE_ENV === 'development') {
        const duration = end - start;
        if (duration > 10) {
          console.log(`⏱️ ${name} took ${duration.toFixed(2)}ms`);
        }
      }
      
      return result;
    };
  }, []);

  return { profile };
}

// Hook to track memory usage (development only)
export function useMemoryTracker(componentName: string) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    
    const checkMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.9) {
          console.warn(`🚨 High memory usage in ${componentName}: ${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB`);
        }
      }
    };

    const interval = setInterval(checkMemory, 5000);
    return () => clearInterval(interval);
  }, [componentName]);
}

// Hook to detect unnecessary re-renders
export function useWhyDidYouUpdate(name: string, props: Record<string, any>) {
  const previousProps = useRef<Record<string, any>>();

  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && previousProps.current) {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps: Record<string, { from: any; to: any }> = {};

      allKeys.forEach(key => {
        if (previousProps.current![key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current![key],
            to: props[key]
          };
        }
      });

      if (Object.keys(changedProps).length) {
        console.log(`🔍 ${name} re-rendered due to:`, changedProps);
      }
    }

    previousProps.current = props;
  });
}

// Performance-optimized debounce hook
export function useOptimizedDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

// Batch state updates for better performance
export function useBatchedUpdates<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const pendingUpdates = useRef<Partial<T>>({});
  const updateTimeout = useRef<NodeJS.Timeout>();

  const batchUpdate = useCallback((updates: Partial<T>) => {
    pendingUpdates.current = { ...pendingUpdates.current, ...updates };

    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
    }

    updateTimeout.current = setTimeout(() => {
      setState(prevState => ({ ...prevState, ...pendingUpdates.current }));
      pendingUpdates.current = {};
    }, 0);
  }, []);

  const flushUpdates = useCallback(() => {
    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
    }
    if (Object.keys(pendingUpdates.current).length > 0) {
      setState(prevState => ({ ...prevState, ...pendingUpdates.current }));
      pendingUpdates.current = {};
    }
  }, []);

  return [state, batchUpdate, flushUpdates] as const;
}

// Performance-optimized useCallback wrapper
export function useOptimizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return useCallback(callback, deps);
}

// Expose performance monitor to window for debugging
if (process.env.NODE_ENV === 'development') {
  (window as any).__performanceMonitor = performanceMonitor;
}