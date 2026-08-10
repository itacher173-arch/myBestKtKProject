import type { Exercise, ProcessState } from './types'
import type { GuardedAction } from './scenarioGuards'

/**
 * Постоянные блокировки ПАЗ / cause-and-effect (учебный объём).
 * Не заменяет проектную документацию ПАЗ.
 */
export function processInterlockReason(
  process: ProcessState,
  action: GuardedAction,
  fuelTarget?: number,
): string | null {
  const p = process

  if (!p.powerOk) {
    if (
      action === 'start-N1' ||
      action === 'start-N2' ||
      action === 'start-N3'
    ) {
      return 'ПАЗ: пуск насосов запрещён — нет электропитания 0,4/6 кВ.'
    }
  }

  if (!p.steamOk) {
    if (action === 'fuel' && (fuelTarget ?? 0) > p.fuelGasPercent + 0.5) {
      return 'ПАЗ: при потере технологического пара увеличение топлива запрещено.'
    }
  }

  if (p.coilRupture || p.furnaceEsd) {
    if (action === 'fuel' && (fuelTarget ?? 0) > 5) {
      return 'ПАЗ: ESD/разрыв змеевика — топливо должно быть отсечено.'
    }
    if (action === 'start-N2' || action === 'start-N3') {
      return 'ПАЗ: при ESD печи пуск печных насосов запрещён.'
    }
  }

  if (!p.instrumentAirOk) {
    if (
      action === 'open-L1' ||
      action === 'open-L2' ||
      action === 'open-L3'
    ) {
      return 'ПАЗ: нет приборного воздуха — открытие задвижек заблокировано (fail-safe).'
    }
  }

  if (!p.coolingWaterOk && action === 'fuel' && (fuelTarget ?? 0) > 40) {
    return 'ПАЗ: при потере оборотной воды запрещён рост топлива выше 40%.'
  }

  if (
    p.pumpN1 === 'running' &&
    p.valveL1 < 3 &&
    action === 'start-N1'
  ) {
    return 'ПАЗ: Н-1 уже в работе на закрытую задвижку — устраните режим.'
  }

  if (
    (action === 'start-N2' || action === 'start-N3') &&
    p.levelK1 < 18 &&
    p.fuelGasPercent > 10
  ) {
    return 'ПАЗ: низкий уровень К-1 — сначала разгрузите печь / восстановите уровень.'
  }

  if (p.pumpLeak && (action === 'start-N1' || action === 'open-L1')) {
    return 'ПАЗ: при разгерметизации насоса пуск Н-1 / открытие Л-1 запрещены.'
  }

  return null
}

/** Карта ключей тревог → подсветка оборудования на мнемосхеме */
export const ALARM_EQUIP_HIGHLIGHT: Record<string, string[]> = {
  steam: ['UTIL-block', 'P-1', 'P-2', 'P-3'],
  power: ['UTIL-block', 'N-1', 'N-2', 'N-3'],
  opsPower: ['UTIL-block'],
  cooling: ['UTIL-block', 'AVZ-3'],
  air: ['UTIL-block', 'L-1', 'L-2', 'L-3'],
  ventOps: ['UTIL-block'],
  ventElou: ['ELOU-block'],
  h2: ['K-12-2', 'K-12-3'],
  coil: ['P-1', 'P-2', 'P-3'],
  leak: ['N-1', 'L-1'],
  e1water: ['E-1-vessel'],
  e2water: ['E-2-vessel'],
  reflux: ['K-1'],
  k1level: ['K-1', 'P-1'],
  avo: ['AVZ-3'],
  n23: ['N-2', 'N-3', 'P-1'],
  n1deadhead: ['N-1', 'L-1'],
  coilOverheat: ['K-1', 'P-1', 'P-2', 'P-3'],
}

export function highlightEquipIdsForAlarms(
  alarmKeys: string[],
): Set<string> {
  const ids = new Set<string>()
  for (const k of alarmKeys) {
    for (const id of ALARM_EQUIP_HIGHLIGHT[k] ?? []) ids.add(id)
  }
  return ids
}

export function criticalFailReasonText(
  process: ProcessState,
  exercise: Exercise | undefined,
  actionsLog: { description: string }[],
): string | null {
  if (exercise?.faultType === 'steamLoss' && process.fuelGasPercent > 10) {
    if (!process.safeShutdownInitiated) {
      return 'Критическая ошибка: топливо при потере пара без безопасного останова.'
    }
  }
  if (!process.steamOk && process.fuelGasPercent > 15) {
    return 'Критическая ошибка: сохранена подача топлива при потере пара.'
  }
  if (process.coilRupture && process.fuelGasPercent > 5 && !process.furnaceEsd) {
    return 'Критическая ошибка: нет ESD при разрыве змеевика / топливо не отсечено.'
  }
  if (
    (!process.steamOk || process.coilRupture) &&
    actionsLog.some((a) => {
      const m = a.description.match(/топливного газа на (\d+)%/)
      return m != null && Number(m[1]) > 10
    })
  ) {
    return 'Критическая ошибка: увеличение топлива в аварийном режиме.'
  }
  return null
}
