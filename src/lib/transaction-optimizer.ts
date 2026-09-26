import { supabase } from "@/integrations/supabase/client";
import { TableName } from "@/lib/data-sync";
import { SaleItem, StockItem, CashTransaction, Product } from "@/types";

// Transaction optimizer for instant perceived performance
export class TransactionOptimizer {
  private userId: string | null = null;
  private storeId: string | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        this.userId = user.id;
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);
        this.storeId = stores?.[0]?.id || null;
      }
    } catch (error) {
      console.error("TransactionOptimizer initialization error:", error);
    }
  }

  public async addTransaction(transactionFn: () => Promise<unknown>, optimisticUpdate?: () => void) {
    if (optimisticUpdate) {
      optimisticUpdate();
    }
    return transactionFn();
  }

  // Optimized sale transaction with batching
  public async processSale(
    saleData: Partial<SaleItem>,
    inventoryUpdates: Partial<StockItem>[],
    cashTransaction?: Partial<CashTransaction>,
    optimisticUpdate?: () => void
  ) {
    if (optimisticUpdate) {
      optimisticUpdate();
    }

    // Always resolve the current authenticated user at insert time — never rely
    // on the stale singleton cache which may be null if initialize() hasn't resolved yet.
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) throw new Error("User not authenticated");

    // Resolve store_id: prefer what was passed in saleData, fall back to singleton cache
    const resolvedStoreId = (saleData as any).store_id || this.storeId;
    if (!resolvedStoreId) throw new Error("No store found — please select a store and try again");

    // Fast path: if a store_id is already provided from UI context, trust it and avoid extra round trips.
    if (!(saleData as any).store_id) {
      const { data: storeCheck } = await supabase
        .from("stores")
        .select("id")
        .eq("id", resolvedStoreId)
        .maybeSingle();

      if (!storeCheck) {
        // Store doesn't exist in this project — create it
        const { error: createErr } = await supabase
          .from("stores")
          .insert({ id: resolvedStoreId, store_name: "My Store", user_id: currentUser.id });
        if (createErr) {
          // If insert fails (e.g. duplicate), try fetching user's first store
          const { data: fallbackStore } = await supabase
            .from("stores")
            .select("id")
            .eq("user_id", currentUser.id)
            .limit(1)
            .maybeSingle();
          if (!fallbackStore) throw new Error("No store found. Please create a store first.");
          (saleData as any).store_id = fallbackStore.id;
        }
      }
    }

    const saleInsert = {
      ...saleData,
      user_id: currentUser.id,
      store_id: resolvedStoreId,
    };
    const saleResult = await supabase.from("sales").insert(saleInsert as any).select().single();
    if (saleResult.error) throw saleResult.error;

    const { sanitizeInventoryPayload } = await import("@/lib/inventoryPayload");
    const inventoryJobs = inventoryUpdates
      .filter((update) => Boolean(update.id))
      .map(async (update) => {
        const { id, ...rest } = update;
        const safeRest = sanitizeInventoryPayload(rest as Record<string, unknown>);
        const inventoryResult = await supabase
          .from("inventory")
          .update(safeRest as any)
          .eq("id", id as string)
          .select();
        if (inventoryResult.error) throw inventoryResult.error;
      });

    const [inventoryResults, cashResult] = await Promise.all([
      Promise.allSettled(inventoryJobs),
      cashTransaction
        ? supabase.from("cash_transactions").insert({
            ...cashTransaction,
            user_id: currentUser.id,
            store_id: (cashTransaction as any).store_id || resolvedStoreId
          } as any).select()
        : Promise.resolve({ error: null } as any),
    ]);

    const inventoryFailure = inventoryResults.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (inventoryFailure?.reason) throw inventoryFailure.reason;
    if (cashResult?.error) throw cashResult.error;

    return {
      success: true,
      optimistic: false,
      saleId: saleResult.data.id,
      receiptNumber: (saleResult.data as any).receipt_number || null,
      message: "Sale processed"
    };
  }

  // Optimized inventory update with batching
  public async updateInventory(
    inventoryId: string,
    updates: Partial<StockItem>,
    optimisticUpdate?: () => void
  ) {
    if (!this.userId || !this.storeId) {
      throw new Error("User or store not available");
    }

    if (optimisticUpdate) {
      optimisticUpdate();
    }

    // Sanitize to only send columns that exist in the inventory table
    const { sanitizeInventoryPayload } = await import("@/lib/inventoryPayload");
    const safeUpdates = sanitizeInventoryPayload(updates as Record<string, unknown>);
    // Remove id from the update payload (it's used in the .eq filter)
    const { id: _id, ...updateFields } = safeUpdates as any;

    const result = await supabase
      .from("inventory")
      .update(updateFields as any)
      .eq("id", inventoryId)
      .select();
    if (result.error) throw result.error;

    return {
      success: true,
      optimistic: false,
      message: "Inventory updated"
    };
  }

  // Batch multiple operations
  public async batchOperations(operations: Array<{
    operation: "insert" | "update" | "delete";
    table: TableName;
    data: unknown;
  }>, optimisticUpdate?: () => void) {
    if (optimisticUpdate) {
      optimisticUpdate();
    }

    const results: unknown[] = [];
    for (const op of operations) {
      switch (op.operation) {
        case "insert": {
          const result = await supabase.from(op.table).insert(op.data as any).select();
          if (result.error) throw result.error;
          results.push(result.data);
          break;
        }
        case "update": {
          const updateData = op.data as { id?: string };
          if (!updateData.id) {
            throw new Error("Update operation requires an id.");
          }
          const { id, ...rest } = updateData;
          const result = await supabase.from(op.table).update(rest as any).eq("id", id).select();
          if (result.error) throw result.error;
          results.push(result.data);
          break;
        }
        case "delete": {
          const deleteData = op.data as { id?: string };
          if (!deleteData.id) {
            throw new Error("Delete operation requires an id.");
          }
          const result = await supabase.from(op.table).delete().eq("id", deleteData.id).select();
          if (result.error) throw result.error;
          results.push(result.data);
          break;
        }
      }
    }

    return {
      success: true,
      optimistic: false,
      count: operations.length,
      results,
      message: `Batch of ${operations.length} operations completed`
    };
  }

  public isProcessingTransactions() {
    return false;
  }

  public getQueueLength() {
    return 0;
  }
}

