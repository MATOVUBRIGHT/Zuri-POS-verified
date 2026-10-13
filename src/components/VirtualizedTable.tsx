import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

interface VirtualizedTableProps<T> {
  data: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactElement;
  className?: string;
  overscanCount?: number;
}

const VirtualizedTable = <T,>({
  data,
  height,
  itemHeight,
  renderItem,
  className = '',
  overscanCount = 5
}: VirtualizedTableProps<T>) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleCount = Math.ceil(height / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscanCount);
  const endIndex = Math.min(data.length - 1, startIndex + visibleCount + overscanCount * 2);
  const visibleItems = data.slice(startIndex, endIndex + 1);

  const totalHeight = data.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div key={startIndex + index} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VirtualizedTable;

// Hook for optimized virtual scrolling with search and filtering
export function useVirtualizedData<T>(
  items: T[],
  searchTerm: string,
  filterFn?: (item: T, searchTerm: string) => boolean,
  sortFn?: (a: T, b: T) => number
) {
  return useMemo(() => {
    let filtered = items;

    // Apply search filter if provided
    if (searchTerm.trim() && filterFn) {
      filtered = items.filter(item => filterFn(item, searchTerm.toLowerCase()));
    }

    // Apply sorting if provided
    if (sortFn) {
      filtered = [...filtered].sort(sortFn);
    }

    return filtered;
  }, [items, searchTerm, filterFn, sortFn]);
}

// Performance optimized pagination hook
export function usePaginatedData<T>(
  items: T[],
  pageSize: number = 50
) {
  const [currentPage, setCurrentPage] = useState(0);
  
  const paginatedData = useMemo(() => {
    const startIndex = currentPage * pageSize;
    const endIndex = startIndex + pageSize;
    return items.slice(startIndex, endIndex);
  }, [items, currentPage, pageSize]);

  const totalPages = Math.ceil(items.length / pageSize);
  const hasMore = currentPage < totalPages - 1;
  const hasPrevious = currentPage > 0;

  const nextPage = useCallback(() => {
    if (hasMore) setCurrentPage(prev => prev + 1);
  }, [hasMore]);

  const previousPage = useCallback(() => {
    if (hasPrevious) setCurrentPage(prev => prev - 1);
  }, [hasPrevious]);

  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(0, Math.min(totalPages - 1, page));
    setCurrentPage(validPage);
  }, [totalPages]);

  const reset = useCallback(() => {
    setCurrentPage(0);
  }, []);

  return {
    data: paginatedData,
    currentPage,
    totalPages,
    hasMore,
    hasPrevious,
    nextPage,
    previousPage,
    goToPage,
    reset,
    totalItems: items.length
  };
}

// Performance optimized row component with memo
export const VirtualTableRow = React.memo<{
  item: any;
  index: number;
  renderContent: (item: any, index: number) => React.ReactElement;
}>(({ item, index, renderContent }) => {
  return renderContent(item, index);
});

VirtualTableRow.displayName = 'VirtualTableRow';