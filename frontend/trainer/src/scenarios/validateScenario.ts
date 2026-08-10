/** Валидация JSON-сценария по схеме (без внешних зависимостей). */

export interface ScenarioDoc {
  id: string
  name: string
  version: string
  description?: string
  mode?: 'train' | 'exam'
  initial: Record<string, unknown>
  checklist: string[]
  goldenSequence?: string[]
  constraints?: {
    maxResponseSec?: number
    forbidActions?: string[]
    requirePaz?: boolean
  }
  faultType?: string
  equipmentIds?: string[]
  zoneIds?: string[]
}

const VERSION_RE = /^[0-9]+\.[0-9]+(\.[0-9]+)?$/

export function validateScenarioDoc(raw: unknown): {
  ok: boolean
  errors: string[]
  value?: ScenarioDoc
} {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Корень должен быть объектом'] }
  }
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id.trim().length < 2) {
    errors.push('id: строка ≥2 символов')
  }
  if (typeof o.name !== 'string' || !o.name.trim()) {
    errors.push('name обязателен')
  }
  if (typeof o.version !== 'string' || !VERSION_RE.test(o.version)) {
    errors.push('version: semver вида N.N или N.N.N')
  }
  if (!o.initial || typeof o.initial !== 'object') {
    errors.push('initial: объект состояния')
  }
  if (!Array.isArray(o.checklist) || o.checklist.length < 1) {
    errors.push('checklist: непустой массив строк')
  } else if (o.checklist.some((x) => typeof x !== 'string' || !x.trim())) {
    errors.push('checklist: только непустые строки')
  }
  if (o.goldenSequence != null) {
    if (
      !Array.isArray(o.goldenSequence) ||
      o.goldenSequence.some((x) => typeof x !== 'string')
    ) {
      errors.push('goldenSequence: массив строк')
    }
  }
  if (o.mode != null && o.mode !== 'train' && o.mode !== 'exam') {
    errors.push('mode: train|exam')
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, errors: [], value: o as unknown as ScenarioDoc }
}
