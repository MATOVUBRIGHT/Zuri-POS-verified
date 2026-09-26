import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StockItem } from '@/types';

export const useInventoryOptimized = (storeId: string | null, userId: string | null) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['inventory', storeId, userId],
    queryFn: async () => {
      if (!storeId || !userId) return [];

      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('store_id', storeId)
        .order('product_name', { ascending: true });

      if (error) throw error;

      const mappedData: StockItem[] = (data || []).map((item: any) => ({
        id: item.id,
        productName: item.product_name,
        quantity: item.quantity || 0,
        sachets_count: item.sachets_count || 0,
        loose_items: item.loose_items || 0,
        opened_sachets: item.opened_sachets || 0,
        items_per_sachet: item.items_per_sachet || 1,
        retail_price: item.retail_price || 0,
        wholesale_price: item.wholesale_price || 0,
        cost_per_unit: item.cost_per_unit || 0,
        costPerUnit: item.cost_per_unit || 0,
        product_name: item.product_name,
        category: item.category || '',
        totalValue: item.total_value || 0,
        dateOfPurchase: item.date_of_purchase,
        store_id: item.store_id,
        min_stock_level: item.min_stock_level || 5,
        reorder_quantity: item.reorder_quantity || 10,
        notes: item.notes,
        packaging_type: item.packaging_type,
        unit_name: item.unit_name,
        barcode: item.barcode,
        barcode_type: item.barcode_type,
        barcode_mode: item.barcode_mode,
        supplier: item.supplier,
        size: item.size,
      }));

      return mappedData;
    },
    enabled: !!storeId && !!userId,
    // Keep inventory data stable so minimizing/restoring the window
    // doesn't trigger a refetch (looks like a "refresh" to users).
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Hook to get new stock (added in last 7 days)
export const useNewStock = (storeId: string | null, userId: string | null) => {
  return useQuery({
    queryKey: ['new-stock', storeId, userId],
    queryFn: async () => {
      if (!storeId || !userId) return [];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('store_id', storeId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const mappedData: StockItem[] = (data || []).map((item: any) => ({
        id: item.id,
        productName: item.product_name,
        quantity: item.quantity || 0,
        sachets_count: item.sachets_count || 0,
        loose_items: item.loose_items || 0,
        opened_sachets: item.opened_sachets || 0,
        items_per_sachet: item.items_per_sachet || 1,
        retail_price: item.retail_price || 0,
        wholesale_price: item.wholesale_price || 0,
        cost_per_unit: item.cost_per_unit || 0,
        costPerUnit: item.cost_per_unit || 0,
        product_name: item.product_name,
        category: item.category || '',
        totalValue: item.total_value || 0,
        dateOfPurchase: item.date_of_purchase,
        dateOfEntry: item.created_at,
        store_id: item.store_id,
        min_stock_level: item.min_stock_level || 5,
        reorder_quantity: item.reorder_quantity || 10,
        notes: item.notes,
        packaging_type: item.packaging_type,
        unit_name: item.unit_name,
        barcode: item.barcode,
        barcode_type: item.barcode_type,
        barcode_mode: item.barcode_mode,
        supplier: item.supplier,
        size: item.size,
      }));

      return mappedData;
    },
    enabled: !!storeId && !!userId,
    staleTime: 60000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};
