import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { equipmentById } from '../scheme'
import {
  EMERGENCY_ACTIONS,
  applyFault,
} from './faultEngine'
import { getAnalogs, tickProcess } from './processModel'
import { saveReport } from './reportsStorage'
import { exercises, getExercise } from './scenarios'
import type { AnalogTag, PanelKind, ProcessState, Role, TrainerState } from './types'
import {
  createInitialProcess,
  createInitialSession,
  createWarmProcess,
} from './types'

type Action =
  | { type: 'SET_ROLE'; role: Role }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_EXERCISE'; id: string }
  | { type: 'OPEN_REPORTS' }
  | { type: 'START_SESSION' }
  | { type: 'SELECT_EQUIP'; id: string | null }
  | { type: 'OPEN_PANEL'; panel: PanelKind }
  | { type: 'CLOSE_PANEL' }
  | { type: 'LOG_ACTION'; id: string; at: number; description: string }
  | { type: 'LOG_SYSTEM'; id: string; at: number; description: string }
  | { type: 'TICK'; dt: number }
  | { type: 'SET_PROCESS'; patch: Partial<ProcessState> }
  | { type: 'FAULT_TRIGGERED' }
  | { type: 'FAULT_RESPONDED'; seconds: number; inTime: boolean }
  | {
      type: 'COMPLETE'
      scorePercent: number
      penalty: number
      finishEvent: { id: string; at: number; description: string }
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
      const process = ex?.warmStart
        ? createWarmProcess()
        : { ...createInitialProcess(), running: true }
      return {
        ...state,
        session: {
          ...state.session,
          role: 'trainee',
          view: 'exercise',
          started: true,
          completed: false,
          scorePercent: 0,
          penalty: 0,
          responseSeconds: null,
          respondedInTime: null,
        },
        process,
        actionsLog: [],
        systemEvents: [
          {
            id: `start-${startedAt}`,
            at: startedAt,
            description: `Упражнение начато: ${ex?.name ?? '—'}${
              ex?.warmStart ? ' (нормальный режим, ожидание отказа)' : ''
            }`,
          },
        ],
        faultTriggered: false,
        faultResponded: false,
        faultAt: null,
        activePanel: null,
        selectedEquipId: null,
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
    case 'TICK':
      return { ...state, process: tickProcess(state.process, action.dt) }
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
          scorePercent: action.scorePercent,
          penalty: action.penalty,
        },
        process: { ...state.process, running: false },
        systemEvents: [...state.systemEvents, action.finishEvent],
      }
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
      }
    default:
      return state
  }
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
  openValve: (id: 'L-1' | 'L-2' | 'L-3') => void
  closeValve: (id: 'L-1' | 'L-2' | 'L-3') => void
  stopValve: (id: 'L-1' | 'L-2' | 'L-3') => void
  setDemulsifier: (on: boolean) => void
  setElectricField: (on: boolean) => void
  setFuelGas: (percent: number) => void
  completeExercise: () => void
  resetToStart: () => void
  performEmergencyAction: (actionId: string) => void
  canControl: boolean
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
}

