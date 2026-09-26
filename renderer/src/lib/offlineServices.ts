/**
 * Offline-first service layer (renderer)
 * All calls go through IPC to main process -> SQLite.
 * No direct API calls for core functionality.
 */

import { getRememberMePreference } from '@/lib/authStorage'

const SESSION_KEY = 'zuripos_offline_session'
const USER_KEY = 'zuripos_offline_user'
const STORE_KEY = 'zuripos_offline_store'

export const offlineServices = {
  product: {
    getByBarcode: (barcode: string, storeId?: string) =>
      window.api.productGetByBarcode(barcode, storeId),
    search: (query: string, storeId?: string, limit = 50) =>
      window.api.productSearch(query, storeId, limit),
    add: (product: any, storeId?: string) =>
      window.api.productAdd(product, storeId),
    updateStock: (id: string, delta: number) =>
      window.api.productUpdateStock(id, delta),
    getAll: (storeId?: string) =>
      window.api.productGetAll(storeId),
  },

  sales: {
    create: (sale: any, storeId?: string) =>
      window.api.salesCreate(sale, storeId),
    getUnsynced: (storeId?: string) =>
      window.api.salesGetUnsynced(storeId),
    markSynced: (id: string) =>
      window.api.salesMarkSynced(id),
    getAll: (storeId?: string) =>
      window.api.salesGetAll(storeId),
  },

  auth: {
    login: (username: string, password: string) =>
      window.api.authLogin(username, password),
    logout: (sessionToken: string) =>
      window.api.authLogout(sessionToken),
    getSession: (sessionToken: string) =>
      window.api.authGetSession(sessionToken),
    createUser: (username: string, password: string, opts?: any) =>
      window.api.authCreateUser(username, password, opts),
    listUsers: (storeId?: string) =>
      window.api.authListUsers(storeId),
  },

  sync: {
    getUnsyncedSales: (storeId?: string) =>
      window.api.syncGetUnsyncedSales(storeId),
    markSaleSynced: (saleId: string) =>
      window.api.syncMarkSaleSynced(saleId),
    getPendingCount: () =>
      window.api.syncGetPendingCount(),
  },

  /** Persist session — localStorage if "Remember me", else sessionStorage */
  session: {
    get: (): string | null => {
      const useLocal = getRememberMePreference()
      const primary = useLocal ? localStorage : sessionStorage
      const secondary = useLocal ? sessionStorage : localStorage
      return primary.getItem(SESSION_KEY) ?? secondary.getItem(SESSION_KEY)
    },
    set: (token: string) => {
      const useLocal = getRememberMePreference()
      if (useLocal) {
        sessionStorage.removeItem(SESSION_KEY)
        localStorage.setItem(SESSION_KEY, token)
      } else {
        localStorage.removeItem(SESSION_KEY)
        sessionStorage.setItem(SESSION_KEY, token)
      }
    },
    clear: () => {
      ;[SESSION_KEY, USER_KEY, STORE_KEY].forEach((k) => {
        localStorage.removeItem(k)
        sessionStorage.removeItem(k)
      })
    },
    setUser: (user: any) => {
      const raw = JSON.stringify(user)
      const useLocal = getRememberMePreference()
      if (useLocal) {
        sessionStorage.removeItem(USER_KEY)
        localStorage.setItem(USER_KEY, raw)
      } else {
        localStorage.removeItem(USER_KEY)
        sessionStorage.setItem(USER_KEY, raw)
      }
    },
    getUser: (): any => {
      const useLocal = getRememberMePreference()
      const primary = useLocal ? localStorage : sessionStorage
      const secondary = useLocal ? sessionStorage : localStorage
      const raw = primary.getItem(USER_KEY) ?? secondary.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    },
    setStore: (store: any) => {
      const raw = JSON.stringify(store)
      const useLocal = getRememberMePreference()
      if (useLocal) {
        sessionStorage.removeItem(STORE_KEY)
        localStorage.setItem(STORE_KEY, raw)
      } else {
        localStorage.removeItem(STORE_KEY)
        sessionStorage.setItem(STORE_KEY, raw)
      }
    },
    getStore: (): any => {
      const useLocal = getRememberMePreference()
      const primary = useLocal ? localStorage : sessionStorage
      const secondary = useLocal ? sessionStorage : localStorage
      const raw = primary.getItem(STORE_KEY) ?? secondary.getItem(STORE_KEY)
      return raw ? JSON.parse(raw) : null
    },
  },
}
