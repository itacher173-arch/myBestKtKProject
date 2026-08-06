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
  /** Л-1 вход сырья, 0–100% */
  valveL1: number
  valveL2: number
  valveL3: number
  valveL1Motion: ValveMotion
  valveL2Motion: ValveMotion
  valveL3Motion: ValveMotion

  pumpN1: PumpState

  demulsifierOn: boolean
  electricFieldOn: boolean

  /** Подача топливного газа к печам 0–100% */
  fuelGasPercent: number

  /** Уровни кубов % */
  levelK1: number
  levelK2: number

  /** Температуры/давления (обновляются тиком) */
  pressureN1: number
  tempElouIn: number
  saltMgL: number
  pressureAfterElou: number
  tempK1Bottom: number
  pressureK1: number
  tempFurnaceOut: number
  pressureK2: number

  feedFlow: number
  running: boolean
  simTimeSec: number
}

export interface Exercise {
  id: string
  name: string
  description: string
  triggerDelaySeconds: number
  normResponseSeconds?: number
  scenarioSteps: string[]
  expectedResponseActions?: string[]
  faultType?: 'demulsifier' | 'fuelGas' | 'pumpTrip' | null
}

export type PanelKind =
  | { type: 'pump'; id: string }
  | { type: 'valve'; id: string }
  | { type: 'desalter'; id: string }
  | { type: 'furnace'; id: string }
  | { type: 'signal'; id: string }
  | { type: 'column'; id: string }
  | { type: 'info'; id: string; equipType: string }
  | null

export interface SessionState {
  role: Role | null
  userName: string
  exerciseId: string | null
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
    demulsifierOn: false,
    electricFieldOn: false,
    fuelGasPercent: 0,
    levelK1: 45,
    levelK2: 45,
    pressureN1: 0,
    tempElouIn: 25,
    saltMgL: 50,
    pressureAfterElou: 0,
    tempK1Bottom: 25,
    pressureK1: 0.5,
    tempFurnaceOut: 25,
    pressureK2: 0.2,
    feedFlow: 0,
    running: false,
    simTimeSec: 0,
  }
}

export function createInitialSession(): SessionState {
  return {
    role: null,
    userName: '',
    exerciseId: null,
    started: false,
    completed: false,
    scorePercent: 0,
    penalty: 0,
    responseSeconds: null,
    respondedInTime: null,
  }
}
