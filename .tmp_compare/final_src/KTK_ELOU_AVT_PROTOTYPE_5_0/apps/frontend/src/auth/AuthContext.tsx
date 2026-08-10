import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiPost, getSessionToken, setSessionToken } from '../lib/api'

export type CorporateRole = 'trainee' | 'instructor' | 'admin'

export interface AuthUser {
  username: string
  displayName: string
  role: CorporateRole
  position: string
}

interface LoginResponse {
  token: string
  expiresAt: number
  user: AuthUser
}

interface AuthApi {
  user: AuthUser | null
  loading: boolean
  error: string
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getSessionToken()
    if (!token) {
      setLoading(false)
      return
    }
    void apiPost<{ valid: boolean; user: AuthUser }>('/auth/verify')
      .then((result) => setUser(result.user))
      .catch(() => setSessionToken(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setError('Сессия истекла. Выполните вход повторно.')
    }
    window.addEventListener('ktk-auth-expired', onExpired)
    return () => window.removeEventListener('ktk-auth-expired', onExpired)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await apiPost<LoginResponse>('/auth/login', { username, password })
      setSessionToken(result.token)
      setUser(result.user)
    } catch (reason) {
      setSessionToken(null)
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    void apiPost('/auth/logout').catch(() => undefined)
    setSessionToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthApi>(() => ({ user, loading, error, login, logout, clearError: () => setError('') }), [error, loading, login, logout, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return context
}
