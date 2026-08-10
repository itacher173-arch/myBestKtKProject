import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { equipmentById } from '../scheme'
import {
  drainActionToken,
  fuelActionToken,
  isMiniActionAllowed,
  levelSetpointToken,
  protectLevelToken,
  pumpActionToken,
  toggleActionToken,
  utilityActionToken,
  valveActionToken,
} from '../miniTraining/actions'
import {
  evaluateMiniTraining,
  getMiniTraining,
  MINI_TRAININGS,
  type MiniTraining,
  type TrainingHint,
  type TrainingProgress,
} from '../miniTraining/catalog'
import { applyMiniPreset } from '../miniTraining/presets'
import { expandMiniFocusEquipment } from '../miniTraining/focusPath'
import {
  EMERGENCY_ACTIONS,
  applyFault,
} from './faultEngine'
import { appendAudit } from './auditStorage'
import { getAuthedUser, resolveWorkRole } from './authApi'
import { processInterlockReason, criticalFailReasonText } from './pazGuards'
import {
  createServerSimSession,
  mirrorServerCommand,
} from './serverSimApi'
import { sequenceBlockReason, type GuardedAction } from './scenarioGuards'
import { getAnalogs, getUtilityAlarms, tickProcess } from './processModel'
import {
  PROTOCOL_VERSION,
  saveReport,
} from './reportsStorage'
import { exercises, getExercise, SCENARIO_VERSION } from './scenarios'
import { scoreExercise } from './scoring'
import type {
  AnalogTag,
  PanelKind,
  ProcessState,
  Role,
  SessionMode,
  SessionSnapshot,
  TimeScale,
  TrainerState,
} from './types'
import {
  createInitialProcess,
  createInitialSession,
  createWarmProcess,
  MODEL_VERSION,
} from './types'

type Action =
  | { type: 'SET_ROLE'; role: Role | null }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_EXERCISE'; id: string | null }
  | { type: 'SET_MODE'; mode: SessionMode }
  | { type: 'OPEN_REPORTS' }
  | {
      type: 'START_SESSION'
      process?: ProcessState
      label?: string
      skipBriefing?: boolean
    }
  | { type: 'SYNC_ALARM_TIMES'; raisedAt: Record<string, number> }
  | { type: 'SELECT_EQUIP'; id: string | null }
  | { type: 'OPEN_PANEL'; panel: PanelKind }
  | { type: 'CLOSE_PANEL' }
  | { type: 'LOG_ACTION'; id: string; at: number; description: string }
  | { type: 'LOG_SYSTEM'; id: string; at: number; description: string }
  | { type: 'TICK'; dt: number }
  | { type: 'SET_PROCESS'; patch: Partial<ProcessState> }
  | { type: 'FAULT_TRIGGERED' }
  | { type: 'FAULT_RESPONDED'; seconds: number; inTime: boolean }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'ACK_ALARM'; key: string }
  | { type: 'SET_TIME_SCALE'; timeScale: TimeScale }
  | { type: 'ACCEPT_BRIEFING' }
  | { type: 'SET_INSTRUCTOR_LIVE'; open: boolean }
  | { type: 'SAVE_SNAPSHOT'; snapshot: SessionSnapshot }
  | { type: 'RESTORE_SNAPSHOT' }
  | { type: 'SET_CRITICAL_FAIL'; reason: string }
  | {
      type: 'COMPLETE'
      scorePercent: number
      penalty: number
      penaltyDetail: {
        unsafe: number
        late: number
        extra: number
        missed: number
      }
      qualified: boolean
      qualificationSummary: string
      finishEvent: { id: string; at: number; description: string }
      criticalFailReason?: string | null
    }
  | { type: 'RESET_TO_START' }

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function reducer(state: TrainerState, action: Action): TrainerState {
  switch (action.type) {
    case 'SET_ROLE':
      return {
        ...state,
        session: { ...state.session, role: action.role },
      }
    case 'SET_NAME':
      return {
        ...state,
        session: { ...state.session, userName: action.name },
      }
    case 'SET_EXERCISE':
      return {
        ...state,
        session: { ...state.session, exerciseId: action.id },
      }
    case 'SET_MODE':
      return {
        ...state,
        session: { ...state.session, mode: action.mode },
      }
    case 'SYNC_ALARM_TIMES':
      return { ...state, alarmRaisedAt: action.raisedAt }
    case 'OPEN_REPORTS':
      return {
        ...state,
        session: {
          ...state.session,
          role: 'instructor',
          view: 'reports',
          started: false,
          completed: false,
        },
        process: createInitialProcess(),
        activePanel: null,
        selectedEquipId: null,
      }
    case 'START_SESSION': {
      const startedAt = Date.now()
      const ex = getExercise(state.session.exerciseId)
      const process =
        action.process ??
        (ex?.warmStart
          ? createWarmProcess()
          : { ...createInitialProcess(), running: true })
      const label = action.label ?? ex?.name ?? '—'
      return {
        ...state,
        session: {
          ...state.session,
          role: 'trainee',
          view: 'exercise',
          started: true,
          completed: false,
          paused: false,
          scorePercent: 0,
          penalty: 0,
          responseSeconds: null,
          respondedInTime: null,
          qualified: null,
          qualificationSummary: null,
          briefingAccepted: Boolean(action.skipBriefing),
          timeScale: 1,
          criticalFailReason: null,
          instructorLiveOpen: false,
        },
        process,
        actionsLog: [],
        systemEvents: [
          {
            id: `start-${startedAt}`,
            at: startedAt,
            description: `Упражнение начато: ${label} [${
              state.session.mode === 'exam' ? 'экзамен' : 'обучение'
            }]${ex?.warmStart && !action.process ? ' (нормальный режим, ожидание отказа)' : ''}`,
          },
        ],
        faultTriggered: false,
        faultResponded: false,
        faultAt: null,
        activePanel: null,
        selectedEquipId: null,
        analogHistory: [],
        ackedAlarmKeys: [],
        alarmRaisedAt: {},
        snapshot: null,
      }
    }
    case 'SELECT_EQUIP':
      return { ...state, selectedEquipId: action.id }
    case 'OPEN_PANEL':
      return { ...state, activePanel: action.panel }
    case 'CLOSE_PANEL':
      return { ...state, activePanel: null }
    case 'LOG_ACTION': {
      const recent = state.actionsLog.slice(-5)
      if (
        recent.some(
          (e) =>
            e.description === action.description && action.at - e.at < 800,
        )
      ) {
        return state
      }
      return {
        ...state,
        actionsLog: [
          ...state.actionsLog,
          {
            id: action.id,
            at: action.at,
            description: action.description,
          },
        ],
      }
    }
    case 'LOG_SYSTEM': {
      const recent = state.systemEvents.slice(-5)
      if (
        recent.some(
          (e) =>
            e.description === action.description && action.at - e.at < 800,
        )
      ) {
        return state
      }
      return {
        ...state,
        systemEvents: [
          ...state.systemEvents,
          {
            id: action.id,
            at: action.at,
            description: action.description,
          },
        ],
      }
    }
    case 'TICK': {
      const process = tickProcess(state.process, action.dt)
      const sample = {
        t: process.simTimeSec,
        pressureN1: process.pressureN1,
        tempFurnaceOut: process.tempFurnaceOut,
        saltMgL: process.saltMgL,
        pressureK1: process.pressureK1,
        levelK1: process.levelK1,
        levelK2: process.levelK2,
        feedFlow: process.feedFlow,
        pressureAfterElou: process.pressureAfterElou,
      }
      return {
        ...state,
        process,
        analogHistory: [...state.analogHistory, sample].slice(-90),
      }
    }
    case 'ACK_ALARM':
      if (state.ackedAlarmKeys.includes(action.key)) return state
      return {
        ...state,
        ackedAlarmKeys: [...state.ackedAlarmKeys, action.key],
      }
    case 'SET_PROCESS':
      return { ...state, process: { ...state.process, ...action.patch } }
    case 'FAULT_TRIGGERED':
      return { ...state, faultTriggered: true, faultAt: Date.now() }
    case 'FAULT_RESPONDED':
      return {
        ...state,
        faultResponded: true,
        session: {
          ...state.session,
          responseSeconds: action.seconds,
          respondedInTime: action.inTime,
        },
      }
    case 'COMPLETE': {
      if (state.session.completed) return state
      return {
        ...state,
        session: {
          ...state.session,
          completed: true,
          paused: true,
          scorePercent: action.scorePercent,
          penalty: action.penalty,
          penaltyDetail: action.penaltyDetail,
          qualified: action.qualified,
          qualificationSummary: action.qualificationSummary,
          criticalFailReason:
            action.criticalFailReason !== undefined
              ? action.criticalFailReason
              : state.session.criticalFailReason,
        },
        process: { ...state.process, running: false },
        systemEvents: [...state.systemEvents, action.finishEvent],
      }
    }
    case 'SET_PAUSED':
      return {
        ...state,
        session: { ...state.session, paused: action.paused },
      }
    case 'ACCEPT_BRIEFING':
      return {
        ...state,
        session: { ...state.session, briefingAccepted: true },
      }
    case 'SET_TIME_SCALE':
      return {
        ...state,
        session: { ...state.session, timeScale: action.timeScale },
      }
    case 'SET_INSTRUCTOR_LIVE':
      return {
        ...state,
        session: { ...state.session, instructorLiveOpen: action.open },
      }
    case 'SAVE_SNAPSHOT':
      return { ...state, snapshot: action.snapshot }
    case 'RESTORE_SNAPSHOT': {
      const snap = state.snapshot
      if (!snap) return state
      return {
        ...state,
        process: snap.process,
        actionsLog: snap.actionsLog,
        systemEvents: snap.systemEvents,
        faultTriggered: snap.faultTriggered,
        faultResponded: snap.faultResponded,
        faultAt: snap.faultAt,
        analogHistory: snap.analogHistory,
        ackedAlarmKeys: snap.ackedAlarmKeys,
        alarmRaisedAt: snap.alarmRaisedAt,
        session: {
          ...state.session,
          view: 'exercise',
          completed: false,
          scorePercent: 0,
          penalty: 0,
          qualified: null,
          qualificationSummary: null,
          criticalFailReason: null,
          responseSeconds: snap.responseSeconds,
          respondedInTime: snap.respondedInTime,
        },
      }
    }
    case 'SET_CRITICAL_FAIL':
      return {
        ...state,
        session: {
          ...state.session,
          criticalFailReason: action.reason,
        },
      }
    case 'RESET_TO_START':
      return {
        session: createInitialSession(),
        process: createInitialProcess(),
        actionsLog: [],
        systemEvents: [],
        activePanel: null,
        selectedEquipId: null,
        faultTriggered: false,
        faultResponded: false,
        faultAt: null,
        analogHistory: [],
        ackedAlarmKeys: [],
        alarmRaisedAt: {},
        snapshot: null,
      }
    default:
      return state
  }
}

