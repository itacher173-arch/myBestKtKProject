import { apiPost } from '../api/client'
import {
  setInstructorAuthed,
  type AuditEntry,
} from './auditStorage'

export type UserRole = 'trainee' | 'instructor' | 'admin'

export interface AuthUser {
  id: string
  fullName: string
  role: UserRole
  createdAt?: number | null
}

const USER_KEY = 'ktk-elou-avt-auth-user'

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

export async function loginUser(input: {
  fullName: string
  password: string
}): Promise<AuthUser> {
  const nameErr = validateFullName(input.fullName)
  if (nameErr) throw new Error(nameErr)
  const passErr = validatePassword(input.password)
  if (passErr) throw new Error(passErr)
  const data = await apiPost<{ ok: boolean; user: AuthUser }>('/auth/login', {
    fullName: input.fullName.trim(),
    password: input.password,
  })
  if (data.user.role === 'admin') {
    throw new Error(
      'Администратор входит через админ-панель (порт 8081), не через КТК.',
    )
  }
  setAuthedUser(data.user)
  return data.user
}

export function logoutUser(): void {
  setAuthedUser(null)
}

export type { AuditEntry }
