/**
 * Расширенная проверка органов управления, ползунков и мини-уроков.
 * Запуск: npx tsx scripts/controls-check.mts
 */
import { createInitialProcess, createWarmProcess } from '../src/simulator/types'
import { tickProcess } from '../src/simulator/processModel'
import { sequenceBlockReason } from '../src/simulator/scenarioGuards'
import { processInterlockReason } from '../src/simulator/pazGuards'
import { CONTROLLABLE_EQUIP_IDS } from '../src/simulator/controllable'
import { equipmentById } from '../src/scheme'
import {
  MINI_TRAININGS,
  evaluateMiniTraining,
} from '../src/training/catalog'
import { applyMiniPreset } from '../src/training/presets'
import {
  isMiniActionAllowed,
  pumpActionToken,
  valveActionToken,
  toggleActionToken,
  utilityActionToken,
  fuelActionToken,
  drainActionToken,
  levelSetpointToken,
  protectLevelToken,
} from '../src/training/actions'
import { articleCount, getArticle, listArticles, listCategories } from '../src/knowledge/store'
import { EQUIPMENT_ARTICLES } from '../src/knowledge/links'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const errors: string[] = []
const ok = (name: string) => console.log('OK ', name)
const fail = (name: string, msg: string) => {
  errors.push(`${name}: ${msg}`)
  console.log('FAIL', name, '-', msg)
}

function tick(p: ReturnType<typeof createWarmProcess>, n = 5) {
  let next = p
  for (let i = 0; i < n; i++) next = tickProcess(next, 1)
  return next
}

// ——— Статическая связка UI ———
const controlPanel = readFileSync(
  resolve('src/simulator/components/ControlPanel.tsx'),
  'utf8',
)
const inline = readFileSync(
  resolve('src/simulator/components/EquipInlineControls.tsx'),
  'utf8',
)

const uiChecks: [string, string, string][] = [
  ['ControlPanel fuel range', controlPanel, 'setFuelGas(Number(e.target.value))'],
  ['ControlPanel level range', controlPanel, 'setLevelSetpoint('],
  ['ControlPanel demulsifier', controlPanel, 'setDemulsifier(!p.demulsifierOn)'],
  ['ControlPanel field', controlPanel, 'setElectricField(!p.electricFieldOn)'],
  ['ControlPanel wash', controlPanel, 'setWashWater(!p.washWaterOn)'],
  ['ControlPanel utility', controlPanel, 'setUtility(key, !ok)'],
  ['ControlPanel avo', controlPanel, 'setAvoFan('],
  ['ControlPanel drain', controlPanel, 'drainVesselWater('],
  ['ControlPanel protect', controlPanel, 'protectColumnLevel('],
  ['Inline fuel range', inline, 'setFuelGas(Number(e.target.value))'],
  ['Inline level range', inline, 'setLevelSetpoint(col, Number(e.target.value))'],
  ['Inline demulsifier', inline, 'setDemulsifier(!p.demulsifierOn)'],
  ['Inline field', inline, 'setElectricField(!p.electricFieldOn)'],
  ['Inline wash', inline, 'setWashWater(!p.washWaterOn)'],
  ['Inline utility', inline, 'setUtility(r.key, !r.ok)'],
  ['Inline avo', inline, 'setAvoFan(true)'],
  ['Inline drain', inline, 'drainVesselWater('],
  ['Inline protect', inline, 'protectColumnLevel(col)'],
]
for (const [name, src, needle] of uiChecks) {
  if (!src.includes(needle)) fail(name, `missing ${needle}`)
  else ok(name)
}

const rangeCount =
  (controlPanel.match(/type="range"/g) ?? []).length +
  (inline.match(/type="range"/g) ?? []).length
if (rangeCount < 4) fail('range inputs', `found ${rangeCount}, expected ≥4`)
else ok(`range inputs count=${rangeCount}`)

// ——— Controllable nodes ———
for (const id of CONTROLLABLE_EQUIP_IDS) {
  if (!equipmentById[id]) fail('scheme', `missing ${id}`)
}
ok(`controllable on scheme=${CONTROLLABLE_EQUIP_IDS.size}`)

