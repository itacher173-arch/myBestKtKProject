import type { SessionMode } from './types'

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
  analogSample?: AnalogSample[]
  actionsLog: StoredLogEntry[]
  systemEvents: StoredLogEntry[]
}

export const PROTOCOL_VERSION = 'session-protocol-1.0'

const STORAGE_KEY = 'ktk-elou-avt-trainee-reports'

export function loadReports(): TraineeReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TraineeReport[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveReport(report: TraineeReport): void {
  const list = loadReports()
  const duplicate = list.some(
    (r) =>
      r.userName === report.userName &&
      r.exerciseId === report.exerciseId &&
      r.scorePercent === report.scorePercent &&
      r.penalty === report.penalty &&
      Math.abs(r.completedAt - report.completedAt) < 3000,
  )
  if (duplicate) return
  list.unshift(report)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function deleteReport(id: string): void {
  const list = loadReports().filter((r) => r.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function clearReports(): void {
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

export function downloadSessionProtocol(report: TraineeReport): void {
  const payload = buildSessionProtocol(report)
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
