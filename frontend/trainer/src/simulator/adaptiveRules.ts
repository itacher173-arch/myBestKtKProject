/** Объяснимые правила: класс ошибки → мини-тренировка из catalog.json. */

export type ErrorClass =
  | 'wrong_order'
  | 'extra_action'
  | 'late_response'
  | 'missed_critical'
  | 'unsafe_action'
  | 'risk_ignored'
  | 'paz_violation'

export interface AdaptiveRule {
  errorClass: ErrorClass
  miniTrainingId: string
  reason: string
}

export const ADAPTIVE_RULES: AdaptiveRule[] = [
  {
    errorClass: 'wrong_order',
    miniTrainingId: 'MT-FEED-01',
    reason: 'Нарушена последовательность — отработайте пуск подачи сырья',
  },
  {
    errorClass: 'missed_critical',
    miniTrainingId: 'MT-SAFE-01',
    reason: 'Пропущено критичное действие — безопасные операции',
  },
  {
    errorClass: 'late_response',
    miniTrainingId: 'MT-UTIL-01',
    reason: 'Поздняя реакция — отработка утилит / аварийных условий',
  },
  {
    errorClass: 'unsafe_action',
    miniTrainingId: 'MT-FURN-01',
    reason: 'Небезопасное действие — управление печью и топливом',
  },
  {
    errorClass: 'paz_violation',
    miniTrainingId: 'MT-SAFE-01',
    reason: 'Попытка обойти ПАЗ — закрепление блокировок',
  },
  {
    errorClass: 'extra_action',
    miniTrainingId: 'MT-FEED-01',
    reason: 'Лишние операции — дисциплина по чек-листу пуска',
  },
  {
    errorClass: 'risk_ignored',
    miniTrainingId: 'MT-VENT-01',
    reason: 'Игнорирование риска — сценарий с развитием опасной ситуации',
  },
]

export function recommendByErrorClass(
  errorClass: ErrorClass | string | null | undefined,
): AdaptiveRule | null {
  if (!errorClass) return null
  return ADAPTIVE_RULES.find((r) => r.errorClass === errorClass) ?? null
}

export function classifyFromScore(input: {
  trajectoryMissed: boolean
  late: boolean
  unsafe: number
  missed: number
  extra: number
  pazBlocked?: boolean
}): ErrorClass | null {
  if (input.pazBlocked) return 'paz_violation'
  if (input.unsafe > 0) return 'unsafe_action'
  if (input.late) return 'late_response'
  if (input.missed > 0) return 'missed_critical'
  if (input.trajectoryMissed) return 'wrong_order'
  if (input.extra > 2) return 'extra_action'
  return null
}

export function recommendFromFindings(
  findings: { class?: string }[],
): AdaptiveRule | null {
  for (const f of findings) {
    const rule = recommendByErrorClass(f.class)
    if (rule) return rule
  }
  return null
}
