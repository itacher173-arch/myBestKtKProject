/** Клиент серверного симулятора (такт + ПАЗ на FastAPI). */

import { apiGet, apiPost } from '../api/client'

export interface ServerSimSession {
  id: string
  userId: string
  exerciseId?: string | null
  running: boolean
  paused: boolean
  simTimeSec: number
  process: Record<string, unknown>
  actionsLog: Array<Record<string, unknown>>
}

export async function createServerSimSession(input?: {
  exerciseId?: string | null
  warmStart?: boolean
  initial?: Record<string, unknown>
}): Promise<ServerSimSession> {
  const res = await apiPost<{ ok: boolean; session: ServerSimSession }>(
    '/simulator/sessions',
    {
      exerciseId: input?.exerciseId ?? null,
      warmStart: input?.warmStart ?? false,
      initial: input?.initial ?? null,
    },
  )
  return res.session
}

export async function getServerSimSession(
  sessionId: string,
): Promise<ServerSimSession> {
  const res = await apiGet<{ ok: boolean; session: ServerSimSession }>(
    `/simulator/sessions/${encodeURIComponent(sessionId)}`,
  )
  return res.session
}

export async function sendServerSimCommand(
  sessionId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<{ ok: boolean; reason?: string; session?: ServerSimSession }> {
  return apiPost(`/simulator/sessions/${encodeURIComponent(sessionId)}/command`, {
    action,
    payload,
  })
}

/** Зеркалирует команду на сервер (best-effort, не блокирует UI). */
export function mirrorServerCommand(
  sessionId: string | null | undefined,
  action: string,
  payload: Record<string, unknown> = {},
): void {
  if (!sessionId) return
  void sendServerSimCommand(sessionId, action, payload).catch(() => undefined)
}
