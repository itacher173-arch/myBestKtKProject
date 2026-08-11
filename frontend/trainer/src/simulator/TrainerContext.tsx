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
} from '../training/actions'
import {
  evaluateMiniTraining,
  getMiniTraining,
  MINI_TRAININGS,
  type MiniTraining,
  type TrainingHint,
  type TrainingProgress,
} from '../training/catalog'
import { applyMiniPreset } from '../training/presets'
import { expandMiniFocusEquipment } from '../training/focusPath'
import {
  EMERGENCY_ACTIONS,
  applyFault,
} from './faultEngine'
import { appendAudit } from '../storage/auditStorage'
import { getAuthedUser, resolveWorkRole } from '../auth/authApi'
import { processInterlockReason, criticalFailReasonText } from './pazGuards'
import {
  abandonServerSimSession,
  completeServerSimSession,
  createServerSimSession,
  getServerSimSession,
  resumeServerSimSession,
  saveServerSimCheckpoint,
  sendServerSimCommand,
  type ActiveSimCheckpoint,
  type ServerSimSession,
  type SimClientCheckpoint,
} from './serverSimApi'
import { sequenceBlockReason, type GuardedAction } from './scenarioGuards'
import { getAnalogs, getUtilityAlarms, tickProcess } from './processModel'
import type { AiAnalysis } from '../ai/types'
import {
  PROTOCOL_VERSION,
  saveReport,
  updateReportAnalysis,
} from '../storage/reportsStorage'
import { exercises, getExercise, SCENARIO_VERSION } from '../scenarios/exercises'
import { scoreExercise } from './scoring'
import {
  TIME_SCALES,
  type AnalogTag,
  type PanelKind,
  type ProcessState,
  type Role,
  type SessionMode,
  type SessionSnapshot,
  type TimeScale,
  type TrainerState,
} from './types'
import { usePreferences } from '../settings/PreferencesContext'
import { useConfirm } from '../common/ui/ConfirmDialog'
import { apiPost } from '../api/client'
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
  | {
      type: 'RESUME_SESSION'
      restored: TrainerState
      process: ProcessState
      paused: boolean
    }
  | { type: 'SYNC_ALARM_TIMES'; raisedAt: Record<string, number> }
  | { type: 'SELECT_EQUIP'; id: string | null }
  | { type: 'OPEN_PANEL'; panel: PanelKind }
  | { type: 'CLOSE_PANEL' }
  | { type: 'LOG_ACTION'; id: string; at: number; description: string }
  | { type: 'LOG_SYSTEM'; id: string; at: number; description: string }
  | { type: 'TICK'; dt: number }
  | { type: 'SET_PROCESS'; patch: Partial<ProcessState> }
  | { type: 'REPLACE_PROCESS'; process: ProcessState }
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
      // Не переключаем рабочую роль: dual-role остаётся в trainee → «Мои результаты»
      return {
        ...state,
        session: {
          ...state.session,
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
    case 'RESUME_SESSION':
      return {
        ...action.restored,
        process: action.process,
        activePanel: null,
        selectedEquipId: null,
        session: {
          ...action.restored.session,
          role: 'trainee',
          view: 'exercise',
          started: true,
          completed: false,
          paused: action.paused,
          instructorLiveOpen: false,
        },
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
    case 'REPLACE_PROCESS': {
      const process = action.process
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
      const last = state.analogHistory[state.analogHistory.length - 1]
      const history =
        last && Math.abs(last.t - sample.t) < 0.05
          ? state.analogHistory
          : [...state.analogHistory, sample].slice(-90)
      return { ...state, process, analogHistory: history }
    }
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
          paused: snap.paused,
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
  resumeSession: (checkpoint: ActiveSimCheckpoint) => Promise<void>
  abandonSession: (sessionId: string) => Promise<void>
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
  sessionTransition: 'pause' | 'resume' | null
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
  aiAnalysis: AiAnalysis | null
  aiAnalysisStatus: 'idle' | 'loading' | 'ready' | 'error' | 'disabled'
  aiAnalysisError: string
  retryAiAnalysis: () => void
  assignMiniTraining: (id: string) => void
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
  const { aiEnabled } = usePreferences()
  const confirm = useConfirm()
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const pumpStartTimer = useRef<number | null>(null)
  const recoveryLogged = useRef(false)
  const saltAlarmLogged = useRef(false)
  const criticalFailHandled = useRef(false)
  const levelSetpointChanges = useRef<
    Record<
      'K-1' | 'K-2',
      { from: number; to: number; timer: number } | null
    >
  >({ 'K-1': null, 'K-2': null })
  const serverSimIdRef = useRef<string | null>(null)
  const [serverSimId, setServerSimId] = useState<string | null>(null)
  const serverSimMetaRef = useRef<{
    seed: number | null
    modelVersion: string
    scenarioVersion: string
  }>({
    seed: null,
    modelVersion: MODEL_VERSION,
    scenarioVersion: SCENARIO_VERSION,
  })
  const lastPolledSimTime = useRef(-1)
  const serverMutationRevision = useRef(0)
  const serverMutationsPending = useRef(0)
  const sessionTransitionRef = useRef<'pause' | 'resume' | null>(null)
  const [sessionTransition, setSessionTransition] = useState<
    'pause' | 'resume' | null
  >(null)

  useEffect(
    () => () => {
      for (const change of Object.values(levelSetpointChanges.current)) {
        if (change) window.clearTimeout(change.timer)
      }
      levelSetpointChanges.current = { 'K-1': null, 'K-2': null }
    },
    [state.session.exerciseId],
  )

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
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null)
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'disabled'
  >(aiEnabled ? 'idle' : 'disabled')
  const [aiAnalysisError, setAiAnalysisError] = useState('')
  const lastAiPayloadRef = useRef<Record<string, unknown> | null>(null)
  const lastAiReportIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!aiEnabled && aiAnalysisStatus !== 'ready') {
      setAiAnalysisStatus('disabled')
    }
    if (aiEnabled && aiAnalysisStatus === 'disabled') {
      setAiAnalysisStatus('idle')
    }
  }, [aiAnalysisStatus, aiEnabled])

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

  const assignMiniTraining = useCallback((id: string) => {
    setTrainingModeState('mini')
    setSelectedMiniTrainingId(id)
    setVisibleHint(null)
    setHintsUsed(0)
    setKnowledgeOpen(false)
    setKnowledgeArticleId(null)
    setAiAnalysis(null)
    setAiAnalysisStatus(aiEnabled ? 'idle' : 'disabled')
    serverSimIdRef.current = null
    setServerSimId(null)
    dispatch({ type: 'RESET_TO_START' })
    const user = getAuthedUser()
    if (user) {
      dispatch({ type: 'SET_ROLE', role: resolveWorkRole(user) })
      dispatch({ type: 'SET_NAME', name: user.fullName })
    }
  }, [aiEnabled])

  const runAiAnalysis = useCallback(
    async (payload: Record<string, unknown>, reportId: string) => {
      if (!aiEnabled) {
        setAiAnalysisStatus('disabled')
        return
      }
      lastAiPayloadRef.current = payload
      lastAiReportIdRef.current = reportId
      setAiAnalysisStatus('loading')
      setAiAnalysisError('')
      try {
        const result = await apiPost<AiAnalysis>('/ai/analyze', payload)
        await updateReportAnalysis(reportId, result)
        if (lastAiReportIdRef.current === reportId) {
          setAiAnalysis(result)
          setAiAnalysisStatus('ready')
        }
      } catch (reason) {
        if (lastAiReportIdRef.current === reportId) {
          setAiAnalysisError(
            reason instanceof Error ? reason.message : String(reason),
          )
          setAiAnalysisStatus('error')
        }
      }
    },
    [aiEnabled],
  )

  const retryAiAnalysis = useCallback(() => {
    if (lastAiPayloadRef.current && lastAiReportIdRef.current) {
      void runAiAnalysis(lastAiPayloadRef.current, lastAiReportIdRef.current)
    }
  }, [runAiAnalysis])

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

  const applyServerSession = useCallback(
    (session: ServerSimSession) => {
      dispatch({
        type: 'REPLACE_PROCESS',
        process: session.process as ProcessState,
      })
      if (session.faultTriggered && !stateRef.current.faultTriggered) {
        dispatch({ type: 'FAULT_TRIGGERED' })
      }
      if (session.paused !== stateRef.current.session.paused) {
        dispatch({ type: 'SET_PAUSED', paused: session.paused })
      }
      const scale = session.timeScale as TimeScale
      if (
        scale &&
        scale !== stateRef.current.session.timeScale &&
        TIME_SCALES.includes(scale)
      ) {
        dispatch({ type: 'SET_TIME_SCALE', timeScale: scale })
      }
      for (const msg of session.systemMessages ?? []) {
        pushSystem(msg)
      }
      serverSimMetaRef.current = {
        seed: session.seed ?? null,
        modelVersion: session.modelVersion || MODEL_VERSION,
        scenarioVersion: session.scenarioVersion || SCENARIO_VERSION,
      }
      lastPolledSimTime.current = session.simTimeSec
    },
    [pushSystem],
  )

  const serverCommand = useCallback(
    async (
      action: string,
      payload: Record<string, unknown> = {},
    ): Promise<boolean> => {
      const id = serverSimIdRef.current
      if (!id) {
        pushSystem('Нет серверной сессии симуляции.')
        return false
      }
      const revision = ++serverMutationRevision.current
      serverMutationsPending.current += 1
      try {
        const result = await sendServerSimCommand(id, action, payload)
        if (!result.ok) {
          pushSystem(result.reason || 'Команда отклонена сервером.')
          if (
            result.session &&
            revision === serverMutationRevision.current &&
            serverSimIdRef.current === id
          ) {
            applyServerSession(result.session)
          }
          return false
        }
        if (
          result.session &&
          revision === serverMutationRevision.current &&
          serverSimIdRef.current === id
        ) {
          applyServerSession(result.session)
        }
        return true
      } catch (reason) {
        pushSystem(
          reason instanceof Error
            ? reason.message
            : 'Ошибка связи с сервером симуляции.',
        )
        return false
      } finally {
        serverMutationsPending.current = Math.max(
          0,
          serverMutationsPending.current - 1,
        )
      }
    },
    [applyServerSession, pushSystem],
  )

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

  // Simulation tick: только локальный fallback запрещён — при serverSimId тик на сервере
  useEffect(() => {
    if (serverSimId) return
    if (state.session.view !== 'exercise') return
    if (!state.session.started || state.session.completed) return
    if (state.session.paused) return
    if (!state.session.briefingAccepted) return
    const id = window.setInterval(() => {
      dispatch({ type: 'TICK', dt: state.session.timeScale })
    }, 1000)
    return () => clearInterval(id)
  }, [
    serverSimId,
    state.session.view,
    state.session.started,
    state.session.completed,
    state.session.paused,
    state.session.briefingAccepted,
    state.session.timeScale,
  ])

  // Poll серверного состояния (источник правды)
  useEffect(() => {
    if (!serverSimId) return
    if (state.session.view !== 'exercise') return
    if (!state.session.started || state.session.completed) return
    let cancelled = false
    let pollInFlight = false
    const poll = async () => {
      if (pollInFlight || serverMutationsPending.current > 0) return
      pollInFlight = true
      const revision = serverMutationRevision.current
      try {
        const session = await getServerSimSession(serverSimId)
        if (cancelled || revision !== serverMutationRevision.current) return
        applyServerSession(session)
      } catch {
        /* сеть — следующий цикл */
      } finally {
        pollInFlight = false
      }
    }
    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, 400)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [
    serverSimId,
    state.session.view,
    state.session.started,
    state.session.completed,
    applyServerSession,
  ])

  // Client-only scoring/HMI state is checkpointed separately from server process state.
  useEffect(() => {
    if (!serverSimId) return
    if (stateRef.current.session.view !== 'exercise') return
    let cancelled = false
    const persist = async () => {
      const cur = stateRef.current
      if (cancelled || cur.session.completed) return
      const clientState: SimClientCheckpoint = {
        trainerState: {
          ...cur,
          actionsLog: cur.actionsLog.slice(-500),
          systemEvents: cur.systemEvents.slice(-500),
          analogHistory: cur.analogHistory.slice(-90),
        },
        trainingMode,
        selectedMiniTrainingId,
        hintsUsed,
      }
      try {
        await saveServerSimCheckpoint(serverSimId, clientState)
      } catch {
        // The interval retries after connectivity is restored.
      }
    }
    void persist()
    const interval = window.setInterval(() => {
      void persist()
    }, 5000)
    const onPageHide = () => {
      void persist()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [
    hintsUsed,
    selectedMiniTrainingId,
    serverSimId,
    trainingMode,
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

  // Отказ по simTimeSec — только если нет серверной сессии (сервер инжектит сам)
  useEffect(() => {
    if (serverSimId) return
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
    serverSimId,
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

  const startPumpN1 = useCallback(async () => {
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
    const ok = await confirm({
      title: 'Пуск Н-1',
      message: 'Подтвердите пуск сырьевого насоса Н-1 (критическая операция).',
      confirmLabel: 'Пуск',
    })
    if (!ok) return
    logAction("Насос 'Н-1': нажата кнопка 'Пуск'")
    void serverCommand('start-N1')
  }, [
    canControl,
    logAction,
    pushSystem,
    blockSequence,
    assertMiniAction,
    serverCommand,
    confirm,
  ])

  const stopPumpN1 = useCallback(() => {
    if (!canControl) return
    if (!assertMiniAction(pumpActionToken('N-1'))) return
    if (blockSequence('shutdown-stop-N1')) return
    if (stateRef.current.process.pumpN1 === 'stopped') return
    logAction("Насос 'Н-1': нажата кнопка 'Стоп'")
    if (pumpStartTimer.current) clearTimeout(pumpStartTimer.current)
    void serverCommand('stop-N1')
  }, [canControl, logAction, blockSequence, assertMiniAction, serverCommand])

  const startPump = useCallback(
    async (id: 'N-1' | 'N-2' | 'N-3') => {
      if (id === 'N-1') {
        await startPumpN1()
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
      const ok = await confirm({
        title: `Пуск ${id}`,
        message: `Подтвердите пуск насоса ${id} (подача в печной тракт).`,
        confirmLabel: 'Пуск',
      })
      if (!ok) return
      logAction(`Насос '${id}': нажата кнопка 'Пуск'`)
      void serverCommand(id === 'N-2' ? 'start-N2' : 'start-N3')
    },
    [
      canControl,
      logAction,
      pushSystem,
      startPumpN1,
      blockSequence,
      assertMiniAction,
      serverCommand,
      confirm,
    ],
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
      void serverCommand(id === 'N-2' ? 'stop-N2' : 'stop-N3')
    },
    [canControl, logAction, stopPumpN1, blockSequence, assertMiniAction, serverCommand],
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
      void serverCommand(guard)
    },
    [canControl, logAction, pushSystem, blockSequence, assertMiniAction, serverCommand],
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
      const action =
        id === 'L-1' ? 'close-L1' : id === 'L-2' ? 'close-L2' : 'close-L3'
      void serverCommand(action)
    },
    [canControl, logAction, pushSystem, assertMiniAction, serverCommand],
  )

  const stopValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
      if (!assertMiniAction(valveActionToken(id))) return
      const action =
        id === 'L-1' ? 'stop-L1' : id === 'L-2' ? 'stop-L2' : 'stop-L3'
      void serverCommand(action)
      logAction(`Электрозадвижка '${id}': останов привода`)
    },
    [canControl, logAction, assertMiniAction, serverCommand],
  )

  const setDemulsifier = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (!assertMiniAction(toggleActionToken('demulsifierOn'))) return
      if (on && blockSequence('elou-demulsifier')) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена")
      else logAction("ЭЛОУ 'Э-1..Э-6': подача деэмульгатора отключена")
      void serverCommand('elou-demulsifier', { on })
    },
    [canControl, logAction, blockSequence, assertMiniAction, serverCommand],
  )

  const setElectricField = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (!assertMiniAction(toggleActionToken('electricFieldOn'))) return
      if (on && blockSequence('elou-field')) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': электрическое поле включено")
      else logAction("ЭЛОУ 'Э-1..Э-6': электрическое поле отключено")
      void serverCommand('elou-field', { on })
    },
    [canControl, logAction, blockSequence, assertMiniAction, serverCommand],
  )

  const setWashWater = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (!assertMiniAction(toggleActionToken('washWaterOn'))) return
      if (on && blockSequence('elou-wash')) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': промывная вода включена")
      else logAction("ЭЛОУ 'Э-1..Э-6': промывная вода отключена")
      void serverCommand('elou-wash', { on })
    },
    [canControl, logAction, blockSequence, assertMiniAction, serverCommand],
  )

  const setLevelSetpoint = useCallback(
    (column: 'K-1' | 'K-2', percent: number) => {
      if (!canControl) return
      if (!assertMiniAction(levelSetpointToken(column))) return
      const v = Math.max(10, Math.min(90, Math.round(percent)))
      const previous = levelSetpointChanges.current[column]
      if (previous) window.clearTimeout(previous.timer)

      const from =
        previous?.from ??
        (column === 'K-1'
          ? stateRef.current.process.levelSetpointK1
          : stateRef.current.process.levelSetpointK2)
      const timer = window.setTimeout(() => {
        const change = levelSetpointChanges.current[column]
        if (!change) return
        levelSetpointChanges.current[column] = null
        if (change.from !== change.to) {
          logAction(
            `Колонна '${column}': уровень куба изменён с ${change.from}% до ${change.to}%`,
          )
        }
      }, 350)
      levelSetpointChanges.current[column] = { from, to: v, timer }
      void serverCommand('set-level-setpoint', { column, percent: v })
    },
    [canControl, logAction, assertMiniAction, serverCommand],
  )

  const drainVesselWater = useCallback(
    async (id: 'E-1-vessel' | 'E-2-vessel') => {
      if (!canControl) return
      if (!assertMiniAction(drainActionToken(id))) return
      const label = id === 'E-1-vessel' ? 'E-1' : 'E-2'
      const ok = await confirm({
        title: `Дренаж ${label}`,
        message: `Подтвердите дренаж воды из ${label} (и парной ёмкости E-1/E-2)?`,
        danger: true,
      })
      if (!ok) return
      void serverCommand('patch', {
        patch: { levelWaterE1: 25, levelWaterE2: 25 },
      })
      logAction(
        "Авария: скорректирован уровень воды E-1/E-2, предотвращён занос в колонны (SC-11)",
      )
    },
    [canControl, logAction, assertMiniAction, serverCommand, confirm],
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
      void serverCommand('set-avo', { on })
    },
    [canControl, logAction, assertMiniAction, serverCommand],
  )

  const setUtility = useCallback(
    async (
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
      if (!ok) {
        const approved = await confirm({
          title: 'Отключение утилиты',
          message: `Подтвердите отключение утилиты «${names[key]}» (критично для процесса)?`,
          danger: true,
          confirmLabel: 'Отключить',
        })
        if (!approved) return
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
      void serverCommand('patch', { patch })
    },
    [canControl, logAction, assertMiniAction, serverCommand, confirm],
  )

  const protectColumnLevel = useCallback(
    async (column: 'K-1' | 'K-2') => {
      if (!canControl) return
      if (!assertMiniAction(protectLevelToken(column))) return
      const approved = await confirm({
        title: `Защита ${column}`,
        message: `Подтвердите разгрузку печи и защиту уровня ${column}?`,
        danger: true,
      })
      if (!approved) return
      if (column === 'K-1') {
        logAction(
          "Авария: разгрузка печи и меры по сохранению минимального уровня K-1 (SC-12)",
        )
        void serverCommand('patch', {
          patch: {
            fuelGasPercent: 0,
            levelSetpointK1: 50,
            levelK1: Math.max(stateRef.current.process.levelK1, 28),
            safeShutdownInitiated: true,
          },
        })
      } else {
        logAction(
          "Авария: восстановление рефлюкса и снижение нагрузки (SC-13)",
        )
        void serverCommand('patch', {
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
    [canControl, logAction, assertMiniAction, serverCommand, confirm],
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
      void serverCommand('fuel', { fuelTarget: p })
    },
    [canControl, logAction, pushSystem, blockSequence, assertMiniAction, serverCommand],
  )

  const performEmergencyAction = useCallback(
    async (actionId: string) => {
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
      if (needsConfirm) {
        const approved = await confirm({
          title: 'Аварийное действие',
          message: `Подтвердите аварийное действие:\n«${def.label}»`,
          danger: true,
          confirmLabel: 'Выполнить',
        })
        if (!approved) return
      }
      const patch = def.apply?.(cur.process) ?? {}
      if (Object.keys(patch).length) {
        void serverCommand('patch', { patch })
      }
      logAction(def.logDescription)
      pushSystem(`Выполнено: ${def.label}`)
    },
    [canControl, logAction, pushSystem, serverCommand, confirm],
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
    const reportId = finishEvent.id

    const analogSample = cur.analogHistory.filter(
      (_, i) => i % 5 === 0 || i === cur.analogHistory.length - 1,
    )

    const analysisPayload = {
      sessionId: reportId,
      userName: cur.session.userName,
      exerciseId: cur.session.exerciseId ?? training?.id ?? '',
      exerciseName: training?.title ?? ex?.name ?? '—',
      trainingId: training?.id ?? null,
      scorePercent,
      penalty,
      responseSeconds: cur.session.responseSeconds,
      respondedInTime: cur.session.respondedInTime,
      process: cur.process,
      actionsLog: cur.actionsLog,
      systemEvents,
    }

    if (cur.session.role === 'trainee' && cur.session.userName.trim()) {
      const authed = getAuthedUser()
      void saveReport({
        id: reportId,
        userId: authed?.id,
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
        modelVersion: serverSimMetaRef.current.modelVersion,
        scenarioVersion: serverSimMetaRef.current.scenarioVersion,
        seed: serverSimMetaRef.current.seed,
        serverSessionId: serverSimIdRef.current,
        sessionMode: cur.session.mode,
        processSnapshot: cur.process as unknown as Record<string, unknown>,
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

    setAiAnalysis(null)
    setAiAnalysisStatus(aiEnabled ? 'loading' : 'disabled')
    void runAiAnalysis(analysisPayload, reportId)
    const completedServerSessionId = serverSimIdRef.current
    if (completedServerSessionId) {
      void completeServerSimSession(completedServerSessionId).catch((reason) => {
        pushSystem(
          reason instanceof Error
            ? `Не удалось закрыть checkpoint: ${reason.message}`
            : 'Не удалось закрыть checkpoint завершённой сессии.',
        )
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
  }, [
    aiEnabled,
    hintsUsed,
    pushSystem,
    runAiAnalysis,
    selectedMiniTrainingId,
    trainingMode,
  ])

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
    async (paused: boolean) => {
      if (stateRef.current.session.view !== 'exercise') return
      if (stateRef.current.session.completed) return
      if (sessionTransitionRef.current) return
      const transition = paused ? 'pause' : 'resume'
      sessionTransitionRef.current = transition
      setSessionTransition(transition)
      const ok = await serverCommand(transition)
      sessionTransitionRef.current = null
      setSessionTransition(null)
      if (!ok) return
      dispatch({ type: 'SET_PAUSED', paused })
      pushSystem(paused ? 'Симуляция на паузе.' : 'Симуляция продолжена.')
      void appendAudit({
        actor: stateRef.current.session.userName || 'trainee',
        role: 'trainee',
        action: paused ? 'pause' : 'resume',
      })
    },
    [pushSystem, serverCommand],
  )

  const abandonSession = useCallback(async (sessionId: string) => {
    await abandonServerSimSession(sessionId)
    if (serverSimIdRef.current === sessionId) {
      serverSimIdRef.current = null
      setServerSimId(null)
    }
  }, [])

  const resumeSession = useCallback(
    async (candidate: ActiveSimCheckpoint) => {
      const checkpoint = await resumeServerSimSession(candidate.sessionId)
      const saved = checkpoint.clientState ?? candidate.clientState
      let session = checkpoint.session
      const exerciseId = session.exerciseId ?? null
      const inferredMini = Boolean(
        getMiniTraining(MINI_TRAININGS, exerciseId),
      )
      const restoredMode =
        saved?.trainingMode ?? (inferredMini ? 'mini' : 'full')
      const briefingAccepted =
        saved?.trainerState.session.briefingAccepted ?? inferredMini
      const shouldRun =
        briefingAccepted &&
        !(saved?.trainerState.session.paused ?? !inferredMini)

      serverSimIdRef.current = session.id
      serverSimMetaRef.current = {
        seed: session.seed ?? null,
        modelVersion: session.modelVersion || MODEL_VERSION,
        scenarioVersion: session.scenarioVersion || SCENARIO_VERSION,
      }
      lastPolledSimTime.current = session.simTimeSec

      if (shouldRun) {
        const resumed = await sendServerSimCommand(session.id, 'resume')
        if (!resumed.ok) {
          throw new Error(resumed.reason || 'Не удалось продолжить симуляцию')
        }
        if (resumed.session) session = resumed.session
      }

      const user = getAuthedUser()
      const baseSession = createInitialSession()
      const fallback: TrainerState = {
        ...initialState,
        session: {
          ...baseSession,
          role: 'trainee',
          userName: user?.fullName ?? '',
          exerciseId,
          mode: saved?.trainerState.session.mode ?? 'train',
          view: 'exercise',
          started: true,
          completed: false,
          paused: session.paused,
          briefingAccepted,
          timeScale: session.timeScale as TimeScale,
        },
        process: session.process as ProcessState,
        systemEvents: [
          {
            id: uid(),
            at: Date.now(),
            description: 'Незавершённое прохождение восстановлено.',
          },
        ],
      }
      const restored = saved?.trainerState
        ? {
            ...saved.trainerState,
            faultAt:
              saved.trainerState.faultAt &&
              !saved.trainerState.faultResponded
                ? saved.trainerState.faultAt +
                  Math.max(0, Date.now() - candidate.savedAt)
                : saved.trainerState.faultAt,
          }
        : fallback

      recoveryLogged.current = restored.faultResponded
      saltAlarmLogged.current = false
      criticalFailHandled.current = Boolean(
        restored.session.criticalFailReason,
      )
      setTrainingModeState(restoredMode)
      setSelectedMiniTrainingId(
        restoredMode === 'mini'
          ? (saved?.selectedMiniTrainingId ?? exerciseId)
          : null,
      )
      setHintsUsed(saved?.hintsUsed ?? 0)
      setVisibleHint(null)
      dispatch({
        type: 'RESUME_SESSION',
        restored,
        process: session.process as ProcessState,
        paused: session.paused,
      })
      setServerSimId(session.id)
      void appendAudit({
        actor: user?.fullName ?? restored.session.userName ?? 'trainee',
        role: 'trainee',
        action: 'resume_session',
        detail: `${exerciseId ?? '?'} · t=${session.simTimeSec.toFixed(1)}`,
      })
    },
    [],
  )

  const resetToStart = useCallback(() => {
    recoveryLogged.current = false
    saltAlarmLogged.current = false
    criticalFailHandled.current = false
    const unfinishedServerSessionId = serverSimIdRef.current
    serverSimIdRef.current = null
    setServerSimId(null)
    if (
      unfinishedServerSessionId &&
      !stateRef.current.session.completed
    ) {
      void sendServerSimCommand(unfinishedServerSessionId, 'pause').catch(() => {
        // The durable checkpoint remains available for recovery.
      })
    }
    lastPolledSimTime.current = -1
    serverSimMetaRef.current = {
      seed: null,
      modelVersion: MODEL_VERSION,
      scenarioVersion: SCENARIO_VERSION,
    }
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
    setServerSimId(null)
    lastPolledSimTime.current = -1
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

    const begin = async () => {
      try {
        if (training) {
          const initial = applyMiniPreset(training.id)
        const session = await createServerSimSession({
          exerciseId: training.id,
          initial: initial as unknown as Record<string, unknown>,
          modelVersion: MODEL_VERSION,
          scenarioVersion: SCENARIO_VERSION,
          timeScale: stateRef.current.session.timeScale,
        })
          serverSimIdRef.current = session.id
          serverSimMetaRef.current = {
            seed: session.seed ?? null,
            modelVersion: session.modelVersion || MODEL_VERSION,
            scenarioVersion: session.scenarioVersion || SCENARIO_VERSION,
          }
          dispatch({ type: 'SET_EXERCISE', id: training.id })
          void appendAudit({
            actor: cur.userName || 'trainee',
            role: 'trainee',
            action: 'start_session',
            detail: `${training.id} · mini · seed=${session.seed}`,
          })
          setHintsUsed(0)
          setVisibleHint(null)
          dispatch({
            type: 'START_SESSION',
            process: session.process as ProcessState,
            label: training.title,
            skipBriefing: true,
          })
          setServerSimId(session.id)
          for (const msg of session.systemMessages ?? []) pushSystem(msg)
          return
        }

        const ex = getExercise(cur.exerciseId)
        const session = await createServerSimSession({
          exerciseId: cur.exerciseId,
          warmStart: Boolean(ex?.warmStart),
          modelVersion: MODEL_VERSION,
          scenarioVersion: SCENARIO_VERSION,
          faultType: ex?.faultType ?? null,
          triggerDelaySeconds: ex?.triggerDelaySeconds ?? null,
          timeScale: stateRef.current.session.timeScale,
        })
        serverSimIdRef.current = session.id
        serverSimMetaRef.current = {
          seed: session.seed ?? null,
          modelVersion: session.modelVersion || MODEL_VERSION,
          scenarioVersion: session.scenarioVersion || SCENARIO_VERSION,
        }
        void appendAudit({
          actor: cur.userName || 'trainee',
          role: 'trainee',
          action: 'start_session',
          detail: `${cur.exerciseId ?? '?'} · ${cur.mode} · seed=${session.seed}`,
        })
        dispatch({
          type: 'START_SESSION',
          process: session.process as ProcessState,
        })
        setServerSimId(session.id)
        // Полное упражнение: тик на паузе до принятия брифинга
        await sendServerSimCommand(session.id, 'pause')
        dispatch({ type: 'SET_PAUSED', paused: true })
        if (session.timeScale && session.timeScale !== 1) {
          dispatch({
            type: 'SET_TIME_SCALE',
            timeScale: session.timeScale as TimeScale,
          })
        }
        for (const msg of session.systemMessages ?? []) pushSystem(msg)
      } catch (reason) {
        const msg =
          reason instanceof Error
            ? reason.message
            : 'Не удалось создать серверную сессию симуляции.'
        pushSystem(`Старт отменён: ${msg}`)
      }
    }
    void begin()
  }, [pushSystem, selectedMiniTrainingId, trainingMode])

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
    const faultType = ex.faultType
    void serverCommand('inject-fault', { faultType }).then((ok) => {
      if (!ok) return
      void appendAudit({
        actor: 'instructor',
        role: 'instructor',
        action: 'inject_fault',
        detail: faultType,
      })
    })
  }, [pushSystem, serverCommand])

  const acceptBriefing = useCallback(() => {
    if (sessionTransitionRef.current) return
    const resume = async () => {
      sessionTransitionRef.current = 'resume'
      setSessionTransition('resume')
      const ok = await serverCommand('resume')
      sessionTransitionRef.current = null
      setSessionTransition(null)
      if (!ok) return
      dispatch({ type: 'ACCEPT_BRIEFING' })
      dispatch({ type: 'SET_PAUSED', paused: false })
      pushSystem('Брифинг принят. Симуляция запущена.')
    }
    void resume()
  }, [pushSystem, serverCommand])

  const setTimeScale = useCallback(
    (timeScale: TimeScale) => {
      dispatch({ type: 'SET_TIME_SCALE', timeScale })
      void serverCommand('set-time-scale', { timeScale })
      pushSystem(`Масштаб времени: ${timeScale}×`)
    },
    [pushSystem, serverCommand],
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
      paused: cur.session.paused,
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
    const snapshot = cur.snapshot
    const restore = async () => {
      const ok = await serverCommand('restore-snapshot', {
        process: snapshot.process,
        paused: snapshot.paused,
        faultTriggered: snapshot.faultTriggered,
      })
      if (!ok) return
      recoveryLogged.current = snapshot.faultResponded
      criticalFailHandled.current = false
      dispatch({ type: 'RESTORE_SNAPSHOT' })
      pushSystem('Состояние восстановлено из снимка.')
    }
    void restore()
  }, [pushSystem, serverCommand])

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
    resumeSession,
    abandonSession,
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
    sessionTransition,
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
    aiAnalysis,
    aiAnalysisStatus,
    aiAnalysisError,
    retryAiAnalysis,
    assignMiniTraining,
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
