// hooks/useOptimizedData.ts - React Query hooks for data fetching
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';
import { SaleItem, StockItem, Product } from '@/types';
import { generateBarcodeByType, validateBarcode } from '@/lib/barcode';
import { retryWithBackoff } from '@/lib/retry';
import { dataSyncService } from '@/lib/data-sync';
import { sanitizeInventoryPayload } from '@/lib/inventoryPayload';
import { logSupabaseError } from '@/lib/supabaseError';

export function useOptimizedInventory(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['inventory', storeId],
        queryFn: async () => {
            if (!storeId) return [];
            return await dataSyncService.getDataWithLocalFirst(`inventory:${storeId}`, async () => {
                const { data, error } = await supabase
                    .from('inventory')
                    .select('*')
                    .eq('store_id', storeId)
                    .order('created_at', { ascending: false })
                    .limit(10000);
                if (error) throw error;
                return data || [];
            });
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 60 * 5,    // 5 min — realtime handles live updates
        gcTime: 1000 * 60 * 60 * 24,
        placeholderData: keepPreviousData,
        retry: 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        structuralSharing: true,
    });
}

export function useOptimizedSales(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['sales', storeId],
        queryFn: async () => {
            if (!storeId) return [];
            return await dataSyncService.getDataWithLocalFirst(`sales:${storeId}`, async () => {
                const { data, error } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('store_id', storeId)
                    .order('date_of_sale', { ascending: false })
                    .limit(10000);
                if (error) throw error;
                return data || [];
            });
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 60 * 2,    // 2 min
        gcTime: 1000 * 60 * 60 * 24,
        placeholderData: keepPreviousData,
        retry: 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        structuralSharing: true,
    });
}

export function useOptimizedExpenses(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['expenses', storeId],
        queryFn: async () => {
            if (!storeId) return [];
            return await dataSyncService.getDataWithLocalFirst(`expenses:${storeId}`, async () => {
                const { data, error } = await supabase
                    .from('expenses')
                    .select('*')
                    .eq('store_id', storeId)
                    .order('date_of_expense', { ascending: false })
                    .limit(10000);
                if (error) throw error;
                return data || [];
            });
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 60 * 10,   // 10 min
        gcTime: 1000 * 60 * 60 * 24,
        placeholderData: keepPreviousData,
        retry: 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        structuralSharing: true,
    });
}

export function useOptimizedCustomers(storeId: string | null) {
    return useQuery({
        queryKey: ['customers', storeId],
        queryFn: async () => {
            if (!storeId) return [];
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('store_id', storeId)
                .order('full_name', { ascending: true })
                .limit(10000);
            if (error) throw error;
            return data || [];
        },
        enabled: !!storeId,
        staleTime: 1000 * 60 * 60,
        gcTime: 1000 * 60 * 60 * 24,
        placeholderData: keepPreviousData,
        retry: 2,
        refetchOnMount: false,
    });

}

