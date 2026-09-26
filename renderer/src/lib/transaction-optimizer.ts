import { supabase } from "@/integrations/supabase/client";
import { dataSyncService, TableName } from "@/lib/data-sync";
import { SaleItem, StockItem, CashTransaction, Product } from "@/types";

// Transaction optimizer for instant perceived performance
export class TransactionOptimizer {
  private transactionQueue: Array<() => Promise<unknown>> = [];
  private isProcessing = false;
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

  // Add transaction to queue with optimistic update
  public async addTransaction(transactionFn: () => Promise<unknown>, optimisticUpdate?: () => void) {
    // Apply optimistic update immediately
    if (optimisticUpdate) {
      optimisticUpdate();
    }

    // Add to queue
    this.transactionQueue.push(transactionFn);

    // Process queue
    this.processQueue();

    // Return immediately for instant perceived performance
    return { success: true, optimistic: true };
  }

  // Process transaction queue
  private async processQueue() {
    if (this.isProcessing || this.transactionQueue.length === 0) return;

    this.isProcessing = true;

    try {
      // Process all transactions in batch
      const transaction = this.transactionQueue.shift();
      if (transaction) {
        await transaction();
      }

      // Continue processing if more transactions in queue
      if (this.transactionQueue.length > 0) {
        await this.processQueue();
      }
    } catch (error) {
      console.error("Transaction processing error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Optimized sale transaction with batching
  public async processSale(
    saleData: Partial<SaleItem>,
    inventoryUpdates: Partial<StockItem>[],
    cashTransaction?: Partial<CashTransaction>,
    optimisticUpdate?: () => void
  ) {
    if (!this.userId || !this.storeId) {
      throw new Error("User or store not available");
    }

    // Apply optimistic update immediately
    if (optimisticUpdate) {
      optimisticUpdate();
    }

    // Add to sync queue for offline capability
    dataSyncService.addToSyncQueue("insert", "sales", {
      ...saleData,
      user_id: this.userId,
      store_id: this.storeId
    });

    // Process inventory updates in batch
    for (const update of inventoryUpdates) {
      dataSyncService.addToSyncQueue("update", "inventory", update);
    }

    // Process cash transaction if applicable
    if (cashTransaction) {
      dataSyncService.addToSyncQueue("insert", "cash_transactions", {
        ...cashTransaction,
        user_id: this.userId,
        store_id: this.storeId
      });
    }

    // Return immediately for instant confirmation
    return {
      success: true,
      optimistic: true,
      saleId: "optimistic-" + Date.now(),
      message: "Sale processed (optimistic)"
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

    // Apply optimistic update immediately
    if (optimisticUpdate) {
      optimisticUpdate();
    }

    // Add to sync queue
    dataSyncService.addToSyncQueue("update", "inventory", {
      id: inventoryId,
      ...updates
    });

    // Return immediately
    return {
      success: true,
      optimistic: true,
      message: "Inventory updated (optimistic)"
    };
  }

  // Batch multiple operations
  public async batchOperations(operations: Array<{
    operation: "insert" | "update" | "delete";
    table: TableName;
    data: unknown;
  }>, optimisticUpdate?: () => void) {
    // Apply optimistic update immediately
    if (optimisticUpdate) {
      optimisticUpdate();
    }

    // Add all operations to sync queue in batch
    const syncOps = operations.map(op => ({
      operation: op.operation,
      table: op.table,
      data: op.data
    }));
    
    dataSyncService.addBatchToSyncQueue(syncOps);

    // Return immediately
    return {
      success: true,
      optimistic: true,
      count: operations.length,
      message: `Batch of ${operations.length} operations queued (optimistic)`
    };
  }

  // Check if transactions are being processed
  public isProcessingTransactions() {
    return this.isProcessing;
  }

  // Get queue length
  public getQueueLength() {
    return this.transactionQueue.length;
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
