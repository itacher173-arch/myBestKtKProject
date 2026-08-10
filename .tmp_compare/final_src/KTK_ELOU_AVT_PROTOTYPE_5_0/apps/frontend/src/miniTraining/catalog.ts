import type { ProcessState } from '../sim/types'

export type TrainingDifficulty = 'Базовый' | 'Средний' | 'Продвинутый'
export type ConditionOperation = 'eq' | 'gte' | 'lte' | 'gt' | 'lt'

export type TrainingCondition =
  | { field: keyof ProcessState; op: ConditionOperation; value: unknown }
  | { all: TrainingCondition[] }
  | { any: TrainingCondition[] }

export interface TrainingHint {
  text: string
  articleId: string
}

export interface MiniTraining {
  id: string
  title: string
  segment: string
  description: string
  durationMinutes: number
  difficulty: TrainingDifficulty
  preset: string
  zoneIds: string[]
  equipmentIds: string[]
  allowedActions: string[]
  objectives: string[]
  criteria: TrainingCondition[]
  hints: TrainingHint[]
}

export interface TrainingProgress {
  checks: boolean[]
  progressPercent: number
  completed: boolean
}

export function getMiniTraining(
  trainings: MiniTraining[],
  id: string | null,
): MiniTraining | undefined {
  return trainings.find((training) => training.id === id)
}

function checkCondition(
  condition: TrainingCondition,
  process: ProcessState,
): boolean {
  if ('all' in condition) {
    return condition.all.every((item) => checkCondition(item, process))
  }
  if ('any' in condition) {
    return condition.any.some((item) => checkCondition(item, process))
  }
  const actual = process[condition.field]
  const expected = condition.value
  switch (condition.op) {
    case 'eq':
      return actual === expected
    case 'gte':
      return Number(actual) >= Number(expected)
    case 'lte':
      return Number(actual) <= Number(expected)
    case 'gt':
      return Number(actual) > Number(expected)
    case 'lt':
      return Number(actual) < Number(expected)
  }
}

export function evaluateMiniTraining(
  training: MiniTraining,
  process: ProcessState,
): TrainingProgress {
  const checks = training.criteria.map((criterion) =>
    checkCondition(criterion, process),
  )
  const completed = checks.length > 0 && checks.every(Boolean)
  return {
    checks,
    completed,
    progressPercent: checks.length
      ? Math.round((checks.filter(Boolean).length / checks.length) * 100)
      : 0,
  }
}
