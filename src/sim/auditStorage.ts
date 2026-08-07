/** Журнал аудита ИБ: действия ролей, доступ к отчётам, завершение сессий. */

export interface AuditEntry {
  id: string
  at: number
  actor: string
  role: 'trainee' | 'instructor' | 'system'
  action: string
  detail?: string
}

const KEY = 'ktk-elou-avt-audit-log'
const MAX = 500

function uid() {
  return `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function loadAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AuditEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendAudit(
  entry: Omit<AuditEntry, 'id' | 'at'> & { at?: number },
): void {
  const list = loadAudit()
  list.unshift({
    id: uid(),
    at: entry.at ?? Date.now(),
    actor: entry.actor,
    role: entry.role,
    action: entry.action,
    detail: entry.detail,
  })
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
}

export function clearAudit(): void {
  localStorage.removeItem(KEY)
}

/** PIN инструктора (учебный прототип). Смена через localStorage ключ. */
const PIN_KEY = 'ktk-elou-avt-instructor-pin'
const DEFAULT_PIN = '2026'
const AUTH_KEY = 'ktk-elou-avt-instructor-auth'

export function getInstructorPin(): string {
  return localStorage.getItem(PIN_KEY) ?? DEFAULT_PIN
}

export function verifyInstructorPin(pin: string): boolean {
  return pin.trim() === getInstructorPin()
}

export function setInstructorAuthed(ok: boolean): void {
  if (ok) sessionStorage.setItem(AUTH_KEY, '1')
  else sessionStorage.removeItem(AUTH_KEY)
}

export function isInstructorAuthed(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === '1'
}
