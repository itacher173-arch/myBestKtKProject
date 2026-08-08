import { apiGet, apiPost } from '../api/client'
import {
  setInstructorAuthed,
  type AuditEntry,
} from './auditStorage'

export type UserRole = 'trainee' | 'instructor' | 'admin'

export interface AuthUser {
  id: string
  login?: string
  fullName: string
  role: UserRole
  createdAt?: number | null
}

const USER_KEY = 'ktk-elou-avt-auth-user'
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

export function setAuthedUser(user: AuthUser | null): void {
  if (!user) {
    sessionStorage.removeItem(USER_KEY)
    setInstructorAuthed(false)
    return
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  setInstructorAuthed(user.role === 'instructor')
}

export function roleLabel(role: UserRole | string): string {
  if (role === 'admin') return 'администратор'
  if (role === 'instructor') return 'инструктор'
  return 'обучаемый'
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
    if (!data.user || data.user.role === 'admin') {
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
  const next = encodeURIComponent(window.location.href)
  window.location.replace(`${authPortalUrl()}/?next=${next}`)
}

export type { AuditEntry }
