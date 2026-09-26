/**
 * Offline ShiftProvider - provides useShift() interface from local SQLite auth
 * Use in Electron for offline-first mode. activeShift/startShift/endShift are stubs.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { offlineServices } from '@/lib/offlineServices'

interface Shift {
  id: string
  status: string
  [key: string]: unknown
}

interface OfflineShiftContextType {
  activeShift: Shift | null
  loading: boolean
  refreshShift: () => Promise<void>
  startShift: (amount: number, staffId?: string) => Promise<void>
  endShift: (actualCash: number) => Promise<{ actual: number; expected: number; discrepancy: number }>
  user: { id: string; email?: string; [key: string]: unknown } | null
  store: { id: string; store_name?: string; [key: string]: unknown } | null
  isAdmin: boolean
}

const OfflineShiftContext = createContext<OfflineShiftContextType | undefined>(undefined)

export const OfflineShiftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null)
  const [store, setStore] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const activeShift: Shift | null = null

  const refreshShift = useCallback(async () => {
    const token = offlineServices.session.get()
    if (!token) {
      setUser(null)
      setStore(null)
      setLoading(false)
      return
    }
    try {
      const { user: u } = await offlineServices.auth.getSession(token)
      if (!u) {
        offlineServices.session.clear()
        setUser(null)
        setStore(null)
        return
      }
      setUser(u)
      offlineServices.session.setUser(u)
      let s = offlineServices.session.getStore()
      if (!s) {
        const stores = await window.api.getAll('stores')
        s = stores?.find((st: any) => st.id === u.store_id) || stores?.[0]
        if (s) offlineServices.session.setStore(s)
      }
      setStore(s || { id: 'default', store_name: 'Default Store' })
    } catch {
      offlineServices.session.clear()
      setUser(null)
      setStore(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshShift()
  }, [refreshShift])

  const startShift = useCallback(async (_amount: number, _staffId?: string) => {
    // Offline mode: no shift tracking for MVP
  }, [])

  const endShift = useCallback(async (_actualCash: number) => {
    return { actual: 0, expected: 0, discrepancy: 0 }
  }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <OfflineShiftContext.Provider
      value={{
        activeShift,
        loading,
        refreshShift,
        startShift,
        endShift,
        user,
        store,
        isAdmin,
      }}
    >
      {children}
    </OfflineShiftContext.Provider>
  )
}

export const useShift = () => {
  const ctx = useContext(OfflineShiftContext)
  if (ctx === undefined) throw new Error('useShift must be used within OfflineShiftProvider')
  return ctx
}
