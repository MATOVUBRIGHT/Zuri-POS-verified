/**
 * Offline-first auth provider
 * Validates against local SQLite. Session persists across app restarts.
 * No API/network required for login after first auth.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { offlineServices } from '@/lib/offlineServices'

export interface OfflineUser {
  id: string
  username: string
  email?: string
  display_name?: string
  store_id?: string
  role?: string
}

export interface OfflineStore {
  id: string
  store_name: string
  [key: string]: unknown
}

interface OfflineAuthContextType {
  user: OfflineUser | null
  store: OfflineStore | null
  loading: boolean
  isAdmin: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const OfflineAuthContext = createContext<OfflineAuthContextType | undefined>(undefined)

export const OfflineAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<OfflineUser | null>(null)
  const [store, setStore] = useState<OfflineStore | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
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

      // Resolve store from local DB or cache
      let s = offlineServices.session.getStore()
      if (!s && u.store_id) {
        try {
          const stores = await window.api.getAll('stores')
          s = stores?.find((st: any) => st.id === u.store_id) || stores?.[0]
          if (s) offlineServices.session.setStore(s)
        } catch {
          s = { id: u.store_id, store_name: 'Default Store' }
        }
      }
      if (!s) {
        try {
          const stores = await window.api.getAll('stores')
          s = stores?.[0]
          if (s) offlineServices.session.setStore(s)
        } catch {
          s = { id: 'default', store_name: 'Default Store' }
        }
      }
      setStore(s)
    } catch (err) {
      offlineServices.session.clear()
      setUser(null)
      setStore(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const { success, user: u, sessionToken } = await offlineServices.auth.login(username, password)
        if (!success || !u || !sessionToken) {
          return { success: false, error: 'Invalid username or password' }
        }

        offlineServices.session.set(sessionToken)
        offlineServices.session.setUser(u)
        setUser(u)

        // Get store
        let s = null
        try {
          const stores = await window.api.getAll('stores')
          s = stores?.find((st: any) => st.id === u.store_id) || stores?.[0]
          if (s) {
            offlineServices.session.setStore(s)
            setStore(s)
          } else {
            setStore({ id: 'default', store_name: 'Default Store' })
          }
        } catch {
          setStore({ id: u.store_id || 'default', store_name: 'Default Store' })
        }

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Login failed' }
      }
    },
    []
  )

  const logout = useCallback(async () => {
    const token = offlineServices.session.get()
    if (token) {
      try {
        await offlineServices.auth.logout(token)
      } catch {}
    }
    offlineServices.session.clear()
    setUser(null)
    setStore(null)
  }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <OfflineAuthContext.Provider
      value={{
        user,
        store,
        loading,
        isAdmin,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </OfflineAuthContext.Provider>
  )
}

export const useOfflineAuth = () => {
  const ctx = useContext(OfflineAuthContext)
  if (ctx === undefined) {
    throw new Error('useOfflineAuth must be used within OfflineAuthProvider')
  }
  return ctx
}
