import type { AnalogTag, ProcessState } from './types'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function approach(current: number, target: number, ratePerSec: number, dt: number) {
  const step = ratePerSec * dt
  if (Math.abs(target - current) <= step) return target
  return current + Math.sign(target - current) * step
}

/** Лёгкий «живой» шум на приборах (только отображение). */
function instrumentJitter(value: number, amp: number, t: number, phase: number) {
  return value + amp * Math.sin(t * 0.85 + phase)
}

/**
 * Тик ~1 с. Цепочка: сырьё → ЭЛОУ → К-1 → Н-2/Н-3 → печи → К-2,
 * с утилитами, АВО, рефлюксом и LIC по уровню.
 */
export function tickProcess(p: ProcessState, dtSec: number): ProcessState {
  if (!p.running) return p

  const next = { ...p, simTimeSec: p.simTimeSec + dtSec }
  const dt = dtSec

  // ——— SC-04: АКБ операторной ———
  if (next.opsPowerOnBattery && !next.opsPowerOk) {
    next.batteryMinutesLeft = Math.max(0, next.batteryMinutesLeft - dt / 60)
  }

  const airOk = next.instrumentAirOk
  const powerOk = next.powerOk
  const steamOk = next.steamOk

  // Приводы задвижек ~12–15 с на полный ход (без воздуха — стоп)
  const valveStep = airOk ? 7.5 * dt : 0
  for (const key of ['L1', 'L2', 'L3'] as const) {
    const motionKey = `valve${key}Motion` as const
    const valKey = `valve${key}` as const
    if (!airOk) {
      next[motionKey] = 'idle'
      continue
    }
    const motion = next[motionKey]
    if (motion === 'opening') {
      next[valKey] = clamp(next[valKey] + valveStep, 0, 100)
      if (next[valKey] >= 100) next[motionKey] = 'idle'
    } else if (motion === 'closing') {
      next[valKey] = clamp(next[valKey] - valveStep, 0, 100)
      if (next[valKey] <= 0) next[motionKey] = 'idle'
    }
  }

  // Потеря питания → отключение насосов
  if (!powerOk) {
    if (next.pumpN1 === 'running' || next.pumpN1 === 'starting') {
      next.pumpN1 = 'tripped'
    }
    if (next.pumpN2 === 'running' || next.pumpN2 === 'starting') {
      next.pumpN2 = 'tripped'
    }
    if (next.pumpN3 === 'running' || next.pumpN3 === 'starting') {
      next.pumpN3 = 'tripped'
    }
  }

  // ——— Сырьевой насос Н-1: расход и напор ———
  const l1 = next.valveL1 / 100
  const leakFactor = next.pumpLeak ? 0.65 : 1
  let flowTarget = 0
  let pN1Target = 0

  if (next.pumpN1 === 'starting' && powerOk) {
    // Набор оборотов: давление растёт, расход ещё мал
    pN1Target = 6 + 4 * l1
    flowTarget = 15 * l1 * leakFactor
  } else if (next.pumpN1 === 'running' && powerOk) {
    if (l1 < 0.03) {
      // Закрытая задвижка — «тупик», высокий напор, расход ≈ 0
      pN1Target = 22.5 * leakFactor
      flowTarget = 0
    } else {
      // Характеристика: больше открытие → больше расход, чуть ниже напор
      flowTarget = (105 * l1 + 8) * leakFactor
      pN1Target = (19.5 - 2.2 * l1) * leakFactor
    }
  } else {
    flowTarget = 0
    pN1Target = 0
  }

  // Потеря приборного воздуха — клапаны «плывут», расход падает
  if (!airOk && flowTarget > 0) {
    flowTarget *= 0.18
    pN1Target *= 0.55
  }

  next.feedFlow = approach(next.feedFlow, flowTarget, 28, dt)
  next.pressureN1 = approach(next.pressureN1, pN1Target, 5.5, dt)

  const F = next.feedFlow
  const hasFeed = F > 4

  // ——— ЭЛОУ: температура входа (подогрев от «хвоста» процесса) ———
  // Чем горячее низ К-1 / выход печей — тем лучше предварительный нагрев сырья
  const preheatDuty =
    0.35 * clamp((next.tempK1Bottom - 40) / 140, 0, 1) +
    0.45 * clamp((next.tempFurnaceOut - 50) / 280, 0, 1) +
    0.2 * clamp(F / 100, 0, 1)
  let tElouTarget = 22
  if (hasFeed) {
    tElouTarget = 48 + 62 * preheatDuty + F * 0.05
    if (!next.coolingWaterOk) tElouTarget += 8
  }
  next.tempElouIn = approach(next.tempElouIn, clamp(tElouTarget, 20, 138), 3.2, dt)

  // Соли: нужны деэмульгатор + поле + промывка; высокий расход ухудшает качество
  let saltTarget = hasFeed ? 180 : 45
  if (hasFeed) {
    const dem = next.demulsifierOn
    const field = next.electricFieldOn
    const wash = next.washWaterOn
    const overload = clamp((F - 95) / 80, 0, 1)
    if (dem && field && wash) {
      saltTarget = 2.6 + overload * 1.8
    } else if (dem && field) {
      saltTarget = 18 + overload * 12
    } else if (dem && wash) {
      saltTarget = 48 + overload * 20
    } else if (field && wash) {
      saltTarget = 60 + overload * 25
    } else if (dem || field || wash) {
      saltTarget = 130 + overload * 40
    } else {
      saltTarget = 850
    }
  }
  // соли меняются медленнее температуры (инерция анализатора / объём)
  next.saltMgL = approach(next.saltMgL, saltTarget, 18, dt)

  let waterTarget = hasFeed ? 0.55 : 0.2
  if (hasFeed) {
    const dem = next.demulsifierOn
    const field = next.electricFieldOn
    const wash = next.washWaterOn
    if (dem && field && wash) waterTarget = 0.09
    else if (dem && field) waterTarget = 0.22
    else if (dem || field || wash) waterTarget = 0.35
    else waterTarget = 0.7
  }
  next.waterAfterElou = approach(next.waterAfterElou, waterTarget, 0.04, dt)

  // Загазованность: вентиляция ЭЛОУ снижает % НКПР
  const gasTarget = next.ventElouOk ? 4 : 28
  next.gasPercent = approach(next.gasPercent, gasTarget, 1.2, dt)

  // Давление после ЭЛОУ: ниже напора Н-1, растёт с расходом, падает при потерях
  let pElouTarget = 0
  if (hasFeed && next.pumpN1 === 'running') {
    pElouTarget = clamp(2.2 + F * 0.042 - (next.pumpLeak ? 0.8 : 0), 1.5, 9.5)
  }
  next.pressureAfterElou = approach(next.pressureAfterElou, pElouTarget, 1.4, dt)

  // Водоотделители: в норме дрейф к ~42%; при промывке медленный рост;
  // выше 82% — ускоренный рост (риск заноса) до дренажа
  if (next.levelWaterE1 > 82 || next.levelWaterE2 > 82) {
    if (next.levelWaterE1 > 82) {
      next.levelWaterE1 = clamp(next.levelWaterE1 + 0.4 * dt, 0, 98)
    }
    if (next.levelWaterE2 > 82) {
      next.levelWaterE2 = clamp(next.levelWaterE2 + 0.4 * dt, 0, 98)
    }
  } else if (next.washWaterOn && hasFeed) {
    next.levelWaterE1 = approach(next.levelWaterE1, 58, 0.12, dt)
    next.levelWaterE2 = approach(next.levelWaterE2, 55, 0.1, dt)
  } else if (hasFeed) {
    next.levelWaterE1 = approach(next.levelWaterE1, 40, 0.4, dt)
    next.levelWaterE2 = approach(next.levelWaterE2, 40, 0.4, dt)
  }

  // ——— Питание К-1 ———
  let tK1InTarget = 22
  if (hasFeed) {
    tK1InTarget = next.tempElouIn + 6 + 18 * clamp((next.tempFurnaceOut - 80) / 250, 0, 1)
  }
  next.tempK1In = approach(next.tempK1In, clamp(tK1InTarget, 20, 290), 2.8, dt)

  // ——— Подача в печи Н-2/Н-3 (из куба К-1) ———
  const pumpsFurnace =
    Number(next.pumpN2 === 'running' && powerOk) +
    Number(next.pumpN3 === 'running' && powerOk)
  // при низком уровне — срыв/недостаток питания печей
  const levelFeedFactor = clamp((next.levelK1 - 8) / 40, 0, 1.15)
  const furnaceCharge =
    pumpsFurnace > 0 && hasFeed
      ? (38 + F * 0.22) * (pumpsFurnace === 2 ? 1.05 : 0.78) * levelFeedFactor
      : 0

  const burnersOk =
    steamOk && !next.coilRupture && !next.furnaceEsd && powerOk && pumpsFurnace > 0
  const fuel = next.fuelGasPercent
  const furnaceFiring = burnersOk && fuel > 4 && furnaceCharge > 5

  // Выход печей: больше топлива → выше T; больше заряд → ниже T (недогрев)
  let tFurnTarget = 35
  if (furnaceFiring) {
    // ~288 °C при fuel=60% и нормальном заряде
    const heat = 155 + fuel * 3.05
    const quench = furnaceCharge * 0.72
    tFurnTarget = heat - quench + next.tempK1Bottom * 0.12
    if (!next.coolingWaterOk) tFurnTarget += 18
    if (!next.avoFanOn) tFurnTarget += 8
  } else if (next.coilRupture) {
    tFurnTarget = 70
  } else if (burnersOk && fuel > 4 && furnaceCharge <= 5) {
    // горелки есть, а сырья в змеевик мало → риск перегрева
    tFurnTarget = 140 + fuel * 3.1
  }
  next.tempFurnaceOut = approach(
    next.tempFurnaceOut,
    clamp(tFurnTarget, 25, 395),
    furnaceFiring ? 4.5 : 6.5,
    dt,
  )

  // Низ К-1: греется от куба / циркуляции с печами
  let tBottomTarget = 28
  if (hasFeed) {
    tBottomTarget =
      70 +
      next.tempElouIn * 0.25 +
      (furnaceFiring ? next.tempFurnaceOut * 0.22 : 0) +
      fuel * 0.15
    if (!next.coolingWaterOk) tBottomTarget += 28
    if (!next.avoFanOn) tBottomTarget += 12
  }
  next.tempK1Bottom = approach(
    next.tempK1Bottom,
    clamp(tBottomTarget, 25, 275),
    2.5,
    dt,
  )

  // ——— Рефлюкс / конденсация верха (АВО + оборотная вода) ———
  const condensing =
    (next.avoFanOn ? 1 : 0.15) *
    (next.coolingWaterOk ? 1 : 0.35) *
    (hasFeed ? 1 : 0.2)
  const refluxTarget = furnaceFiring
    ? clamp(25 + condensing * 45 - (1 - next.valveL2 / 100) * 8, 5, 85)
    : hasFeed
      ? 35 * condensing
      : 50
  next.levelReflux = approach(next.levelReflux, refluxTarget, 1.8, dt)
  if (next.levelReflux < 18 && hasFeed) {
    next.levelReflux = clamp(next.levelReflux - 0.25 * dt, 0, 100)
  }

  // ——— Давление верха К-1 ———
  const waterCarry =
    next.levelWaterE1 > 85 || next.levelWaterE2 > 85
      ? 1.6 + 0.02 * Math.max(next.levelWaterE1, next.levelWaterE2)
      : 0
  const vaporLoad =
    (hasFeed ? 0.9 : 0) +
    (furnaceFiring ? 0.7 + fuel * 0.008 : 0) +
    clamp((next.tempK1Bottom - 100) / 120, 0, 1.2)
  const condensation =
    condensing * 1.1 +
    clamp(next.levelReflux / 55, 0, 1.2) +
    (next.valveL2 / 100) * 0.35
  let pK1Target = 0.55 + vaporLoad * 0.85 - condensation * 0.55 + waterCarry
  if (!next.h2GasOk) pK1Target += 0.1
  pK1Target = clamp(pK1Target, 0.4, 5.8)
  next.pressureK1 = approach(next.pressureK1, pK1Target, 0.28, dt)

  // ——— Давление верха К-2 ———
  let pK2Target = 0.22
  if (furnaceFiring) {
    pK2Target =
      0.35 +
      fuel * 0.0035 +
      furnaceCharge * 0.0012 -
      (next.coolingWaterOk ? 0.08 : -0.25) -
      (next.avoFanOn ? 0.04 : -0.12)
  }
  if (!next.h2GasOk) pK2Target += 0.12
  next.pressureK2 = approach(next.pressureK2, clamp(pK2Target, 0.15, 1.6), 0.12, dt)

  // ——— Баланс уровней К-1 / К-2 + LIC ———
  const inK1 = F * 0.012 * dt
  const outTop =
    (next.valveL2 / 100) *
    (0.0035 * F + 0.28 * clamp(next.pressureK1 - 0.8, 0, 3)) *
    dt
  const outToFurnace = furnaceCharge * 0.011 * dt

  // LIC: при уровне выше задания — сильнее отбор в низ/печной тракт
  const errK1 = next.levelK1 - next.levelSetpointK1
  const licOutK1 =
    clamp(0.7 + errK1 * 0.08, 0.12, 2.2) * (hasFeed ? 1 : 0.12)
  const outLicK1 = licOutK1 * 0.85 * dt

  let levelK1 = next.levelK1 + inK1 - outTop - outToFurnace - outLicK1
  // перегрев куба при низком уровне и огне — «выкипание»
  if (next.levelK1 < 22 && furnaceFiring) {
    levelK1 -= 0.22 * dt * (fuel / 60)
  }
  // доводка LIC к уставке (медленный контур)
  if (hasFeed) {
    levelK1 = approach(levelK1, next.levelSetpointK1, 0.55, dt)
  }
  next.levelK1 = clamp(levelK1, 4, 96)

  // К-2: приход после печей, уход мазутом через Л-3 + LIC
  const inK2 = furnaceFiring ? outToFurnace * 0.9 + outLicK1 * 0.65 : 0
  const errK2 = next.levelK2 - next.levelSetpointK2
  const licOutK2 = clamp(0.85 + errK2 * 0.09, 0.2, 2.4)
  const outK2Prod =
    (next.valveL3 / 100) * (furnaceFiring ? 1.35 : 0.08) * licOutK2 * dt
  let levelK2 = next.levelK2 + inK2 - outK2Prod
  if (furnaceFiring || hasFeed) {
    levelK2 = approach(levelK2, next.levelSetpointK2, 0.5, dt)
  } else {
    levelK2 = approach(levelK2, 42, 0.35, dt)
  }
  next.levelK2 = clamp(levelK2, 4, 96)

  return next
}

