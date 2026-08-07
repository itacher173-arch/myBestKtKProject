/** ИИ-модуль КТК: эвристическая классификация ошибок, обратная связь и прогноз риска. */

import type { ProcessState } from './types'
import type { Exercise } from './types'

export type AiErrorClass =
  | 'wrong_order'
  | 'extra_action'
  | 'late_response'
  | 'missed_critical'
  | 'unsafe_action'
  | 'risk_ignored'

export interface AiFinding {
  id: string
  at: number
  class: AiErrorClass
  title: string
  why: string
  relatedTag?: string
  severity: 'low' | 'medium' | 'high'
}

export interface AiRiskWarning {
  level: 'info' | 'warn' | 'critical'
  title: string
  detail: string
  relatedTag?: string
}

const CLASS_LABEL: Record<AiErrorClass, string> = {
  wrong_order: 'Нарушение последовательности',
  extra_action: 'Лишнее действие',
  late_response: 'Поздняя реакция',
  missed_critical: 'Пропущен критический шаг',
  unsafe_action: 'Небезопасное действие',
  risk_ignored: 'Игнорирование риска',
}

export function aiClassLabel(c: AiErrorClass): string {
  return CLASS_LABEL[c]
}

function uid() {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** Прогноз риска до совершения действия / по текущему состоянию. */
export function predictRisk(
  p: ProcessState,
  pending?: string | null,
): AiRiskWarning | null {
  if (pending === 'pump-n1-start' && p.valveL1 < 5) {
    return {
      level: 'critical',
      title: 'Риск работы Н-1 на закрытую задвижку',
      detail:
        'Пуск сырьевого насоса при закрытой Л-1 приводит к тупиковому напору и перегреву. Сначала откройте Л-1.',
      relatedTag: 'PRA351',
    }
  }
  if (
    (pending === 'pump-n2-start' || pending === 'pump-n3-start') &&
    p.levelK1 < 22
  ) {
    return {
      level: 'critical',
      title: 'Риск срыва насоса и прогара змеевика',
      detail:
        'Уровень К-1 низкий. Пуск Н-2/Н-3 без уровня усиливает риск перегрева печного тракта.',
      relatedTag: 'LRCA602',
    }
  }
  if (pending === 'fuel-up' && !p.steamOk) {
    return {
      level: 'critical',
      title: 'Риск подачи топлива без пара',
      detail:
        'Без технологического пара горелки нестабильны. Сначала восстановите пар или отсеките топливо.',
      relatedTag: 'TR55-1',
    }
  }
  if (pending === 'fuel-up' && p.pumpN2 !== 'running' && p.pumpN3 !== 'running') {
    return {
      level: 'warn',
      title: 'Риск перегрева змеевика без подачи',
      detail:
        'Топливо без работающих Н-2/Н-3: заряд в печи отсутствует, возможен перегрев труб.',
      relatedTag: 'TR55-1',
    }
  }
  if (p.levelWaterE1 > 85 || p.levelWaterE2 > 85) {
    return {
      level: 'critical',
      title: 'Риск заноса воды в колонны',
      detail:
        'Высокий уровень воды E-1/E-2. Требуется дренаж до роста давления в К-1/К-2.',
      relatedTag: 'PRSA204',
    }
  }
  if (p.levelK1 < 20 && p.fuelGasPercent > 15) {
    return {
      level: 'critical',
      title: 'Риск прогара при низком уровне К-1',
      detail:
        'Разгрузите печь (топливо → 0) и восстановите уровень куба К-1.',
      relatedTag: 'LRCA602',
    }
  }
  if (p.saltMgL > 5 && p.feedFlow > 5 && !p.demulsifierOn) {
    return {
      level: 'warn',
      title: 'Риск коррозии тракта',
      detail:
        'Соли выше нормы при отключённом деэмульгаторе. Включите подачу деэмульгатора.',
      relatedTag: 'Q-ELOU',
    }
  }
  if (!p.avoFanOn && p.feedFlow > 5) {
    return {
      level: 'warn',
      title: 'Риск роста давления верха',
      detail:
        'АВО АВЗ-3 выключен — ухудшается конденсация и растёт давление верха К-1.',
      relatedTag: 'PRSA204',
    }
  }
  if (!p.instrumentAirOk && (p.valveL1Motion !== 'idle' || p.valveL2Motion !== 'idle')) {
    return {
      level: 'warn',
      title: 'Приводы задвижек без воздуха',
      detail: 'Нет приборного воздуха — электрозадвижки не управляются.',
    }
  }
  return null
}

/** Разбор действия относительно эталона. */
export function analyzeAction(opts: {
  description: string
  at: number
  actionsSoFar: string[]
  exercise: Exercise | undefined
  process: ProcessState
}): AiFinding | null {
  const { description, at, actionsSoFar, exercise, process } = opts
  if (!exercise) return null

  const steps = exercise.scenarioSteps
  const expected = exercise.expectedResponseActions ?? []
  const done = new Set(actionsSoFar)

  // Небезопасные комбинации
  if (
    description.includes("Насос 'Н-1': нажата кнопка 'Пуск'") &&
    process.valveL1 < 5
  ) {
    return {
      id: uid(),
      at,
      class: 'unsafe_action',
      title: 'Пуск Н-1 при закрытой Л-1',
      why: 'Эталон: сначала открыть Л-1, затем пустить Н-1. Иначе тупиковый напор и риск повреждения насоса.',
      relatedTag: 'PRA351',
      severity: 'high',
    }
  }

  if (
    description.includes('топливного газа') &&
    !process.steamOk &&
    /на (6|5|4|3|2|1)/.test(description)
  ) {
    return {
      id: uid(),
      at,
      class: 'unsafe_action',
      title: 'Подача топлива без пара',
      why: 'При потере пара топливо должно быть отсечено. Увеличение топлива усугубляет аварию.',
      relatedTag: 'TR55-1',
      severity: 'high',
    }
  }

  // Эталонный шаг — ок
  if (steps.includes(description) || expected.includes(description)) {
    return null
  }

  // Нарушение порядка: действие из эталона, но предыдущие не сделаны
  const idx = steps.indexOf(description)
  if (idx > 0) {
    const missingBefore = steps.slice(0, idx).filter((s) => !done.has(s))
    if (missingBefore.length) {
      return {
        id: uid(),
        at,
        class: 'wrong_order',
        title: 'Шаг выполнен вне порядка',
        why: `Пропущены предшествующие шаги эталона. Ближайший: «${missingBefore[0]}».`,
        severity: 'medium',
      }
    }
  }

  // Лишнее действие (не из эталона)
  if (steps.length > 0 && !steps.includes(description)) {
    return {
      id: uid(),
      at,
      class: 'extra_action',
      title: 'Действие вне эталонного сценария',
      why: `«${description}» не входит в эталон упражнения «${exercise.name}». Лишние команды снижают оценку квалификации.`,
      severity: 'low',
    }
  }

  return null
}

export function analyzeCompletion(opts: {
  exercise: Exercise | undefined
  actionsLog: { at: number; description: string }[]
  faultTriggered: boolean
  faultResponded: boolean
  respondedInTime: boolean | null
  responseSeconds: number | null
}): AiFinding[] {
  const findings: AiFinding[] = []
  const ex = opts.exercise
  if (!ex) return findings
  const done = new Set(opts.actionsLog.map((a) => a.description))
  const now = Date.now()

  for (const step of ex.expectedResponseActions ?? []) {
    if (!done.has(step)) {
      findings.push({
        id: uid(),
        at: now,
        class: 'missed_critical',
        title: 'Не выполнен критический ответ на отказ',
        why: `Эталонная реакция не зафиксирована: «${step}». Квалификация по аварии не подтверждена.`,
        severity: 'high',
      })
    }
  }

  if (
    opts.faultTriggered &&
    opts.faultResponded &&
    opts.respondedInTime === false
  ) {
    findings.push({
      id: uid(),
      at: now,
      class: 'late_response',
      title: 'Реакция на отказ сверх нормы',
      why: `Время реакции ${opts.responseSeconds?.toFixed(1) ?? '—'} с превышает норму ${ex.normResponseSeconds ?? '—'} с. Тренируйте скорость распознавания отказа.`,
      severity: 'high',
    })
  }

  if (opts.faultTriggered && !opts.faultResponded) {
    findings.push({
      id: uid(),
      at: now,
      class: 'missed_critical',
      title: 'Отказ не отработан',
      why: 'Нештатная ситуация была активна, но корректная реакция не зафиксирована до завершения.',
      severity: 'high',
    })
  }

  // Пропущенные шаги эталона (для cold start)
  if (!ex.warmStart) {
    for (const step of ex.scenarioSteps) {
      if (!done.has(step)) {
        findings.push({
          id: uid(),
          at: now,
          class: 'missed_critical',
          title: 'Пропущен шаг пуска',
          why: `Не выполнен эталонный шаг: «${step}».`,
          severity: 'medium',
        })
      }
    }
  }

  return findings
}

/** Адаптивный повтор: подбор упражнения по классам ошибок. */
export function recommendRetrain(
  findings: AiFinding[],
  currentExerciseId: string | null,
): { exerciseId: string; reason: string } | null {
  const classes = new Set(findings.map((f) => f.class))
  const text = findings.map((f) => f.why + f.title).join(' ')

  if (/солей|деэмульг|ЭЛОУ|корроз/i.test(text)) {
    return {
      exerciseId: 'demulsifier',
      reason: 'Повтор: отказ деэмульгатора — закрепить работу с ЭЛОУ и солями.',
    }
  }
  if (/Н-1|сырьев|PRA351|тупиков/i.test(text)) {
    return {
      exerciseId: 'pumpTrip',
      reason: 'Повтор: отказ Н-1 — отработать пуск/восстановление сырьевого насоса.',
    }
  }
  if (/топлив|пар|горелок|змеевик|TR55/i.test(text)) {
    return {
      exerciseId: 'sc02-steam',
      reason: 'Повтор: потеря пара / топливо — отработать безопасное отсечение.',
    }
  }
  if (/вод[аы]|E-1|E-2|занос/i.test(text)) {
    return {
      exerciseId: 'sc11-water',
      reason: 'Повтор: высокий уровень воды E-1/E-2 — дренаж и защита колонн.',
    }
  }
  if (/уровень K-1|К-1|прогар/i.test(text)) {
    return {
      exerciseId: 'sc12-low-k1',
      reason: 'Повтор: низкий уровень K-1 — разгрузка печи и защита куба.',
    }
  }
  if (classes.has('late_response') || classes.has('missed_critical')) {
    return {
      exerciseId: currentExerciseId ?? 'startup',
      reason: 'Повтор текущего сценария: закрепить скорость и полноту реакции.',
    }
  }
  if (classes.has('wrong_order') || classes.has('extra_action')) {
    return {
      exerciseId: 'startup',
      reason: 'Повтор штатного пуска: закрепить эталонную последовательность.',
    }
  }
  return null
}

export function evaluateQualification(opts: {
  scorePercent: number
  penalty: number
  findings: AiFinding[]
  faultTriggered: boolean
  respondedInTime: boolean | null
}): { qualified: boolean; summary: string } {
  const high = opts.findings.filter((f) => f.severity === 'high').length
  const criticalMiss = opts.findings.some((f) => f.class === 'missed_critical')
  const late = opts.findings.some((f) => f.class === 'late_response')
  const scoreOk = opts.scorePercent >= 70
  const penaltyOk = opts.penalty <= 10
  const responseOk =
    !opts.faultTriggered ||
    (opts.respondedInTime === true && !criticalMiss && !late)

  const qualified = scoreOk && penaltyOk && responseOk && high <= 1 && !criticalMiss

  const summary = qualified
    ? 'КВАЛИФИЦИРОВАН: эталон выполнен, критические ошибки отсутствуют.'
    : `НЕ КВАЛИФИЦИРОВАН: выполнение ${opts.scorePercent.toFixed(0)}%` +
      (!scoreOk ? ' (<70%)' : '') +
      (!penaltyOk ? `, лишних ${opts.penalty}` : '') +
      (criticalMiss ? ', пропущен критический шаг' : '') +
      (late ? ', реакция сверх нормы' : '') +
      (high > 1 ? `, высоких замечаний ИИ: ${high}` : '') +
      '.'

  return { qualified, summary }
}
