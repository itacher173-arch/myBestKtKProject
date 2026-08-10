import type { FaultType } from './faultEngine'

export type Role = 'instructor' | 'trainee'

export type PumpState = 'stopped' | 'starting' | 'running' | 'tripped'

export type ValveMotion = 'idle' | 'opening' | 'closing'

export interface LogEntry {
  id: string
  at: number
  description: string
}

export interface AnalogTag {
  id: string
  tag: string
  description: string
  unit: string
  value: number
  min: number
  max: number
  alarmLow?: number
  alarmHigh?: number
}

export interface ProcessState {
  valveL1: number
  valveL2: number
  valveL3: number
  valveL1Motion: ValveMotion
  valveL2Motion: ValveMotion
  valveL3Motion: ValveMotion

  pumpN1: PumpState
  /** Подача в печи П-1/П-2 */
  pumpN2: PumpState
  /** Подача в печь П-3 */
  pumpN3: PumpState

  demulsifierOn: boolean
  electricFieldOn: boolean
  /** Промывная вода на ЭЛОУ */
  washWaterOn: boolean

  /** Топливный газ П-1…П-3, 0–100% */
  fuelGasPercent: number

  levelK1: number
  levelK2: number
  /** Уставки уровня куба, % (контур регулирования) */
  levelSetpointK1: number
  levelSetpointK2: number

  /** АВО / воздушное охлаждение (АВЗ-3) */
  avoFanOn: boolean

  pressureN1: number
  tempElouIn: number
  saltMgL: number
  /** Остаточная вода после ЭЛОУ, % масс. */
  waterAfterElou: number
  pressureAfterElou: number
  tempK1In: number
  tempK1Bottom: number
  pressureK1: number
  tempFurnaceOut: number
  pressureK2: number

  feedFlow: number
  running: boolean
  simTimeSec: number

  /** Утилиты и аварийные флаги (SC-02…SC-15) */
  steamOk: boolean
  powerOk: boolean
  opsPowerOk: boolean
  opsPowerOnBattery: boolean
  batteryMinutesLeft: number
  coolingWaterOk: boolean
  instrumentAirOk: boolean
  ventOpsOk: boolean
  ventElouOk: boolean
  h2GasOk: boolean
  levelWaterE1: number
  levelWaterE2: number
  levelReflux: number
  /** Модельная загазованность, % НКПР */
  gasPercent: number
  coilRupture: boolean
  pumpLeak: boolean
  furnaceEsd: boolean
  safeShutdownInitiated: boolean
}

export interface Exercise {
  id: string
  specId?: string
  name: string
  description: string
  triggerDelaySeconds: number
  normResponseSeconds?: number
  scenarioSteps: string[]
  expectedResponseActions?: string[]
  faultType?: FaultType | null
  /** Стартовать уже в нормальном режиме (для отработки отказа) */
  warmStart?: boolean
}

export type PanelKind =
  | { type: 'pump'; id: string }
  | { type: 'valve'; id: string }
  | { type: 'desalter'; id: string }
  | { type: 'furnace'; id: string }
  | { type: 'column'; id: string }
  | { type: 'signal'; id: string }
  | { type: 'info'; id: string; equipType: string }
  | null

export interface SessionState {
  role: Role | null
  userName: string
  exerciseId: string | null
  view: 'start' | 'exercise' | 'reports'
  started: boolean
  completed: boolean
  scorePercent: number
  penalty: number
  responseSeconds: number | null
  respondedInTime: boolean | null
}

export interface TrainerState {
  session: SessionState
  process: ProcessState
  actionsLog: LogEntry[]
  systemEvents: LogEntry[]
  activePanel: PanelKind
  selectedEquipId: string | null
  faultTriggered: boolean
  faultResponded: boolean
  faultAt: number | null
}

export function createInitialProcess(): ProcessState {
  return {
    valveL1: 0,
    valveL2: 0,
    valveL3: 0,
    valveL1Motion: 'idle',
    valveL2Motion: 'idle',
    valveL3Motion: 'idle',
    pumpN1: 'stopped',
    pumpN2: 'stopped',
    pumpN3: 'stopped',
    demulsifierOn: false,
    electricFieldOn: false,
    washWaterOn: false,
    fuelGasPercent: 0,
    levelK1: 45,
    levelK2: 45,
    levelSetpointK1: 50,
    levelSetpointK2: 50,
    avoFanOn: true,
    pressureN1: 0,
    tempElouIn: 25,
    saltMgL: 50,
    waterAfterElou: 0.7,
    pressureAfterElou: 0,
    tempK1In: 25,
    tempK1Bottom: 25,
    pressureK1: 0.6,
    tempFurnaceOut: 25,
    pressureK2: 0.25,
    feedFlow: 0,
    running: false,
    simTimeSec: 0,
    steamOk: true,
    powerOk: true,
    opsPowerOk: true,
    opsPowerOnBattery: false,
    batteryMinutesLeft: 30,
    coolingWaterOk: true,
    instrumentAirOk: true,
    ventOpsOk: true,
    ventElouOk: true,
    h2GasOk: true,
    levelWaterE1: 40,
    levelWaterE2: 40,
    levelReflux: 50,
    gasPercent: 0,
    coilRupture: false,
    pumpLeak: false,
    furnaceEsd: false,
    safeShutdownInitiated: false,
  }
}

/** Нормальный режим для сценариев отказа (SC). */
export function createWarmProcess(): ProcessState {
  return {
    ...createInitialProcess(),
    running: true,
    valveL1: 100,
    valveL2: 70,
    valveL3: 70,
    pumpN1: 'running',
    pumpN2: 'running',
    pumpN3: 'running',
    demulsifierOn: true,
    electricFieldOn: true,
    washWaterOn: true,
    fuelGasPercent: 60,
    pressureN1: 17.3,
    feedFlow: 113,
    tempElouIn: 113,
    saltMgL: 3,
    waterAfterElou: 0.12,
    pressureAfterElou: 7,
    tempK1In: 135,
    tempK1Bottom: 175,
    pressureK1: 1.45,
    tempFurnaceOut: 308,
    pressureK2: 0.52,
    levelK1: 50,
    levelK2: 50,
    levelSetpointK1: 50,
    levelSetpointK2: 50,
    avoFanOn: true,
    levelWaterE1: 55,
    levelWaterE2: 52,
    levelReflux: 65,
  }
}

export function createInitialSession(): SessionState {
  return {
    role: null,
    userName: '',
    exerciseId: null,
    view: 'start',
    started: false,
    completed: false,
    scorePercent: 0,
    penalty: 0,
    responseSeconds: null,
    respondedInTime: null,
  }
}
