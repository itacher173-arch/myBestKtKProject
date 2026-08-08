import type { Exercise, ProcessState } from './types'
import { criticalFailReasonText } from './pazGuards'

export type PenaltyKind = 'unsafe' | 'late' | 'extra' | 'missed'

export interface PenaltyDetail {
  unsafe: number
  late: number
  extra: number
  missed: number
}

export interface ScoreInput {
  exercise: Exercise | undefined
  process: ProcessState
  actionsLog: { description: string }[]
  faultTriggered: boolean
  faultResponded: boolean
  respondedInTime: boolean | null
  responseSeconds: number | null
}

export interface ScoreResult {
  scorePercent: number
  penalty: number
  penaltyDetail: PenaltyDetail
  qualified: boolean
  summary: string
  criticalFail: boolean
  outcomeOk: boolean
  stepsDone: number
  stepsTotal: number
}

function stepDone(needed: string, doneDescs: string[]): boolean {
  if (doneDescs.includes(needed)) return true
  if (needed.includes('топливного газа')) {
    return doneDescs.some((d) => {
      const m = d.match(/топливного газа на (\d+)%/)
      return m != null && Number(m[1]) >= 40
    })
  }
  return false
}

/** Исход процесса после отработки отказа / штатного сценария. */
export function evaluateProcessOutcome(
  exercise: Exercise | undefined,
  process: ProcessState,
  faultResponded: boolean,
): { ok: boolean; reason: string } {
  if (!exercise) return { ok: false, reason: 'Упражнение не выбрано' }

  if (!exercise.faultType) {
    if (exercise.id === 'startup') {
      const ok =
        process.pumpN1 === 'running' &&
        process.feedFlow > 20 &&
        process.demulsifierOn &&
        process.washWaterOn &&
        process.fuelGasPercent >= 40
      return {
        ok,
        reason: ok
          ? 'Пуск: сырьё, ЭЛОУ и нагрев в рабочем диапазоне'
          : 'Пуск не завершён по параметрам процесса',
      }
    }
    if (exercise.id === 'shutdown') {
      const ok =
        process.fuelGasPercent <= 5 &&
        process.pumpN1 === 'stopped' &&
        process.pumpN2 === 'stopped' &&
        process.valveL1 < 10
      return {
        ok,
        reason: ok
          ? 'Останов: топливо и сырьё сняты'
          : 'Останов не завершён по параметрам процесса',
      }
    }
    return { ok: true, reason: 'Штатный сценарий без отказа' }
  }

  if (!faultResponded) {
    return { ok: false, reason: 'Отказ не отработан' }
  }

  switch (exercise.faultType) {
    case 'steamLoss':
    case 'powerLoss':
    case 'airLoss':
    case 'coolingWaterLoss':
    case 'coilRupture':
      return {
        ok: process.fuelGasPercent <= 5 && process.safeShutdownInitiated,
        reason:
          process.fuelGasPercent <= 5 && process.safeShutdownInitiated
            ? 'Безопасный останов зафиксирован'
            : 'Нет подтверждённого безопасного останова / топливо не отсечено',
      }
    case 'pumpLeak':
      return {
        ok: process.pumpN1 === 'stopped' && process.fuelGasPercent <= 60,
        reason:
          process.pumpN1 === 'stopped'
            ? 'Утечка локализована (Н-1 остановлен)'
            : 'Н-1 не остановлен',
      }
    case 'demulsifier':
      return {
        ok: process.demulsifierOn && process.saltMgL <= 8,
        reason: process.demulsifierOn
          ? 'Деэмульгатор восстановлен'
          : 'Деэмульгатор не включён',
      }
    case 'fuelGas':
      return {
        ok: process.fuelGasPercent >= 40 && process.steamOk,
        reason:
          process.fuelGasPercent >= 40
            ? 'Топливо восстановлено'
            : 'Топливо не восстановлено (≥40%)',
      }
    case 'pumpTrip':
      return {
        ok: process.pumpN1 === 'running' || process.pumpN1 === 'starting',
        reason:
          process.pumpN1 === 'running' || process.pumpN1 === 'starting'
            ? 'Н-1 в работе'
            : 'Н-1 не пущен повторно',
      }
    case 'highWaterE12':
      return {
        ok: process.levelWaterE1 < 70 && process.levelWaterE2 < 70,
        reason:
          process.levelWaterE1 < 70
            ? 'Уровень воды E-1/E-2 снижен'
            : 'Вода E-1/E-2 всё ещё высока',
      }
    case 'lowLevelK1':
      return {
        ok: process.fuelGasPercent <= 10 || process.levelK1 >= 25,
        reason: 'Разгрузка / уровень K-1',
      }
    default:
      return {
        ok: process.safeShutdownInitiated || faultResponded,
        reason: faultResponded ? 'Реакция зафиксирована' : 'Нет реакции',
      }
  }
}

