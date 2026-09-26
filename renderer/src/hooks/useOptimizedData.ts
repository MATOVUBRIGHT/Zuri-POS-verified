// hooks/useOptimizedData.ts - React Query hooks for data fetching
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';
import { SaleItem, StockItem, Product } from '@/types';
import { dataSyncService } from '@/lib/data-sync';

async function fetchWithSWRCache<T>(table: string, fetcher: () => Promise<T>, storeId?: string | null) {
    // Offline-first: when in Electron, always read from local SQLite first
    if (typeof window !== 'undefined' && (window as any).api?.getAll) {
        try {
            let localData = await dataSyncService.getLocalData(table);
            if (storeId && Array.isArray(localData)) {
                localData = localData.filter((r: any) => r.store_id === storeId || !r.store_id);
            }
            if (Array.isArray(localData)) {
                return localData as unknown as T;
            }
        } catch (_) {}
    }

    const fresh = await fetcher();
    if (Array.isArray(fresh)) {
        try {
            await dataSyncService.saveLocalData(table, fresh);
        } catch {
            // Ignore cache write failures
        }
    }
    return fresh;
}

export function useOptimizedInventory(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['inventory', storeId],
        queryFn: async () => {
            if (!storeId) return [];

            return await fetchWithSWRCache<any[]>(
                'inventory',
                async () => {
                    const { data, error } = await supabase
                        .from('inventory')
                        .select('*')
                        .eq('store_id', storeId)
                        .order('created_at', { ascending: false })
                        .limit(10000);
                    if (error) throw error;
                    return data || [];
                },
                storeId
            );
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 60 * 4,
        placeholderData: keepPreviousData,
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
        refetchOnMount: 'always',
        structuralSharing: true,
    });
}

export function useOptimizedSales(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['sales', storeId],
        queryFn: async () => {
            if (!storeId) return [];

            return await fetchWithSWRCache<any[]>(
                'sales',
                async () => {
                    const { data, error } = await supabase
                        .from('sales')
                        .select('*')
                        .eq('store_id', storeId)
                        .order('date_of_sale', { ascending: false })
                        .limit(10000);
                    if (error) throw error;
                    return data || [];
                },
                storeId
            );
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 60 * 4,
        placeholderData: keepPreviousData,
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
        refetchOnMount: 'always',
        structuralSharing: true,
    });
}

export function useOptimizedExpenses(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['expenses', storeId],
        queryFn: async () => {
            if (!storeId) return [];

            return await fetchWithSWRCache<any[]>(
                'expenses',
                async () => {
                    const { data, error } = await supabase
                        .from('expenses')
                        .select('*')
                        .eq('store_id', storeId)
                        .order('date_of_expense', { ascending: false })
                        .limit(10000);
                    if (error) throw error;
                    return data || [];
                },
                storeId
            );
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 60 * 4,
        placeholderData: keepPreviousData,
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
        refetchOnMount: 'always',
        structuralSharing: true,
    });
}

export function useOptimizedCustomers(storeId: string | null) {
    return useQuery({
        queryKey: ['customers', storeId],
        queryFn: async () => {
            if (!storeId) return [];

            return await fetchWithSWRCache<any[]>(
                'customers',
                async () => {
                    const { data, error } = await supabase
                        .from('customers')
                        .select('*')
                        .eq('store_id', storeId)
                        .order('full_name', { ascending: true })
                        .limit(10000);
                    if (error) throw error;
                    return data || [];
                }
            );
        },
        enabled: !!storeId,
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 60 * 4,
        placeholderData: keepPreviousData,
        retry: 2,
        refetchOnMount: 'always',
    });

}

export function useOptimizedCashTransactions(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['cash_transactions', storeId],
        queryFn: async () => {
            if (!storeId) return [];

            return await fetchWithSWRCache<any[]>(
                'cash_transactions',
                async () => {
                    const { data, error } = await supabase
                        .from('cash_transactions')
                        .select('*')
                        .eq('store_id', storeId)
                        .limit(10000);
                    if (error) throw error;
                    return data || [];
                }
            );
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 60 * 4,
        placeholderData: keepPreviousData,
        retry: 2,
        refetchOnMount: 'always',
    });

}

// Type for sale input that includes store_id and user_id
interface SaleInput {
    id?: string;
    customerName: string;
    dateOfSale: string;
    totalAmount: number;
    paidInCash: boolean;
    products: Product[];
    store_id: string;
    user_id: string;
    staff_id?: string;
    customer_id?: string;
}

