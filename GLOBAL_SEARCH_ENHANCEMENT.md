# Global Search Bar Enhancement

## Overview
Enhanced the main navigation search bar to provide comprehensive search across all entities and pages.

## Features Implemented

### 1. Multi-Entity Search
- **Products**: Search by name, barcode, supplier, category
- **Customers**: Search by name, email, phone, address
- **Suppliers**: Search by name, contact person, phone, email, company
- **Sales**: Search by customer name and sale ID

### 2. Enhanced Product Display
Product results now show:
- Product name with PRODUCT badge
- Barcode with icon (if available)
- Supplier with truck icon (if available)
- Category badge (if available)
- Quantity in stock
- Retail price in UGX

### 3. Quick Navigation
- Matches page names against search query
- Shows up to 3 matching pages for quick access
- Includes page icons for visual recognition

### 4. Search Behavior
- Real-time search with 300ms debounce
- Minimum 2 characters to trigger search
- Case-insensitive partial matching
- Instant results dropdown
- Click outside to close

### 5. Visual Design
- Color-coded badges for different entity types:
  - Products: Primary blue
  - Customers: Success green
  - Suppliers: Info blue
  - Sales: Warning yellow
- Hover effects with matching colors
- Loading spinner during search
- Empty state with helpful message

## Usage
1. Click the search bar in the main navigation
2. Type at least 2 characters
3. Results appear instantly in dropdown
4. Click any result to navigate to that page with the item highlighted
5. Search query is preserved in URL for context

## Technical Details
- Search limit: 10 products, 5 each for customers/suppliers/sales
- Uses Supabase `.or()` query for multi-field search
- URL parameters: `q` (query) and `highlight` (item ID)
- Automatic page navigation on result click

## Files Modified
- `silo-sachet-sense/src/components/Layout.tsx`
