export interface StoredLogEntry {
  at: number
  description: string
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
  recommendExerciseId: string | null
  recommendReason: string | null
  aiFindings: {
    at: number
    class: string
    title: string
    why: string
    severity: string
    relatedTag?: string
  }[]
  actionsLog: StoredLogEntry[]
  systemEvents: StoredLogEntry[]
}

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