import { transactionOptimizer } from '@/lib/transaction-optimizer';

// Optimistic mutation for adding sales
export function useAddSaleOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (sale: SaleInput) => {
            const baseSale = {
                customer_name: sale.customerName,
                date_of_sale: sale.dateOfSale,
                total_amount: sale.totalAmount,
                paid_in_cash: sale.paidInCash,
                products: sale.products as unknown as any,
                store_id: sale.store_id,
                user_id: sale.user_id,
                staff_id: sale.staff_id,
                customer_id: sale.customer_id
            };

            // Calculate inventory updates to reduce stock
            const { data: inventory } = await supabase
                .from('inventory')
                .select('*')
                .eq('store_id', sale.store_id);

            const inventoryUpdates = sale.products.map(product => {
                const stockItem = inventory?.find((s: any) => s.product_name === product.productName);
                if (!stockItem || !stockItem.id) return null;

                const itemsPerSachet = stockItem.items_per_sachet || 1;
                let itemsSold = product.quantity;

                if (product.sellType === 'sachet') {
                    itemsSold = product.quantity * itemsPerSachet;
                }

                const newQuantity = Math.max(0, (stockItem.quantity || 0) - itemsSold);
                const newSachets = product.sellType === 'sachet'
                    ? Math.max(0, (stockItem.sachets_count || 0) - product.quantity)
                    : Math.floor(newQuantity / itemsPerSachet);
                const newLoose = product.sellType === 'item'
                    ? Math.max(0, (stockItem.loose_items || 0) - product.quantity)
                    : newQuantity % itemsPerSachet;

                return {
                    id: stockItem.id,
                    quantity: newQuantity,
                    sachets_count: newSachets,
                    loose_items: newLoose
                };
            }).filter(Boolean) as Partial<StockItem>[];

            // Use transactionOptimizer for robust saving (handles offline/queueing)
            return await transactionOptimizer.processSale(
                baseSale,
                inventoryUpdates,
                sale.paidInCash ? {
                    amount: sale.totalAmount,
                    type: 'in',
                    description: `Sale to ${sale.customerName}`,
                    account_type: 'Cash',
                    user_id: sale.user_id,
                    store_id: sale.store_id
                } : undefined
            );
        },
        onSettled: (data, error, variables: SaleInput) => {
            queryClient.invalidateQueries({ queryKey: [ 'sales', variables.store_id ] });
            queryClient.invalidateQueries({ queryKey: [ 'inventory', variables.store_id ] });
            queryClient.invalidateQueries({ queryKey: [ 'cash_transactions', variables.store_id ] });
        },
    });
}

// Optimistic mutation for updating inventory
export function useUpdateInventoryOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<StockItem> }) => {
            return await transactionOptimizer.updateInventory(id, updates);
        },
        onSettled: (data, error, variables) => {
            // We don't have store_id here directly from data if it's optimistic
            // But we can invalidate all inventory or find the store_id
            queryClient.invalidateQueries({ queryKey: [ 'inventory' ] });
        },
    });
}

// Optimistic mutation for deleting inventory
export function useDeleteProductOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            return await transactionOptimizer.batchOperations([ {
                operation: 'delete',
                table: 'inventory',
                data: { id }
            } ]);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: [ 'inventory' ] });
        },
    });
}

// Optimistic mutation for adding expenses
export function useAddExpenseOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (expense: any) => {
            return await transactionOptimizer.batchOperations([ {
                operation: 'insert',
                table: 'expenses',
                data: expense
            } ]);
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: [ 'expenses' ] });
            queryClient.invalidateQueries({ queryKey: [ 'cash_transactions' ] });
        },
    });
}

// Optimistic mutation for deleting expenses
export function useDeleteExpenseOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            return await transactionOptimizer.batchOperations([ {
                operation: 'delete',
                table: 'expenses',
                data: { id }
            } ]);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: [ 'expenses' ] });
        },
    });
}

