/**
 * Global cache-first data store
 * Load once from SQLite, reuse across navigation. Refresh on demand only.
 */
import { create } from 'zustand';

export type StockItem = Record<string, unknown> & {
  id: string;
  product_name?: string;
  productName?: string;
  barcode?: string;
  quantity?: number;
  retail_price?: number;
  cost_per_unit?: number;
  store_id?: string;
  [key: string]: unknown;
};

export type SaleItem = Record<string, unknown> & {
  id: string;
  total_amount?: number;
  date_of_sale?: string;
  products?: unknown;
  [key: string]: unknown;
};

export type ExpenseItem = Record<string, unknown> & {
  id: string;
  amount?: number;
  description?: string;
  date_of_expense?: string;
  [key: string]: unknown;
};

interface DataState {
  // Data
  products: StockItem[];
  sales: SaleItem[];
  expenses: ExpenseItem[];
  cashTransactions: unknown[];
  categories: { id: string; name: string; store_id?: string }[];
  lastLoadedStoreId: string | null;

  // Loading
  initialLoadDone: boolean;
  isRefreshing: boolean;

  // Actions
  setProducts: (items: StockItem[]) => void;
  setSales: (items: SaleItem[]) => void;
  setExpenses: (items: ExpenseItem[]) => void;
  setCashTransactions: (items: unknown[]) => void;
  setCategories: (items: { id: string; name: string; store_id?: string }[]) => void;

  loadAll: (storeId: string) => Promise<void>;
  refresh: (storeId: string) => Promise<boolean>;
  clear: () => void;
  updateProduct: (id: string, updates: Partial<StockItem>) => void;
  addSale: (sale: SaleItem) => void;
  addExpense: (expense: ExpenseItem) => void;
  removeSale: (id: string) => void;
  removeExpense: (id: string) => void;
}

const filterByStore = <T extends { store_id?: string }>(arr: T[], storeId: string): T[] =>
  arr.filter((r) => r.store_id === storeId || !r.store_id);

async function loadFromSqlite(storeId: string): Promise<{
  inventory: StockItem[];
  sales: SaleItem[];
  expenses: ExpenseItem[];
  cash_transactions: unknown[];
  categories: { id: string; name: string; store_id?: string }[];
}> {
  if (typeof window === 'undefined' || !(window as any).api?.getAll) {
    return { inventory: [], sales: [], expenses: [], cash_transactions: [], categories: [] };
  }

  const api = (window as any).api;
  const [inventory, sales, expenses, cash_transactions, categories] = await Promise.all([
    api.getAll('inventory'),
    api.getAll('sales'),
    api.getAll('expenses'),
    api.getAll('cash_transactions'),
    api.getAll('categories').catch(() => []),
  ]);

  return {
    inventory: filterByStore(inventory || [], storeId),
    sales: filterByStore(sales || [], storeId),
    expenses: filterByStore(expenses || [], storeId),
    cash_transactions: filterByStore(cash_transactions || [], storeId),
    categories: filterByStore(categories || [], storeId).map((c: any) => ({
      id: String(c.id),
      name: String(c.name || ''),
      store_id: c.store_id,
    })),
  };
}

export const useDataStore = create<DataState>((set, get) => ({
  products: [],
  sales: [],
  expenses: [],
  cashTransactions: [],
  categories: [],
  lastLoadedStoreId: null,
  initialLoadDone: false,
  isRefreshing: false,

  setProducts: (items) => set({ products: items }),
  setSales: (items) => set({ sales: items }),
  setExpenses: (items) => set({ expenses: items }),
  setCashTransactions: (items) => set({ cashTransactions: items }),
  setCategories: (items) => set({ categories: items }),

  loadAll: async (storeId: string) => {
    const { lastLoadedStoreId, products } = get();
    if (lastLoadedStoreId === storeId && products.length > 0) return;

    try {
      const data = await loadFromSqlite(storeId);
      set({
        products: data.inventory,
        sales: data.sales,
        expenses: data.expenses,
        cashTransactions: data.cash_transactions,
        categories: data.categories.length > 0 ? data.categories : get().categories,
        lastLoadedStoreId: storeId,
        initialLoadDone: true,
      });
    } catch (e) {
      console.error('[DataStore] loadAll failed:', e);
      set({ initialLoadDone: true });
    }
  },

  refresh: async (storeId: string) => {
    set({ isRefreshing: true });
    try {
      const data = await loadFromSqlite(storeId);
      set({
        products: data.inventory,
        sales: data.sales,
        expenses: data.expenses,
        cashTransactions: data.cash_transactions,
        categories: data.categories.length > 0 ? data.categories : get().categories,
        lastLoadedStoreId: storeId,
      });
      return true;
    } catch (e) {
      console.error('[DataStore] refresh failed:', e);
      return false;
    } finally {
      set({ isRefreshing: false });
    }
  },

  clear: () =>
    set({
      products: [],
      sales: [],
      expenses: [],
      cashTransactions: [],
      categories: [],
      lastLoadedStoreId: null,
    }),

  updateProduct: (id, updates) =>
    set((s) => ({
      products: s.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  addSale: (sale) => set((s) => ({ sales: [sale, ...s.sales] })),
  addExpense: (expense) => set((s) => ({ expenses: [expense, ...s.expenses] })),
  removeSale: (id) => set((s) => ({ sales: s.sales.filter((x) => x.id !== id) })),
  removeExpense: (id) => set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) })),
}));
