/**
 * Проверка мини-уроков и сценариев: статика + симуляция канонических решений.
 * Запуск: npx tsx scripts/verify-training.mts
 */
import { equipment } from '../src/scheme/equipment'
import { SCHEME_ZONES } from '../src/scheme/zones'
import { getArticle } from '../src/knowledge/store'
import {
  MINI_TRAININGS,
  evaluateMiniTraining,
  type MiniTraining,
} from '../src/training/catalog'
import { applyMiniPreset } from '../src/training/presets'
import { tickProcess } from '../src/simulator/processModel'
import type { ProcessState } from '../src/simulator/types'
import { exercises } from '../src/scenarios/exercises'
import {
  EMERGENCY_ACTIONS,
  type FaultType,
} from '../src/simulator/faultEngine'
import { SPEC_SCENARIOS } from '../src/scenarios/catalog'

const DT = 1
const MAX_TICKS = 180

type SolutionFn = (p: ProcessState) => ProcessState

function applyProtectK1(p: ProcessState): ProcessState {
  return {
    ...p,
    fuelGasPercent: 0,
    levelSetpointK1: 50,
    levelK1: Math.max(p.levelK1, 28),
    safeShutdownInitiated: true,
  }
}

function applyProtectK2(p: ProcessState): ProcessState {
  return {
    ...p,
    levelReflux: 45,
    levelSetpointK2: 50,
    fuelGasPercent: Math.min(p.fuelGasPercent, 40),
  }
}

function applyDrain(p: ProcessState, level = 25): ProcessState {
  return { ...p, levelWaterE1: level, levelWaterE2: level }
}

/** Канонические действия оператора (после фикса багов дренажа/защиты). */
const SOLUTIONS: Record<string, SolutionFn> = {
  'MT-FEED-01': (p) => ({
    ...p,
    valveL1Motion: 'opening',
    pumpN1: 'running',
  }),
  'MT-FEED-02': (p) => ({
    ...p,
    valveL1Motion: 'opening',
    pumpN1: 'running',
  }),
  'MT-ELOU-01': (p) => ({
    ...p,
    demulsifierOn: true,
    electricFieldOn: true,
    washWaterOn: true,
  }),
  'MT-ELOU-02': (p) => ({
    ...p,
    demulsifierOn: true,
    electricFieldOn: true,
    washWaterOn: true,
  }),
  'MT-E1-01': (p) =>
    applyDrain({ ...p, coolingWaterOk: true, avoFanOn: true }, 25),
  'MT-K1-01': (p) => ({
    ...p,
    coolingWaterOk: true,
    avoFanOn: true,
    fuelGasPercent: 40,
  }),
  'MT-K1-02': (p) => applyProtectK1(p),
  'MT-FURN-01': (p) => ({
    ...p,
    pumpN2: 'running',
    fuelGasPercent: 40,
  }),
  'MT-K2-01': (p) => ({
    ...p,
    coolingWaterOk: true,
    fuelGasPercent: 40,
  }),
  'MT-K2-02': (p) => ({
    ...applyProtectK2(p),
    fuelGasPercent: 25,
  }),
  'MT-UTIL-01': (p) => ({ ...p, instrumentAirOk: true }),
  'MT-VENT-01': (p) => ({ ...p, ventElouOk: true }),
  'MT-SAFE-01': (p) => ({
    ...p,
    coolingWaterOk: true,
    avoFanOn: true,
    fuelGasPercent: 40,
  }),
}

/** Поведение UI после фикса (зеркало TrainerContext / faultEngine). */
const UI_ACTIONS: Partial<Record<string, SolutionFn>> = {
  'MT-E1-01': (p) =>
    applyDrain({ ...p, coolingWaterOk: true, avoFanOn: true }, 25),
  'MT-K1-02': (p) => applyProtectK1(p),
  'MT-K2-02': (p) => ({
    ...applyProtectK2(p),
    fuelGasPercent: 25, // protect ставит ≤40; урок требует ≤25
  }),
}

function simulate(
  training: MiniTraining,
  solve: SolutionFn,
): { ok: boolean; ticks: number; checks: boolean[]; process: ProcessState } {
  let process = solve(applyMiniPreset(training.id))
  for (let i = 0; i < MAX_TICKS; i++) {
    const progress = evaluateMiniTraining(training, process)
    if (progress.completed) {
      return { ok: true, ticks: i, checks: progress.checks, process }
    }
    process = tickProcess(process, DT)
  }
  const progress = evaluateMiniTraining(training, process)
  return {
    ok: progress.completed,
    ticks: MAX_TICKS,
    checks: progress.checks,
    process,
  }
}

function staticAudit(): string[] {
  const errors: string[] = []
  const equipIds = new Set(equipment.map((e) => e.id))
  const zoneIds = new Set(SCHEME_ZONES.map((z) => z.id))

  for (const t of MINI_TRAININGS) {
    for (const id of t.equipmentIds) {
      if (!equipIds.has(id)) {
        errors.push(`${t.id}: неизвестное оборудование «${id}»`)
      }
    }
    for (const id of t.zoneIds) {
      if (!zoneIds.has(id)) {
        errors.push(`${t.id}: неизвестная зона «${id}»`)
      }
    }
    for (const hint of t.hints) {
      if (!getArticle(hint.articleId)) {
        errors.push(`${t.id}: нет статьи «${hint.articleId}»`)
      }
    }
    if (t.criteria.length === 0) {
      errors.push(`${t.id}: пустые критерии`)
    }
    if (t.allowedActions.length === 0) {
      errors.push(`${t.id}: пустые allowedActions`)
    }
  }
  return errors
}