// Singleton instance
export const transactionOptimizer = new TransactionOptimizer();

// Optimized sale processing hook
export const useOptimizedSales = () => {
  const processSale = async (
    customerName: string,
    products: Product[],
    paidInCash: boolean,
    amountReceived: number,
    stockData: StockItem[],
    optimisticUpdate?: () => void
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: stores } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      const storeId = stores?.[0]?.id;
      if (!storeId) throw new Error("No store found");

      const totalAmount = products.reduce((sum, p) => sum + (p.quantity * p.sellingPrice), 0);

      // Prepare sale data
      const saleData = {
        customer_name: customerName,
        date_of_sale: new Date().toISOString().split('T')[0],
        total_amount: totalAmount,
        paid_in_cash: paidInCash,
        products: products.map(p => ({
          id: p.id,
          productName: p.productName,
          quantity: p.quantity,
          sellingPrice: p.sellingPrice,
          sellType: p.sellType
        })),
        user_id: user.id,
        store_id: storeId
      };

      // Prepare inventory updates
      const inventoryUpdates = products.map(product => {
        const stockItem = stockData.find((s: StockItem) => s.productName === product.productName);
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

      // Prepare cash transaction if applicable
      let cashTransaction = null;
      if (paidInCash) {
        const cashReceived = amountReceived > 0 ? Math.min(amountReceived, totalAmount) : totalAmount;
        cashTransaction = {
          amount: cashReceived,
          type: 'in',
          description: `Sale to ${customerName}`,
          account_type: 'cash',
          user_id: user.id,
          store_id: storeId
        };
      }

      // Process with transaction optimizer
      return transactionOptimizer.processSale(
        saleData,
        inventoryUpdates,
        cashTransaction,
        optimisticUpdate
      );

    } catch (error) {
      console.error("Optimized sale processing error:", error);
      throw error;
    }
  };

  return { processSale };
};
