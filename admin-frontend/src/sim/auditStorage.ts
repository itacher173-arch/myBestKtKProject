import { apiPost } from '../api/client'

export async function appendAudit(entry: {
  actor: string
  role: 'admin' | 'system'
  action: string
  detail?: string
}): Promise<void> {
  try {
    await apiPost('/audit', {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      ...entry,
    })
  } catch {
    /* не блокируем UI */
  }
}
