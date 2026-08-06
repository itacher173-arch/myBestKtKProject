import type { AnalogTag, ProcessState } from './types'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function approach(current: number, target: number, rate: number) {
  if (Math.abs(target - current) < rate) return target
  return current + Math.sign(target - current) * rate
}

/** Шаг симуляции ~1 с (упрощённый материальный/тепловой баланс по мотивам WPF-прототипа). */
export function tickProcess(p: ProcessState, dtSec: number): ProcessState {
  if (!p.running) return p

  let next = { ...p, simTimeSec: p.simTimeSec + dtSec }

  // Движение задвижек
  const valveStep = 25 * dtSec
  for (const key of ['L1', 'L2', 'L3'] as const) {
    const motionKey = `valve${key}Motion` as const
    const valKey = `valve${key}` as const
    const motion = next[motionKey]
    if (motion === 'opening') {
      next[valKey] = clamp(next[valKey] + valveStep, 0, 100)
      if (next[valKey] >= 100) next[motionKey] = 'idle'
    } else if (motion === 'closing') {
      next[valKey] = clamp(next[valKey] - valveStep, 0, 100)
      if (next[valKey] <= 0) next[motionKey] = 'idle'
    }
  }

  // Разгон насоса
  if (next.pumpN1 === 'starting') {
    // завершается отдельным таймером в контексте; здесь держим давление нарастающим
    next.pressureN1 = approach(next.pressureN1, 8, 4 * dtSec)
  }

  const pumpOn = next.pumpN1 === 'running'
  const feedOpen = next.valveL1 / 100

  if (pumpOn && feedOpen > 0.05) {
    next.feedFlow = approach(next.feedFlow, 120 * feedOpen, 40 * dtSec)
    next.pressureN1 = approach(next.pressureN1, 18 * feedOpen + 1, 6 * dtSec)
  } else if (next.pumpN1 === 'stopped' || next.pumpN1 === 'tripped') {
    next.feedFlow = approach(next.feedFlow, 0, 50 * dtSec)
    next.pressureN1 = approach(next.pressureN1, 0, 8 * dtSec)
  }

  // Температура перед ЭЛОУ (подогрев при наличии потока)
  const tElouTarget = next.feedFlow > 5 ? 110 + next.feedFlow * 0.1 : 25
  next.tempElouIn = approach(next.tempElouIn, tElouTarget, 8 * dtSec)

  // Соли после ЭЛОУ
  let saltTarget = 800
  if (next.demulsifierOn && next.electricFieldOn && next.feedFlow > 5) saltTarget = 40
  else if (next.demulsifierOn || next.electricFieldOn) saltTarget = 200
  else if (next.feedFlow < 1) saltTarget = 50
  next.saltMgL = approach(next.saltMgL, saltTarget, 30 * dtSec)

  next.pressureAfterElou = approach(
    next.pressureAfterElou,
    pumpOn && feedOpen > 0.05 ? 4.5 : 0,
    2 * dtSec,
  )

  // Печь
  const furnaceOn = next.fuelGasPercent > 5 && next.feedFlow > 5
  const tFurnTarget = furnaceOn ? 180 + next.fuelGasPercent * 1.8 : 40
  next.tempFurnaceOut = approach(next.tempFurnaceOut, tFurnTarget, 12 * dtSec)

  next.tempK1Bottom = approach(
    next.tempK1Bottom,
    next.feedFlow > 5 ? 120 + next.tempElouIn * 0.4 : 30,
    6 * dtSec,
  )
  next.pressureK1 = approach(
    next.pressureK1,
    next.feedFlow > 5 ? 2.5 : 0.5,
    0.5 * dtSec,
  )
  next.pressureK2 = approach(
    next.pressureK2,
    furnaceOn ? 0.6 : 0.2,
    0.2 * dtSec,
  )

  // Уровни кубов (условный баланс)
  const inK1 = next.feedFlow * 0.02 * dtSec
  const outK1Top = (next.valveL2 / 100) * next.feedFlow * 0.008 * dtSec
  const outK1Bot = next.feedFlow > 5 ? next.feedFlow * 0.012 * dtSec : 0
  next.levelK1 = clamp(next.levelK1 + inK1 - outK1Top - outK1Bot * 0.3, 5, 95)

  const inK2 = furnaceOn ? outK1Bot : 0
  const outK2 = (next.valveL3 / 100) * (furnaceOn ? next.feedFlow * 0.01 : 0) * dtSec
  next.levelK2 = clamp(next.levelK2 + inK2 - outK2, 5, 95)

  return next
}

export function getAnalogs(p: ProcessState): AnalogTag[] {
  return [
    {
      id: 'PR_351',
      tag: 'PRA351',
      description: 'Давление сырой нефти на выкиде Н-1',
      unit: 'кгс/см²',
      value: p.pressureN1,
      min: 0,
      max: 25,
      alarmLow: 2,
      alarmHigh: 22,
    },
    {
      id: 'TR_41_2',
      tag: 'TR41-2',
      description: 'Температура нефти на входе ЭЛОУ',
      unit: '°C',
      value: p.tempElouIn,
      min: 0,
      max: 160,
      alarmHigh: 140,
    },
    {
      id: 'Q_ELOU',
      tag: 'Q-ELOU',
      description: 'Содержание солей после ЭЛОУ',
      unit: 'мг/л',
      value: p.saltMgL,
      min: 0,
      max: 1000,
      alarmHigh: 100,
    },
    {
      id: 'PRA_312',
      tag: 'PRA312',
      description: 'Давление обессоленной нефти',
      unit: 'кгс/см²',
      value: p.pressureAfterElou,
      min: 0,
      max: 10,
    },
    {
      id: 'LRCA_602',
      tag: 'LRCA602',
      description: 'Уровень в колонне К-1',
      unit: '%',
      value: p.levelK1,
      min: 0,
      max: 100,
      alarmLow: 20,
      alarmHigh: 80,
    },
    {
      id: 'TR_55_1',
      tag: 'TR55-1',
      description: 'Температура на выходе печи',
      unit: '°C',
      value: p.tempFurnaceOut,
      min: 0,
      max: 400,
      alarmHigh: 365,
    },
    {
      id: 'LRCA_604',
      tag: 'LRCA604',
      description: 'Уровень в колонне К-2',
      unit: '%',
      value: p.levelK2,
      min: 0,
      max: 100,
      alarmLow: 20,
      alarmHigh: 80,
    },
  ]
}

export function isAnalogAlarm(tag: {
  value: number
  alarmLow?: number
  alarmHigh?: number
}): boolean {
  if (tag.alarmHigh != null && tag.value >= tag.alarmHigh) return true
  if (tag.alarmLow != null && tag.value <= tag.alarmLow) return true
  return false
}