export function getAnalogs(p: ProcessState): AnalogTag[] {
  const t = p.simTimeSec
  return [
    {
      id: 'PR_351',
      tag: 'PRA351',
      description: 'Давление сырой нефти на выкиде Н-1',
      unit: 'кгс/см²',
      value: instrumentJitter(p.pressureN1, 0.08, t, 0.2),
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
      value: instrumentJitter(p.tempElouIn, 0.35, t, 1.1),
      min: 0,
      max: 160,
      alarmHigh: 140,
    },
    {
      id: 'Q_ELOU',
      tag: 'Q-ELOU',
      description: 'Содержание солей после ЭЛОУ',
      unit: 'мг/л',
      value: instrumentJitter(p.saltMgL, p.saltMgL > 20 ? 1.2 : 0.08, t, 2.0),
      min: 0,
      max: 1000,
      alarmHigh: 5,
    },
    {
      id: 'PRA_312',
      tag: 'PRA312',
      description: 'Давление обессоленной нефти',
      unit: 'кгс/см²',
      value: instrumentJitter(p.pressureAfterElou, 0.05, t, 0.7),
      min: 0,
      max: 12,
      alarmHigh: 10,
    },
    {
      id: 'TR1K_21',
      tag: 'TR1K-21',
      description: 'Температура питания колонны К-1',
      unit: '°C',
      value: instrumentJitter(p.tempK1In, 0.4, t, 1.4),
      min: 0,
      max: 300,
      alarmHigh: 280,
    },
    {
      id: 'PRSA_204',
      tag: 'PRSA204',
      description: 'Давление верха колонны К-1',
      unit: 'кгс/см²',
      value: instrumentJitter(p.pressureK1, 0.015, t, 2.2),
      min: 0,
      max: 6,
      alarmHigh: 4.5,
    },
    {
      id: 'LRCA_602',
      tag: 'LRCA602',
      description: 'Уровень в колонне К-1',
      unit: '%',
      value: instrumentJitter(p.levelK1, 0.15, t, 0.5),
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
      value: instrumentJitter(p.tempFurnaceOut, 0.5, t, 3.1),
      min: 0,
      max: 400,
      alarmHigh: 365,
    },
    {
      id: 'PRSA_213',
      tag: 'PRSA213',
      description: 'Давление верха колонны К-2',
      unit: 'кгс/см²',
      value: instrumentJitter(p.pressureK2, 0.008, t, 1.8),
      min: 0,
      max: 2,
      alarmHigh: 1,
    },
    {
      id: 'LRCA_604',
      tag: 'LRCA604',
      description: 'Уровень в колонне К-2',
      unit: '%',
      value: instrumentJitter(p.levelK2, 0.15, t, 2.6),
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

/** Приоритет: 1 — критический, 2 — высокий, 3 — предупреждение */
export type AlarmPriority = 1 | 2 | 3

export interface UtilityAlarm {
  key: string
  message: string
  priority: AlarmPriority
}

export function getUtilityAlarms(p: ProcessState): UtilityAlarm[] {
  const a: UtilityAlarm[] = []
  const push = (key: string, message: string, priority: AlarmPriority) => {
    a.push({ key, message, priority })
  }
  if (!p.steamOk) push('steam', 'Пар: НЕТ', 1)
  if (!p.powerOk) push('power', 'Питание 0,4/6 кВ: НЕТ', 1)
  if (!p.opsPowerOk)
    push(
      'opsPower',
      p.opsPowerOnBattery
        ? `Операторная: АКБ ${p.batteryMinutesLeft.toFixed(0)} мин`
        : 'Операторная: НЕТ питания',
      p.opsPowerOnBattery ? 2 : 1,
    )
  if (!p.coolingWaterOk) push('cooling', 'Оборотная вода: НЕТ', 1)
  if (!p.instrumentAirOk) push('air', 'Приборный воздух: НЕТ', 1)
  if (!p.ventOpsOk) push('ventOps', 'Вентиляция РУ: НЕТ', 2)
  if (!p.ventElouOk) push('ventElou', 'Вентиляция ЭЛОУ: НЕТ', 2)
  if (p.gasPercent >= 20)
    push('gas', `Загазованность ${p.gasPercent.toFixed(0)}% НКПР`, 1)
  if (p.waterAfterElou > 0.15 && p.feedFlow > 5)
    push(
      'elouWater',
      `Вода после ЭЛОУ ${p.waterAfterElou.toFixed(2)}%`,
      2,
    )
  if (!p.h2GasOk) push('h2', 'H₂-газ K-12: НЕТ', 2)
  if (p.coilRupture) push('coil', 'Змеевик печи: РАЗРЫВ', 1)
  if (p.pumpLeak) push('leak', 'Утечка насоса/фланца', 1)
  if (p.levelWaterE1 > 85)
    push('e1water', `E-1 вода ${p.levelWaterE1.toFixed(0)}%`, 2)
  if (p.levelWaterE2 > 85)
    push('e2water', `E-2 вода ${p.levelWaterE2.toFixed(0)}%`, 2)
  if (p.levelReflux < 15)
    push('reflux', `Рефлюкс ${p.levelReflux.toFixed(0)}%`, 3)
  if (p.levelK1 < 20)
    push('k1level', `K-1 уровень ${p.levelK1.toFixed(0)}%`, 2)
  if (!p.avoFanOn) push('avo', 'АВО: вентилятор ВЫКЛ', 3)
  if (
    p.pumpN2 !== 'running' &&
    p.pumpN3 !== 'running' &&
    p.fuelGasPercent > 5
  ) {
    push('n23', 'Н-2/Н-3: нет подачи в печи', 1)
  }
  if (p.pumpN1 === 'running' && p.valveL1 < 3 && p.pressureN1 > 20) {
    push('n1deadhead', 'Н-1: работа на закрытую задвижку', 1)
  }
  if (p.levelK1 < 22 && p.fuelGasPercent > 20) {
    push('coilOverheat', 'Риск перегрева змеевика (низкий уровень К-1)', 1)
  }
  return a.sort((x, y) => x.priority - y.priority)
}
