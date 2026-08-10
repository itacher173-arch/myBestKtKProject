import { createInitialProcess, createWarmProcess } from '../src/simulator/types'
import {
  tickProcess,
  getAnalogs,
  getUtilityAlarms,
} from '../src/simulator/processModel'
import { exercises, getExercise } from '../src/scenarios/exercises'
import { SPEC_SCENARIOS } from '../src/scenarios/catalog'
import {
  applyFault,
  emergencyActionsForFault,
  type FaultType,
} from '../src/simulator/faultEngine'
import { sequenceBlockReason } from '../src/simulator/scenarioGuards'
import { scoreExercise } from '../src/simulator/scoring'
import { CONTROLLABLE_EQUIP_IDS } from '../src/simulator/controllable'
import { equipmentById, equipment } from '../src/scheme'

const errors: string[] = []
const ok = (name: string) => console.log('OK ', name)
const fail = (name: string, msg: string) => {
  errors.push(`${name}: ${msg}`)
  console.log('FAIL', name, '-', msg)
}

ok(`exercises count=${exercises.length}`)
for (const ex of exercises) {
  if (!ex.id || !ex.name || !ex.scenarioSteps?.length) {
    fail(`exercise ${ex.id}`, 'missing fields/steps')
  }
  if (ex.faultType) {
    const acts = emergencyActionsForFault(ex.faultType)
    const hasExpected = (ex.expectedResponseActions?.length ?? 0) > 0
    // MVP-отказы закрываются органами управления; SC — аварийной панелью
    if (!acts.length && !hasExpected) {
      fail(`exercise ${ex.id}`, `no recovery path for ${ex.faultType}`)
    }
  }
}
if (!getExercise('startup')) fail('getExercise', 'startup missing')
if (!getExercise('shutdown')) fail('getExercise', 'shutdown missing')

for (const s of SPEC_SCENARIOS) {
  if (s.status === 'playable' && s.exerciseId) {
    if (!getExercise(s.exerciseId))
      fail(`catalog ${s.specId}`, `missing exercise ${s.exerciseId}`)
  }
}
ok(
  `catalog playable=${SPEC_SCENARIOS.filter((s) => s.status === 'playable').length}`,
)

for (const id of CONTROLLABLE_EQUIP_IDS) {
  if (!equipmentById[id]) fail('controllable', `missing on scheme: ${id}`)
}
ok(`controllable ${CONTROLLABLE_EQUIP_IDS.size} nodes present`)
ok(`equipment total=${equipment.length}`)

let p = { ...createInitialProcess(), running: true }
p.valveL1 = 100
p.pumpN1 = 'running'
for (let i = 0; i < 25; i++) p = tickProcess(p, 1)
if (!(p.feedFlow > 50 && p.pressureN1 > 10))
  fail('cold feed', `F=${p.feedFlow} P=${p.pressureN1}`)
else ok(`cold feed F=${p.feedFlow.toFixed(0)} P=${p.pressureN1.toFixed(1)}`)

p.demulsifierOn = true
p.electricFieldOn = true
p.washWaterOn = true
for (let i = 0; i < 40; i++) p = tickProcess(p, 1)
if (p.saltMgL > 10) fail('elou', `salt=${p.saltMgL}`)
else ok(`elou salt=${p.saltMgL.toFixed(1)}`)

p.pumpN2 = 'running'
p.fuelGasPercent = 60
p.valveL2 = 70
p.valveL3 = 70
for (let i = 0; i < 80; i++) p = tickProcess(p, 1)
if (!(p.tempFurnaceOut > 200 && p.levelK1 > 20))
  fail('furnace', `T=${p.tempFurnaceOut} L=${p.levelK1}`)
else
  ok(
    `furnace T=${p.tempFurnaceOut.toFixed(0)} LK1=${p.levelK1.toFixed(0)}`,
  )

let w = createWarmProcess()
for (let i = 0; i < 60; i++) w = tickProcess(w, 1)
if (Math.abs(w.levelK1 - 50) > 8 || w.saltMgL > 6)
  fail('warm', `L=${w.levelK1} salt=${w.saltMgL}`)
else
  ok(
    `warm stable L=${w.levelK1.toFixed(0)} salt=${w.saltMgL.toFixed(1)} T=${w.tempFurnaceOut.toFixed(0)}`,
  )

const analogs = getAnalogs(w)
if (analogs.length < 8) fail('analogs', `count=${analogs.length}`)
else ok(`analogs ${analogs.length}`)
for (const a of analogs) {
  if (!Number.isFinite(a.value)) fail('analog value', a.id)
}

