import type { AnalogTag, ProcessState } from './types'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function approach(current: number, target: number, rate: number) {
  if (Math.abs(target - current) < rate) return target
  return current + Math.sign(target - current) * rate
}

/**
 * Упрощённый тик ~1 с по мотивам регламента ЭЛОУ-АВТ (§3) и WPF-прототипа.
 * Рабочие окна: К-1 верх 1–4,5 кгс/см²; К-2 верх 0,2–1; печи ≤365 °C; вход ЭЛОУ ≤140 °C;
 * соли после ЭЛОУ — норма обучения ≤5 мг/л.
 */
export function tickProcess(p: ProcessState, dtSec: number): ProcessState {
  if (!p.running) return p

  let next = { ...p, simTimeSec: p.simTimeSec + dtSec }

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

  if (next.pumpN1 === 'starting') {
    next.pressureN1 = approach(next.pressureN1, 8, 4 * dtSec)
  }

  const pumpOn = next.pumpN1 === 'running'
  const feedOpen = next.valveL1 / 100
  const hasFeed = pumpOn && feedOpen > 0.05

  if (hasFeed) {
    // Н-1: расчётное ~19,5 кгс/см² (§9.1.3) при полном открытии Л-1
    next.feedFlow = approach(next.feedFlow, 120 * feedOpen, 40 * dtSec)
    next.pressureN1 = approach(next.pressureN1, 18 * feedOpen + 1, 6 * dtSec)
  } else if (next.pumpN1 === 'stopped' || next.pumpN1 === 'tripped') {
    next.feedFlow = approach(next.feedFlow, 0, 50 * dtSec)
    next.pressureN1 = approach(next.pressureN1, 0, 8 * dtSec)
  }

  // TR41-2: подогрев перед ЭЛОУ, регламент ≤140 °C
  const tElouTarget = next.feedFlow > 5 ? 110 + next.feedFlow * 0.1 : 25
  next.tempElouIn = approach(next.tempElouIn, tElouTarget, 8 * dtSec)

  // Соли после ЭЛОУ (как в WPF Desalter: норма 3, частичный 120, сырая 900)
  let saltTarget = 50
  if (next.feedFlow > 5) {
    if (next.demulsifierOn && next.electricFieldOn) saltTarget = 3
    else if (next.demulsifierOn || next.electricFieldOn) saltTarget = 120
    else saltTarget = 900
  }
  next.saltMgL = approach(next.saltMgL, saltTarget, 40 * dtSec)

  // PRA312: обессоленная нефть, рабочий диапазон ~4,5–10 кгс/см²
  next.pressureAfterElou = approach(
    next.pressureAfterElou,
    hasFeed ? 6 : 0,
    2 * dtSec,
  )

  // Питание К-1 только от теплообменников (без печи) — TR1K-21
  const tK1InTarget = next.feedFlow > 5 ? next.tempElouIn + 8 : 25
  next.tempK1In = approach(next.tempK1In, tK1InTarget, 6 * dtSec)

  next.tempK1Bottom = approach(
    next.tempK1Bottom,
    next.feedFlow > 5 ? 120 + next.tempElouIn * 0.4 : 30,
    6 * dtSec,
  )

  // PRSA204: верх К-1, рабочее 1–4,5 кгс/см²
  next.pressureK1 = approach(
    next.pressureK1,
    next.feedFlow > 5 ? 2.2 : 0.6,
    0.4 * dtSec,
  )

  // Печи П-1…П-3 (атмосферный нагрев отбензиненной нефти к К-2)
  const furnaceOn = next.fuelGasPercent > 5 && next.feedFlow > 5
  const tFurnTarget = furnaceOn ? 180 + next.fuelGasPercent * 1.8 : 40
  next.tempFurnaceOut = approach(next.tempFurnaceOut, tFurnTarget, 12 * dtSec)

  // PRSA213: верх К-2, рабочее 0,2–1 кгс/см²
  next.pressureK2 = approach(
    next.pressureK2,
    furnaceOn ? 0.55 : 0.25,
    0.15 * dtSec,
  )

  const inK1 = next.feedFlow * 0.02 * dtSec
  const outK1Top = (next.valveL2 / 100) * next.feedFlow * 0.008 * dtSec
  const outK1Bot = next.feedFlow > 5 ? next.feedFlow * 0.012 * dtSec : 0
  next.levelK1 = clamp(next.levelK1 + inK1 - outK1Top - outK1Bot * 0.3, 5, 95)

  const inK2 = furnaceOn ? outK1Bot : 0
  const outK2 =
    (next.valveL3 / 100) * (furnaceOn ? next.feedFlow * 0.01 : 0) * dtSec
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
      alarmHigh: 5,
    },
    {
      id: 'PRA_312',
      tag: 'PRA312',
      description: 'Давление обессоленной нефти',
      unit: 'кгс/см²',
      value: p.pressureAfterElou,
      min: 0,
      max: 12,
      alarmHigh: 10,
    },
    {
      id: 'TR1K_21',
      tag: 'TR1K-21',
      description: 'Температура питания колонны К-1',
      unit: '°C',
      value: p.tempK1In,
      min: 0,
      max: 300,
      alarmHigh: 280,
    },
    {
      id: 'PRSA_204',
      tag: 'PRSA204',
      description: 'Давление верха колонны К-1',
      unit: 'кгс/см²',
      value: p.pressureK1,
      min: 0,
      max: 6,
      alarmHigh: 4.5,
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
      description: 'Температура на выходе печей П-1…П-3',
      unit: '°C',
      value: p.tempFurnaceOut,
      min: 0,
      max: 400,
      alarmHigh: 365,
    },
    {
      id: 'PRSA_213',
      tag: 'PRSA213',
      description: 'Давление верха колонны К-2',
      unit: 'кгс/см²',
      value: p.pressureK2,
      min: 0,
      max: 2,
      alarmHigh: 1,
    },    {
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

/** Норма остаточных солей после ЭЛОУ (обучение / WPF MaxNormSaltContent). */
export const SALT_NORM_MG_L = 5
