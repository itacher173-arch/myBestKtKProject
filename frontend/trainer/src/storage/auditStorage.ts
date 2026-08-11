/** Журнал аудита ИБ: PostgreSQL через storage API. */

import { apiDelete, apiGet, apiPost } from '../api/client'

export interface AuditEntry {
  id: string
  at: number
  actor: string
  role: 'trainee' | 'instructor' | 'admin' | 'system'
  action: string
  detail?: string
}

function uid() {
  return `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export async function loadAudit(): Promise<AuditEntry[]> {
  const remote = await apiGet<AuditEntry[]>('/audit')
  return Array.isArray(remote) ? remote : []
}

export async function appendAudit(
  entry: Omit<AuditEntry, 'id' | 'at'> & { at?: number },
): Promise<void> {
  const record: AuditEntry = {
    id: uid(),
    at: entry.at ?? Date.now(),
    actor: entry.actor,
    role: entry.role,
    action: entry.action,
    detail: entry.detail,
  }
  await apiPost<AuditEntry>('/audit', record)
}

export async function clearAudit(): Promise<void> {
  await apiDelete<{ ok: boolean }>('/audit')
}

// Ephemeral UI mirror of the role verified by /auth/me. Authorization remains server-side.
let instructorAuthed = false

export function setInstructorAuthed(ok: boolean): void {
  instructorAuthed = ok
}

export function isInstructorAuthed(): boolean {
  return instructorAuthed
}