const faultTypes: FaultType[] = [
  'demulsifier',
  'fuelGas',
  'pumpTrip',
  'steamLoss',
  'powerLoss',
  'opsPowerLoss',
  'coolingWaterLoss',
  'airLoss',
  'coilRupture',
  'pumpLeak',
  'ventOpsLoss',
  'ventElouLoss',
  'highWaterE12',
  'lowLevelK1',
  'lowReflux',
  'h2Loss',
]
for (const ft of faultTypes) {
  try {
    const applied = applyFault(ft)
    if (!applied.patch || !applied.messages?.length) fail(`fault ${ft}`, 'empty')
    const acts = emergencyActionsForFault(ft)
    const viaControls = ['demulsifier', 'fuelGas', 'pumpTrip'].includes(ft)
    if (!acts.length && !viaControls) fail(`fault ${ft}`, 'no clear action')
  } catch (e) {
    fail(`fault ${ft}`, e instanceof Error ? e.message : String(e))
  }
}
ok(`faults ${faultTypes.length} apply (+ clear or control recovery)`)

const cold = createInitialProcess()
cold.running = true
const startup = getExercise('startup')!
let r = sequenceBlockReason({
  exercise: startup,
  process: cold,
  actionLogs: [],
  action: 'start-N1',
})
if (!r) fail('guard N1', 'should block without L-1')
else ok('guard blocks N-1 without L-1')

cold.valveL1 = 100
cold.pumpN1 = 'running'
cold.demulsifierOn = true
cold.electricFieldOn = true
cold.washWaterOn = true
cold.simTimeSec = 20
r = sequenceBlockReason({
  exercise: startup,
  process: { ...cold, pumpN2: 'stopped', pumpN3: 'stopped' },
  actionLogs: [],
  action: 'fuel',
  fuelTarget: 60,
})
if (!r) fail('guard fuel', 'should block without N-2/N-3')
else ok('guard blocks fuel without furnace pumps')

const shut = getExercise('shutdown')!
r = sequenceBlockReason({
  exercise: shut,
  process: { ...createWarmProcess(), fuelGasPercent: 60 },
  actionLogs: [],
  action: 'shutdown-stop-furnace-pump',
})
if (!r) fail('guard shutdown', 'should block stop N-2 with fuel on')
else ok('guard blocks stop N-2 while fuel on')

{
  const scored = scoreExercise({
    exercise: startup,
    process: {
      ...createWarmProcess(),
      pumpN1: 'running',
      feedFlow: 100,
      demulsifierOn: true,
      washWaterOn: true,
      fuelGasPercent: 60,
    },
    actionsLog: (startup.scenarioSteps ?? []).map((description) => ({
      description,
    })),
    faultTriggered: false,
    faultResponded: false,
    respondedInTime: null,
    responseSeconds: null,
  })
  if (!scored.qualified) fail('scoring startup', scored.summary)
  else ok(`scoring startup PASS ${scored.scorePercent}%`)
}

let d = {
  ...createInitialProcess(),
  running: true,
  pumpN1: 'running' as const,
  valveL1: 0,
}
for (let i = 0; i < 20; i++) d = tickProcess(d, 1)
if (!(d.pressureN1 > 20 && d.feedFlow < 1))
  fail('deadhead', `P=${d.pressureN1} F=${d.feedFlow}`)
else ok(`deadhead P=${d.pressureN1.toFixed(1)} F=${d.feedFlow.toFixed(1)}`)

let a = createWarmProcess()
a.avoFanOn = false
for (let i = 0; i < 40; i++) a = tickProcess(a, 1)
if (!(a.pressureK1 > 1.8)) fail('avo', `PK1=${a.pressureK1}`)
else ok(`avo off raises PK1=${a.pressureK1.toFixed(2)}`)

const alarms = getUtilityAlarms({ ...createWarmProcess(), steamOk: false })
if (!alarms.some((x) => x.message.includes('Пар')))
  fail('alarms', 'no steam alarm')
else ok(`utility alarms ok (${alarms.length})`)

// Multistep SC-02…08
for (const id of ['sc02-steam', 'sc03-power', 'sc07-coil', 'sc08-leak'] as const) {
  const ex = getExercise(id)
  const n = ex?.expectedResponseActions?.length ?? 0
  if (n < 2) fail(id, `expected multistep, got ${n}`)
  else ok(`${id} steps=${n}`)
}

{
  const ex = getExercise('sc02-steam')!
  const p = {
    ...createWarmProcess(),
    steamOk: false,
    fuelGasPercent: 0,
    safeShutdownInitiated: true,
  }
  const r = scoreExercise({
    exercise: ex,
    process: p,
    actionsLog: (ex.expectedResponseActions ?? []).map((description) => ({
      description,
    })),
    faultTriggered: true,
    faultResponded: true,
    respondedInTime: true,
    responseSeconds: 30,
  })
  if (!r.outcomeOk) fail('scoring', r.summary)
  else ok(`scoring outcomeOk=${r.outcomeOk} score=${r.scorePercent}`)
}

console.log('\n==== SUMMARY ====')
if (errors.length) {
  console.log('FAILED', errors.length)
  for (const e of errors) console.log(' -', e)
  process.exit(1)
} else {
  console.log('ALL CHECKS PASSED')
}