interface TrainerApi {
  state: TrainerState
  exercises: typeof exercises
  analogs: AnalogTag[]
  setRole: (role: Role | null) => void
  setName: (name: string) => void
  setExercise: (id: string) => void
  setSessionMode: (mode: SessionMode) => void
  openReports: () => void
  startSession: () => void
  selectEquip: (id: string | null) => void
  openPanelForEquip: (equipId: string) => void
  closePanel: () => void
  startPumpN1: () => void
  stopPumpN1: () => void
  startPump: (id: 'N-1' | 'N-2' | 'N-3') => void
  stopPump: (id: 'N-1' | 'N-2' | 'N-3') => void
  openValve: (id: 'L-1' | 'L-2' | 'L-3') => void
  closeValve: (id: 'L-1' | 'L-2' | 'L-3') => void
  stopValve: (id: 'L-1' | 'L-2' | 'L-3') => void
  setDemulsifier: (on: boolean) => void
  setElectricField: (on: boolean) => void
  setWashWater: (on: boolean) => void
  setFuelGas: (percent: number) => void
  setLevelSetpoint: (column: 'K-1' | 'K-2', percent: number) => void
  drainVesselWater: (id: 'E-1-vessel' | 'E-2-vessel') => void
  setAvoFan: (on: boolean) => void
  setUtility: (
    key:
      | 'steamOk'
      | 'powerOk'
      | 'coolingWaterOk'
      | 'instrumentAirOk'
      | 'ventOpsOk'
      | 'ventElouOk',
    ok: boolean,
  ) => void
  protectColumnLevel: (column: 'K-1' | 'K-2') => void
  completeExercise: () => void
  resetToStart: () => void
  performEmergencyAction: (actionId: string) => void
  setPaused: (paused: boolean) => void
  ackAlarm: (key: string) => void
  injectCurrentFault: () => void
  acceptBriefing: () => void
  setTimeScale: (scale: TimeScale) => void
  setInstructorLiveOpen: (open: boolean) => void
  saveSnapshot: () => void
  restoreSnapshot: () => void
  canControl: boolean
  trainingMode: 'full' | 'mini'
  setTrainingMode: (mode: 'full' | 'mini') => void
  miniTrainings: MiniTraining[]
  selectedMiniTrainingId: string | null
  setSelectedMiniTraining: (id: string) => void
  activeMiniTraining: MiniTraining | null
  miniTrainingProgress: TrainingProgress
  visibleHint: TrainingHint | null
  hintsUsed: number
  requestHint: () => void
  knowledgeOpen: boolean
  knowledgeArticleId: string | null
  openKnowledge: (articleId?: string) => void
  closeKnowledge: () => void
}

const TrainerContext = createContext<TrainerApi | null>(null)

const initialState: TrainerState = {
  session: createInitialSession(),
  process: createInitialProcess(),
  actionsLog: [],
  systemEvents: [],
  activePanel: null,
  selectedEquipId: null,
  faultTriggered: false,
  faultResponded: false,
  faultAt: null,
  analogHistory: [],
  ackedAlarmKeys: [],
  alarmRaisedAt: {},
  snapshot: null,
}

