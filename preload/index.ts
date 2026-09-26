import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Generic Database APIs
  getAll: (table: string) => ipcRenderer.invoke('db:getAll', table),
  save: (table: string, data: any) => ipcRenderer.invoke('db:save', { table, data }),
  batchInsert: (table: string, data: any[]) => ipcRenderer.invoke('db:batchInsert', { table, data }),
  delete: (table: string, id: string) => ipcRenderer.invoke('db:delete', { table, id }),

  // Legacy/Specific Database APIs
  getProducts: () => ipcRenderer.invoke('db:getProducts'),
  saveProduct: (product: any) => ipcRenderer.invoke('db:saveProduct', product),
  deleteProduct: (id: string) => ipcRenderer.invoke('db:deleteProduct', id),
  getSales: () => ipcRenderer.invoke('db:getSales'),
  saveSale: (sale: any) => ipcRenderer.invoke('db:saveSale', sale),

  // Offline-first Product APIs
  productGetByBarcode: (barcode: string, storeId?: string) => ipcRenderer.invoke('product:getByBarcode', barcode, storeId),
  productSearch: (query: string, storeId?: string, limit?: number) => ipcRenderer.invoke('product:search', query, storeId, limit),
  productAdd: (product: any, storeId?: string) => ipcRenderer.invoke('product:add', product, storeId),
  productUpdateStock: (id: string, delta: number) => ipcRenderer.invoke('product:updateStock', id, delta),
  productGetAll: (storeId?: string) => ipcRenderer.invoke('product:getAll', storeId),

  // Offline-first Sales APIs
  salesCreate: (sale: any, storeId?: string) => ipcRenderer.invoke('sales:create', sale, storeId),
  salesGetUnsynced: (storeId?: string) => ipcRenderer.invoke('sales:getUnsynced', storeId),
  salesMarkSynced: (id: string) => ipcRenderer.invoke('sales:markSynced', id),
  salesGetAll: (storeId?: string) => ipcRenderer.invoke('sales:getAll', storeId),

  // Offline-first Auth APIs
  authLogin: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
  authLogout: (sessionToken: string) => ipcRenderer.invoke('auth:logout', sessionToken),
  authGetSession: (sessionToken: string) => ipcRenderer.invoke('auth:getSession', sessionToken),
  authCreateUser: (username: string, password: string, opts?: any) => ipcRenderer.invoke('auth:createUser', username, password, opts),
  authListUsers: (storeId?: string) => ipcRenderer.invoke('auth:listUsers', storeId),

  // Sync APIs
  syncGetUnsyncedSales: (storeId?: string) => ipcRenderer.invoke('sync:getUnsyncedSales', storeId),
  syncMarkSaleSynced: (saleId: string) => ipcRenderer.invoke('sync:markSaleSynced', saleId),
  syncGetPendingCount: () => ipcRenderer.invoke('sync:getPendingCount'),

  // Printer APIs
  printLabel: (data: any) => ipcRenderer.invoke('printer:printLabel', data),

  // App APIs
  getOfflineStatus: () => ipcRenderer.invoke('app:getOfflineStatus'),
  closeApp: () => ipcRenderer.invoke('app:close'),

  // Auto-update APIs
  checkForUpdate: () => ipcRenderer.invoke('app:check-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateAvailable: (cb: (info: any) => void) => {
    ipcRenderer.removeAllListeners('app:update-available')
    ipcRenderer.on('app:update-available', (_e, info) => cb(info))
  },
  onUpdateProgress: (cb: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('app:update-progress')
    ipcRenderer.on('app:update-progress', (_e, progress) => cb(progress))
  },
  onUpdateDownloaded: (cb: (info: any) => void) => {
    ipcRenderer.removeAllListeners('app:update-downloaded')
    ipcRenderer.on('app:update-downloaded', (_e, info) => cb(info))
  },
}

// Use `contextBridge` to expose Electron APIs to
// renderer only if main isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
