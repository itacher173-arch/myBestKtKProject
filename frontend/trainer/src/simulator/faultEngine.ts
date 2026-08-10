import type { ProcessState } from './types'

/** Типы отказов сценариев (каталог SC + MVP). */
export type FaultType =
  | 'demulsifier'
  | 'fuelGas'
  | 'pumpTrip'
  | 'steamLoss'
  | 'powerLoss'
  | 'opsPowerLoss'
  | 'coolingWaterLoss'
  | 'airLoss'
  | 'coilRupture'
  | 'pumpLeak'
  | 'ventOpsLoss'
  | 'ventElouLoss'
  | 'highWaterE12'
  | 'lowLevelK1'
  | 'lowReflux'
  | 'h2Loss'

export interface FaultApplyResult {
  patch: Partial<ProcessState>
  messages: string[]
}

export function applyFault(type: FaultType): FaultApplyResult {
  switch (type) {
    case 'demulsifier':
      return {
        patch: { demulsifierOn: false },
        messages: [
          'ОТКАЗ: остановлен насос-дозатор деэмульгатора на ЭЛОУ. Ожидается рост солей (Q-ELOU).',
        ],
      }
    case 'fuelGas':
      return {
        patch: { fuelGasPercent: 0 },
        messages: [
          'ОТКАЗ: прекращена подача топливного газа к печам П-1…П-3. Температура (TR55-1) будет падать.',
        ],
      }
    case 'pumpTrip':
      return {
        patch: { pumpN1: 'tripped', pressureN1: 0 },
        messages: [
          'ОТКАЗ: аварийная остановка Н-1 (защита электродвигателя). Давление PRA351 падает.',
        ],
      }
    case 'steamLoss':
      return {
        patch: { steamOk: false, fuelGasPercent: 0 },
        messages: [
          'ОТКАЗ SC-02: потеря технологического пара. Горелки погасли; риск накопления топлива.',
        ],
      }
    case 'powerLoss':
      return {
        patch: {
          powerOk: false,
          pumpN1: 'tripped',
          pressureN1: 0,
          feedFlow: 0,
        },
        messages: [
          'ОТКАЗ SC-03: потеря электропитания 0,4/6 кВ. Останов насосов, АВО, вентиляции.',
        ],
      }
    case 'opsPowerLoss':
      return {
        patch: {
          opsPowerOk: false,
          opsPowerOnBattery: true,
          batteryMinutesLeft: 30,
        },
        messages: [
          'ОТКАЗ SC-04: потеря питания операторной. Переход на резерв/АКБ (~0,5 ч).',
        ],
      }
    case 'coolingWaterLoss':
      return {
        patch: { coolingWaterOk: false },
        messages: [
          'ОТКАЗ SC-05: потеря оборотной воды. Рост температур и давлений в теплообменном контуре.',
        ],
      }
    case 'airLoss':
      return {
        patch: {
          instrumentAirOk: false,
          valveL1Motion: 'idle',
          valveL2Motion: 'idle',
          valveL3Motion: 'idle',
          valveL1: 0,
        },
        messages: [
          'ОТКАЗ SC-06: потеря приборного воздуха. Клапаны в fail-safe (Л-1 закрыта); резерв А-6 ограничен.',
        ],
      }
    case 'coilRupture':
      return {
        patch: {
          coilRupture: true,
          fuelGasPercent: 0,
          furnaceEsd: true,
        },
        messages: [
          'АВАРИЯ SC-07: разрыв змеевика печи. Выброс продукта / пожар в топке — немедленный ESD.',
        ],
      }
    case 'pumpLeak':
      return {
        patch: { pumpLeak: true },
        messages: [
          'АВАРИЯ SC-08: разгерметизация насоса/фланца (лужа/облако УВ). Необходима локализация.',
        ],
      }
    case 'ventOpsLoss':
      return {
        patch: { ventOpsOk: false },
        messages: [
          'ОТКАЗ SC-09: потеря вентиляции операторной/РУ. Риск накопления взрывоопасной смеси.',
        ],
      }
    case 'ventElouLoss':
      return {
        patch: { ventElouOk: false },
        messages: [
          'ОТКАЗ SC-10: потеря вентиляции насосных ЭЛОУ. Газонакопление в помещении.',
        ],
      }
    case 'highWaterE12':
      return {
        patch: { levelWaterE1: 92, levelWaterE2: 90 },
        messages: [
          'ОТКАЗ SC-11: высокий уровень воды E-1/E-2. Риск попадания воды в K-1/K-2 и скачка давления.',
        ],
      }
    case 'lowLevelK1':
      return {
        patch: { levelK1: 12, levelK2: 40 },
        messages: [
          'ОТКАЗ SC-12: низкий уровень K-1. Риск срыва насосов и прогара змеевиков печей.',
        ],
      }
    case 'lowReflux':
      return {
        patch: { levelReflux: 8 },
        messages: [
          'ОТКАЗ SC-13: низкий уровень УВ в рефлюксных ёмкостях. Риск срыва рефлюксных насосов.',
        ],
      }
    case 'h2Loss':
      return {
        patch: { h2GasOk: false },
        messages: [
          'ОТКАЗ SC-15: потеря водородсодержащего газа (блок K-12). Риск коксования / роста давления.',
        ],
      }
  }
}