export function TrainerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const pumpStartTimer = useRef<number | null>(null)
  const recoveryLogged = useRef(false)
  const saltAlarmLogged = useRef(false)

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

  // Simulation tick
  useEffect(() => {
    if (state.session.view !== 'exercise') return
    if (!state.session.started || state.session.completed) return
    const id = window.setInterval(() => {
      dispatch({ type: 'TICK', dt: 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [state.session.view, state.session.started, state.session.completed])

  // Salt alarm (норма обучения ≤5 мг/л)
  useEffect(() => {
    if (state.session.view !== 'exercise' || !state.session.started) return
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
    state.process.feedFlow,
    state.process.saltMgL,
    pushSystem,
  ])

  // Fault trigger by exercise delay
  useEffect(() => {
    if (state.session.view !== 'exercise') return
    if (!state.session.started || state.session.completed) return
    const ex = getExercise(state.session.exerciseId)
    if (!ex?.faultType || !ex.triggerDelaySeconds) return
    if (state.faultTriggered) return

    const t = window.setTimeout(() => {
      const cur = stateRef.current
      const exercise = getExercise(cur.session.exerciseId)
      if (!exercise?.faultType || cur.faultTriggered) return

      const applied = applyFault(exercise.faultType)
      dispatch({ type: 'SET_PROCESS', patch: applied.patch })
      for (const msg of applied.messages) pushSystem(msg)
      dispatch({ type: 'FAULT_TRIGGERED' })
      pushSystem(`--- Запущена нештатная ситуация: «${exercise.name}» ---`)
    }, ex.triggerDelaySeconds * 1000)

    return () => clearTimeout(t)
  }, [
    state.session.view,
    state.session.started,
    state.session.completed,
    state.session.exerciseId,
    state.faultTriggered,
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
      const ex = getExercise(cur.session.exerciseId)
      if (!ex?.expectedResponseActions?.includes(description)) return

      recoveryLogged.current = true
      const sec = (Date.now() - cur.faultAt) / 1000
      const inTime =
        ex.normResponseSeconds != null ? sec <= ex.normResponseSeconds : true
      dispatch({ type: 'FAULT_RESPONDED', seconds: sec, inTime })
      pushSystem(
        inTime
          ? `Нештатная ситуация устранена за ${sec.toFixed(1)} с (норма ${ex.normResponseSeconds} с).`
          : `Реакция ${sec.toFixed(1)} с — сверх нормы ${ex.normResponseSeconds} с.`,
      )
    },
    [pushAction, pushSystem],
  )
  const canControl =
    state.session.view === 'exercise' &&
    state.session.started &&
    !state.session.completed &&
    state.session.role === 'trainee'

  const startPumpN1 = useCallback(() => {
    if (!canControl) return
    const proc = stateRef.current.process
    if (!proc.powerOk) {
      pushSystem('Пуск Н-1 невозможен: нет электропитания.')
      return
    }
    const p = proc.pumpN1
    if (p === 'running' || p === 'starting') return
    logAction("Насос 'Н-1': нажата кнопка 'Пуск'")
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
  }, [canControl, logAction, pushSystem])

  const stopPumpN1 = useCallback(() => {
    if (!canControl) return
    if (stateRef.current.process.pumpN1 === 'stopped') return
    logAction("Насос 'Н-1': нажата кнопка 'Стоп'")
    if (pumpStartTimer.current) clearTimeout(pumpStartTimer.current)
    dispatch({
      type: 'SET_PROCESS',
      patch: { pumpN1: 'stopped', pressureN1: 0 },
    })
  }, [canControl, logAction])

  const openValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
      if (!stateRef.current.process.instrumentAirOk) {
        pushSystem('Привод задвижки недоступен: нет приборного воздуха.')
        return
      }
      const names = {
        'L-1': "Электрозадвижка 'Л-1 (вход сырья)' нажата кнопка 'Открыть'",
        'L-2':
          "Электрозадвижка 'Л-2 (вывод бензина НК-180°С)' нажата кнопка 'Открыть'",
        'L-3':
          "Электрозадвижка 'Л-3 (вывод товарного мазута)' нажата кнопка 'Открыть'",
      }
      logAction(names[id])
      const patch: Partial<ProcessState> =
        id === 'L-1'
          ? { valveL1Motion: 'opening' }
          : id === 'L-2'
            ? { valveL2Motion: 'opening' }
            : { valveL3Motion: 'opening' }
      dispatch({ type: 'SET_PROCESS', patch })
    },
    [canControl, logAction, pushSystem],
  )

  const closeValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
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
    [canControl, logAction, pushSystem],
  )

  const stopValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
      const patch: Partial<ProcessState> =
        id === 'L-1'
          ? { valveL1Motion: 'idle' }
          : id === 'L-2'
            ? { valveL2Motion: 'idle' }
            : { valveL3Motion: 'idle' }
      dispatch({ type: 'SET_PROCESS', patch })
      logAction(`Электрозадвижка '${id}': останов привода`)
    },
    [canControl, logAction],
  )

  const setDemulsifier = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': подача деэмульгатора включена")
      else logAction("ЭЛОУ 'Э-1..Э-6': подача деэмульгатора отключена")
      dispatch({ type: 'SET_PROCESS', patch: { demulsifierOn: on } })
    },
    [canControl, logAction],
  )

  const setElectricField = useCallback(
    (on: boolean) => {
      if (!canControl) return
      if (on) logAction("ЭЛОУ 'Э-1..Э-6': электрическое поле включено")
      else logAction("ЭЛОУ 'Э-1..Э-6': электрическое поле отключено")
      dispatch({ type: 'SET_PROCESS', patch: { electricFieldOn: on } })
    },
    [canControl, logAction],
  )

  const setFuelGas = useCallback(
    (percent: number) => {
      if (!canControl) return
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
      logAction(`Печь 'П-1': Изменена подача топливного газа на ${p}%`)
      dispatch({ type: 'SET_PROCESS', patch: { fuelGasPercent: p } })
    },
    [canControl, logAction, pushSystem],
  )

  const performEmergencyAction = useCallback(
    (actionId: string) => {
      if (!canControl) return
      const def = EMERGENCY_ACTIONS.find((a) => a.id === actionId)
      if (!def) return
      const cur = stateRef.current
      const ex = getExercise(cur.session.exerciseId)
      if (
        !cur.faultTriggered ||
        !ex?.faultType ||
        !def.clearsFaults.includes(ex.faultType)
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
        } else {
          panel = { type: 'info', id: equipId, equipType: node.type }
        }
        break
      default:
        panel = { type: 'info', id: equipId, equipType: node.type }
        break
    }
    dispatch({ type: 'OPEN_PANEL', panel })
  }, [])

  const completeExercise = useCallback(() => {
    const cur = stateRef.current
    if (cur.session.view !== 'exercise' || cur.session.completed) return

    const ex = getExercise(cur.session.exerciseId)
    const needed = ex?.scenarioSteps ?? []
    const done = new Set(cur.actionsLog.map((a) => a.description))
    const countDone = needed.filter((s) => done.has(s)).length
    const score = needed.length === 0 ? 0 : (countDone / needed.length) * 100
    const scorePercent = Math.round(score * 10) / 10
    const penalty = cur.actionsLog.filter(
      (a) => !needed.includes(a.description),
    ).length
    const finishEvent = {
      id: uid(),
      at: Date.now(),
      description: `Упражнение завершено. Выполнение: ${score.toFixed(0)}%, лишних действий: ${penalty}`,
    }
    const systemEvents = [...cur.systemEvents, finishEvent]

    if (cur.session.role === 'trainee' && cur.session.userName.trim()) {
      saveReport({
        id: uid(),
        userName: cur.session.userName.trim(),
        exerciseId: cur.session.exerciseId ?? '',
        exerciseName: ex?.name ?? '—',
        completedAt: finishEvent.at,
        scorePercent,
        penalty,
        responseSeconds: cur.session.responseSeconds,
        respondedInTime: cur.session.respondedInTime,
        simTimeSec: cur.process.simTimeSec,
        actionsLog: cur.actionsLog.map(({ at, description }) => ({
          at,
          description,
        })),
        systemEvents: systemEvents.map(({ at, description }) => ({
          at,
          description,
        })),
      })
    }

    dispatch({ type: 'COMPLETE', scorePercent, penalty, finishEvent })
  }, [])

  const startSession = useCallback(() => {
    recoveryLogged.current = false
    saltAlarmLogged.current = false
    if (pumpStartTimer.current) {
      clearTimeout(pumpStartTimer.current)
      pumpStartTimer.current = null
    }
    dispatch({ type: 'START_SESSION' })
  }, [])

  const resetToStart = useCallback(() => {
    recoveryLogged.current = false
    saltAlarmLogged.current = false
    if (pumpStartTimer.current) {
      clearTimeout(pumpStartTimer.current)
      pumpStartTimer.current = null
    }
    dispatch({ type: 'RESET_TO_START' })
  }, [])

  const analogs = useMemo(() => getAnalogs(state.process), [state.process])

  const api: TrainerApi = {
    state,
    exercises,
    analogs,
    setRole: (role) => dispatch({ type: 'SET_ROLE', role }),
    setName: (name) => dispatch({ type: 'SET_NAME', name }),
    setExercise: (id) => dispatch({ type: 'SET_EXERCISE', id }),
    openReports: () => dispatch({ type: 'OPEN_REPORTS' }),
    startSession,
    selectEquip: (id) => dispatch({ type: 'SELECT_EQUIP', id }),
    openPanelForEquip,
    closePanel: () => dispatch({ type: 'CLOSE_PANEL' }),
    startPumpN1,
    stopPumpN1,
    openValve,
    closeValve,
    stopValve,
    setDemulsifier,
    setElectricField,
    setFuelGas,
    completeExercise,
    resetToStart,
    performEmergencyAction,
    canControl,
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