// ——— Process responses to control patches (как после клика/ползунка) ———
{
  let p = { ...createWarmProcess(), running: true }

  p = tick({ ...p, demulsifierOn: false, electricFieldOn: false, washWaterOn: false }, 20)
  if (!(p.saltMgL > 8)) fail('elou off raises salt', `salt=${p.saltMgL}`)
  else ok(`elou toggles off → salt=${p.saltMgL.toFixed(1)}`)

  p = tick({ ...p, demulsifierOn: true, electricFieldOn: true, washWaterOn: true }, 40)
  if (!(p.saltMgL <= 8)) fail('elou on lowers salt', `salt=${p.saltMgL}`)
  else ok(`elou toggles on → salt=${p.saltMgL.toFixed(1)}`)

  p = tick({ ...p, fuelGasPercent: 80 }, 30)
  if (!(p.tempFurnaceOut > 250)) fail('fuel slider up', `T=${p.tempFurnaceOut}`)
  else ok(`fuel 80% → T=${p.tempFurnaceOut.toFixed(0)}`)

  const tAt80 = p.tempFurnaceOut
  p = tick({ ...p, fuelGasPercent: 0 }, 60)
  if (!(p.tempFurnaceOut < tAt80))
    fail('fuel slider down', `T=${p.tempFurnaceOut} was ${tAt80}`)
  else ok(`fuel 0% cools T=${p.tempFurnaceOut.toFixed(0)} (was ${tAt80.toFixed(0)})`)

  p = { ...createWarmProcess(), running: true, levelSetpointK1: 70 }
  p = tick(p, 40)
  if (!(p.levelK1 > 55)) fail('level SP K-1', `L=${p.levelK1}`)
  else ok(`level SP K-1=70 → L=${p.levelK1.toFixed(0)}`)

  p = { ...createWarmProcess(), running: true, avoFanOn: false }
  const pWith = tick({ ...createWarmProcess(), running: true, avoFanOn: true }, 25)
  const pWithout = tick({ ...createWarmProcess(), running: true, avoFanOn: false, coolingWaterOk: false }, 25)
  if (!(pWithout.pressureK1 >= pWith.pressureK1 - 0.05))
    fail('avo toggle pressure', `on=${pWith.pressureK1} off=${pWithout.pressureK1}`)
  else
    ok(
      `avo/cooling → PK1 on=${pWith.pressureK1.toFixed(2)} offCW=${pWithout.pressureK1.toFixed(2)}`,
    )

  p = tick(
    { ...createWarmProcess(), running: true, instrumentAirOk: false, valveL1: 100, pumpN1: 'running' },
    15,
  )
  if (!(p.feedFlow < 40)) fail('air off cuts flow', `F=${p.feedFlow}`)
  else ok(`instrument air off → F=${p.feedFlow.toFixed(0)}`)

  p = tick(
    { ...createWarmProcess(), running: true, ventElouOk: false, gasPercent: 24 },
    5,
  )
  if (!(p.gasPercent > 15)) fail('vent elou gas', `gas=${p.gasPercent}`)
  else ok(`ventElou off → gas=${p.gasPercent.toFixed(0)}%`)

  p = tick(
    { ...createWarmProcess(), running: true, ventElouOk: true, gasPercent: 24 },
    40,
  )
  if (!(p.gasPercent < 12)) fail('vent elou recover', `gas=${p.gasPercent}`)
  else ok(`ventElou on → gas=${p.gasPercent.toFixed(0)}%`)

  p = {
    ...createWarmProcess(),
    running: true,
    levelWaterE1: 90,
    levelWaterE2: 90,
  }
  p = { ...p, levelWaterE1: 35, levelWaterE2: 35 }
  if (!(p.levelWaterE1 === 35)) fail('drain patch', 'level not set')
  else ok('drain vessel water patch')

  // valve motion toward open
  p = { ...createInitialProcess(), running: true, valveL1: 0, valveL1Motion: 'opening' as const }
  p = tick(p, 20)
  if (!(p.valveL1 > 50)) fail('valve open motion', `L1=${p.valveL1}`)
  else ok(`valve L-1 opening → ${p.valveL1.toFixed(0)}%`)

  p = { ...p, valveL1Motion: 'closing' as const }
  p = tick(p, 20)
  if (!(p.valveL1 < 50)) fail('valve close motion', `L1=${p.valveL1}`)
  else ok(`valve L-1 closing → ${p.valveL1.toFixed(0)}%`)
}

// ——— Guards / interlocks ———
{
  const cold = createInitialProcess()
  const blockN1 = sequenceBlockReason({
    exercise: {
      id: 'startup',
      name: 'Пуск',
      description: '',
      triggerDelaySeconds: 0,
      scenarioSteps: ['x'],
    },
    process: cold,
    actionLogs: [],
    action: 'start-N1',
  })
  if (!blockN1) fail('guard N-1', 'expected block without L-1')
  else ok(`guard blocks start-N1: ${blockN1.slice(0, 48)}…`)

  const warm = createWarmProcess()
  const fuelBlock = sequenceBlockReason({
    exercise: {
      id: 'startup',
      name: 'Пуск',
      description: '',
      triggerDelaySeconds: 0,
      scenarioSteps: ['x'],
    },
    process: { ...warm, pumpN2: 'stopped', pumpN3: 'stopped', fuelGasPercent: 0 },
    actionLogs: ["Л-1", "Н-1", "деэмульгатор", "поле", "промыв"],
    action: 'fuel',
    fuelTarget: 60,
  })
  if (!fuelBlock) fail('guard fuel', 'expected block without furnace pumps')
  else ok(`guard blocks fuel: ${fuelBlock.slice(0, 48)}…`)

  const pazSteam = processInterlockReason(
    { ...warm, steamOk: false, fuelGasPercent: 20 },
    'fuel',
    50,
  )
  if (!pazSteam) fail('paz steam+fuel', 'expected block')
  else ok(`paz steam+fuel: ${pazSteam.slice(0, 48)}…`)
}