function exerciseAudit(): string[] {
  const errors: string[] = []
  const knownFaults = new Set(
    EMERGENCY_ACTIONS.flatMap((a) => a.clearsFaults) as FaultType[],
  )
  // faults that clear via non-emergency logs (MVP)
  knownFaults.add('demulsifier')
  knownFaults.add('fuelGas')
  knownFaults.add('pumpTrip')

  const playable = SPEC_SCENARIOS.filter((s) => s.status === 'playable')
  const exerciseSpecIds = new Set(
    exercises.map((e) => e.specId).filter(Boolean) as string[],
  )

  for (const s of playable) {
    if (!exerciseSpecIds.has(s.specId)) {
      errors.push(`playable ${s.specId}: нет упражнения в exercises.ts`)
    }
    if (s.exerciseId && !exercises.some((e) => e.id === s.exerciseId)) {
      errors.push(
        `playable ${s.specId}: exerciseId «${s.exerciseId}» не найден`,
      )
    }
  }

  for (const ex of exercises) {
    if (!ex.scenarioSteps?.length) {
      errors.push(`${ex.id}: пустые scenarioSteps`)
    }
    if (ex.faultType) {
      const actions = EMERGENCY_ACTIONS.filter(
        (a) =>
          a.clearsFaults.includes(ex.faultType!) ||
          (a.procedureFor?.includes(ex.faultType!) ?? false),
      )
      const expected = ex.expectedResponseActions ?? []
      if (expected.length === 0 && actions.length === 0) {
        // MVP demulsifier/fuel/pump use normal logs
        if (
          !['demulsifier', 'fuelGas', 'pumpTrip'].includes(ex.faultType)
        ) {
          errors.push(`${ex.id}: fault ${ex.faultType} без emergency-действия`)
        }
      }
      for (const log of expected) {
        if (!log.startsWith('Авария:') && !ex.scenarioSteps.includes(log)) {
          errors.push(`${ex.id}: expectedResponse не в scenarioSteps: ${log}`)
        }
      }
    }
  }
  return errors
}

console.log('=== Обучение: проверка кейсов ===\n')

const staticErrors = staticAudit()
if (staticErrors.length === 0) {
  console.log(`✓ Статика: ${MINI_TRAININGS.length} мини-уроков (equip/zone/articles)`)
} else {
  console.log(`✗ Статика (${staticErrors.length}):`)
  staticErrors.forEach((e) => console.log(`  - ${e}`))
}

console.log('\n--- Мини-уроки (каноническое решение) ---')
let miniFail = 0
for (const t of MINI_TRAININGS) {
  const solve = SOLUTIONS[t.id]
  if (!solve) {
    console.log(`✗ ${t.id}: нет канонического решения в скрипте`)
    miniFail++
    continue
  }
  const result = simulate(t, solve)
  const detail = result.checks
    .map((ok, i) => (ok ? '✓' : `✗#${i + 1}`))
    .join(' ')
  if (result.ok) {
    console.log(`✓ ${t.id} (${t.title}) — ${result.ticks}с  [${detail}]`)
  } else {
    miniFail++
    console.log(`✗ ${t.id} (${t.title}) — не за ${MAX_TICKS}с  [${detail}]`)
    const failed = t.criteria
      .map((c, i) => (!result.checks[i] ? `  criterion ${i + 1}: ${JSON.stringify(c)}` : null))
      .filter(Boolean)
    failed.forEach((line) => console.log(line))
  }
}

console.log('\n--- Действия UI (зеркало кода) ---')
for (const [id, solve] of Object.entries(UI_ACTIONS)) {
  const t = MINI_TRAININGS.find((x) => x.id === id)
  if (!t || !solve) continue
  const result = simulate(t, solve)
  console.log(
    `${result.ok ? '✓' : '✗'} ${id} через UI: ${
      result.ok ? `OK за ${result.ticks}с` : `FAIL (${result.checks.map((c, i) => (c ? '✓' : `✗#${i + 1}`)).join(' ')})`
    }`,
  )
}

console.log('\n--- Полные сценарии ---')
const exErrors = exerciseAudit()
if (exErrors.length === 0) {
  console.log(`✓ Сценарии: ${exercises.length} упражнений, playable спецификации связаны`)
} else {
  console.log(`✗ Сценарии (${exErrors.length}):`)
  exErrors.forEach((e) => console.log(`  - ${e}`))
}

const totalFail = staticErrors.length + miniFail + exErrors.length
console.log(
  `\nИтого: ${totalFail === 0 ? 'все кейсы проходят' : `проблем: ${totalFail}`}`,
)
process.exit(totalFail === 0 ? 0 : 1)
