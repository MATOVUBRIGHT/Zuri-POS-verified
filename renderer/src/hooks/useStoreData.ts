/**
 * Hook to consume DataStore with format expected by Index/components
 */
import { useMemo, useCallback } from 'react';
import { useDataStore } from '@/store/useDataStore';
import type { StockItem, SaleItem, ExpenseItem } from '@/types';

function toStockItem(item: any, storeId: string): StockItem {
  return {
    id: item.id,
    productName: item.product_name || 'Untitled Product',
    product_name: item.product_name || 'Untitled Product',
    category: item.category || 'General',
    quantity: Number(item.quantity) || 0,
    costPerUnit: Number(item.cost_per_unit) || 0,
    cost_per_unit: Number(item.cost_per_unit) || 0,
    totalValue: 0,
    dateOfPurchase: item.date_of_purchase,
    sachets_count: Number(item.sachets_count) || 0,
    loose_items: Number(item.loose_items) || 0,
    opened_sachets: Number(item.opened_sachets) || 0,
    items_per_sachet: Number(item.items_per_sachet) || 1,
    retail_price: Number(item.retail_price) || 0,
    wholesale_price: Number(item.wholesale_price) || 0,
    retailPrice: Number(item.retail_price) || 0,
    wholesalePrice: Number(item.wholesale_price) || 0,
    store_id: item.store_id || storeId,
    size: item.size,
    min_stock_level: Number(item.min_stock_level) || 5,
    reorder_quantity: Number(item.reorder_quantity) || 10,
    notes: item.notes,
    packaging_type: item.packaging_type,
    unit_name: item.unit_name,
    supplier: item.supplier,
    barcode: item.barcode,
    barcode_type: item.barcode_type,
    barcode_mode: item.barcode_mode || 'standard',
    productImage: item.product_image,
    dateOfEntry: item.created_at || item.date_of_purchase,
    ...item,
  };
}

function toSaleItem(sale: any): SaleItem {
  return {
    id: sale.id,
    customerName: sale.customer_name || 'Unknown',
    dateOfSale: sale.date_of_sale,
    totalAmount: sale.total_amount,
    paidInCash: sale.paid_in_cash || false,
    products: Array.isArray(sale.products)
      ? sale.products
      : typeof sale.products === 'string'
        ? JSON.parse(sale.products || '[]')
        : [],
    staff_id: sale.staff_id,
    paymentMethodId: sale.payment_method_id ?? null,
    paymentDetails:
      typeof sale.payment_details === 'string'
        ? JSON.parse(sale.payment_details || '{}')
        : sale.payment_details ?? null,
    ...sale,
  };
}

function toExpenseItem(exp: any): ExpenseItem {
  return {
    id: exp.id,
    description: exp.description || 'Expense',
    amount: exp.amount,
    category: exp.category || 'General',
    date: exp.date_of_expense,
    paymentMethod: exp.payment_method || 'Cash',
    ...exp,
  };
}

export function useStoreData(storeId: string | null) {
  const {
    products,
    sales,
    expenses,
    cashTransactions,
    categories,
    lastLoadedStoreId,
    initialLoadDone,
    isRefreshing,
    loadAll,
    refresh,
    updateProduct,
    addSale,
    addExpense,
    removeSale,
    removeExpense,
  } = useDataStore();

  const stockData = useMemo(() => {
    if (!storeId) return [];
    return products.map((p) => toStockItem(p, storeId));
  }, [products, storeId]);

  const salesData = useMemo(() => sales.map(toSaleItem), [sales]);
  const expensesData = useMemo(() => expenses.map(toExpenseItem), [expenses]);

  const availableCash = useMemo(() => {
    return (cashTransactions as any[]).reduce((sum, tx) => {
      const t = String(tx?.type ?? '').toLowerCase();
      const amount = Number(tx?.amount) || 0;
      if (t === 'in' || t === 'deposit') return sum + amount;
      if (t === 'out' || t === 'withdrawal') return sum - amount;
      return sum;
    }, 0);
  }, [cashTransactions]);

  const categoriesList = useMemo(() => categories, [categories]);

  const refreshData = useCallback(async () => {
    if (!storeId) return false;
    const ok = await refresh(storeId);
    return ok;
  }, [storeId, refresh]);

  const handleUpdateStock = useCallback(
    (updated: StockItem) => {
      updateProduct(updated.id, {
        ...updated,
        product_name: updated.productName || updated.product_name,
        quantity: updated.quantity,
        retail_price: updated.retail_price ?? updated.retailPrice,
      });
    },
    [updateProduct]
  );

  const handleSetStockData = useCallback(
    (updater: StockItem[] | ((prev: StockItem[]) => StockItem[])) => {
      const next = typeof updater === 'function' ? updater(stockData) : updater;
      useDataStore.getState().setProducts(next.map((s) => ({ ...s, product_name: s.productName || s.product_name })));
    },
    [stockData]
  );

  const handleSetSalesData = useCallback((items: SaleItem[]) => {
    useDataStore.getState().setSales(items as any);
  }, []);

  const handleSetExpensesData = useCallback((items: ExpenseItem[]) => {
    useDataStore.getState().setExpenses(items as any);
  }, []);

  return {
    stockData,
    salesData,
    expensesData,
    availableCash,
    categories: categoriesList,
    lastLoadedStoreId,
    initialLoadDone,
    isRefreshing,
    loadAll,
    refreshData,
    updateProduct,
    onUpdateStock: handleUpdateStock,
    setStockData: handleSetStockData,
    setSalesData: handleSetSalesData,
    setExpensesData: handleSetExpensesData,
    addSale,
    addExpense,
    removeSale,
    removeExpense,
  };
}
