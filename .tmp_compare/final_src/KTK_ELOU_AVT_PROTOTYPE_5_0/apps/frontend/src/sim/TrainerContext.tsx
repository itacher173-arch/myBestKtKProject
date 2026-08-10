import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AiAnalysis } from '../ai/types'
import { useAuth } from '../auth/AuthContext'
import { apiGet, apiPost } from '../lib/api'
import { equipmentById } from '../scheme'
import { usePreferences } from '../settings/PreferencesContext'
import {
  evaluateMiniTraining,
  getMiniTraining,
  type MiniTraining,
  type TrainingHint,
  type TrainingProgress,
} from '../miniTraining/catalog'
import { getAnalogs } from './processModel'
import { saveReport, updateReportAnalysis } from './reportsStorage'
import { exercises, getExercise } from './scenarios'
import type {
  AnalogTag,
  PanelKind,
  ProcessState,
  Role,
  TrainerState,
} from './types'
import { createInitialProcess, createInitialSession } from './types'

interface RemoteState {
  process: ProcessState
  actionsLog?: TrainerState['actionsLog']
  systemEvents?: TrainerState['systemEvents']
  scenarios?: string[]
}

interface TrainerApi {
  state: TrainerState
  exercises: typeof exercises
  analogs: AnalogTag[]
  setRole: (role: Role) => void
  setName: (name: string) => void
  setExercise: (id: string) => void
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
  aiAnalysis: AiAnalysis | null
  aiAnalysisStatus: 'idle' | 'loading' | 'ready' | 'error' | 'disabled'
  aiAnalysisError: string
  retryAiAnalysis: () => void
  assignMiniTraining: (id: string) => void
}

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
}

const TrainerContext = createContext<TrainerApi | null>(null)

