# Search Optimization Guide

## Overview

All search bars across the application have been optimized for:
- **Real-time filtering** - No debouncing, instant results as you type
- **Fast deletion** - Backspace works instantly in real-time
- **Partial matching** - Works even if search word is not completed
- **Case-insensitive** - Searches regardless of letter case
- **Multiple field search** - Searches across multiple fields simultaneously

## Optimized Search Hook

Created `src/hooks/useOptimizedSearch.ts` with two hooks:

### 1. useOptimizedSearch
Basic search with multiple fields:
```typescript
const { searchTerm, setSearchTerm, filteredData } = useOptimizedSearch(
  data,
  ['field1', 'field2', 'field3']
);
```

### 2. useAdvancedSearch
Search + category/status filtering:
```typescript
const { 
  searchTerm, 
  setSearchTerm, 
  filterValue, 
  setFilterValue, 
  filteredData 
} = useAdvancedSearch(
  data,
  ['field1', 'field2'],
  'categoryField'
);
```

## Current Search Implementations

### Already Optimized (Real-time, Partial Match)

1. **SalesEntry** (`src/components/SalesEntry.tsx`)
   - Searches: productName, barcode
   - Real-time filtering with useMemo
   - Shows out-of-stock items with badges
   - Instant results as you type

2. **Products** (`src/components/Products.tsx`)
   - Searches: productName, barcode, supplier, category
   - Real-time filtering
   - Category filter support
   - Sort options

3. **Suppliers** (`src/components/Suppliers.tsx`)
   - Searches: name, company, phone
   - Real-time filtering
   - Instant results

4. **Customers** (`src/components/Customers.tsx`)
   - Searches: full_name, email, phone, address
   - Real-time filtering
   - URL parameter support

5. **SachetManagement** (`src/components/SachetManagement.tsx`)
   - Searches: productName
   - Real-time filtering

6. **BarcodeManager** (`src/components/BarcodeManager.tsx`)
   - Searches: productName, barcode, category
   - Real-time filtering with useMemo
   - Mode and category filters

7. **InventoryManagement** (`src/components/InventoryManagement.tsx`)
   - Searches: productName, category, barcode
   - Real-time filtering
   - Status filters (low stock, critical)

8. **Layout Global Search** (`src/components/Layout.tsx`)
   - Searches: products, customers, suppliers
   - Real-time with ilike queries
   - Navigation support

## Search Performance Features

### 1. Real-time Filtering
All searches use direct filtering without debouncing:
```typescript
const filteredData = data.filter(item =>
  item.field.toLowerCase().includes(searchTerm.toLowerCase())
);
```

### 2. Partial Matching
Uses `.includes()` instead of exact match:
```typescript
// ✅ Good - Partial match
"Coca".includes("Coc") // true

// ❌ Bad - Exact match only
"Coca" === "Coc" // false
```

### 3. Case-Insensitive
Converts both search term and data to lowercase:
```typescript
item.productName.toLowerCase().includes(searchTerm.toLowerCase())
```

### 4. Multiple Field Search
Searches across multiple fields with OR logic:
```typescript
const matchesSearch = 
  item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
  item.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  item.category?.toLowerCase().includes(searchTerm.toLowerCase());
```

### 5. Optimized with useMemo
Prevents unnecessary re-filtering:
```typescript
const filteredData = useMemo(() =>
  data.filter(item => /* filter logic */),
  [data, searchTerm]
);
```

## Search Input Best Practices

### 1. Instant Updates
```typescript
<Input
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  placeholder="Search..."
/>
```

### 2. Clear Button
```typescript
{searchTerm && (
  <Button onClick={() => setSearchTerm('')}>
    <X className="h-4 w-4" />
  </Button>
)}
```

### 3. Search Icon
```typescript
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
  <Input className="pl-10" />
</div>
```

### 4. Result Count
```typescript
<p>{filteredData.length} results found</p>
```

## Performance Optimizations

### 1. useMemo for Filtering
```typescript
const filteredData = useMemo(() => {
  return data.filter(/* filter logic */);
}, [data, searchTerm]);
```

### 2. Early Return for Empty Search
```typescript
if (!searchTerm || searchTerm.trim() === '') {
  return data; // Return all data
}
```

### 3. Null/Undefined Checks
```typescript
if (value === null || value === undefined) {
  return false;
}
```

### 4. Limit Results for Large Datasets
```typescript
const filteredData = data
  .filter(/* filter logic */)
  .slice(0, 100); // Limit to 100 results
```

## Testing Checklist

For each search implementation:

- [ ] Type single character - shows results immediately
- [ ] Type partial word - shows matching results
- [ ] Backspace - removes characters instantly
- [ ] Clear all text - shows all items
- [ ] Type fast - no lag or delay
- [ ] Case variations - finds results regardless of case
- [ ] Special characters - handles gracefully
- [ ] Empty results - shows "No results" message
- [ ] Large datasets - performs well with 1000+ items

## Common Issues & Solutions

### Issue: Search is slow
**Solution:** Use useMemo to cache filtered results
```typescript
const filteredData = useMemo(() => 
  data.filter(/* logic */),
  [data, searchTerm]
);
```

### Issue: Backspace doesn't work instantly
**Solution:** Remove debouncing, use direct state updates
```typescript
// ❌ Bad - Debounced
const debouncedSearch = useDebounce(searchTerm, 300);

// ✅ Good - Instant
onChange={(e) => setSearchTerm(e.target.value)}
```

### Issue: Partial words don't match
**Solution:** Use .includes() instead of startsWith()
```typescript
// ❌ Bad - Only matches start
text.startsWith(search)

// ✅ Good - Matches anywhere
text.includes(search)
```

### Issue: Case-sensitive search
**Solution:** Convert both to lowercase
```typescript
text.toLowerCase().includes(search.toLowerCase())
```

## Migration Guide

To migrate a component to use the optimized search hook:

### Before:
```typescript
const [searchTerm, setSearchTerm] = useState("");
const filtered = data.filter(item =>
  item.name.toLowerCase().includes(searchTerm.toLowerCase())
);
```

### After:
```typescript
import { useOptimizedSearch } from "@/hooks/useOptimizedSearch";

const { searchTerm, setSearchTerm, filteredData } = useOptimizedSearch(
  data,
  ['name', 'description', 'category']
);
```

## Summary

All search bars in the application now provide:
- ✅ Real-time filtering (no delay)
- ✅ Instant backspace/deletion
- ✅ Partial word matching
- ✅ Case-insensitive search
- ✅ Multiple field search
- ✅ Optimized performance with useMemo
- ✅ Clean, consistent UX across all pages

Users can now search quickly and efficiently across all pages without any lag or delay!
