/// <reference types="vite/client" />

interface Window {
  electron: import('@electron-toolkit/preload').ElectronAPI
  api: {
    getAll: (table: string) => Promise<any[]>
    save: (table: string, data: any) => Promise<any>
    delete: (table: string, id: string) => Promise<any>
    getProducts: () => Promise<any[]>
    saveProduct: (product: any) => Promise<void>
    deleteProduct: (id: string) => Promise<void>
    getSales: () => Promise<any[]>
    saveSale: (sale: any) => Promise<void>
    printLabel: (data: any) => Promise<{ success: boolean }>
    getOfflineStatus: () => Promise<boolean>
  }
}