export function useOptimizedCashTransactions(storeId: string | null, userId: string | null) {
    return useQuery({
        queryKey: ['cash_transactions', storeId],
        queryFn: async () => {
            if (!storeId) return [];
            return await dataSyncService.getDataWithLocalFirst(`cash_transactions:${storeId}`, async () => {
                const { data, error } = await supabase
                    .from('cash_transactions')
                    .select('*')
                    .eq('store_id', storeId)
                    .limit(10000);
                if (error) throw error;
                return data || [];
            });
        },
        enabled: !!storeId && !!userId,
        staleTime: 1000 * 30,
        gcTime: 1000 * 60 * 60 * 24,
        placeholderData: keepPreviousData,
        retry: 2,
        refetchOnMount: false,
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
    payment_method_id?: string | null;
    payment_account_id?: string | null;
    payment_details?: any;
    inventorySnapshot?: StockItem[];
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
                , payment_method_id: sale.payment_method_id
                , payment_account_id: sale.payment_account_id
                , payment_details: sale.payment_details
            };

            // Calculate inventory updates to reduce stock.
            // Use the current UI snapshot when available to avoid an extra query.
            let inventorySource: any[] = Array.isArray(sale.inventorySnapshot) ? sale.inventorySnapshot : [];
            if (inventorySource.length === 0) {
                const { data: inventory } = await supabase
                    .from('inventory')
                    .select('*')
                    .eq('store_id', sale.store_id);
                inventorySource = inventory || [];
            }

            const inventoryUpdates = sale.products.map(product => {
                // Prefer matching inventory by id, fall back to normalized name match
                let stockItem = inventorySource.find((s: any) => String(s.id) === String(product.id));
                if (!stockItem) {
                    stockItem = inventorySource.find((s: any) => {
                        const name = s.product_name || s.productName;
                        return String(name || "").trim().toLowerCase() === String(product.productName || "").trim().toLowerCase();
                    });
                }
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
            const splitPayments = Array.isArray((sale.payment_details as any)?.splitPayments) ? (sale.payment_details as any).splitPayments : [];
            const paymentProviderType = String((sale.payment_details as any)?.paymentProviderType || "").toLowerCase();
            const cashAmount = splitPayments.length > 1
                ? splitPayments.filter((payment: any) => String(payment.providerType || "").toLowerCase() === "cash").reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0)
                : paymentProviderType === "cash" ? sale.totalAmount : 0;
            const result = await transactionOptimizer.processSale(
                baseSale,
                inventoryUpdates,
                sale.paidInCash && cashAmount > 0 ? {
                    amount: cashAmount,
                    type: 'in',
                    description: `Sale to ${sale.customerName}`,
                    account_type: 'Cash',
                    user_id: sale.user_id,
                    store_id: sale.store_id
                } : undefined
            );
            if (splitPayments.length > 1 && result.saleId) {
                const { error: splitError } = await (supabase.from("sale_payment_splits" as any) as any).insert(
                    splitPayments.map((payment: any) => ({ sale_id: result.saleId, store_id: sale.store_id, account_id: payment.accountId, amount: Number(payment.amount) || 0 }))
                );
                if (splitError) throw splitError;
            }
            return result;
        },
        onSettled: (data, error, variables: SaleInput) => {
            queryClient.refetchQueries({ queryKey: ['sales', variables.store_id], type: 'all' });
            queryClient.refetchQueries({ queryKey: ['inventory', variables.store_id], type: 'all' });
            queryClient.refetchQueries({ queryKey: ['cash_transactions', variables.store_id], type: 'all' });
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
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
        },
    });
}

// Optimistic mutation for deleting inventory
export function useDeleteProductOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            return await transactionOptimizer.batchOperations([{
                operation: 'delete',
                table: 'inventory',
                data: { id }
            }]);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
        },
    });
}

// Optimistic mutation for adding expenses
export function useAddExpenseOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (expense: any) => {
            return await transactionOptimizer.batchOperations([{
                operation: 'insert',
                table: 'expenses',
                data: expense
            }]);
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        },
    });
}

// Optimistic mutation for deleting expenses
export function useDeleteExpenseOptimistic() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            return await transactionOptimizer.batchOperations([{
                operation: 'delete',
                table: 'expenses',
                data: { id }
            }]);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
        },
    });
}

// Prefetch data for faster navigation
export function usePrefetchData() {
    const queryClient = useQueryClient();

    const prefetchAll = useCallback(async (storeId: string, userId: string) => {
        await Promise.all([
            queryClient.prefetchQuery({
                queryKey: ['inventory', storeId],
                queryFn: async () => {
                    const { data } = await supabase
                        .from('inventory')
                        .select('*')
                        .eq('store_id', storeId);
                    return data || [];
                },
            }),
            queryClient.prefetchQuery({
                queryKey: ['sales', storeId],
                queryFn: async () => {
                    const { data } = await supabase
                        .from('sales')
                        .select('*')
                        .eq('store_id', storeId);
                    return data || [];
                },
            }),
        ]);
    }, [queryClient]);

    return { prefetchAll };
}
// Optimized mutation for adding bulk stock

