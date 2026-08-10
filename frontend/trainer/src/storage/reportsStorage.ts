import { apiDelete, apiGet, apiPost } from '../api/client'
import type { SessionMode } from '../simulator/types'

import type { AiAnalysis } from '../ai/types'

export interface StoredLogEntry {
  at: number
  description: string
}

export interface AnalogSample {
  t: number
  pressureN1: number
  tempFurnaceOut: number
  saltMgL: number
  pressureK1: number
  levelK1: number
  levelK2?: number
  feedFlow?: number
  pressureAfterElou?: number
}

export interface TraineeReport {
  id: string
  userName: string
  exerciseId: string
  exerciseName: string
  completedAt: number
  scorePercent: number
  penalty: number
  responseSeconds: number | null
  respondedInTime: boolean | null
  simTimeSec: number
  qualified: boolean
  qualificationSummary: string
  protocolVersion?: string
  modelVersion?: string
  scenarioVersion?: string
  sessionMode?: SessionMode
  criticalFail?: boolean
  outcomeOk?: boolean
  penaltyDetail?: {
    unsafe: number
    late: number
    extra: number
    missed: number
  }
  lcsMatched?: number
  lcsTotal?: number
  trajectoryError?: {
    at: number | null
    stepIndex: number
    expected: string
    rule: string
    message: string
  } | null
  recommendExerciseId?: string | null
  recommendReason?: string | null
  analogSample?: AnalogSample[]
  actionsLog: StoredLogEntry[]
  systemEvents: StoredLogEntry[]
  aiAnalysis?: AiAnalysis
}

export const PROTOCOL_VERSION = 'session-protocol-1.0'

const STORAGE_KEY = 'ktk-elou-avt-trainee-reports'

function loadLocalReports(): TraineeReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TraineeReport[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocalReports(list: TraineeReport[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function isDuplicate(list: TraineeReport[], report: TraineeReport): boolean {
  return list.some(
    (r) =>
      r.userName === report.userName &&
      r.exerciseId === report.exerciseId &&
      r.scorePercent === report.scorePercent &&
      r.penalty === report.penalty &&
      Math.abs(r.completedAt - report.completedAt) < 3000,
  )
}

/** Синхронный кэш/офлайн-фолбэк, если API недоступен. */
export function loadReportsSync(): TraineeReport[] {
  return loadLocalReports()
}

export async function loadReports(): Promise<TraineeReport[]> {
  try {
    const remote = await apiGet<TraineeReport[]>('/reports')
    if (Array.isArray(remote)) {
      saveLocalReports(remote)
      return remote
    }
  } catch {
    /* offline / no backend */
  }
  return loadLocalReports()
}

export async function saveReport(report: TraineeReport): Promise<void> {
  await apiPost<{ ok: boolean }>('/reports', report)
  const local = loadLocalReports()
  if (!isDuplicate(local, report)) {
    local.unshift(report)
    saveLocalReports(local)
  }
}

export async function updateReportAnalysis(
  id: string,
  aiAnalysis: AiAnalysis,
): Promise<void> {
  const local = loadLocalReports()
  const index = local.findIndex((report) => report.id === id)
  if (index >= 0) {
    local[index] = { ...local[index], aiAnalysis }
    saveLocalReports(local)
  }
  const remote = await loadReports().catch(() => [] as TraineeReport[])
  const remoteReport = remote.find((report) => report.id === id)
  if (remoteReport) {
    await saveReport({ ...remoteReport, aiAnalysis })
  }
}

export async function deleteReport(id: string): Promise<void> {
  await apiDelete<{ ok: boolean }>(`/reports/${encodeURIComponent(id)}`)
  saveLocalReports(loadLocalReports().filter((r) => r.id !== id))
}

export async function clearReports(): Promise<void> {
  await apiDelete<{ ok: boolean }>('/reports')
  localStorage.removeItem(STORAGE_KEY)
}

/** JSON-пакет протокола сессии для скачивания / доказуемости */
export function buildSessionProtocol(report: TraineeReport): object {
  return {
    protocolVersion: report.protocolVersion ?? PROTOCOL_VERSION,
    modelVersion: report.modelVersion ?? null,
    scenarioVersion: report.scenarioVersion ?? null,
    sessionMode: report.sessionMode ?? 'train',
    meta: {
      reportId: report.id,
      userName: report.userName,
      exerciseId: report.exerciseId,
      exerciseName: report.exerciseName,
      completedAt: report.completedAt,
      completedAtIso: new Date(report.completedAt).toISOString(),
      simTimeSec: report.simTimeSec,
    },
    verdict: {
      qualified: report.qualified,
      scorePercent: report.scorePercent,
      penalty: report.penalty,
      penaltyDetail: report.penaltyDetail ?? null,
      criticalFail: report.criticalFail ?? false,
      outcomeOk: report.outcomeOk ?? null,
      summary: report.qualificationSummary,
      responseSeconds: report.responseSeconds,
      respondedInTime: report.respondedInTime,
    },
    timeline: {
      actions: report.actionsLog,
      systemEvents: report.systemEvents,
    },
    trends: {
      sampleIntervalHint: '1s sim tick subsample',
      points: report.analogSample ?? [],
    },
  }
}

export async function protocolContentHash(payload: object): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(payload))
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  let h = 0
  const s = JSON.stringify(payload)
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return `fnv_${(h >>> 0).toString(16)}`
}

export async function downloadSessionProtocol(report: TraineeReport): Promise<void> {
  const base = buildSessionProtocol(report)
  const contentHash = await protocolContentHash(base)
  const payload = { ...base, contentHash, hashAlg: 'SHA-256' }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date(report.completedAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-')
  a.href = url
  a.download = `ktk-protocol-${report.exerciseId}-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Печать разбора / протокола из кабинета инструктора */
export function printSessionProtocol(report: TraineeReport): void {
  const w = window.open('', '_blank', 'noopener,noreferrer')
  if (!w) return
  const rows = report.actionsLog
    .map(
      (e) =>
        `<tr><td>${new Date(e.at).toLocaleString('ru-RU')}</td><td>${e.description}</td></tr>`,
    )
    .join('')
  w.document.write(`<!doctype html><html><head><title>Протокол ${report.exerciseName}</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#111}
    h1{font-size:18px} table{border-collapse:collapse;width:100%;font-size:12px}
    td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}
    .meta{margin:12px 0;font-size:13px}
  </style></head><body>
  <h1>Протокол сессии КТК ЭЛОУ-АВТ</h1>
  <div class="meta">
    <div><b>${report.userName}</b> · ${report.exerciseName}</div>
    <div>${report.qualified ? 'КВАЛИФИЦИРОВАН' : 'НЕ КВАЛИФИЦИРОВАН'} · ${report.scorePercent}% · штрафы ${report.penalty}</div>
    <div>${report.qualificationSummary ?? ''}</div>
    <div>Режим: ${report.sessionMode === 'exam' ? 'экзамен' : 'обучение'} · ${new Date(report.completedAt).toLocaleString('ru-RU')}</div>
    <div>Версии: ${[report.protocolVersion, report.modelVersion, report.scenarioVersion].filter(Boolean).join(' · ')}</div>
  </div>
  <h2>Журнал действий</h2>
  <table><thead><tr><th>Время</th><th>Действие</th></tr></thead><tbody>${rows || '<tr><td colspan=2>Пусто</td></tr>'}</tbody></table>
  <script>window.onload=()=>window.print()</script>
  </body></html>`)
  w.document.close()
}