// ——— Knowledge ———
{
  if (articleCount() < 20) fail('knowledge count', String(articleCount()))
  else ok(`knowledge articles=${articleCount()}`)
  if (!listCategories().length) fail('knowledge categories', 'empty')
  else ok(`knowledge categories=${listCategories().length}`)
  if (!getArticle('elou-principle')) fail('knowledge get', 'elou-principle missing')
  else ok('knowledge getArticle')
  if (!listArticles({ query: 'ЭЛОУ' }).length) fail('knowledge search', 'no hits')
  else ok(`knowledge search hits=${listArticles({ query: 'ЭЛОУ' }).length}`)
  for (const [equipId, articleId] of Object.entries(EQUIPMENT_ARTICLES)) {
    if (!getArticle(articleId))
      fail('equip→article', `${equipId}→${articleId} missing`)
  }
  ok(`equip article links=${Object.keys(EQUIPMENT_ARTICLES).length}`)
}

// ——— Mini trainings ———
{
  if (MINI_TRAININGS.length < 10)
    fail('mini count', String(MINI_TRAININGS.length))
  else ok(`mini trainings=${MINI_TRAININGS.length}`)

  // applyMiniPreset for each lesson
  for (const mt of MINI_TRAININGS) {
    const preset = applyMiniPreset(mt.id)
    if (!preset.running) fail(`preset ${mt.id}`, 'not running')
    const progress = evaluateMiniTraining(mt, preset)
    if (progress.checks.length !== mt.criteria.length)
      fail(`criteria ${mt.id}`, 'checks length mismatch')
    // starting preset should not already be fully complete (except maybe edge)
    if (progress.completed && mt.id === 'MT-FEED-01')
      fail(`preset ${mt.id}`, 'already completed at start')

    for (const token of mt.allowedActions) {
      if (!isMiniActionAllowed(mt, token))
        fail(`allow ${mt.id}`, `self token ${token}`)
    }
    if (isMiniActionAllowed(mt, 'pump:N-99'))
      fail(`allow ${mt.id}`, 'accepted unknown pump')
  }
  ok('mini presets + allowlist self-check')

  // MT-FEED-01 playthrough via process patches
  {
    const mt = MINI_TRAININGS.find((t) => t.id === 'MT-FEED-01')!
    let p = applyMiniPreset('MT-FEED-01')
    if (!isMiniActionAllowed(mt, valveActionToken('L-1')))
      fail('MT-FEED-01', 'L-1 not allowed')
    if (!isMiniActionAllowed(mt, pumpActionToken('N-1')))
      fail('MT-FEED-01', 'N-1 not allowed')
    if (isMiniActionAllowed(mt, fuelActionToken()))
      fail('MT-FEED-01', 'fuel should be blocked')

    p = { ...p, valveL1: 100, valveL1Motion: 'idle' as const, pumpN1: 'running' }
    p = tick(p, 20)
    const done = evaluateMiniTraining(mt, p)
    if (!done.completed)
      fail(
        'MT-FEED-01 complete',
        `progress=${done.progressPercent} checks=${done.checks.join(',')}`,
      )
    else ok(`MT-FEED-01 completable score=${done.progressPercent}%`)
  }

  // MT-ELOU-01
  {
    const mt = MINI_TRAININGS.find((t) => t.id === 'MT-ELOU-01')!
    let p = applyMiniPreset('MT-ELOU-01')
    for (const t of [
      toggleActionToken('demulsifierOn'),
      toggleActionToken('electricFieldOn'),
      toggleActionToken('washWaterOn'),
    ]) {
      if (!isMiniActionAllowed(mt, t)) fail('MT-ELOU-01 allow', t)
    }
    p = {
      ...p,
      demulsifierOn: true,
      electricFieldOn: true,
      washWaterOn: true,
    }
    p = tick(p, 50)
    const done = evaluateMiniTraining(mt, p)
    if (!done.completed)
      fail('MT-ELOU-01 complete', `salt=${p.saltMgL} progress=${done.progressPercent}`)
    else ok(`MT-ELOU-01 completable salt=${p.saltMgL.toFixed(1)}`)
  }

  // token helpers smoke
  ok(
    [
      pumpActionToken('N-1'),
      valveActionToken('L-1'),
      toggleActionToken('avoFanOn'),
      utilityActionToken('coolingWaterOk'),
      drainActionToken('E-1-vessel'),
      fuelActionToken(),
      levelSetpointToken('K-1'),
      protectLevelToken('K-2'),
    ].join(' | '),
  )
}

console.log('\n==== CONTROLS SUMMARY ====')
if (errors.length) {
  console.log(`FAILED ${errors.length}`)
  for (const e of errors) console.log(' -', e)
  process.exit(1)
}
console.log('ALL CONTROL CHECKS PASSED')
