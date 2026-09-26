/**
 * Supabase auth persistence: "Remember me" uses localStorage; unchecked uses sessionStorage
 * so closing the browser/tab clears the session without logging out other devices.
 */
export const AUTH_REMEMBER_ME_KEY = 'brec_auth_remember_me'

export function getRememberMePreference(): boolean {
  const v = localStorage.getItem(AUTH_REMEMBER_ME_KEY)
  if (v === null) return true
  return v === '1' || v === 'true'
}

export function setRememberMePreference(remember: boolean): void {
  localStorage.setItem(AUTH_REMEMBER_ME_KEY, remember ? '1' : '0')
}

/** Storage adapter for createClient auth.storage */
export const dualAuthStorage = {
  getItem: (key: string): string | null => {
    const useLocal = getRememberMePreference()
    const primary = useLocal ? localStorage : sessionStorage
    const secondary = useLocal ? sessionStorage : localStorage
    return primary.getItem(key) ?? secondary.getItem(key)
  },
  setItem: (key: string, value: string): void => {
    const useLocal = getRememberMePreference()
    if (useLocal) {
      sessionStorage.removeItem(key)
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
      sessionStorage.setItem(key, value)
    }
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}