export function TrainerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const pumpStartTimer = useRef<number | null>(null)
  const recoveryLogged = useRef(false)
  const saltAlarmLogged = useRef(false)
  const criticalFailHandled = useRef(false)
  const serverSimIdRef = useRef<string | null>(null)

  const [trainingMode, setTrainingModeState] = useState<'full' | 'mini'>('full')
  const [selectedMiniTrainingId, setSelectedMiniTrainingId] = useState<
    string | null
  >(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [visibleHint, setVisibleHint] = useState<TrainingHint | null>(null)
  const [knowledgeOpen, setKnowledgeOpen] = useState(false)
  const [knowledgeArticleId, setKnowledgeArticleId] = useState<string | null>(
    null,
  )

  const activeMiniTraining =
    trainingMode === 'mini'
      ? getMiniTraining(MINI_TRAININGS, selectedMiniTrainingId) ?? null
      : null
  const miniTrainingProgress = useMemo(
    () =>
      activeMiniTraining
        ? evaluateMiniTraining(activeMiniTraining, state.process)
        : { checks: [], progressPercent: 0, completed: false },
    [activeMiniTraining, state.process],
  )

  const setTrainingMode = useCallback((mode: 'full' | 'mini') => {
    setTrainingModeState(mode)
    setVisibleHint(null)
    setHintsUsed(0)
    if (mode === 'mini') {
      dispatch({ type: 'SET_EXERCISE', id: null })
      dispatch({ type: 'SET_MODE', mode: 'train' })
    } else {
      setSelectedMiniTrainingId(null)
    }
  }, [])

  const setSelectedMiniTraining = useCallback((id: string) => {
    setSelectedMiniTrainingId(id)
    setVisibleHint(null)
    setHintsUsed(0)
  }, [])

  const requestHint = useCallback(() => {
    const training = getMiniTraining(MINI_TRAININGS, selectedMiniTrainingId)
    if (!training) return
    setHintsUsed((current) => {
      const next = Math.min(current + 1, training.hints.length)
      setVisibleHint(training.hints[Math.max(0, next - 1)] ?? null)
      return next
    })
  }, [selectedMiniTrainingId])

  const openKnowledge = useCallback((articleId?: string) => {
    setKnowledgeArticleId(articleId ?? null)
    setKnowledgeOpen(true)
  }, [])

  const closeKnowledge = useCallback(() => {
    setKnowledgeOpen(false)
  }, [])

  const pushAction = useCallback((description: string) => {
    dispatch({
      type: 'LOG_ACTION',
      id: uid(),
      at: Date.now(),
      description,
    })
  }, [])

  const pushSystem = useCallback((description: string) => {
    dispatch({
      type: 'LOG_SYSTEM',
      id: uid(),
      at: Date.now(),
      description,
    })
  }, [])

  const assertMiniAction = useCallback(
    (token: string) => {
      if (trainingMode !== 'mini' || !activeMiniTraining) return true
      if (isMiniActionAllowed(activeMiniTraining, token)) return true
      pushSystem(
        `Действие ${token} не относится к текущему мини-обучению.`,
      )
      return false
    },
    [activeMiniTraining, pushSystem, trainingMode],
  )

  // Simulation tick (пауза останавливает модель и таймер отказа)
  useEffect(() => {
    if (state.session.view !== 'exercise') return
    if (!state.session.started || state.session.completed) return
    if (state.session.paused) return
    if (!state.session.briefingAccepted) return
    const id = window.setInterval(() => {
      dispatch({ type: 'TICK', dt: state.session.timeScale })
    }, 1000)
    return () => clearInterval(id)
  }, [
    state.session.view,
    state.session.started,
    state.session.completed,
    state.session.paused,
    state.session.briefingAccepted,
    state.session.timeScale,
  ])

  // Фиксация времени появления тревог (для HMI: время / RTN при исчезновении)
  useEffect(() => {
    if (state.session.view !== 'exercise' || !state.session.started) return
    const alarms = getUtilityAlarms(state.process)
    const keys = new Set(alarms.map((a) => a.key))
    const prev = state.alarmRaisedAt
    const next: Record<string, number> = {}
    let changed = false
    const now = Date.now()
    for (const a of alarms) {
      if (prev[a.key] != null) next[a.key] = prev[a.key]
      else {
        next[a.key] = now
        changed = true
      }
    }
    for (const k of Object.keys(prev)) {
      if (!keys.has(k)) changed = true
    }
    if (changed || Object.keys(prev).length !== Object.keys(next).length) {
      dispatch({ type: 'SYNC_ALARM_TIMES', raisedAt: next })
    }
  }, [
    state.session.view,
    state.session.started,
    state.process,
    state.alarmRaisedAt,
  ])

  // Salt alarm (норма обучения ≤5 мг/л)
  useEffect(() => {
    if (state.session.view !== 'exercise' || !state.session.started) return
    if (state.session.paused) return
    if (state.process.feedFlow > 5 && state.process.saltMgL > 5) {
      if (saltAlarmLogged.current) return
      saltAlarmLogged.current = true
      pushSystem(
        `ТРЕВОГА: превышено содержание солей после ЭЛОУ (${state.process.saltMgL.toFixed(0)} мг/л > 5), риск коррозии по тракту.`,
      )
    } else if (state.process.saltMgL <= 5) {
      saltAlarmLogged.current = false
    }
  }, [
    state.session.view,
    state.session.started,
    state.session.paused,
    state.process.feedFlow,
    state.process.saltMgL,
    pushSystem,
  ])

  // Отказ по simTimeSec (корректно работает с паузой)
  useEffect(() => {
    if (state.session.view !== 'exercise') return
    if (!state.session.started || state.session.completed) return
    if (state.session.paused || state.faultTriggered) return
    if (trainingMode === 'mini') return
    const ex = getExercise(state.session.exerciseId)
    if (!ex?.faultType || !ex.triggerDelaySeconds) return
    if (state.process.simTimeSec < ex.triggerDelaySeconds) return

    const applied = applyFault(ex.faultType)
    dispatch({ type: 'SET_PROCESS', patch: applied.patch })
    for (const msg of applied.messages) pushSystem(msg)
    dispatch({ type: 'FAULT_TRIGGERED' })
    pushSystem(`--- Запущена нештатная ситуация: «${ex.name}» ---`)
  }, [
    state.session.view,
    state.session.started,
    state.session.completed,
    state.session.paused,
    state.session.exerciseId,
    state.faultTriggered,
    state.process.simTimeSec,
    trainingMode,
    pushSystem,
  ])

  // Fuel gas recovery detection (flexible)
  useEffect(() => {
    if (!state.faultTriggered || state.faultResponded || !state.faultAt) return
    if (recoveryLogged.current) return
    const ex = getExercise(state.session.exerciseId)
    if (ex?.faultType !== 'fuelGas') return
    if (state.process.fuelGasPercent >= 40) {
      recoveryLogged.current = true
      const sec = (Date.now() - state.faultAt) / 1000
      const inTime =
        ex.normResponseSeconds != null ? sec <= ex.normResponseSeconds : true
      dispatch({ type: 'FAULT_RESPONDED', seconds: sec, inTime })
      pushSystem(
        inTime
          ? `Нештатная ситуация устранена за ${sec.toFixed(1)} с (норма ${ex.normResponseSeconds} с).`
          : `Реакция ${sec.toFixed(1)} с — сверх нормы ${ex.normResponseSeconds} с.`,
      )
    }
  }, [
    state.faultTriggered,
    state.faultResponded,
    state.faultAt,
    state.process.fuelGasPercent,
    state.session.exerciseId,
    pushSystem,
  ])

  const logAction = useCallback(
    (description: string) => {
      pushAction(description)

      const cur = stateRef.current
      if (!cur.faultTriggered || cur.faultResponded || !cur.faultAt) return
      if (recoveryLogged.current) return
      const exercise = getExercise(cur.session.exerciseId)
      if (!exercise) return

      const done = new Set([
        ...cur.actionsLog.map((a) => a.description),
        description,
      ])
      const expected = exercise.expectedResponseActions ?? []

      let matched = false
      if (expected.length === 0) {
        matched = false
      } else if (exercise.faultType === 'fuelGas') {
        matched = [...done].some((d) => {
          const m = d.match(/топливного газа на (\d+)%/)
          return m != null && Number(m[1]) >= 40
        })
      } else {
        matched = expected.every((s) => done.has(s))
      }
      if (!matched) return

      recoveryLogged.current = true
      const sec = (Date.now() - cur.faultAt) / 1000
      const inTime =
        exercise.normResponseSeconds != null
          ? sec <= exercise.normResponseSeconds
          : true
      dispatch({ type: 'FAULT_RESPONDED', seconds: sec, inTime })
      pushSystem(
        inTime
          ? `Нештатная ситуация устранена за ${sec.toFixed(1)} с (норма ${exercise.normResponseSeconds} с).`
          : `Реакция ${sec.toFixed(1)} с — сверх нормы ${exercise.normResponseSeconds} с.`,
      )
    },
    [pushAction, pushSystem],
  )
  const canControl =
    state.session.view === 'exercise' &&
    state.session.started &&
    !state.session.completed &&
    !state.session.paused &&
    state.session.role === 'trainee'

  const blockSequence = useCallback(
    (action: GuardedAction, fuelTarget?: number) => {
      const cur = stateRef.current
      const reason = sequenceBlockReason({
        exercise: getExercise(cur.session.exerciseId),
        process: cur.process,
        actionLogs: cur.actionsLog.map((a) => a.description),
        action,
        fuelTarget,
      })
      if (reason) {
        pushSystem(`Последовательность: ${reason}`)
        return true
      }
      const interlock = processInterlockReason(
        cur.process,
        action,
        fuelTarget,
      )
      if (interlock) {
        pushSystem(interlock)
        return true
      }
      return false
    },
    [pushSystem],
  )

  const startPumpN1 = useCallback(() => {
    if (!canControl) return
    if (!assertMiniAction(pumpActionToken('N-1'))) return
    if (blockSequence('start-N1')) return
    const proc = stateRef.current.process
    if (!proc.powerOk) {
      pushSystem('Пуск Н-1 невозможен: нет электропитания.')
      return
    }
    const p = proc.pumpN1
    if (p === 'running' || p === 'starting') return
    if (
      !window.confirm(
        'Подтвердите пуск сырьевого насоса Н-1 (критическая операция).',
      )
    )
      return
    logAction("Насос 'Н-1': нажата кнопка 'Пуск'")
    mirrorServerCommand(serverSimIdRef.current, 'start-N1')
    dispatch({ type: 'SET_PROCESS', patch: { pumpN1: 'starting' } })
    if (pumpStartTimer.current) clearTimeout(pumpStartTimer.current)
    pumpStartTimer.current = window.setTimeout(() => {
      if (
        stateRef.current.process.pumpN1 === 'starting' &&
        stateRef.current.process.powerOk
      ) {
        dispatch({ type: 'SET_PROCESS', patch: { pumpN1: 'running' } })
        pushSystem('Н-1 вышел на режим (Running).')
      }
    }, 1500)
  }, [canControl, logAction, pushSystem, blockSequence, assertMiniAction])

  const stopPumpN1 = useCallback(() => {
    if (!canControl) return
    if (!assertMiniAction(pumpActionToken('N-1'))) return
    if (blockSequence('shutdown-stop-N1')) return
    if (stateRef.current.process.pumpN1 === 'stopped') return
    logAction("Насос 'Н-1': нажата кнопка 'Стоп'")
    mirrorServerCommand(serverSimIdRef.current, 'stop-N1')
    if (pumpStartTimer.current) clearTimeout(pumpStartTimer.current)
    dispatch({
      type: 'SET_PROCESS',
      patch: { pumpN1: 'stopped', pressureN1: 0 },
    })
  }, [canControl, logAction, blockSequence, assertMiniAction])

  const startPump = useCallback(
    (id: 'N-1' | 'N-2' | 'N-3') => {
      if (id === 'N-1') {
        startPumpN1()
        return
      }
      if (!canControl) return
      if (!assertMiniAction(pumpActionToken(id))) return
      if (blockSequence(id === 'N-2' ? 'start-N2' : 'start-N3')) return
      const proc = stateRef.current.process
      if (!proc.powerOk) {
        pushSystem(`Пуск ${id} невозможен: нет электропитания.`)
        return
      }
      const key = id === 'N-2' ? 'pumpN2' : 'pumpN3'
      if (proc[key] === 'running' || proc[key] === 'starting') return
      if (
        !window.confirm(
          `Подтвердите пуск насоса ${id} (подача в печной тракт).`,
        )
      ) {
        return
      }
      logAction(`Насос '${id}': нажата кнопка 'Пуск'`)
      mirrorServerCommand(
        serverSimIdRef.current,
        id === 'N-2' ? 'start-N2' : 'start-N3',
      )
      dispatch({ type: 'SET_PROCESS', patch: { [key]: 'running' } })
    },
    [canControl, logAction, pushSystem, startPumpN1, blockSequence, assertMiniAction],
  )

  const stopPump = useCallback(
    (id: 'N-1' | 'N-2' | 'N-3') => {
      if (id === 'N-1') {
        stopPumpN1()
        return
      }
      if (!canControl) return
      if (!assertMiniAction(pumpActionToken(id))) return
      if (blockSequence('shutdown-stop-furnace-pump')) return
      const key = id === 'N-2' ? 'pumpN2' : 'pumpN3'
      if (stateRef.current.process[key] === 'stopped') return
      logAction(`Насос '${id}': нажата кнопка 'Стоп'`)
      mirrorServerCommand(
        serverSimIdRef.current,
        id === 'N-2' ? 'stop-N2' : 'stop-N3',
      )
      dispatch({ type: 'SET_PROCESS', patch: { [key]: 'stopped' } })
    },
    [canControl, logAction, stopPumpN1, blockSequence, assertMiniAction],
  )

  const openValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
      if (!assertMiniAction(valveActionToken(id))) return
      if (!stateRef.current.process.instrumentAirOk) {
        pushSystem('Привод задвижки недоступен: нет приборного воздуха.')
        return
      }
      const guard: GuardedAction =
        id === 'L-1' ? 'open-L1' : id === 'L-2' ? 'open-L2' : 'open-L3'
      if (blockSequence(guard)) return
      const names = {
        'L-1': "Электрозадвижка 'Л-1 (вход сырья)' нажата кнопка 'Открыть'",
        'L-2':
          "Электрозадвижка 'Л-2 (вывод бензина НК-180°С)' нажата кнопка 'Открыть'",
        'L-3':
          "Электрозадвижка 'Л-3 (вывод товарного мазута)' нажата кнопка 'Открыть'",
      }
      logAction(names[id])
      mirrorServerCommand(serverSimIdRef.current, guard)
      const patch: Partial<ProcessState> =
        id === 'L-1'
          ? { valveL1Motion: 'opening' }
          : id === 'L-2'
            ? { valveL2Motion: 'opening' }
            : { valveL3Motion: 'opening' }
      dispatch({ type: 'SET_PROCESS', patch })
    },
    [canControl, logAction, pushSystem, blockSequence, assertMiniAction],
  )

  const closeValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
      if (!assertMiniAction(valveActionToken(id))) return
      if (!stateRef.current.process.instrumentAirOk) {
        pushSystem('Привод задвижки недоступен: нет приборного воздуха.')
        return
      }
      const names = {
        'L-1': "Электрозадвижка 'Л-1 (вход сырья)' нажата кнопка 'Закрыть'",
        'L-2':
          "Электрозадвижка 'Л-2 (вывод бензина НК-180°С)' нажата кнопка 'Закрыть'",
        'L-3':
          "Электрозадвижка 'Л-3 (вывод товарного мазута)' нажата кнопка 'Закрыть'",
      }
      logAction(names[id])
      const patch: Partial<ProcessState> =
        id === 'L-1'
          ? { valveL1Motion: 'closing' }
          : id === 'L-2'
            ? { valveL2Motion: 'closing' }
            : { valveL3Motion: 'closing' }
      dispatch({ type: 'SET_PROCESS', patch })
    },
    [canControl, logAction, pushSystem, assertMiniAction],
  )

  const stopValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
      if (!assertMiniAction(valveActionToken(id))) return
      const patch: Partial<ProcessState> =
        id === 'L-1'
          ? { valveL1Motion: 'idle' }
          : id === 'L-2'
            ? { valveL2Motion: 'idle' }
            : { valveL3Motion: 'idle' }
      dispatch({ type: 'SET_PROCESS', patch })
      logAction(`Электрозадвижка '${id}': останов привода`)
    },
    [canControl, logAction, assertMiniAction],
  )

  const setDemulsifier = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (!assertMiniAction(toggleActionToken('demulsifierOn'))) return
      if (on && blockSequence('elou-demulsifier')) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена")
      else logAction("ЭЛОУ 'Э-1..Э-6': подача деэмульгатора отключена")
      dispatch({ type: 'SET_PROCESS', patch: { demulsifierOn: on } })
    },
    [canControl, logAction, blockSequence, assertMiniAction],
  )

  const setElectricField = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (!assertMiniAction(toggleActionToken('electricFieldOn'))) return
      if (on && blockSequence('elou-field')) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': электрическое поле включено")
      else logAction("ЭЛОУ 'Э-1..Э-6': электрическое поле отключено")
      dispatch({ type: 'SET_PROCESS', patch: { electricFieldOn: on } })
    },
    [canControl, logAction, blockSequence, assertMiniAction],
  )

  const setWashWater = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (!assertMiniAction(toggleActionToken('washWaterOn'))) return
      if (on && blockSequence('elou-wash')) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': промывная вода включена")
      else logAction("ЭЛОУ 'Э-1..Э-6': промывная вода отключена")
      dispatch({ type: 'SET_PROCESS', patch: { washWaterOn: on } })
    },
    [canControl, logAction, blockSequence, assertMiniAction],
  )

  const setLevelSetpoint = useCallback(
    (column: 'K-1' | 'K-2', percent: number) => {
      if (!canControl) return
      if (!assertMiniAction(levelSetpointToken(column))) return
      const v = Math.max(10, Math.min(90, Math.round(percent)))
      if (column === 'K-1') {
        logAction(`Колонна 'К-1': задан уровень куба ${v}%`)
        dispatch({ type: 'SET_PROCESS', patch: { levelSetpointK1: v } })
      } else {
        logAction(`Колонна 'К-2': задан уровень куба ${v}%`)
        dispatch({ type: 'SET_PROCESS', patch: { levelSetpointK2: v } })
      }
    },
    [canControl, logAction, assertMiniAction],
  )

  const drainVesselWater = useCallback(
    (id: 'E-1-vessel' | 'E-2-vessel') => {
      if (!canControl) return
      if (!assertMiniAction(drainActionToken(id))) return
      const label = id === 'E-1-vessel' ? 'E-1' : 'E-2'
      if (
        !window.confirm(
          `Подтвердите дренаж воды из ${label} (и парной ёмкости E-1/E-2)?`,
        )
      ) {
        return
      }
      dispatch({
        type: 'SET_PROCESS',
        patch: { levelWaterE1: 35, levelWaterE2: 35 },
      })
      logAction(
        "Авария: скорректирован уровень воды E-1/E-2, предотвращён занос в колонны (SC-11)",
      )
    },
    [canControl, logAction, assertMiniAction],
  )

  const setAvoFan = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (!assertMiniAction(toggleActionToken('avoFanOn'))) return
      logAction(
        on
          ? "АВО 'АВЗ-3': вентилятор включён"
          : "АВО 'АВЗ-3': вентилятор отключён",
      )
      dispatch({ type: 'SET_PROCESS', patch: { avoFanOn: on } })
    },
    [canControl, logAction, assertMiniAction],
  )

  const setUtility = useCallback(
    (
      key:
        | 'steamOk'
        | 'powerOk'
        | 'coolingWaterOk'
        | 'instrumentAirOk'
        | 'ventOpsOk'
        | 'ventElouOk',
      ok: boolean,
    ) => {
      if (!canControl) return
      if (!assertMiniAction(utilityActionToken(key))) return
      const names: Record<typeof key, string> = {
        steamOk: 'Технологический пар',
        powerOk: 'Электропитание 0,4/6 кВ',
        coolingWaterOk: 'Оборотная вода',
        instrumentAirOk: 'Приборный воздух',
        ventOpsOk: 'Вентиляция операторной/РУ',
        ventElouOk: 'Вентиляция насосных ЭЛОУ',
      }
      if (
        !ok &&
        !window.confirm(
          `Подтвердите отключение утилиты «${names[key]}» (критично для процесса)?`,
        )
      ) {
        return
      }
      logAction(
        ok
          ? `Утилита «${names[key]}»: восстановлена / включена`
          : `Утилита «${names[key]}»: отключена`,
      )
      const patch: Partial<ProcessState> = { [key]: ok }
      if (key === 'powerOk' && ok) {
        patch.opsPowerOk = true
        patch.opsPowerOnBattery = false
      }
      if (key === 'steamOk' && !ok) {
        patch.fuelGasPercent = 0
      }
      dispatch({ type: 'SET_PROCESS', patch })
    },
    [canControl, logAction, assertMiniAction],
  )

  const protectColumnLevel = useCallback(
    (column: 'K-1' | 'K-2') => {
      if (!canControl) return
      if (!assertMiniAction(protectLevelToken(column))) return
      if (
        !window.confirm(
          `Подтвердите разгрузку печи и защиту уровня ${column}?`,
        )
      ) {
        return
      }
      if (column === 'K-1') {
        logAction(
          "Авария: разгрузка печи и меры по сохранению минимального уровня K-1 (SC-12)",
        )
        dispatch({
          type: 'SET_PROCESS',
          patch: {
            fuelGasPercent: 0,
            levelSetpointK1: 45,
            levelK1: Math.max(stateRef.current.process.levelK1, 28),
            safeShutdownInitiated: true,
          },
        })
      } else {
        logAction(
          "Авария: восстановление рефлюкса и снижение нагрузки (SC-13)",
        )
        dispatch({
          type: 'SET_PROCESS',
          patch: {
            levelReflux: 45,
            levelSetpointK2: 50,
            fuelGasPercent: Math.min(
              stateRef.current.process.fuelGasPercent,
              40,
            ),
          },
        })
      }
    },
    [canControl, logAction, assertMiniAction],
  )

  const setFuelGas = useCallback(
    (percent: number) => {
      if (!canControl) return
      if (!assertMiniAction(fuelActionToken())) return
      const proc = stateRef.current.process
      if (!proc.steamOk && percent > 0) {
        pushSystem(
          'Подача топлива заблокирована: нет технологического пара (горелки погашены).',
        )
        return
      }
      if (proc.coilRupture || proc.furnaceEsd) {
        pushSystem('Подача топлива заблокирована: ESD / разрыв змеевика.')
        return
      }
      const p = Math.max(0, Math.min(100, Math.round(percent)))
      if (blockSequence('fuel', p)) return
      logAction(`Печь 'П-1': Изменена подача топливного газа на ${p}%`)
      mirrorServerCommand(serverSimIdRef.current, 'fuel', { fuelTarget: p })
      dispatch({ type: 'SET_PROCESS', patch: { fuelGasPercent: p } })
    },
    [canControl, logAction, pushSystem, blockSequence, assertMiniAction],
  )

  const performEmergencyAction = useCallback(
    (actionId: string) => {
      if (!canControl) return
      const def = EMERGENCY_ACTIONS.find((a) => a.id === actionId)
      if (!def) return
      const cur = stateRef.current
      const ex = getExercise(cur.session.exerciseId)
      const fault = ex?.faultType
      if (
        !cur.faultTriggered ||
        !fault ||
        !(
          def.clearsFaults.includes(fault) ||
          (def.procedureFor?.includes(fault) ?? false)
        )
      ) {
        return
      }
      const needsConfirm =
        actionId === 'esd-coil' ||
        actionId === 'safe-stop-power' ||
        actionId === 'safe-stop-air' ||
        actionId === 'cut-fuel-steam' ||
        actionId === 'sc02-safe-stop' ||
        actionId === 'isolate-leak'
      if (
        needsConfirm &&
        !window.confirm(`Подтвердите аварийное действие:\n«${def.label}»`)
      ) {
        return
      }
      const patch = def.apply?.(cur.process) ?? {}
      if (Object.keys(patch).length) {
        dispatch({ type: 'SET_PROCESS', patch })
      }
      logAction(def.logDescription)
      pushSystem(`Выполнено: ${def.label}`)
    },
    [canControl, logAction, pushSystem],
  )

  const openPanelForEquip = useCallback((equipId: string) => {
    if (trainingMode === 'mini' && activeMiniTraining) {
      const focus = expandMiniFocusEquipment(activeMiniTraining)
      if (
        !focus.has(equipId) &&
        !activeMiniTraining.zoneIds.includes(equipId)
      ) {
        pushSystem('Оборудование вне выбранного сегмента заблокировано.')
        return
      }
    }
    dispatch({ type: 'SELECT_EQUIP', id: equipId })
    const node = equipmentById[equipId]
    if (!node) {
      dispatch({ type: 'CLOSE_PANEL' })
      return
    }
    // Баннеры зон — только навигация по схеме, без панели сведений
    if (equipId.startsWith('zone-')) {
      dispatch({ type: 'CLOSE_PANEL' })
      return
    }

    let panel: PanelKind = null
    switch (node.type) {
      case 'pump':
        panel = { type: 'pump', id: equipId }
        break
      case 'valve':
        panel = { type: 'valve', id: equipId }
        break
      case 'furnace':
        panel = { type: 'furnace', id: equipId }
        break
      case 'column':
        panel = { type: 'column', id: equipId }
        break
      case 'desalter':
        panel = { type: 'desalter', id: equipId }
        break
      case 'signal':
        panel = { type: 'signal', id: equipId }
        break
      case 'group':
        if (equipId === 'ELOU-block') {
          panel = { type: 'desalter', id: 'ELOU-block' }
        } else if (equipId === 'UTIL-block') {
          panel = { type: 'info', id: equipId, equipType: 'utilities' }
        } else {
          panel = { type: 'info', id: equipId, equipType: node.type }
        }
        break
      case 'vessel':
        panel = { type: 'info', id: equipId, equipType: 'vessel' }
        break
      case 'heatExchanger':
        panel = { type: 'info', id: equipId, equipType: 'heatExchanger' }
        break
      default:
        panel = { type: 'info', id: equipId, equipType: node.type }
        break
    }
    dispatch({ type: 'OPEN_PANEL', panel })
  }, [activeMiniTraining, pushSystem, trainingMode])

  const completeExercise = useCallback(() => {
    const cur = stateRef.current
    if (cur.session.view !== 'exercise' || cur.session.completed) return

    const training =
      trainingMode === 'mini'
        ? getMiniTraining(MINI_TRAININGS, selectedMiniTrainingId)
        : undefined
    const ex = training ? undefined : getExercise(cur.session.exerciseId)

    let scorePercent: number
    let penalty: number
    let penaltyDetail:
      | { unsafe: number; late: number; extra: number; missed: number }
      | undefined
    let qualified: boolean
    let summary: string
    let criticalFailReason: string | null =
      cur.session.criticalFailReason ?? null
    let outcomeOk = true
    let lcsMatched: number | undefined
    let lcsTotal: number | undefined
    let trajectoryError:
      | {
          at: number | null
          stepIndex: number
          expected: string
          rule: string
          message: string
        }
      | null
      | undefined
    let recommendExerciseId: string | null | undefined
    let recommendReason: string | null | undefined

    if (training) {
      const progress = evaluateMiniTraining(training, cur.process)
      scorePercent = Math.max(0, progress.progressPercent - hintsUsed * 5)
      penalty = hintsUsed
      penaltyDetail = {
        unsafe: 0,
        late: 0,
        extra: hintsUsed,
        missed: progress.checks.filter((ok) => !ok).length,
      }
      qualified = progress.completed && scorePercent >= 70
      summary = progress.completed
        ? `Мини-урок выполнен (${scorePercent}%, подсказок: ${hintsUsed}).`
        : `Мини-урок не завершён (${progress.progressPercent}% целей, подсказок: ${hintsUsed}).`
      outcomeOk = progress.completed
    } else {
      const scored = scoreExercise({
        exercise: ex,
        process: cur.process,
        actionsLog: cur.actionsLog,
        faultTriggered: cur.faultTriggered,
        faultResponded: cur.faultResponded,
        respondedInTime: cur.session.respondedInTime,
        responseSeconds: cur.session.responseSeconds,
      })
      scorePercent = scored.scorePercent
      penalty = scored.penalty
      penaltyDetail = scored.penaltyDetail
      qualified = scored.qualified
      summary = scored.summary
      outcomeOk = scored.outcomeOk
      criticalFailReason =
        cur.session.criticalFailReason ??
        criticalFailReasonText(cur.process, ex, cur.actionsLog)
      lcsMatched = scored.lcsMatched
      lcsTotal = scored.lcsTotal
      trajectoryError = scored.trajectoryError
      recommendExerciseId = scored.adaptive?.miniTrainingId ?? null
      recommendReason = scored.adaptive?.reason ?? null
    }

    const finishEvent = {
      id: uid(),
      at: Date.now(),
      description: `Упражнение завершено. ${summary}`,
    }
    const systemEvents = [...cur.systemEvents, finishEvent]

    const analogSample = cur.analogHistory.filter(
      (_, i) => i % 5 === 0 || i === cur.analogHistory.length - 1,
    )

    if (cur.session.role === 'trainee' && cur.session.userName.trim()) {
      void saveReport({
        id: uid(),
        userName: cur.session.userName.trim(),
        exerciseId: cur.session.exerciseId ?? training?.id ?? '',
        exerciseName: training?.title ?? ex?.name ?? '—',
        completedAt: finishEvent.at,
        scorePercent,
        penalty,
        penaltyDetail,
        responseSeconds: cur.session.responseSeconds,
        respondedInTime: cur.session.respondedInTime,
        simTimeSec: cur.process.simTimeSec,
        qualified,
        qualificationSummary: summary,
        criticalFail: Boolean(criticalFailReason) || !outcomeOk,
        outcomeOk,
        lcsMatched,
        lcsTotal,
        trajectoryError: trajectoryError ?? null,
        recommendExerciseId: recommendExerciseId ?? null,
        recommendReason: recommendReason ?? null,
        protocolVersion: PROTOCOL_VERSION,
        modelVersion: MODEL_VERSION,
        scenarioVersion: SCENARIO_VERSION,
        sessionMode: cur.session.mode,
        analogSample,
        actionsLog: cur.actionsLog.map(({ at, description }) => ({
          at,
          description,
        })),
        systemEvents: systemEvents.map(({ at, description }) => ({
          at,
          description,
        })),
      })
      void appendAudit({
        actor: cur.session.userName.trim(),
        role: 'trainee',
        action: 'complete_exercise',
        detail: `${cur.session.exerciseId ?? training?.id ?? '?'} · ${
          cur.session.mode
        } · ${qualified ? 'PASS' : 'FAIL'} · ${scorePercent}%`,
      })
    }

    dispatch({
      type: 'COMPLETE',
      scorePercent,
      penalty,
      penaltyDetail: penaltyDetail ?? {
        unsafe: 0,
        late: 0,
        extra: 0,
        missed: 0,
      },
      qualified,
      qualificationSummary: summary,
      finishEvent,
      criticalFailReason,
    })
  }, [hintsUsed, selectedMiniTrainingId, trainingMode])

  // Экзамен: критический fail → автозавершение
  useEffect(() => {
    if (state.session.view !== 'exercise') return
    if (!state.session.started || state.session.completed) return
    if (state.session.mode !== 'exam') return
    if (trainingMode === 'mini') return
    if (!state.session.briefingAccepted) return
    if (criticalFailHandled.current) return

    const ex = getExercise(state.session.exerciseId)
    const reason = criticalFailReasonText(
      state.process,
      ex,
      state.actionsLog,
    )
    if (!reason) return
    if (state.session.criticalFailReason) return

    criticalFailHandled.current = true
    dispatch({ type: 'SET_CRITICAL_FAIL', reason })
    pushSystem(reason)
    completeExercise()
  }, [
    state.session.view,
    state.session.started,
    state.session.completed,
    state.session.mode,
    state.session.briefingAccepted,
    state.session.criticalFailReason,
    state.session.exerciseId,
    state.process,
    state.actionsLog,
    trainingMode,
    pushSystem,
    completeExercise,
  ])

  const setPaused = useCallback(
    (paused: boolean) => {
      if (stateRef.current.session.view !== 'exercise') return
      if (stateRef.current.session.completed) return
      dispatch({ type: 'SET_PAUSED', paused })
      pushSystem(paused ? 'Симуляция на паузе.' : 'Симуляция продолжена.')
      void appendAudit({
        actor: stateRef.current.session.userName || 'trainee',
        role: 'trainee',
        action: paused ? 'pause' : 'resume',
      })
    },
    [pushSystem],
  )

  const resetToStart = useCallback(() => {
    recoveryLogged.current = false
    saltAlarmLogged.current = false
    criticalFailHandled.current = false
    if (pumpStartTimer.current) {
      clearTimeout(pumpStartTimer.current)
      pumpStartTimer.current = null
    }
    setTrainingModeState('full')
    setSelectedMiniTrainingId(null)
    setHintsUsed(0)
    setVisibleHint(null)
    setKnowledgeOpen(false)
    setKnowledgeArticleId(null)
    dispatch({ type: 'RESET_TO_START' })
    const user = getAuthedUser()
    if (user) {
      dispatch({ type: 'SET_ROLE', role: resolveWorkRole(user) })
      dispatch({ type: 'SET_NAME', name: user.fullName })
    }
  }, [])

  const startSession = useCallback(() => {
    recoveryLogged.current = false
    saltAlarmLogged.current = false
    criticalFailHandled.current = false
    serverSimIdRef.current = null
    if (pumpStartTimer.current) {
      clearTimeout(pumpStartTimer.current)
      pumpStartTimer.current = null
    }
    const user = getAuthedUser()
    if (user) {
      dispatch({ type: 'SET_NAME', name: user.fullName })
    }
    const cur = {
      ...stateRef.current.session,
      role: stateRef.current.session.role,
      userName: user?.fullName ?? stateRef.current.session.userName,
    }
    const training =
      trainingMode === 'mini'
        ? getMiniTraining(MINI_TRAININGS, selectedMiniTrainingId)
        : undefined
    if (trainingMode === 'mini' && !training) return
    if (trainingMode === 'full' && !getExercise(cur.exerciseId)) return
    if (cur.role !== 'trainee' || !cur.userName.trim()) return

    if (training) {
      dispatch({ type: 'SET_EXERCISE', id: training.id })
      void appendAudit({
        actor: cur.userName || 'trainee',
        role: 'trainee',
        action: 'start_session',
        detail: `${training.id} · mini`,
      })
      setHintsUsed(0)
      setVisibleHint(null)
      dispatch({
        type: 'START_SESSION',
        process: applyMiniPreset(training.id),
        label: training.title,
        skipBriefing: true,
      })
      void createServerSimSession({
        exerciseId: training.id,
        initial: applyMiniPreset(training.id) as unknown as Record<
          string,
          unknown
        >,
      })
        .then((s) => {
          serverSimIdRef.current = s.id
        })
        .catch(() => undefined)
      return
    }

    void appendAudit({
      actor: cur.userName || 'trainee',
      role: 'trainee',
      action: 'start_session',
      detail: `${cur.exerciseId ?? '?'} · ${cur.mode}`,
    })
    dispatch({ type: 'START_SESSION' })
    void createServerSimSession({ exerciseId: cur.exerciseId })
      .then((s) => {
        serverSimIdRef.current = s.id
      })
      .catch(() => undefined)
  }, [selectedMiniTrainingId, trainingMode])

  const ackAlarm = useCallback((key: string) => {
    dispatch({ type: 'ACK_ALARM', key })
    pushSystem(`Тревога квитирована: ${key}`)
  }, [pushSystem])

  const injectCurrentFault = useCallback(() => {
    const cur = stateRef.current
    if (cur.session.view !== 'exercise' || cur.session.completed) return
    if (cur.faultTriggered) {
      pushSystem('Отказ уже активен.')
      return
    }
    const ex = getExercise(cur.session.exerciseId)
    if (!ex?.faultType) {
      pushSystem('У текущего упражнения нет отказа для ввода.')
      return
    }
    const applied = applyFault(ex.faultType)
    dispatch({ type: 'SET_PROCESS', patch: applied.patch })
    for (const msg of applied.messages) pushSystem(msg)
    dispatch({ type: 'FAULT_TRIGGERED' })
    pushSystem(`--- Нештатная ситуация: «${ex.name}» ---`)
    void appendAudit({
      actor: 'instructor',
      role: 'instructor',
      action: 'inject_fault',
      detail: ex.faultType,
    })
  }, [pushSystem])

  const acceptBriefing = useCallback(() => {
    dispatch({ type: 'ACCEPT_BRIEFING' })
    pushSystem('Брифинг принят. Симуляция запущена.')
  }, [pushSystem])

  const setTimeScale = useCallback(
    (timeScale: TimeScale) => {
      dispatch({ type: 'SET_TIME_SCALE', timeScale })
      pushSystem(`Масштаб времени: ${timeScale}×`)
    },
    [pushSystem],
  )

  const setInstructorLiveOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_INSTRUCTOR_LIVE', open })
  }, [])

  const saveSnapshot = useCallback(() => {
    const cur = stateRef.current
    if (cur.session.view !== 'exercise' || !cur.session.started) return
    const snapshot: SessionSnapshot = {
      savedAt: Date.now(),
      label: `t=${cur.process.simTimeSec.toFixed(0)}с`,
      process: { ...cur.process },
      actionsLog: [...cur.actionsLog],
      systemEvents: [...cur.systemEvents],
      faultTriggered: cur.faultTriggered,
      faultResponded: cur.faultResponded,
      faultAt: cur.faultAt,
      analogHistory: [...cur.analogHistory],
      ackedAlarmKeys: [...cur.ackedAlarmKeys],
      alarmRaisedAt: { ...cur.alarmRaisedAt },
      responseSeconds: cur.session.responseSeconds,
      respondedInTime: cur.session.respondedInTime,
    }
    dispatch({ type: 'SAVE_SNAPSHOT', snapshot })
    pushSystem('Снимок состояния сохранён.')
  }, [pushSystem])

  const restoreSnapshot = useCallback(() => {
    const cur = stateRef.current
    if (!cur.snapshot) {
      pushSystem('Нет сохранённого снимка.')
      return
    }
    recoveryLogged.current = cur.snapshot.faultResponded
    criticalFailHandled.current = false
    dispatch({ type: 'RESTORE_SNAPSHOT' })
    pushSystem('Состояние восстановлено из снимка.')
  }, [pushSystem])

  const analogs = useMemo(() => getAnalogs(state.process), [state.process])

  const api: TrainerApi = {
    state,
    exercises,
    analogs,
    setRole: (role) => dispatch({ type: 'SET_ROLE', role }),
    setName: (name) => dispatch({ type: 'SET_NAME', name }),
    setExercise: (id) => dispatch({ type: 'SET_EXERCISE', id }),
    setSessionMode: (mode) => dispatch({ type: 'SET_MODE', mode }),
    openReports: () => dispatch({ type: 'OPEN_REPORTS' }),
    startSession,
    selectEquip: (id) => dispatch({ type: 'SELECT_EQUIP', id }),
    openPanelForEquip,
    closePanel: () => dispatch({ type: 'CLOSE_PANEL' }),
    startPumpN1,
    stopPumpN1,
    startPump,
    stopPump,
    openValve,
    closeValve,
    stopValve,
    setDemulsifier,
    setElectricField,
    setWashWater,
    setFuelGas,
    setLevelSetpoint,
    drainVesselWater,
    setAvoFan,
    setUtility,
    protectColumnLevel,
    completeExercise,
    resetToStart,
    performEmergencyAction,
    setPaused,
    ackAlarm,
    injectCurrentFault,
    acceptBriefing,
    setTimeScale,
    setInstructorLiveOpen,
    saveSnapshot,
    restoreSnapshot,
    canControl,
    trainingMode,
    setTrainingMode,
    miniTrainings: MINI_TRAININGS,
    selectedMiniTrainingId,
    setSelectedMiniTraining,
    activeMiniTraining,
    miniTrainingProgress,
    visibleHint,
    hintsUsed,
    requestHint,
    knowledgeOpen,
    knowledgeArticleId,
    openKnowledge,
    closeKnowledge,
  }

  return (
    <TrainerContext.Provider value={api}>{children}</TrainerContext.Provider>
  )
}

export function useTrainer() {
  const ctx = useContext(TrainerContext)
  if (!ctx) throw new Error('useTrainer must be used within TrainerProvider')
  return ctx
}
