import { useState, useMemo, useCallback } from 'react';

/**
 * Optimized search hook with real-time filtering and partial matching
 * 
 * Features:
 * - Real-time search with no debouncing (instant results)
 * - Partial word matching (searches within words)
 * - Case-insensitive search
 * - Multiple field search support
 * - Optimized with useMemo for performance
 * 
 * @param data - Array of items to search
 * @param searchFields - Array of field names to search in
 * @returns [searchTerm, setSearchTerm, filteredData]
 */
export function useOptimizedSearch<T extends Record<string, any>>(
  data: T[],
  searchFields: (keyof T)[]
) {
  const [searchTerm, setSearchTerm] = useState('');

  // Optimized filter function with memoization
  const filteredData = useMemo(() => {
    if (!searchTerm || searchTerm.trim() === '') {
      return data;
    }

    const lowerSearchTerm = searchTerm.toLowerCase().trim();

    return data.filter(item => {
      // Check if any of the specified fields match the search term
      return searchFields.some(field => {
        const value = item[field];
        
        // Handle null/undefined values
        if (value === null || value === undefined) {
          return false;
        }

        // Convert to string and search (case-insensitive, partial match)
        const stringValue = String(value).toLowerCase();
        return stringValue.includes(lowerSearchTerm);
      });
    });
  }, [data, searchTerm, searchFields]);

  // Optimized setter that doesn't cause unnecessary re-renders
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  return {
    searchTerm,
    setSearchTerm: handleSearchChange,
    filteredData,
    hasResults: filteredData.length > 0,
    resultCount: filteredData.length
  };
}

/**
 * Advanced search hook with category/status filtering
 * 
 * @param data - Array of items to search
 * @param searchFields - Array of field names to search in
 * @param filterField - Field name to filter by (e.g., 'category', 'status')
 * @returns Search and filter controls with filtered data
 */
export function useAdvancedSearch<T extends Record<string, any>>(
  data: T[],
  searchFields: (keyof T)[],
  filterField?: keyof T
) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterValue, setFilterValue] = useState<string>('all');

  const filteredData = useMemo(() => {
    let result = data;

    // Apply search filter
    if (searchTerm && searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase().trim();
      result = result.filter(item => {
        return searchFields.some(field => {
          const value = item[field];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(lowerSearchTerm);
        });
      });
    }

    // Apply category/status filter
    if (filterField && filterValue !== 'all') {
      result = result.filter(item => item[filterField] === filterValue);
    }

    return result;
  }, [data, searchTerm, filterValue, searchFields, filterField]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleFilterChange = useCallback((value: string) => {
    setFilterValue(value);
  }, []);

  return {
    searchTerm,
    setSearchTerm: handleSearchChange,
    filterValue,
    setFilterValue: handleFilterChange,
    filteredData,
    hasResults: filteredData.length > 0,
    resultCount: filteredData.length
  };
}