export function TrainerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { aiEnabled } = usePreferences()
  const [state, setState] = useState<TrainerState>(initialState)
  const [trainingMode, setTrainingModeState] = useState<'full' | 'mini'>('full')
  const [miniTrainings, setMiniTrainings] = useState<MiniTraining[]>([])
  const [selectedMiniTrainingId, setSelectedMiniTrainingId] = useState<string | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [visibleHint, setVisibleHint] = useState<TrainingHint | null>(null)
  const [knowledgeOpen, setKnowledgeOpen] = useState(false)
  const [knowledgeArticleId, setKnowledgeArticleId] = useState<string | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null)
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'disabled'>(aiEnabled ? 'idle' : 'disabled')
  const [aiAnalysisError, setAiAnalysisError] = useState('')
  const lastAiPayloadRef = useRef<Record<string, unknown> | null>(null)
  const lastAiReportIdRef = useRef<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!user) return
    setState((current) => ({
      ...current,
      session: {
        ...current.session,
        userName: user.displayName,
        role: user.role === 'trainee' ? 'trainee' : 'instructor',
      },
    }))
  }, [user])

  useEffect(() => {
    if (!aiEnabled && aiAnalysisStatus !== 'ready') setAiAnalysisStatus('disabled')
    if (aiEnabled && aiAnalysisStatus === 'disabled') setAiAnalysisStatus('idle')
  }, [aiAnalysisStatus, aiEnabled])
  const activeMiniTraining =
    trainingMode === 'mini'
      ? getMiniTraining(miniTrainings, selectedMiniTrainingId) ?? null
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
      setState((current) => ({
        ...current,
        session: { ...current.session, exerciseId: null },
      }))
    } else {
      setSelectedMiniTrainingId(null)
    }
  }, [])

  const setSelectedMiniTraining = useCallback((id: string) => {
    setSelectedMiniTrainingId(id)
    setVisibleHint(null)
    setHintsUsed(0)
  }, [])

  const assignMiniTraining = useCallback((id: string) => {
    setTrainingModeState('mini')
    setSelectedMiniTrainingId(id)
    setVisibleHint(null)
    setHintsUsed(0)
    setKnowledgeOpen(false)
    setState((current) => ({
      ...current,
      activePanel: null,
      selectedEquipId: null,
      session: {
        ...current.session,
        view: 'start',
        started: false,
        completed: false,
        exerciseId: null,
      },
    }))
  }, [])

  const requestHint = useCallback(() => {
    const training = getMiniTraining(miniTrainings, selectedMiniTrainingId)
    if (!training) return
    setHintsUsed((current) => {
      const next = Math.min(current + 1, training.hints.length)
      setVisibleHint(training.hints[Math.max(0, next - 1)] ?? null)
      return next
    })
  }, [miniTrainings, selectedMiniTrainingId])

  const openKnowledge = useCallback((articleId?: string) => {
    setKnowledgeArticleId(articleId ?? null)
    setKnowledgeOpen(true)
  }, [])

  const closeKnowledge = useCallback(() => {
    setKnowledgeOpen(false)
  }, [])

  const runAiAnalysis = useCallback(async (payload: Record<string, unknown>, reportId: string) => {
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
      updateReportAnalysis(reportId, result)
      if (lastAiReportIdRef.current === reportId) {
        setAiAnalysis(result)
        setAiAnalysisStatus('ready')
      }
    } catch (reason) {
      if (lastAiReportIdRef.current === reportId) {
        setAiAnalysisError(reason instanceof Error ? reason.message : String(reason))
        setAiAnalysisStatus('error')
      }
    }
  }, [aiEnabled])

  const retryAiAnalysis = useCallback(() => {
    if (lastAiPayloadRef.current && lastAiReportIdRef.current) {
      void runAiAnalysis(lastAiPayloadRef.current, lastAiReportIdRef.current)
    }
  }, [runAiAnalysis])

  const addSystemEvent = useCallback((description: string) => {
    setState((current) => ({
      ...current,
      systemEvents: [
        ...current.systemEvents,
        { id: `ui-${Date.now()}`, at: Date.now(), description },
      ].slice(-200),
    }))
  }, [])

  useEffect(() => {
    void apiGet<MiniTraining[]>('/mini-trainings')
      .then(setMiniTrainings)
      .catch((error: unknown) =>
        addSystemEvent(
          `Каталог мини-обучений недоступен: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
  }, [addSystemEvent])

  const refresh = useCallback(async () => {
    try {
      const remote = await apiGet<RemoteState>('/state')
      setState((current) => {
        const activeFault = Boolean(remote.scenarios?.length)
        return {
          ...current,
          process: remote.process,
          actionsLog: remote.actionsLog ?? current.actionsLog,
          systemEvents:
            remote.systemEvents?.length
              ? remote.systemEvents
              : current.systemEvents,
          faultTriggered: current.faultTriggered || activeFault,
          faultAt:
            current.faultAt ?? (activeFault ? Date.now() : current.faultAt),
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!stateRef.current.systemEvents.some((event) => event.description.includes('API недоступен'))) {
        addSystemEvent(`API недоступен: ${message}`)
      }
    }
  }, [addSystemEvent])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 700)
    return () => window.clearInterval(timer)
  }, [refresh])

  const command = useCallback(
    (body: Record<string, unknown>) => {
      const training = getMiniTraining(miniTrainings, selectedMiniTrainingId)
      if (trainingMode === 'mini' && training) {
        const commandName = String(body.command)
        const token =
          commandName === 'fuel'
            ? 'fuel:*'
            : commandName === 'level-setpoint' || commandName === 'protect-level'
              ? `${commandName}:${String(body.column)}`
              : `${commandName}:${String(body.id)}`
        if (!training.allowedActions.includes(token)) {
          addSystemEvent(`Действие ${token} не относится к текущему мини-обучению.`)
          return
        }
      }
      void apiPost<RemoteState>('/command', body)
        .then(() => refresh())
        .catch((error: unknown) =>
          addSystemEvent(
            `Команда отклонена: ${error instanceof Error ? error.message : String(error)}`,
          ),
        )
    },
    [addSystemEvent, miniTrainings, refresh, selectedMiniTrainingId, trainingMode],
  )

  const setRole = useCallback((role: Role) => {
    setState((current) => ({
      ...current,
      session: { ...current.session, role },
    }))
  }, [])

  const setName = useCallback((name: string) => {
    setState((current) => ({
      ...current,
      session: { ...current.session, userName: name },
    }))
  }, [])

  const setExercise = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      session: { ...current.session, exerciseId: id },
    }))
  }, [])

  const openReports = useCallback(() => {
    setState((current) => ({
      ...current,
      session: {
        ...current.session,
        role: 'instructor',
        view: 'reports',
        started: false,
      },
    }))
  }, [])

  const startSession = useCallback(() => {
    const current = stateRef.current
    const exercise = getExercise(current.session.exerciseId)
    const training = getMiniTraining(miniTrainings, selectedMiniTrainingId)
    if (trainingMode === 'full' && !exercise) return
    if (trainingMode === 'mini' && !training) return
    const scenarioId = training?.id ?? exercise?.specId ?? exercise?.id
    const prepare = training
      ? apiPost('/training/start', { trainingId: training.id })
      : Promise.resolve(null)
    void prepare
      .then(() => apiPost<RemoteState>('/session/start', { scenarioId }))
      .then((remote) => {
        setState((value) => ({
          ...value,
          process: remote.process,
          actionsLog: remote.actionsLog ?? [],
          systemEvents: remote.systemEvents ?? [],
          activePanel: null,
          selectedEquipId: null,
          faultTriggered: !training && exercise?.specId !== 'SC-14',
          faultResponded: false,
          faultAt: !training && exercise?.specId !== 'SC-14' ? Date.now() : null,
          session: {
            ...value.session,
            exerciseId: scenarioId ?? null,
            role: 'trainee',
            view: 'exercise',
            started: true,
            completed: false,
            scorePercent: 0,
            penalty: 0,
            responseSeconds: null,
            respondedInTime: null,
          },
        }))
      })
      .catch((error: unknown) =>
        addSystemEvent(
          `Не удалось начать упражнение: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
  }, [addSystemEvent, miniTrainings, selectedMiniTrainingId, trainingMode])

  const selectEquip = useCallback((id: string | null) => {
    setState((current) => ({ ...current, selectedEquipId: id }))
  }, [])

  const closePanel = useCallback(() => {
    setState((current) => ({ ...current, activePanel: null }))
  }, [])

  const openPanelForEquip = useCallback((equipId: string) => {
    const training = getMiniTraining(miniTrainings, selectedMiniTrainingId)
    if (
      trainingMode === 'mini' &&
      training &&
      !training.equipmentIds.includes(equipId)
    ) {
      addSystemEvent('Оборудование вне выбранного сегмента заблокировано.')
      return
    }
    const node = equipmentById[equipId]
    if (!node) return
    let panel: PanelKind
    if (equipId === 'ELOU-block' || /^E-[1-6]$/.test(equipId)) {
      panel = { type: 'desalter', id: equipId }
    } else if (node.type === 'pump') {
      panel = { type: 'pump', id: equipId }
    } else if (node.type === 'valve') {
      panel = { type: 'valve', id: equipId }
    } else if (node.type === 'furnace') {
      panel = { type: 'furnace', id: equipId }
    } else if (node.type === 'column') {
      panel = { type: 'column', id: equipId }
    } else if (node.type === 'signal') {
      panel = { type: 'signal', id: equipId }
    } else {
      panel = { type: 'info', id: equipId, equipType: node.type }
    }
    setState((current) => ({
      ...current,
      selectedEquipId: equipId,
      activePanel: panel,
    }))
  }, [addSystemEvent, selectedMiniTrainingId, trainingMode])

  const startPump = useCallback(
    (id: 'N-1' | 'N-2' | 'N-3') => command({ command: 'pump', id, action: 'start' }),
    [command],
  )
  const stopPump = useCallback(
    (id: 'N-1' | 'N-2' | 'N-3') => command({ command: 'pump', id, action: 'stop' }),
    [command],
  )
  const openValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => command({ command: 'valve', id, action: 'open' }),
    [command],
  )
  const closeValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => command({ command: 'valve', id, action: 'close' }),
    [command],
  )
  const stopValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => command({ command: 'valve', id, action: 'stop' }),
    [command],
  )
  const setDemulsifier = useCallback(
    (on: boolean) => command({ command: 'toggle', id: 'demulsifierOn', value: on }),
    [command],
  )
  const setElectricField = useCallback(
    (on: boolean) => command({ command: 'toggle', id: 'electricFieldOn', value: on }),
    [command],
  )
  const setWashWater = useCallback(
    (on: boolean) => command({ command: 'toggle', id: 'washWaterOn', value: on }),
    [command],
  )
  const setFuelGas = useCallback(
    (value: number) => command({ command: 'fuel', value }),
    [command],
  )
  const setLevelSetpoint = useCallback(
    (column: 'K-1' | 'K-2', value: number) =>
      command({ command: 'level-setpoint', column, value }),
    [command],
  )
  const drainVesselWater = useCallback(
    (id: 'E-1-vessel' | 'E-2-vessel') => command({ command: 'drain', id }),
    [command],
  )
  const setAvoFan = useCallback(
    (on: boolean) => command({ command: 'toggle', id: 'avoFanOn', value: on }),
    [command],
  )
  const setUtility = useCallback(
    (id: 'steamOk' | 'powerOk' | 'coolingWaterOk' | 'instrumentAirOk' | 'ventOpsOk' | 'ventElouOk', value: boolean) => {
      const training = getMiniTraining(miniTrainings, selectedMiniTrainingId)
      if (
        trainingMode === 'mini' &&
        training &&
        !training.allowedActions.includes(`utility:${id}`)
      ) {
        addSystemEvent(`Инженерная среда ${id} не входит в текущий урок.`)
        return
      }
      void apiPost<RemoteState>('/utility', { id, value }).then(() => refresh())
    },
    [addSystemEvent, miniTrainings, refresh, selectedMiniTrainingId, trainingMode],
  )
  const protectColumnLevel = useCallback(
    (column: 'K-1' | 'K-2') => command({ command: 'protect-level', column }),
    [command],
  )
  const performEmergencyAction = useCallback(
    (id: string) => {
      command({ command: 'emergency', id })
      setState((current) => {
        const seconds = current.faultAt ? (Date.now() - current.faultAt) / 1000 : 0
        return {
          ...current,
          faultResponded: true,
          session: {
            ...current.session,
            responseSeconds: seconds,
            respondedInTime: seconds <= 60,
          },
        }
      })
    },
    [command],
  )

  const completeExercise = useCallback(() => {
    const current = stateRef.current
    if (current.session.completed) return
    const exercise = getExercise(current.session.exerciseId)
    const training = getMiniTraining(miniTrainings, selectedMiniTrainingId)
    const descriptions = current.actionsLog.map((entry) => entry.description)
    const expected = training?.objectives ?? exercise?.scenarioSteps ?? []
    const hits = expected.filter((step) => descriptions.some((item) => item.includes(step) || step.includes(item))).length
    const progress = training
      ? evaluateMiniTraining(training, current.process)
      : null
    const scorePercent = training
      ? Math.max(0, progress!.progressPercent - hintsUsed * 5)
      : expected.length
        ? Math.round((hits / expected.length) * 100)
        : 100
    const penalty = training ? hintsUsed : Math.max(0, descriptions.length - hits)
    const completedAt = Date.now()
    const reportId = `report-${completedAt}`
    const exerciseName = training?.title ?? exercise?.name ?? 'Упражнение'
    const analysisPayload = {
      sessionId: reportId,
      userName: current.session.userName,
      exerciseId: current.session.exerciseId ?? 'unknown',
      exerciseName,
      trainingId: training?.id ?? null,
      scorePercent,
      penalty,
      responseSeconds: current.session.responseSeconds,
      respondedInTime: current.session.respondedInTime,
      process: current.process,
      actionsLog: current.actionsLog,
      systemEvents: current.systemEvents,
    }
    saveReport({
      id: reportId,
      userName: current.session.userName,
      exerciseId: current.session.exerciseId ?? 'unknown',
      exerciseName,
      completedAt,
      scorePercent,
      penalty,
      responseSeconds: current.session.responseSeconds,
      respondedInTime: current.session.respondedInTime,
      simTimeSec: current.process.simTimeSec,
      actionsLog: current.actionsLog,
      systemEvents: current.systemEvents,
      processSnapshot: current.process,
    })
    setAiAnalysis(null)
    void runAiAnalysis(analysisPayload, reportId)
    void apiPost('/run', { running: false })
    setState((value) => ({
      ...value,
      process: { ...value.process, running: false },
      session: { ...value.session, completed: true, scorePercent, penalty },
    }))
  }, [hintsUsed, miniTrainings, runAiAnalysis, selectedMiniTrainingId])

  const resetToStart = useCallback(() => {
    void apiPost('/reset', { mode: 'normal' })
    setState({
      ...initialState,
      session: {
        ...initialState.session,
        userName: user?.displayName ?? '',
        role: user?.role === 'trainee' ? 'trainee' : 'instructor',
      },
    })
    setTrainingModeState('full')
    setSelectedMiniTrainingId(null)
    setHintsUsed(0)
    setVisibleHint(null)
    setKnowledgeOpen(false)
    setKnowledgeArticleId(null)
    setAiAnalysis(null)
    setAiAnalysisError('')
    setAiAnalysisStatus(aiEnabled ? 'idle' : 'disabled')
    lastAiPayloadRef.current = null
    lastAiReportIdRef.current = null
  }, [aiEnabled, user])

  const canControl =
    state.session.view === 'exercise' &&
    state.session.started &&
    !state.session.completed &&
    state.session.role === 'trainee'

  const analogs = useMemo(() => getAnalogs(state.process), [state.process])

  const value = useMemo<TrainerApi>(
    () => ({
      state,
      exercises,
      analogs,
      setRole,
      setName,
      setExercise,
      openReports,
      startSession,
      selectEquip,
      openPanelForEquip,
      closePanel,
      startPumpN1: () => startPump('N-1'),
      stopPumpN1: () => stopPump('N-1'),
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
      canControl,
      trainingMode,
      setTrainingMode,
      miniTrainings,
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
    }),
    [
      state,
      analogs,
      setRole,
      setName,
      setExercise,
      openReports,
      startSession,
      selectEquip,
      openPanelForEquip,
      closePanel,
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
      canControl,
      trainingMode,
      setTrainingMode,
      miniTrainings,
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
    ],
  )

  return <TrainerContext.Provider value={value}>{children}</TrainerContext.Provider>
}

export function useTrainer() {
  const context = useContext(TrainerContext)
  if (!context) throw new Error('useTrainer должен использоваться внутри TrainerProvider')
  return context
}