// Prefetch data for faster navigation
export function usePrefetchData() {
    const queryClient = useQueryClient();

    const prefetchAll = useCallback(async (storeId: string, userId: string) => {
        await Promise.all([
            queryClient.prefetchQuery({
                queryKey: [ 'inventory', storeId ],
                queryFn: async () => {
                    const { data } = await supabase
                        .from('inventory')
                        .select('*')
                        .eq('store_id', storeId);
                    return data || [];
                },
            }),
            queryClient.prefetchQuery({
                queryKey: [ 'sales', storeId ],
                queryFn: async () => {
                    const { data } = await supabase
                        .from('sales')
                        .select('*')
                        .eq('store_id', storeId);
                    return data || [];
                },
            }),
        ]);
    }, [ queryClient ]);

    return { prefetchAll };
}
// Optimized mutation for adding bulk stock
export function useAddBatchStockOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: {
            batchItems: any[];
            storeId: string;
            userId: string;
        }) => {
            const { batchItems, storeId, userId } = payload;

            // --- Resolve suppliers in bulk (single query) ---
            const uniqueSupplierNames = [...new Set(
                batchItems.map(i => (i.supplier || '').trim()).filter(Boolean)
            )];

            const supplierMap = new Map<string, string>();

            if (uniqueSupplierNames.length > 0) {
                const { data: existingSuppliers } = await supabase
                    .from('suppliers')
                    .select('id, name, total_supplied, outstanding_balance')
                    .eq('store_id', storeId);

                const existingByName = new Map<string, any>();
                (existingSuppliers || []).forEach(s => existingByName.set(s.name.toLowerCase(), s));

                for (const name of uniqueSupplierNames) {
                    const key = name.toLowerCase();
                    if (existingByName.has(key)) {
                        supplierMap.set(key, existingByName.get(key).id);
                    } else {
                        const { data: created, error: insertErr } = await supabase
                            .from('suppliers')
                            .insert({ store_id: storeId, user_id: userId, name } as any)
                            .select('id')
                            .maybeSingle();
                        if (created) {
                            supplierMap.set(key, created.id);
                            existingByName.set(key, { ...created, total_supplied: 0, outstanding_balance: 0 });
                        } else if (insertErr) {
                            // Conflict - supplier created concurrently, fetch it
                            const { data: fetched } = await supabase
                                .from('suppliers')
                                .select('id, total_supplied, outstanding_balance')
                                .eq('store_id', storeId)
                                .ilike('name', name)
                                .maybeSingle();
                            if (fetched) {
                                supplierMap.set(key, fetched.id);
                                existingByName.set(key, { ...fetched, name });
                            }
                        }
                    }
                }

                // Accumulate & update supplier totals
                const supplierTotals = new Map<string, { addedTotal: number; addedBalance: number }>();
                for (const item of batchItems) {
                    const name = (item.supplier || '').trim();
                    if (!name) continue;
                    const key = name.toLowerCase();
                    const id = supplierMap.get(key);
                    if (id) item.supplier_id = id;
                    if (!supplierTotals.has(key)) supplierTotals.set(key, { addedTotal: 0, addedBalance: 0 });
                    const t = supplierTotals.get(key)!;
                    t.addedTotal += item.totalCost || 0;
                    if (item.onCredit) t.addedBalance += (item.totalCost || 0) - (item.credit_paid_now || 0);
                }

                await Promise.all([...supplierTotals.entries()].map(async ([key, totals]) => {
                    const supplierId = supplierMap.get(key);
                    if (!supplierId) return;
                    const existing = existingByName.get(key);
                    await supabase.from('suppliers').update({
                        total_supplied: (Number(existing?.total_supplied) || 0) + totals.addedTotal,
                        outstanding_balance: (Number(existing?.outstanding_balance) || 0) + totals.addedBalance,
                        updated_at: new Date().toISOString(),
                    } as any).eq('id', supplierId);
                }));
            }

            // 1. Prepare inventory inserts
            const inventoryUpserts = batchItems.map(item => ({
                store_id: storeId,
                user_id: userId,
                product_name: item.productName,
                category: item.category,
                quantity: item.quantity,
                cost_per_unit: item.costPerUnit,
                total_value: item.totalCost,
                retail_price: item.retailPrice,
                wholesale_price: item.wholesalePrice,
                date_of_purchase: item.date_of_purchase,
                size: item.size,
                barcode: item.barcode,
                notes: item.notes,
                packaging_type: item.packagingType,
                items_per_sachet: item.itemsPerUnit,
                sachets_count: item.sachetsCount,
                loose_items: item.looseItems,
                unit_name: item.unit_name,
                supplier_id: item.supplier_id || null,
                supplier_name: (item.supplier || '').trim() || null,
            }));

            // 2. Prepare Financial Records (Credit Loans & Cash Transactions)
            const stockLoans: any[] = [];
            const cashTransactions: any[] = [];

            batchItems.forEach(item => {
                if (item.onCredit) {
                    stockLoans.push({
                        store_id: storeId,
                        user_id: userId,
                        supplier: item.supplier || 'Unknown Supplier',
                        product_name: item.productName,
                        quantity: item.quantity,
                        cost_per_unit: item.costPerUnit,
                        total_amount: item.totalCost,
                        amount_paid: item.credit_paid_now || 0,
                        balance: item.totalCost - (item.credit_paid_now || 0),
                        status: (item.totalCost - (item.credit_paid_now || 0)) <= 0 ? 'paid' : 'pending',
                        date_of_purchase: item.date_of_purchase
                    });

                    if (item.credit_paid_now > 0) {
                        cashTransactions.push({
                            store_id: storeId,
                            user_id: userId,
                            amount: item.credit_paid_now,
                            type: 'out',
                            description: `Partial payment for stock: ${item.productName}`,
                            account_type: 'cash'
                        });
                    }
                } else {
                    cashTransactions.push({
                        store_id: storeId,
                        user_id: userId,
                        amount: item.totalCost,
                        type: 'out',
                        description: `Stock Purchase: ${item.productName}`,
                        account_type: 'cash'
                    });
                }
            });

            // 3. Use transactionOptimizer for batch operations (handles offline/queueing)
            const operations: any[] = inventoryUpserts.map(inv => ({ operation: 'insert', table: 'inventory', data: inv }));
            stockLoans.forEach(loan => operations.push({ operation: 'insert', table: 'stock_loans', data: loan }));
            cashTransactions.forEach(tx => operations.push({ operation: 'insert', table: 'cash_transactions', data: tx }));

            return await transactionOptimizer.batchOperations(operations);
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: [ 'inventory' ] });
            queryClient.invalidateQueries({ queryKey: [ 'cash_transactions' ] });
            queryClient.invalidateQueries({ queryKey: [ 'stock_loans' ] });
            queryClient.invalidateQueries({ queryKey: [ 'suppliers' ] });
            queryClient.invalidateQueries({ queryKey: [ 'reports' ] });
            queryClient.invalidateQueries({ queryKey: [ 'sales' ] });
            queryClient.invalidateQueries({ queryKey: [ 'expenses' ] });
        },
    });
}