export function useAddBatchStockOptimistic() {
    const queryClient = useQueryClient();

    const chunkArray = <T,>(items: T[], size: number) => {
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += size) {
            chunks.push(items.slice(i, i + size));
        }
        return chunks;
    };

    return useMutation({
        mutationFn: async (payload: {
            batchItems: any[];
            storeId: string;
            userId: string;
            onProgress?: (processed: number, total: number) => void;
        }) => {
            const { batchItems, storeId, userId, onProgress } = payload;

            const INVENTORY_CHUNK_SIZE = 250;

            // --- Barcode validation + dedupe (single-store uniqueness) ---
            const normalizeBarcode = (value: unknown) =>
                typeof value === "string" ? value.trim() : "";

            // We are forgiving:
            // - barcode is optional
            // - duplicates are auto-resolved (non-blocking)
            // - invalid barcodes are replaced with generated ones (non-blocking)
            const warnings: string[] = [];
            let duplicatesAutoFixed = 0;
            let invalidBarcodesFixed = 0;
            let missingBarcodesAutoGenerated = 0;

            const providedBarcodes = batchItems
                .map((item) => normalizeBarcode(item?.barcode))
                .filter(Boolean);

            // 1) Fetch existing barcodes in DB for conflict avoidance (not for rejection)
            const existing = new Set<string>();
            if (providedBarcodes.length > 0) {
                for (const chunk of chunkArray(Array.from(new Set(providedBarcodes)), 500)) {
                    const { data, error } = await supabase
                        .from("inventory")
                        .select("barcode")
                        .eq("store_id", storeId)
                        .in("barcode", chunk as any);
                    if (error) throw error;
                    (data || []).forEach((row: any) => {
                        if (row?.barcode) existing.add(String(row.barcode));
                    });
                }

                if (existing.size > 0) {
                    warnings.push("Some barcodes already existed and were auto-adjusted to avoid scan conflicts.");
                }
            }

            const usedBarcodes = new Set<string>(existing);
            const resolveBarcode = (rawBarcode: string, index: number) => {
                // Always return a unique value for scan safety, even if DB allows duplicates.
                let candidate = rawBarcode;
                if (!candidate) candidate = `AUTO-${Date.now()}-${index}`;

                if (!usedBarcodes.has(candidate)) {
                    usedBarcodes.add(candidate);
                    return candidate;
                }

                // Collision: append a deterministic suffix.
                let attempt = 1;
                while (usedBarcodes.has(`${candidate}-${attempt}`)) attempt++;
                const resolved = `${candidate}-${attempt}`;
                usedBarcodes.add(resolved);
                duplicatesAutoFixed++;
                return resolved;
            };

            // --- Resolve suppliers in bulk (2 queries max) ---
            let supplierTotalsUpdatePromise: Promise<void> | null = null;

            const uniqueSupplierNames = [...new Set(
                batchItems.map(i => (i.supplier || '').trim()).filter(Boolean)
            )];

            const supplierMap = new Map<string, string>(); // lowercase name -> id

            if (uniqueSupplierNames.length > 0) {
                // 1. Fetch all existing suppliers in one query
                const { data: existingSuppliers } = await supabase
                    .from('suppliers')
                    .select('id, name, total_supplied, outstanding_balance')
                    .eq('store_id', storeId);

                const existingByName = new Map<string, any>();
                (existingSuppliers || []).forEach(s => existingByName.set(s.name.toLowerCase(), s));

                // 2. Insert all missing suppliers in one bulk insert
                const missing = uniqueSupplierNames.filter(n => !existingByName.has(n.toLowerCase()));
                if (missing.length > 0) {
                    const { data: created } = await supabase
                        .from('suppliers')
                        .insert(missing.map(name => ({ store_id: storeId, user_id: userId, name })))
                        .select('id, name');
                    (created || []).forEach(s => {
                        existingByName.set(s.name.toLowerCase(), { ...s, total_supplied: 0, outstanding_balance: 0 });
                    });
                }

                uniqueSupplierNames.forEach(name => {
                    const key = name.toLowerCase();
                    const s = existingByName.get(key);
                    if (s) supplierMap.set(key, s.id);
                });

                // 3. Accumulate totals per supplier
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

                // 4. Update supplier totals in the background so inventory save completes faster.
                supplierTotalsUpdatePromise = Promise.all(
                    [...supplierTotals.entries()].map(([key, totals]) => {
                        const supplierId = supplierMap.get(key);
                        if (!supplierId) return Promise.resolve();
                        const existing = existingByName.get(key);
                        return supabase.from('suppliers').update({
                            total_supplied: (Number(existing?.total_supplied) || 0) + totals.addedTotal,
                            outstanding_balance: (Number(existing?.outstanding_balance) || 0) + totals.addedBalance,
                            updated_at: new Date().toISOString(),
                        } as any).eq('id', supplierId);
                    })
                ).then(() => undefined).catch(() => {
                    warnings.push("Supplier totals will finish syncing shortly.");
                });
            }

            const barcodeToBatchIndex = new Map<string, number>();

            // 1. Bulk insert inventory (single query)
            // Normalize and "sanitize" messy import data so the app never crashes.
            const inventoryRows = batchItems.map((item, index) => {
                const barcodeType = (item.barcode_type || "CODE128") as any;

                const rawBarcode = normalizeBarcode(item.barcode);
                let candidateBarcode = rawBarcode;

                if (!candidateBarcode) {
                    candidateBarcode = generateBarcodeByType(barcodeType);
                    missingBarcodesAutoGenerated++;
                } else if (!validateBarcode(candidateBarcode, barcodeType)) {
                    // Replace invalid format with a generated barcode (do not block the batch).
                    candidateBarcode = generateBarcodeByType(barcodeType);
                    invalidBarcodesFixed++;
                }

                const resolvedBarcode = resolveBarcode(candidateBarcode, index);

                const productName = String(item.productName ?? "").trim() || "Unnamed Product";
                const category = String(item.category ?? "").trim() || "Other";
                const quantity = Number(item.quantity) || 0;
                const costPerUnit = Number(item.costPerUnit) || 0;
                const retailPrice = Number(item.retailPrice) || 0;
                const wholesalePrice = Number(item.wholesalePrice) || 0;
                const looseItemPrice = Number(item.looseItemPrice) || 0;
                const totalValue = Number(item.totalCost) || quantity * costPerUnit || 0;

                const row = sanitizeInventoryPayload({
                    store_id: storeId,
                    user_id: userId,
                    product_name: productName,
                    category,
                    quantity,
                    cost_per_unit: costPerUnit,
                    total_value: totalValue,
                    retail_price: retailPrice,
                    wholesale_price: wholesalePrice,
                    loose_item_price: looseItemPrice,
                    date_of_purchase: item.date_of_purchase || new Date().toISOString().split("T")[0],
                    supplier_id: item.supplier_id || null,
                    supplier_name: String(item.supplier || "").trim() || null,
                    barcode: resolvedBarcode || null,
                    unit_name: item.unit_name || item.unitName || "unit",
                    packaging_type: item.packagingType || item.packaging_type || "individual",
                    items_per_sachet: Number(item.itemsPerUnit) || 1,
                    sachets_count: Number(item.sachetsCount) || 0,
                    loose_items: Number(item.looseItems) || 0,
                    size: String(item.size || "").trim() || null,
                    notes: String(item.notes || "").trim() || null,
                    product_image: String(item.productImage || item.product_image || "").trim() || null,
                    min_stock_level: Number(item.min_stock_level) || 0,
                    reorder_quantity: Number(item.reorder_quantity) || 0,
                } as Record<string, unknown>);

                if (typeof row.barcode === "string" && row.barcode.length > 0) {
                    barcodeToBatchIndex.set(row.barcode, index);
                }

                return row;
            });

            if (duplicatesAutoFixed > 0) warnings.push("Some duplicate barcodes were auto-fixed.");
            if (invalidBarcodesFixed > 0) warnings.push("Some invalid barcodes were replaced with auto-generated ones.");
            if (missingBarcodesAutoGenerated > 0) warnings.push("Some missing barcodes were auto-generated.");

            // 2. Prepare loans and cash transactions
            const stockLoans: any[] = [];
            const cashTransactions: any[] = [];

            batchItems.forEach(item => {
                if (item.onCredit) {
                    stockLoans.push({
                        store_id: storeId, user_id: userId,
                        supplier: item.supplier || 'Unknown Supplier',
                        product_name: item.productName,
                        quantity: item.quantity,
                        cost_per_unit: item.costPerUnit,
                        total_amount: item.totalCost,
                        amount_paid: item.credit_paid_now || 0,
                        balance: item.totalCost - (item.credit_paid_now || 0),
                        status: (item.totalCost - (item.credit_paid_now || 0)) <= 0 ? 'paid' : 'pending',
                        date_of_purchase: item.date_of_purchase,
                    });
                    if (item.credit_paid_now > 0) {
                        cashTransactions.push({
                            store_id: storeId, user_id: userId,
                            amount: Number(item.credit_paid_now) || 0, type: 'out',
                            description: `Partial payment for stock: ${item.productName}`,
                            account_type: 'cash',
                        });
                    }
                } else if (item.totalCost > 0) {
                    cashTransactions.push({
                        store_id: storeId, user_id: userId,
                        amount: Number(item.totalCost) || 0, type: 'out',
                        description: `Stock Purchase: ${item.productName}`,
                        account_type: 'cash',
                    });
                }
            });

            const failures: { table: string; reason: string; row?: any; batchIndex?: number }[] = [];

            // --- Offline-first: persist locally before any network calls ---
            try {
                const localCreatedAt = new Date().toISOString();
                const localRows = inventoryRows.map((r, i) => ({
                    ...r,
                    id: `local-inv-${Date.now()}-${i}`,
                    created_at: localCreatedAt,
                }));
                const localKey = `inventory:${storeId}`;
                const existingLocal = await dataSyncService.getLocalData(localKey);
                await dataSyncService.saveLocalData(localKey, [...localRows, ...(existingLocal as any[])]);
            } catch {
                // If IndexedDB/localStorage is unavailable, continue without blocking the user.
                warnings.push("Local storage is unavailable; offline mode may be limited on this device.");
            }

            // If offline, queue everything and return success immediately (UI stays instant).
            if (!navigator.onLine) {
                warnings.push("Saved locally. Will sync automatically when internet returns.");
                await dataSyncService.enqueueMany("insert", "inventory", inventoryRows);
                if (stockLoans.length > 0) await dataSyncService.enqueueMany("insert", "stock_loans", stockLoans);
                if (cashTransactions.length > 0) await dataSyncService.enqueueMany("insert", "cash_transactions", cashTransactions);

                onProgress?.(inventoryRows.length, inventoryRows.length);
                return {
                    success: true,
                    count: batchItems.length,
                    warnings,
                    failures: [],
                    insertedInventory: 0,
                    meta: {
                        duplicatesAutoFixed,
                        invalidBarcodesFixed,
                        missingBarcodesAutoGenerated,
                    },
                };
            }

            const chunkedInsert = async (
                table: "inventory" | "stock_loans" | "cash_transactions",
                rows: any[],
                chunkSize: number,
                callback?: (inserted: number) => void,
                selectCols: string = "id"
            ) => {
                const extractMissingColumn = (err: any) => {
                    const message = String(err?.message || "");
                    const code = String(err?.code || "");
                    if (!code.startsWith("PGRST2")) return null;
                    const match = message.match(/Could not find the '([^']+)' column/i);
                    return match?.[1] || null;
                };

                const stripColumn = (value: any, column: string) => {
                    if (!value || typeof value !== "object") return value;
                    if (!(column in value)) return value;
                    const cloned = { ...value };
                    delete cloned[column];
                    return cloned;
                };

                const insertWithSchemaFallback = async (inputRows: any[]) => {
                    let workingRows = inputRows;
                    const removed = new Set<string>();

                    for (let i = 0; i < 12; i++) {
                        const result = await supabase.from(table).insert(workingRows).select(selectCols);
                        if (!result.error) {
                            return { error: null, removed };
                        }

                        const missingColumn = extractMissingColumn(result.error);
                        if (!missingColumn || removed.has(missingColumn)) {
                            return { error: result.error, removed };
                        }

                        removed.add(missingColumn);
                        workingRows = workingRows.map((row) => stripColumn(row, missingColumn));
                    }

                    return { error: new Error("Schema fallback exhausted"), removed };
                };

                const shouldRetry = (err: any) => {
                    const code = String(err?.code || "");
                    const message = String(err?.message || "").toLowerCase();
                    if (code.startsWith("PGRST2")) return false;
                    if (message.includes("could not find the") && message.includes("column")) return false;

                    const status = Number(err?.status || err?.cause?.status || 0);
                    if (status === 0) return true; // network drop
                    if (status === 408 || status === 429) return true;
                    if (status >= 500 && status < 600) return true;
                    return false;
                };

                for (const chunk of chunkArray(rows, chunkSize)) {
                    let { error, removed } = await retryWithBackoff(async () => {
                        const res = await insertWithSchemaFallback(chunk);
                        if (res.error && shouldRetry(res.error)) throw res.error;
                        return res;
                    }, { retries: 2, baseDelayMs: 300, maxDelayMs: 2500, shouldRetry });

                    if ((removed?.size || 0) > 0) {
                        warnings.push(`Some unavailable columns were ignored: ${Array.from(removed).join(", ")}.`);
                    }

                    if (!error) {
                        callback?.(chunk.length);
                        continue;
                    }

                    logSupabaseError("inventory.batch.insert.bulk", error, {
                        table,
                        chunkSize: chunk.length,
                    });

                    // Bulk insert failed - fall back to per-row inserts so one bad row doesn't kill the whole batch.
                    warnings.push(`Some ${table} rows failed bulk insert and were retried individually.`);
                    for (const row of chunk) {
                        try {
                            await retryWithBackoff(async () => {
                                const res = await insertWithSchemaFallback([row]);
                                if (res.error) throw res.error;
                                return res;
                            }, { retries: 2, baseDelayMs: 300, maxDelayMs: 2500, shouldRetry });

                            callback?.(1);
                        } catch (rowError: any) {
                                logSupabaseError("inventory.batch.insert.row", rowError, {
                                    table,
                                    hasBarcode: Boolean(row?.barcode),
                                });
                                failures.push({
                                    table,
                                    reason: rowError?.message || "Insert failed",
                                    row,
                                    batchIndex: table === "inventory" && typeof row?.barcode === "string"
                                        ? barcodeToBatchIndex.get(row.barcode)
                                        : undefined,
                                });
                        }
                    }
                }
            };

            const totalInventoryRows = inventoryRows.length;
            let processedInventory = 0;

            if (totalInventoryRows > 0) {
                await chunkedInsert('inventory', inventoryRows, INVENTORY_CHUNK_SIZE, (inserted) => {
                    processedInventory += inserted;
                    onProgress?.(processedInventory, totalInventoryRows);
                });
            } else {
                onProgress?.(0, 0);
            }

            // If nothing was saved, treat as a hard error (usually offline/network) so UI doesn't clear the batch.
            if (totalInventoryRows > 0 && processedInventory === 0) {
                const first = failures.find((f) => f.table === "inventory");
                throw new Error(first?.reason || "Failed to save inventory. Check your network and try again.");
            }

            if (stockLoans.length > 0) {
                await chunkedInsert('stock_loans', stockLoans, INVENTORY_CHUNK_SIZE);
            }

            if (cashTransactions.length > 0) {
                await chunkedInsert('cash_transactions', cashTransactions, INVENTORY_CHUNK_SIZE);
            }

            // Fire-and-forget supplier total updates started above.
            void supplierTotalsUpdatePromise;

            // Queue failed rows for background sync (never block the user).
            if (failures.length > 0) {
                const invFailed = failures.filter((f) => f.table === "inventory").map((f) => f.row).filter(Boolean);
                const loansFailed = failures.filter((f) => f.table === "stock_loans").map((f) => f.row).filter(Boolean);
                const cashFailed = failures.filter((f) => f.table === "cash_transactions").map((f) => f.row).filter(Boolean);

                if (invFailed.length > 0) await dataSyncService.enqueueMany("insert", "inventory", invFailed as any[]);
                if (loansFailed.length > 0) await dataSyncService.enqueueMany("insert", "stock_loans", loansFailed as any[]);
                if (cashFailed.length > 0) await dataSyncService.enqueueMany("insert", "cash_transactions", cashFailed as any[]);

                warnings.push("Some rows failed online save and were queued for automatic sync.");
            }

            onProgress?.(totalInventoryRows, totalInventoryRows);
            return {
                success: true,
                count: batchItems.length,
                warnings,
                failures,
                insertedInventory: processedInventory,
                meta: {
                    duplicatesAutoFixed,
                    invalidBarcodesFixed,
                    missingBarcodesAutoGenerated,
                },
            };
        },
        onMutate: async (variables) => {
            const now = new Date().toISOString();
            const optimisticInventory = variables.batchItems.map((item, index) => ({
                id: `optimistic-inventory-${Date.now()}-${index}`,
                store_id: variables.storeId,
                user_id: variables.userId,
                product_name: item.productName,
                category: item.category,
                quantity: item.quantity,
                cost_per_unit: item.costPerUnit,
                total_value: item.totalCost,
                date_of_purchase: item.date_of_purchase || new Date().toISOString().split('T')[0],
                created_at: now,
            }));

            const optimisticCashTransactions = variables.batchItems
                .filter((item) => !item.onCredit || item.credit_paid_now > 0)
                .map((item, index) => ({
                    id: `optimistic-cash-${Date.now()}-${index}`,
                    store_id: variables.storeId,
                    user_id: variables.userId,
                    amount: item.onCredit ? (item.credit_paid_now || 0) : item.totalCost,
                    type: 'out',
                    description: item.onCredit
                        ? `Partial payment for stock: ${item.productName}`
                        : `Stock Purchase: ${item.productName}`,
                    account_type: 'cash',
                    created_at: now,
                }));

            await queryClient.cancelQueries({ queryKey: ['inventory', variables.storeId] });
            await queryClient.cancelQueries({ queryKey: ['cash_transactions', variables.storeId] });

            const previousInventory = queryClient.getQueryData<any[]>(['inventory', variables.storeId]) || [];
            const previousCashTransactions = queryClient.getQueryData<any[]>(['cash_transactions', variables.storeId]) || [];

            queryClient.setQueryData(
                ['inventory', variables.storeId],
                [...optimisticInventory, ...previousInventory]
            );
            queryClient.setQueryData(
                ['cash_transactions', variables.storeId],
                [...optimisticCashTransactions, ...previousCashTransactions]
            );

            return {
                previousInventory,
                previousCashTransactions,
            };
        },
        onError: async (_error, variables, context) => {
            if (context?.previousInventory) {
                queryClient.setQueryData(['inventory', variables.storeId], context.previousInventory);
            }

            if (context?.previousCashTransactions) {
                queryClient.setQueryData(['cash_transactions', variables.storeId], context.previousCashTransactions);
            }
        },
        onSettled: (data, error, variables) => {
            // Invalidate all inventory-related queries (different components use different key shapes)
            queryClient.invalidateQueries({ queryKey: [ 'inventory' ] });
            queryClient.invalidateQueries({ queryKey: [ 'cash_transactions' ] });
            queryClient.invalidateQueries({ queryKey: [ 'stock_loans' ] });
            queryClient.invalidateQueries({ queryKey: [ 'suppliers' ] });
            queryClient.invalidateQueries({ queryKey: [ 'reports' ] });
            queryClient.invalidateQueries({ queryKey: [ 'sales' ] });
            queryClient.invalidateQueries({ queryKey: [ 'expenses' ] });
        },
        // Disable retries for non-retryable server errors (schema mismatch, validation errors, etc.)
        retry: (failureCount, error: any) => {
            const status = Number(error?.status || error?.cause?.status || 0);
            const code = String(error?.code || "");
            const message = String(error?.message || "").toLowerCase();
            const isClientError = status >= 400 && status < 500 && status !== 429;
            const isSchemaError = code.startsWith("PGRST2");
            const isUniqueViolation = code === "23505";
            const isMissingColumn = message.includes("could not find the") && message.includes("column");
            if (isClientError || isSchemaError || isUniqueViolation || isMissingColumn) return false;
            return failureCount < 2;
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
            return Array.from(new Set(data?.map((c: any) => c.name) || []));
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
