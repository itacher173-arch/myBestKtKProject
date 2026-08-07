import type { AnalogTag, ProcessState } from './types'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function approach(current: number, target: number, rate: number) {
  if (Math.abs(target - current) < rate) return target
  return current + Math.sign(target - current) * rate
}

/**
 * Упрощённый тик ~1 с. Учитывает утилиты и аварийные флаги SC-02…SC-15.
 */
export function tickProcess(p: ProcessState, dtSec: number): ProcessState {
  if (!p.running) return p

  let next = { ...p, simTimeSec: p.simTimeSec + dtSec }

  // SC-04: разряд АКБ операторной
  if (next.opsPowerOnBattery && !next.opsPowerOk) {
    next.batteryMinutesLeft = Math.max(
      0,
      next.batteryMinutesLeft - dtSec / 60,
    )
  }

  const airOk = next.instrumentAirOk
  const powerOk = next.powerOk
  const steamOk = next.steamOk

  const valveStep = airOk ? 25 * dtSec : 0
  for (const key of ['L1', 'L2', 'L3'] as const) {
    const motionKey = `valve${key}Motion` as const
    const valKey = `valve${key}` as const
    const motion = next[motionKey]
    if (!airOk) {
      next[motionKey] = 'idle'
      continue
    }
    if (motion === 'opening') {
      next[valKey] = clamp(next[valKey] + valveStep, 0, 100)
      if (next[valKey] >= 100) next[motionKey] = 'idle'
    } else if (motion === 'closing') {
      next[valKey] = clamp(next[valKey] - valveStep, 0, 100)
      if (next[valKey] <= 0) next[motionKey] = 'idle'
    }
  }

  if (!powerOk && next.pumpN1 === 'running') {
    next.pumpN1 = 'tripped'
  }

  if (next.pumpN1 === 'starting' && powerOk) {
    next.pressureN1 = approach(next.pressureN1, 8, 4 * dtSec)
  }

  const pumpOn = next.pumpN1 === 'running' && powerOk
  const feedOpen = next.valveL1 / 100
  const hasFeed = pumpOn && feedOpen > 0.05

  if (hasFeed) {
    next.feedFlow = approach(next.feedFlow, 120 * feedOpen, 40 * dtSec)
    next.pressureN1 = approach(next.pressureN1, 18 * feedOpen + 1, 6 * dtSec)
  } else if (
    next.pumpN1 === 'stopped' ||
    next.pumpN1 === 'tripped' ||
    !powerOk
  ) {
    next.feedFlow = approach(next.feedFlow, 0, 50 * dtSec)
    next.pressureN1 = approach(next.pressureN1, 0, 8 * dtSec)
  }

  const tElouTarget = next.feedFlow > 5 ? 110 + next.feedFlow * 0.1 : 25
  next.tempElouIn = approach(next.tempElouIn, tElouTarget, 8 * dtSec)

  let saltTarget = 50
  if (next.feedFlow > 5) {
    if (next.demulsifierOn && next.electricFieldOn) saltTarget = 3
    else if (next.demulsifierOn || next.electricFieldOn) saltTarget = 120
    else saltTarget = 900
  }
  next.saltMgL = approach(next.saltMgL, saltTarget, 40 * dtSec)

  next.pressureAfterElou = approach(
    next.pressureAfterElou,
    hasFeed ? 6 : 0,
    2 * dtSec,
  )

  const tK1InTarget = next.feedFlow > 5 ? next.tempElouIn + 8 : 25
  next.tempK1In = approach(next.tempK1In, tK1InTarget, 6 * dtSec)

  let tBottomTarget =
    next.feedFlow > 5 ? 120 + next.tempElouIn * 0.4 : 30
  if (!next.coolingWaterOk) tBottomTarget += 40
  next.tempK1Bottom = approach(next.tempK1Bottom, tBottomTarget, 6 * dtSec)

  let pK1Target = next.feedFlow > 5 ? 2.2 : 0.6
  if (next.levelWaterE1 > 85 || next.levelWaterE2 > 85) pK1Target += 1.8
  if (!next.coolingWaterOk) pK1Target += 0.8
  if (next.levelReflux < 15 && next.feedFlow > 5) pK1Target += 0.3
  next.pressureK1 = approach(next.pressureK1, pK1Target, 0.5 * dtSec)

  // Печи: без пара / ESD / coil — нет устойчивого нагрева
  const burnersOk =
    steamOk && !next.coilRupture && !next.furnaceEsd && powerOk
  const furnaceOn =
    burnersOk && next.fuelGasPercent > 5 && next.feedFlow > 5
  let tFurnTarget = furnaceOn ? 180 + next.fuelGasPercent * 1.8 : 40
  if (!next.coolingWaterOk && furnaceOn) tFurnTarget += 25
  if (next.coilRupture) tFurnTarget = 80
  next.tempFurnaceOut = approach(next.tempFurnaceOut, tFurnTarget, 12 * dtSec)

  let pK2Target = furnaceOn ? 0.55 : 0.25
  if (!next.coolingWaterOk) pK2Target += 0.35
  if (!next.h2GasOk) pK2Target += 0.15
  next.pressureK2 = approach(next.pressureK2, pK2Target, 0.2 * dtSec)

  // Вода в E-1/E-2: при высоком уровне медленно растёт, пока не сдренируют
  if (next.levelWaterE1 > 80) {
    next.levelWaterE1 = clamp(next.levelWaterE1 + 0.4 * dtSec, 0, 98)
  }
  if (next.levelWaterE2 > 80) {
    next.levelWaterE2 = clamp(next.levelWaterE2 + 0.4 * dtSec, 0, 98)
  }
  if (next.levelReflux < 20 && next.feedFlow > 5) {
    next.levelReflux = clamp(next.levelReflux - 0.3 * dtSec, 0, 100)
  }

  const inK1 = next.feedFlow * 0.02 * dtSec
  const outK1Top = (next.valveL2 / 100) * next.feedFlow * 0.008 * dtSec
  const outK1Bot = next.feedFlow > 5 ? next.feedFlow * 0.012 * dtSec : 0
  let levelK1 = next.levelK1 + inK1 - outK1Top - outK1Bot * 0.3
  if (next.levelK1 < 20 && furnaceOn) {
    // ускоренное опорожнение при низком уровне и работе печи (риск)
    levelK1 -= 0.15 * dtSec
  }
  next.levelK1 = clamp(levelK1, 5, 95)

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

export const SALT_NORM_MG_L = 5

export function getUtilityAlarms(p: ProcessState): string[] {
  const a: string[] = []
  if (!p.steamOk) a.push('Пар: НЕТ')
  if (!p.powerOk) a.push('Питание 0,4/6 кВ: НЕТ')
  if (!p.opsPowerOk)
    a.push(
      p.opsPowerOnBattery
        ? `Операторная: АКБ ${p.batteryMinutesLeft.toFixed(0)} мин`
        : 'Операторная: НЕТ питания',
    )
  if (!p.coolingWaterOk) a.push('Оборотная вода: НЕТ')
  if (!p.instrumentAirOk) a.push('Приборный воздух: НЕТ')
  if (!p.ventOpsOk) a.push('Вентиляция РУ: НЕТ')
  if (!p.ventElouOk) a.push('Вентиляция ЭЛОУ: НЕТ')
  if (!p.h2GasOk) a.push('H₂-газ K-12: НЕТ')
  if (p.coilRupture) a.push('Змеевик печи: РАЗРЫВ')
  if (p.pumpLeak) a.push('Утечка насоса/фланца')
  if (p.levelWaterE1 > 85) a.push(`E-1 вода ${p.levelWaterE1.toFixed(0)}%`)
  if (p.levelWaterE2 > 85) a.push(`E-2 вода ${p.levelWaterE2.toFixed(0)}%`)
  if (p.levelReflux < 15) a.push(`Рефлюкс ${p.levelReflux.toFixed(0)}%`)
  if (p.levelK1 < 20) a.push(`K-1 уровень ${p.levelK1.toFixed(0)}%`)
  return a
}
