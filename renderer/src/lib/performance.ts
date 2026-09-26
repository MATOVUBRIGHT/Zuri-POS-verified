// lib/performance.ts - Performance monitoring and optimization utilities
export const perf = {
    // Measure component render time
    measure(name: string, fn: () => void) {
        const start = performance.now();
        fn();
        const end = performance.now();
        if (import.meta.env.DEV) console.log(`⚡ ${name}: ${(end - start).toFixed(2)}ms`);
    },

    // Debounce function for search/input
    debounce<T extends (...args: unknown[]) => unknown>(
        func: T,
        wait: number
    ): (...args: Parameters<T>) => void {
        let timeout: NodeJS.Timeout;
        return (...args: Parameters<T>) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },

    // Throttle function for scroll/resize
    throttle<T extends (...args: unknown[]) => unknown>(
        func: T,
        limit: number
    ): (...args: Parameters<T>) => void {
        let inThrottle: boolean;
        return (...args: Parameters<T>) => {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    },

    // Log load times
    logLoadTime(label: string) {
        if (typeof window !== 'undefined' && window.performance) {
            const perfData = window.performance.timing;
            const loadTime = perfData.loadEventEnd - perfData.navigationStart;
            if (import.meta.env.DEV) console.log(`📊 ${label} Load Time: ${loadTime}ms`);
        }
    },

    // Create performance observer
    observePerformance() {
        if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'navigation') {
                        const navEntry = entry as PerformanceNavigationTiming;
                        if (!import.meta.env.DEV) continue;
                        console.log('🚀 Performance Metrics:', {
                            'DNS Lookup': navEntry.domainLookupEnd - navEntry.domainLookupStart,
                            'TCP Connection': navEntry.connectEnd - navEntry.connectStart,
                            'Request': navEntry.responseStart - navEntry.requestStart,
                            'Response': navEntry.responseEnd - navEntry.responseStart,
                            'DOM Processing': navEntry.domContentLoadedEventEnd - navEntry.responseEnd,
                            'Total Load': navEntry.loadEventEnd - navEntry.fetchStart,
                        });
                    }
                }
            });

            try {
                observer.observe({ entryTypes: ['navigation', 'resource'] });
            } catch (e) {
                console.warn('Performance observer not supported');
            }
        }
    },
};

// Memoization helper for expensive computations
export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const cache = new Map();

    return ((...args: unknown[]) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn(...args);
        cache.set(key, result);
        return result;
    }) as T;
}

// Lazy load images
export function lazyLoadImage(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = reject;
        img.src = src;
    });
}

// Virtual scrolling helper for large lists
export function calculateVisibleRange(
    scrollTop: number,
    containerHeight: number,
    itemHeight: number,
    totalItems: number,
    overscan: number = 3
) {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
        totalItems - 1,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return { startIndex, endIndex };
}
