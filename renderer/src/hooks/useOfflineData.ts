/**
 * Offline-first data hooks - read from SQLite via IPC
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { offlineServices } from '@/lib/offlineServices'

export function useOfflineProducts(storeId: string | null) {
  return useQuery({
    queryKey: ['offline-products', storeId],
    queryFn: () => offlineServices.product.getAll(storeId || undefined),
    enabled: !!storeId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useOfflineProductByBarcode(barcode: string, storeId: string | null) {
  return useQuery({
    queryKey: ['offline-product-barcode', barcode, storeId],
    queryFn: () => offlineServices.product.getByBarcode(barcode, storeId || undefined),
    enabled: !!barcode && barcode.length >= 3,
    staleTime: 1000 * 30,
  })
}

export function useOfflineSales(storeId: string | null) {
  return useQuery({
    queryKey: ['offline-sales', storeId],
    queryFn: () => offlineServices.sales.getAll(storeId || undefined),
    enabled: !!storeId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useOfflineProductSearch(query: string, storeId: string | null) {
  return useQuery({
    queryKey: ['offline-product-search', query, storeId],
    queryFn: () => offlineServices.product.search(query, storeId || undefined, 50),
    enabled: query.length >= 1,
    staleTime: 1000 * 30,
  })
}

export function useCreateOfflineSale(storeId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sale: any) => offlineServices.sales.create(sale, storeId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline-sales', storeId] })
    },
  })
}

export function useAddOfflineProduct(storeId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (product: any) => offlineServices.product.add(product, storeId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline-products', storeId] })
    },
  })
}