export function useOptimizedSuppliers(storeId: string | null) {
    return useQuery({
        queryKey: [ 'suppliers', storeId ],
        queryFn: async () => {
            if (!storeId) return [];
            const { data, error } = await supabase
                .from('suppliers')
                .select('id, name, company')
                .eq('store_id', storeId)
                .order('name', { ascending: true });
            if (error) throw error;
            return data || [];
        },
        enabled: !!storeId,
        staleTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: false,
    });
}

export function useOptimizedCategories(storeId: string | null) {
    return useQuery({
        queryKey: [ 'categories', storeId ],
        queryFn: async () => {
            if (!storeId) return [];
            const { data, error } = await supabase
                .from('categories')
                .select('name')
                .eq('store_id', storeId)
                .order('name', { ascending: true });
            if (error) throw error;
            return Array.from(new Set(data?.map(c => c.name) || []));
        },
        enabled: !!storeId,
        staleTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: false,
    });
}

export function useOptimizedStoresData(storeIds: string[], userId: string | null) {
    return useQuery({
        queryKey: [ 'custom_stores_data', storeIds.join(',') ],
        queryFn: async () => {
            if (!storeIds || storeIds.length === 0) return { inventory: [], sales: [], expenses: [] };

            const [ inv, sales, exp ] = await Promise.all([
                supabase.from('inventory').select('*').in('store_id', storeIds),
                supabase.from('sales').select('*').in('store_id', storeIds).order('date_of_sale', { ascending: false }),
                supabase.from('expenses').select('*').in('store_id', storeIds).order('date_of_expense', { ascending: false })
            ]);

            return {
                inventory: inv.data || [],
                sales: sales.data || [],
                expenses: exp.data || []
            };
        },
        enabled: storeIds.length > 0 && !!userId,
        staleTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: false,
    });
}