export interface EmergencyActionDef {
  id: string
  label: string
  /** Строка для журнала действий и эталона */
  logDescription: string
  /** Какие отказы закрывает этот шаг (финальный) */
  clearsFaults: FaultType[]
  /** Показывать при активном отказе как шаг процедуры (даже без clear) */
  procedureFor?: FaultType[]
  apply?: (p: ProcessState) => Partial<ProcessState>
}

export const EMERGENCY_ACTIONS: EmergencyActionDef[] = [
  // ——— SC-02 многошагово ———
  {
    id: 'sc02-ack-flameout',
    label: '1. Подтвердить погасание / запрет топлива',
    logDescription:
      "Авария: подтверждено погасание горелок, запрет подачи топлива (SC-02)",
    clearsFaults: [],
    procedureFor: ['steamLoss'],
    apply: () => ({ fuelGasPercent: 0 }),
  },
  {
    id: 'cut-fuel-steam',
    label: '2. Отсечь топливный газ',
    logDescription:
      "Авария: исключена подача топлива при потере пара (SC-02)",
    clearsFaults: [],
    procedureFor: ['steamLoss'],
    apply: () => ({ fuelGasPercent: 0 }),
  },
  {
    id: 'sc02-safe-stop',
    label: '3. Безопасный останов (пар)',
    logDescription:
      "Авария: инициирован безопасный останов при потере пара (SC-02)",
    clearsFaults: ['steamLoss'],
    procedureFor: ['steamLoss'],
    apply: () => ({ fuelGasPercent: 0, safeShutdownInitiated: true }),
  },
  // ——— SC-03 многошагово ———
  {
    id: 'sc03-cut-load',
    label: '1. Снять тепловую нагрузку / топливо',
    logDescription:
      "Авария: снята тепловая нагрузка при потере электропитания (SC-03)",
    clearsFaults: [],
    procedureFor: ['powerLoss'],
    apply: () => ({ fuelGasPercent: 0 }),
  },
  {
    id: 'safe-stop-power',
    label: '2. Безопасный останов (питание)',
    logDescription:
      "Авария: инициирован безопасный останов при потере электропитания (SC-03)",
    clearsFaults: ['powerLoss'],
    procedureFor: ['powerLoss'],
    apply: (p) => ({
      safeShutdownInitiated: true,
      fuelGasPercent: 0,
      pumpN1: p.pumpN1 === 'running' ? 'stopped' : p.pumpN1,
    }),
  },
  {
    id: 'ack-ops-backup',
    label: 'Подтвердить резерв питания операторной',
    logDescription:
      "Авария: подтверждён резерв/АКБ операторной, организован безопасный перевод (SC-04)",
    clearsFaults: ['opsPowerLoss'],
    apply: () => ({ safeShutdownInitiated: true }),
  },
  {
    id: 'unload-cooling',
    label: 'Снизить тепловую нагрузку (оборотная вода)',
    logDescription:
      "Авария: снижена тепловая нагрузка / инициирован останов при потере оборотной воды (SC-05)",
    clearsFaults: ['coolingWaterLoss'],
    apply: () => ({
      fuelGasPercent: 0,
      safeShutdownInitiated: true,
    }),
  },
  {
    id: 'safe-stop-air',
    label: 'Безопасный останов (приборный воздух)',
    logDescription:
      "Авария: инициирован безопасный останов при потере приборного воздуха (SC-06)",
    clearsFaults: ['airLoss'],
    apply: () => ({
      fuelGasPercent: 0,
      safeShutdownInitiated: true,
      valveL1: 0,
    }),
  },
  // ——— SC-07 многошагово ———
  {
    id: 'sc07-cut-fuel',
    label: '1. Немедленно отсечь топливо',
    logDescription:
      "Авария: немедленное отсечение топливного газа (SC-07)",
    clearsFaults: [],
    procedureFor: ['coilRupture'],
    apply: () => ({ fuelGasPercent: 0, furnaceEsd: true }),
  },
  {
    id: 'sc07-isolate-feed',
    label: '2. Отсечь сырьё / остановить Н-1',
    logDescription:
      "Авария: отсечение сырья и останов Н-1 (SC-07)",
    clearsFaults: [],
    procedureFor: ['coilRupture'],
    apply: () => ({
      valveL1: 0,
      pumpN1: 'stopped',
      pressureN1: 0,
      fuelGasPercent: 0,
      furnaceEsd: true,
    }),
  },
  {
    id: 'esd-coil',
    label: '3. ESD печи / оповещение',
    logDescription:
      "Авария: ESD печи — отсечение, прекращение нагрева, оповещение (SC-07)",
    clearsFaults: ['coilRupture'],
    procedureFor: ['coilRupture'],
    apply: () => ({
      fuelGasPercent: 0,
      furnaceEsd: true,
      safeShutdownInitiated: true,
      valveL1: 0,
      pumpN1: 'stopped',
    }),
  },
  // ——— SC-08 многошагово ———
  {
    id: 'sc08-stop-pump',
    label: '1. Остановить Н-1',
    logDescription:
      "Авария: останов Н-1 при разгерметизации (SC-08)",
    clearsFaults: [],
    procedureFor: ['pumpLeak'],
    apply: () => ({
      pumpN1: 'stopped',
      pressureN1: 0,
    }),
  },
  {
    id: 'sc08-close-feed',
    label: '2. Закрыть Л-1 / исключить приток',
    logDescription:
      "Авария: закрыта Л-1, исключён приток к месту утечки (SC-08)",
    clearsFaults: [],
    procedureFor: ['pumpLeak'],
    apply: () => ({ valveL1: 0, pumpN1: 'stopped', pressureN1: 0 }),
  },
  {
    id: 'isolate-leak',
    label: '3. Локализовать / оповестить',
    logDescription:
      "Авария: останов Н-1 и локализация разгерметизации (SC-08)",
    clearsFaults: ['pumpLeak'],
    procedureFor: ['pumpLeak'],
    apply: () => ({
      pumpN1: 'stopped',
      pressureN1: 0,
      pumpLeak: false,
      valveL1: 0,
      safeShutdownInitiated: true,
    }),
  },
  {
    id: 'vent-ops',
    label: 'Газоанализ / ограничить пребывание (РУ)',
    logDescription:
      "Авария: контроль газоанализа, ограничение пребывания, действия по эвакуации/останову (SC-09)",
    clearsFaults: ['ventOpsLoss'],
    apply: () => ({ safeShutdownInitiated: true }),
  },
  {
    id: 'vent-elou',
    label: 'Ограничить доступ / проветривание ЭЛОУ',
    logDescription:
      "Авария: ограничение доступа в насосную ЭЛОУ, проветривание/контроль (SC-10)",
    clearsFaults: ['ventElouLoss'],
    apply: () => ({ safeShutdownInitiated: true }),
  },
  {
    id: 'drain-water',
    label: 'Сдренировать воду E-1/E-2',
    logDescription:
      "Авария: скорректирован уровень воды E-1/E-2, предотвращён занос в колонны (SC-11)",
    clearsFaults: ['highWaterE12'],
    apply: () => ({
      levelWaterE1: 35,
      levelWaterE2: 35,
    }),
  },
  {
    id: 'protect-low-k1',
    label: 'Разгрузить печь / сохранить уровень K-1',
    logDescription:
      "Авария: разгрузка печи и меры по сохранению минимального уровня K-1 (SC-12)",
    clearsFaults: ['lowLevelK1'],
    apply: (p) => ({
      fuelGasPercent: 0,
      levelK1: Math.max(p.levelK1, 25),
      safeShutdownInitiated: true,
    }),
  },
  {
    id: 'restore-reflux',
    label: 'Восстановить рефлюкс / снизить нагрузку',
    logDescription:
      "Авария: восстановление рефлюкса и снижение нагрузки (SC-13)",
    clearsFaults: ['lowReflux'],
    apply: () => ({
      levelReflux: 45,
      fuelGasPercent: 40,
    }),
  },
  {
    id: 'h2-transfer',
    label: 'Снизить T / перевод блока K-12',
    logDescription:
      "Авария: снижена нагрузка/температура, выполнен перевод блока K-12 (SC-15)",
    clearsFaults: ['h2Loss'],
    apply: () => ({
      fuelGasPercent: 0,
      safeShutdownInitiated: true,
      h2GasOk: true,
    }),
  },
]

export function emergencyActionsForFault(
  fault: FaultType | null | undefined,
): EmergencyActionDef[] {
  if (!fault) return []
  return EMERGENCY_ACTIONS.filter(
    (a) =>
      a.clearsFaults.includes(fault) ||
      (a.procedureFor?.includes(fault) ?? false),
  )
}