/** Критические ошибки по состоянию процесса (без эвристик разбора). */
export function detectCriticalFails(
  process: ProcessState,
  exercise: Exercise | undefined,
  actionsLog: { description: string }[],
): boolean {
  return criticalFailReasonText(process, exercise, actionsLog) != null
}

function countUnsafeActions(
  process: ProcessState,
  actionsLog: { description: string }[],
): number {
  let n = 0
  for (const a of actionsLog) {
    if (
      (!process.steamOk || process.coilRupture) &&
      /топливного газа на (\d+)%/.test(a.description)
    ) {
      const m = a.description.match(/на (\d+)%/)
      if (m && Number(m[1]) > 10) n += 1
    }
    if (
      a.description.includes("Насос 'Н-1': нажата кнопка 'Пуск'") &&
      process.valveL1 < 5 &&
      process.pumpN1 === 'running'
    ) {
      n += 1
    }
  }
  return n
}

export function scoreExercise(input: ScoreInput): ScoreResult {
  const {
    exercise,
    process,
    actionsLog,
    faultTriggered,
    faultResponded,
    respondedInTime,
  } = input

  const needed = exercise?.scenarioSteps ?? []
  const doneDescs = actionsLog.map((a) => a.description)
  const stepsDone = needed.filter((s) => stepDone(s, doneDescs)).length
  const stepsTotal = needed.length
  const stepScore =
    stepsTotal === 0 ? 0 : Math.round((stepsDone / stepsTotal) * 1000) / 10

  const expected = exercise?.expectedResponseActions ?? []
  const missedExpected = expected.filter((s) => !stepDone(s, doneDescs)).length

  const extra = doneDescs.filter((d) => {
    if (needed.includes(d)) return false
    if (
      needed.some((s) => s.includes('топливного')) &&
      /топливного газа на (\d+)%/.test(d)
    ) {
      const m = d.match(/на (\d+)%/)
      if (m && Number(m[1]) >= 40) return false
    }
    return true
  }).length

  const unsafe = countUnsafeActions(process, actionsLog)
  const late = respondedInTime === false ? 1 : 0
  const missed = missedExpected

  const penaltyDetail: PenaltyDetail = {
    unsafe,
    late,
    extra,
    missed,
  }
  const penalty = unsafe * 3 + late * 2 + extra + missed * 2

  const outcome = evaluateProcessOutcome(exercise, process, faultResponded)
  const criticalFail = detectCriticalFails(process, exercise, actionsLog)

  let scorePercent = stepScore
  if (outcome.ok) scorePercent = Math.min(100, scorePercent + 10)
  else scorePercent = Math.max(0, scorePercent - 15)
  if (criticalFail) scorePercent = Math.min(scorePercent, 40)
  scorePercent = Math.max(0, Math.min(100, Math.round(scorePercent * 10) / 10))

  const scoreOk = scorePercent >= 70
  const penaltyOk = penalty <= 12
  const responseOk =
    !faultTriggered ||
    (faultResponded && respondedInTime !== false && missedExpected === 0)

  const qualified =
    !criticalFail && scoreOk && penaltyOk && responseOk && outcome.ok

  const summary = criticalFail
    ? `НЕ КВАЛИФИЦИРОВАН: критическая ошибка. ${outcome.reason}.`
    : qualified
      ? `КВАЛИФИЦИРОВАН: ${outcome.reason}. Балл ${scorePercent.toFixed(0)}%.`
      : `НЕ КВАЛИФИЦИРОВАН: балл ${scorePercent.toFixed(0)}%` +
        (!scoreOk ? ' (<70%)' : '') +
        (!outcome.ok ? `; исход: ${outcome.reason}` : '') +
        (!responseOk ? '; реакция на отказ неполная/поздняя' : '') +
        (penalty > 12 ? `; штрафы ${penalty}` : '') +
        '.'

  return {
    scorePercent,
    penalty,
    penaltyDetail,
    qualified,
    summary,
    criticalFail,
    outcomeOk: outcome.ok,
    stepsDone,
    stepsTotal,
  }
}
