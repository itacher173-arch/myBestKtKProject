import { ApiError, apiGet, apiPost } from '../api/client'

export type UserRole = 'trainee' | 'instructor' | 'admin'

export interface AuthUser {
  id: string
  login?: string
  fullName: string
  role: UserRole
  roles: UserRole[]
  createdAt?: number | null
}

const SESSION_COOKIE = 'ktk_session'
const TOKEN_KEY = 'ktk-elou-avt-session-token'
const LOGIN_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/

export function hasRole(user: AuthUser, role: UserRole): boolean {
  return (user.roles ?? [user.role]).includes(role)
}

export function appUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL as string | undefined
  return (fromEnv && fromEnv.trim()) || 'http://localhost:8080'
}

export function validateLogin(login: string): string | null {
  if (!LOGIN_RE.test(login.trim())) {
    return 'Логин: 3–32 символа, латиница; начинается с буквы; a-z, 0-9, _'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) return 'Пароль: минимум 4 символа'
  return null
}

function setClientCookie(token: string) {
  const secure =
    window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${12 * 60 * 60}; SameSite=Lax${secure}`
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearClientSession() {
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function loginAppUser(input: {
  login: string
  password: string
}): Promise<AuthUser> {
  const loginErr = validateLogin(input.login)
  if (loginErr) throw new Error(loginErr)
  const passErr = validatePassword(input.password)
  if (passErr) throw new Error(passErr)
  const data = await apiPost<{ ok: boolean; user: AuthUser; token?: string }>(
    '/auth/login',
    {
      login: input.login.trim().toLowerCase(),
      password: input.password,
    },
  )
  if (hasRole(data.user, 'admin')) {
    clearClientSession()
    try {
      await apiPost('/auth/logout', {})
    } catch {
      /* ignore */
    }
    throw new Error('Администратор входит через админ-панель: /admin/')
  }
  if (!data.token) {
    throw new Error('Сервер не выдал сессию')
  }
  setClientCookie(data.token)
  return data.user
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const data = await apiGet<{ ok: boolean; user: AuthUser }>('/auth/me')
    return data.user
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return null
    }
    throw err
  }
}

export function redirectTarget(): string {
  const params = new URLSearchParams(window.location.search)
  const next = params.get('next')
  if (next) {
    try {
      const url = new URL(next, window.location.origin)
      if (url.origin === window.location.origin) return url.href
    } catch {
      /* ignore */
    }
    if (
      next.startsWith('http://localhost:8080') ||
      next.startsWith('http://127.0.0.1:8080')
    ) {
      return next
    }
  }
  return appUrl()
}
