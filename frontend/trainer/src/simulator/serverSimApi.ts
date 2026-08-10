/** Клиент серверного симулятора (такт + ПАЗ на FastAPI). Источник правды — сервер. */

import { apiGet, apiPost } from '../api/client'
import type { ProcessState } from './types'

export interface ServerSimSession {
  id: string
  userId: string
  exerciseId?: string | null
  running: boolean
  paused: boolean
  simTimeSec: number
  seed: number
  modelVersion: string
  scenarioVersion: string
  timeScale: number
  faultTriggered: boolean
  faultType?: string | null
  process: ProcessState
  actionsLog: Array<Record<string, unknown>>
  systemMessages?: string[]
}

export interface CreateServerSimInput {
  exerciseId?: string | null
  warmStart?: boolean
  initial?: Record<string, unknown>
  seed?: number | string | null
  modelVersion?: string | null
  scenarioVersion?: string | null
  faultType?: string | null
  triggerDelaySeconds?: number | null
  timeScale?: number
}

export async function createServerSimSession(
  input?: CreateServerSimInput,
): Promise<ServerSimSession> {
  const res = await apiPost<{ ok: boolean; session: ServerSimSession }>(
    '/sim/sessions',
    {
      exerciseId: input?.exerciseId ?? null,
      warmStart: input?.warmStart ?? false,
      initial: input?.initial ?? null,
      seed: input?.seed ?? null,
      modelVersion: input?.modelVersion ?? null,
      scenarioVersion: input?.scenarioVersion ?? null,
      faultType: input?.faultType ?? null,
      triggerDelaySeconds: input?.triggerDelaySeconds ?? null,
      timeScale: input?.timeScale ?? 1,
    },
  )
  return res.session
}

export async function getServerSimSession(
  sessionId: string,
): Promise<ServerSimSession> {
  const res = await apiGet<{ ok: boolean; session: ServerSimSession }>(
    `/sim/sessions/${encodeURIComponent(sessionId)}`,
  )
  return res.session
}

export async function sendServerSimCommand(
  sessionId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<{ ok: boolean; reason?: string; session?: ServerSimSession }> {
  return apiPost(`/sim/sessions/${encodeURIComponent(sessionId)}/command`, {
    action,
    payload,
  })
}
