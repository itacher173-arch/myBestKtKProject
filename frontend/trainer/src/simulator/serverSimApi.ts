/** Клиент серверного симулятора (такт + ПАЗ на FastAPI). Источник правды — сервер. */

import { apiGet, apiPost, apiPut } from '../api/client'
import type { ProcessState, TrainerState } from './types'

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

export interface SimClientCheckpoint {
  trainerState: TrainerState
  trainingMode: 'full' | 'mini'
  selectedMiniTrainingId: string | null
  hintsUsed: number
}

export interface ActiveSimCheckpoint {
  sessionId: string
  userId: string
  savedAt: number
  session: ServerSimSession
  clientState?: SimClientCheckpoint | null
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

export async function getActiveSimSession(): Promise<ActiveSimCheckpoint | null> {
  const res = await apiGet<{
    ok: boolean
    checkpoint: ActiveSimCheckpoint | null
  }>('/sim/sessions/active')
  return res.checkpoint
}

export async function saveServerSimCheckpoint(
  sessionId: string,
  clientState: SimClientCheckpoint,
): Promise<void> {
  await apiPut(`/sim/sessions/${encodeURIComponent(sessionId)}/checkpoint`, {
    clientState,
  })
}

export async function resumeServerSimSession(
  sessionId: string,
): Promise<ActiveSimCheckpoint> {
  const res = await apiPost<{
    ok: boolean
    checkpoint: ActiveSimCheckpoint
  }>(`/sim/sessions/${encodeURIComponent(sessionId)}/resume`)
  return res.checkpoint
}

export async function abandonServerSimSession(
  sessionId: string,
): Promise<void> {
  await apiPost(`/sim/sessions/${encodeURIComponent(sessionId)}/abandon`)
}

export async function completeServerSimSession(
  sessionId: string,
): Promise<void> {
  await apiPost(`/sim/sessions/${encodeURIComponent(sessionId)}/complete`)
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
