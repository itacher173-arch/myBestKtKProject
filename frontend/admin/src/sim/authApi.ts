import { apiPost } from '../api/client'

export type UserRole = 'trainee' | 'instructor' | 'admin'

export interface AuthUser {
  id: string
  login?: string
  fullName: string
  role: UserRole
  roles: UserRole[]
  createdAt?: number | null
}

const USER_KEY = 'ktk-elou-avt-admin-auth-user'
const LOGIN_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/

export function authPortalUrl(): string {
  const fromEnv = import.meta.env.VITE_AUTH_URL as string | undefined
  return (fromEnv && fromEnv.trim()) || 'http://localhost:8082'
}

export function getAuthedUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setAuthedUser(user: AuthUser | null): void {
  if (!user) {
    sessionStorage.removeItem(USER_KEY)
    return
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function roleLabel(role: UserRole | string): string {
  if (role === 'admin') return 'администратор'
  if (role === 'instructor') return 'инструктор'
  return 'обучаемый'
}

export function hasRole(user: AuthUser, role: UserRole): boolean {
  return (user.roles ?? [user.role]).includes(role)
}

export function rolesLabel(roles: UserRole[]): string {
  return roles.map(roleLabel).join(', ')
}

export function validateLogin(login: string): string | null {
  if (!LOGIN_RE.test(login.trim())) {
    return 'Логин: 3–32 символа, латиница; начинается с буквы; a-z, 0-9, _'
  }
  return null
}

export function validateFullName(name: string): string | null {
  if (name.trim().length < 1) return 'ФИО: минимум 1 символ'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) return 'Пароль: минимум 4 символа'
  return null
}

export async function loginAdmin(input: {
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
  if (!hasRole(data.user, 'admin')) {
    throw new Error('Доступ только для администратора. Используйте портал входа КТК.')
  }
  if (!data.token) {
    throw new Error('Сервер не выдал сессию администратора')
  }
  setAuthedUser(data.user)
  return data.user
}

export async function logoutUser(): Promise<void> {
  try {
    await apiPost('/auth/logout', {})
  } catch {
    /* ignore */
  }
  setAuthedUser(null)
}
