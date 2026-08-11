import { apiGet, apiPost } from '../api/client'
import {
  setInstructorAuthed,
  type AuditEntry,
} from '../storage/auditStorage'

export type UserRole = 'trainee' | 'instructor' | 'admin'

export interface AuthUser {
  id: string
  login?: string
  fullName: string
  role: UserRole
  roles: UserRole[]
  createdAt?: number | null
}

const USER_KEY = 'ktk-elou-avt-auth-user'
const ACTIVE_ROLE_KEY = 'ktk-elou-avt-active-role'
const SESSION_COOKIE = 'ktk_session'

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

export function getActiveWorkRole(): 'trainee' | 'instructor' | null {
  const value = sessionStorage.getItem(ACTIVE_ROLE_KEY)
  if (value === 'trainee' || value === 'instructor') return value
  return null
}

export function setActiveWorkRole(role: 'trainee' | 'instructor' | null): void {
  if (!role) {
    sessionStorage.removeItem(ACTIVE_ROLE_KEY)
    return
  }
  sessionStorage.setItem(ACTIVE_ROLE_KEY, role)
}

export function resolveWorkRole(
  user: AuthUser,
): 'trainee' | 'instructor' | null {
  const canTrain = hasRole(user, 'trainee')
  const canInstruct = hasRole(user, 'instructor')
  const saved = getActiveWorkRole()
  if (saved === 'trainee' && canTrain) return 'trainee'
  if (saved === 'instructor' && canInstruct) return 'instructor'
  // По умолчанию — режим «Обучение», чтобы сразу был каталог/тело экрана
  if (canTrain) return 'trainee'
  if (canInstruct) return 'instructor'
  return null
}

export function setAuthedUser(user: AuthUser | null): void {
  if (!user) {
    sessionStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(ACTIVE_ROLE_KEY)
    setInstructorAuthed(false)
  } else {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
    setInstructorAuthed(hasRole(user, 'instructor'))
  }
  window.dispatchEvent(new Event('ktk-auth-changed'))
}

export function roleLabel(role: UserRole | string): string {
  if (role === 'admin') return 'администратор'
  if (role === 'instructor') return 'инструктор'
  return 'обучаемый'
}

export function hasRole(user: AuthUser, role: UserRole): boolean {
  return (user.roles ?? [user.role]).includes(role)
}

export function rolesLabel(user: AuthUser): string {
  return (user.roles ?? [user.role]).map(roleLabel).join(', ')
}

export function validateFullName(name: string): string | null {
  if (name.trim().length < 1) return 'ФИО: минимум 1 символ'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) return 'Пароль: минимум 4 символа'
  return null
}

export async function fetchSessionUser(): Promise<AuthUser | null> {
  try {
    const data = await apiGet<{ ok: boolean; user: AuthUser }>('/auth/me')
    if (!data.user || hasRole(data.user, 'admin')) {
      setAuthedUser(null)
      return null
    }
    setAuthedUser(data.user)
    return data.user
  } catch {
    setAuthedUser(null)
    return null
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await apiPost('/auth/logout', {})
  } catch {
    /* ignore */
  }
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
  setAuthedUser(null)
}

export function redirectToAuthPortal(): void {
  const loginUrl = new URL(authPortalUrl(), window.location.origin)
  loginUrl.searchParams.set('next', window.location.href)
  window.location.replace(loginUrl.href)
}

export type { AuditEntry }
