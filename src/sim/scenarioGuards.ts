import type { Exercise, ProcessState } from './types'

/** Минимальная выдержка между ключевыми шагами пуска, с. */
export const STARTUP_DWELL_SEC = 12

export type GuardedAction =
  | 'open-L1'
  | 'start-N1'
  | 'elou-demulsifier'
  | 'elou-field'
  | 'elou-wash'
  | 'start-N2'
  | 'start-N3'
  | 'fuel'
  | 'open-L2'
  | 'open-L3'
  | 'shutdown-fuel'
  | 'shutdown-stop-furnace-pump'
  | 'shutdown-stop-N1'

function hasLog(actions: string[], needle: string) {
  return actions.some((a) => a.includes(needle))
}

/**
 * Блокировки последовательности для SC-14 (пуск) и планового останова.
 * Возвращает null, если действие допустимо.
 */
export function sequenceBlockReason(opts: {
  exercise: Exercise | undefined
  process: ProcessState
  actionLogs: string[]
  action: GuardedAction
  fuelTarget?: number
}): string | null {
  const ex = opts.exercise
  if (!ex) return null
  const logs = opts.actionLogs
  const p = opts.process

  // ——— Пуск / SC-14 ———
  if (ex.id === 'startup' || ex.specId === 'SC-14') {
    if (opts.action === 'start-N1') {
      if (p.valveL1 < 40 && !hasLog(logs, "Л-1")) {
        return 'Сначала откройте Л-1 (вход сырья). Пуск Н-1 при закрытой задвижке запрещён.'
      }
    }
    if (
      opts.action === 'elou-demulsifier' ||
      opts.action === 'elou-field' ||
      opts.action === 'elou-wash'
    ) {
      if (p.pumpN1 !== 'running' && p.pumpN1 !== 'starting') {
        return 'Включите сырьевой насос Н-1 до настройки ЭЛОУ.'
      }
    }
    if (opts.action === 'start-N2' || opts.action === 'start-N3') {
      if (!p.demulsifierOn || !p.electricFieldOn || !p.washWaterOn) {
        return 'Перед подачей в печи включите деэмульгатор, эл. поле и промывную воду ЭЛОУ.'
      }
      if (p.simTimeSec < STARTUP_DWELL_SEC) {
        return `Выдержка после начала пуска: ещё ${Math.ceil(STARTUP_DWELL_SEC - p.simTimeSec)} с.`
      }
    }
    if (opts.action === 'fuel') {
      const target = opts.fuelTarget ?? 0
      if (target > p.fuelGasPercent + 1) {
        if (p.pumpN2 !== 'running' && p.pumpN3 !== 'running') {
          return 'Нельзя поднимать топливо без работающих Н-2/Н-3 (риск перегрева змеевика).'
        }
        if (p.tempFurnaceOut < 80 && target - p.fuelGasPercent > 25) {
          return 'Ускоренный прогрев запрещён: повышайте топливо ступенями не более +25%.'
        }
        if (p.tempElouIn < 60 && target > 40) {
          return 'Слишком ранний набор топлива: дождитесь прогрева тракта (TR41-2).'
        }
      }
    }
    if (opts.action === 'open-L2' || opts.action === 'open-L3') {
      if (p.feedFlow < 20) {
        return 'Открывайте продуктовую задвижку при устойчивом расходе сырья.'
      }
    }
  }

  // ——— Плановый останов ———
  if (ex.id === 'shutdown') {
    if (opts.action === 'shutdown-stop-furnace-pump') {
      if (p.fuelGasPercent > 5) {
        return 'Сначала снизьте топливный газ до 0%.'
      }
    }
    if (opts.action === 'shutdown-stop-N1') {
      if (p.pumpN2 === 'running' || p.pumpN3 === 'running') {
        return 'Остановите Н-2/Н-3 до останова сырьевого Н-1.'
      }
      if (p.fuelGasPercent > 5) {
        return 'Топливо должно быть отсечено до останова Н-1.'
      }
    }
  }

  return null
}
