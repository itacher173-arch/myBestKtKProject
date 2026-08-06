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
import { getAnalogs, tickProcess } from './processModel'
import { exercises, getExercise } from './scenarios'
import type { AnalogTag, PanelKind, ProcessState, Role, TrainerState } from './types'
import { createInitialProcess, createInitialSession } from './types'
import { equipmentById } from '../scheme'

type Action =
  | { type: 'SET_ROLE'; role: Role }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_EXERCISE'; id: string }
  | { type: 'START_SESSION' }
  | { type: 'SELECT_EQUIP'; id: string | null }
  | { type: 'OPEN_PANEL'; panel: PanelKind }
  | { type: 'CLOSE_PANEL' }
  | { type: 'LOG_ACTION'; description: string }
  | { type: 'LOG_SYSTEM'; description: string }
  | { type: 'TICK'; dt: number }
  | { type: 'SET_PROCESS'; patch: Partial<ProcessState> }
  | { type: 'FAULT_TRIGGERED' }
  | { type: 'FAULT_RESPONDED'; seconds: number; inTime: boolean }
  | { type: 'COMPLETE' }
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
    case 'START_SESSION':
      return {
        ...state,
        session: {
          ...state.session,
          started: true,
          completed: false,
          scorePercent: 0,
          penalty: 0,
          responseSeconds: null,
          respondedInTime: null,
        },
        process: { ...createInitialProcess(), running: true },
        actionsLog: [],
        systemEvents: [
          {
            id: uid(),
            at: Date.now(),
            description: `Упражнение начато: ${getExercise(state.session.exerciseId)?.name ?? '—'}`,
          },
        ],
        faultTriggered: false,
        faultResponded: false,
        faultAt: null,
        activePanel: null,
        selectedEquipId: null,
      }
    case 'SELECT_EQUIP':
      return { ...state, selectedEquipId: action.id }
    case 'OPEN_PANEL':
      return { ...state, activePanel: action.panel }
    case 'CLOSE_PANEL':
      return { ...state, activePanel: null }
    case 'LOG_ACTION':
      return {
        ...state,
        actionsLog: [
          ...state.actionsLog,
          { id: uid(), at: Date.now(), description: action.description },
        ],
      }
    case 'LOG_SYSTEM':
      return {
        ...state,
        systemEvents: [
          ...state.systemEvents,
          { id: uid(), at: Date.now(), description: action.description },
        ],
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
      const ex = getExercise(state.session.exerciseId)
      const needed = ex?.scenarioSteps ?? []
      const done = new Set(state.actionsLog.map((a) => a.description))
      const countDone = needed.filter((s) => done.has(s)).length
      const score =
        needed.length === 0 ? 0 : (countDone / needed.length) * 100
      const penalty = state.actionsLog.filter(
        (a) => !needed.includes(a.description),
      ).length
      return {
        ...state,
        session: {
          ...state.session,
          completed: true,
          scorePercent: Math.round(score * 10) / 10,
          penalty,
        },
        process: { ...state.process, running: false },
        systemEvents: [
          ...state.systemEvents,
          {
            id: uid(),
            at: Date.now(),
            description: `Упражнение завершено. Выполнение: ${score.toFixed(0)}%, лишних действий: ${penalty}`,
          },
        ],
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

  // Simulation tick
  useEffect(() => {
    if (!state.session.started || state.session.completed) return
    const id = window.setInterval(() => {
      dispatch({ type: 'TICK', dt: 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [state.session.started, state.session.completed])

  // Fault trigger by exercise delay
  useEffect(() => {
    if (!state.session.started || state.session.completed) return
    const ex = getExercise(state.session.exerciseId)
    if (!ex?.faultType || !ex.triggerDelaySeconds) return
    if (state.faultTriggered) return

    const t = window.setTimeout(() => {
      const cur = stateRef.current
      const exercise = getExercise(cur.session.exerciseId)
      if (!exercise?.faultType) return

      if (exercise.faultType === 'demulsifier') {
        dispatch({
          type: 'SET_PROCESS',
          patch: { demulsifierOn: false },
        })
        dispatch({
          type: 'LOG_SYSTEM',
          description:
            'ОТКАЗ: остановлен насос-дозатор деэмульгатора на ЭЛОУ. Ожидается рост солей (Q-ELOU).',
        })
      } else if (exercise.faultType === 'fuelGas') {
        dispatch({ type: 'SET_PROCESS', patch: { fuelGasPercent: 0 } })
        dispatch({
          type: 'LOG_SYSTEM',
          description:
            'ОТКАЗ: прекращена подача топливного газа к печам. Температура на выходе (TR55-1) будет падать.',
        })
      } else if (exercise.faultType === 'pumpTrip') {
        dispatch({
          type: 'SET_PROCESS',
          patch: { pumpN1: 'tripped', pressureN1: 0 },
        })
        dispatch({
          type: 'LOG_SYSTEM',
          description:
            'ОТКАЗ: аварийная остановка Н-1 (защита электродвигателя). Давление PRA351 падает.',
        })
      }
      dispatch({ type: 'FAULT_TRIGGERED' })
      dispatch({
        type: 'LOG_SYSTEM',
        description: `--- Запущена нештатная ситуация: «${exercise.name}» ---`,
      })
    }, ex.triggerDelaySeconds * 1000)

    return () => clearTimeout(t)
  }, [
    state.session.started,
    state.session.completed,
    state.session.exerciseId,
    state.faultTriggered,
  ])

  // Fuel gas recovery detection (flexible)
  useEffect(() => {
    if (!state.faultTriggered || state.faultResponded || !state.faultAt) return
    const ex = getExercise(state.session.exerciseId)
    if (ex?.faultType !== 'fuelGas') return
    if (state.process.fuelGasPercent >= 40) {
      const sec = (Date.now() - state.faultAt) / 1000
      const inTime =
        ex.normResponseSeconds != null ? sec <= ex.normResponseSeconds : true
      dispatch({ type: 'FAULT_RESPONDED', seconds: sec, inTime })
      dispatch({
        type: 'LOG_SYSTEM',
        description: inTime
          ? `Нештатная ситуация устранена за ${sec.toFixed(1)} с (норма ${ex.normResponseSeconds} с).`
          : `Реакция ${sec.toFixed(1)} с — сверх нормы ${ex.normResponseSeconds} с.`,
      })
    }
  }, [
    state.faultTriggered,
    state.faultResponded,
    state.faultAt,
    state.process.fuelGasPercent,
    state.session.exerciseId,
  ])

  const logAction = useCallback((description: string) => {
    dispatch({ type: 'LOG_ACTION', description })

    const cur = stateRef.current
    if (!cur.faultTriggered || cur.faultResponded || !cur.faultAt) return
    const ex = getExercise(cur.session.exerciseId)
    if (!ex?.expectedResponseActions?.includes(description)) return

    const sec = (Date.now() - cur.faultAt) / 1000
    const inTime =
      ex.normResponseSeconds != null ? sec <= ex.normResponseSeconds : true
    dispatch({ type: 'FAULT_RESPONDED', seconds: sec, inTime })
    dispatch({
      type: 'LOG_SYSTEM',
      description: inTime
        ? `Нештатная ситуация устранена за ${sec.toFixed(1)} с (норма ${ex.normResponseSeconds} с).`
        : `Реакция ${sec.toFixed(1)} с — сверх нормы ${ex.normResponseSeconds} с.`,
    })
  }, [])

  const canControl =
    state.session.started &&
    !state.session.completed &&
    (state.session.role === 'trainee' || state.session.role === 'instructor')

  const startPumpN1 = useCallback(() => {
    if (!canControl) return
    const p = stateRef.current.process.pumpN1
    if (p === 'running' || p === 'starting') return
    logAction("Насос 'Н-1': нажата кнопка 'Пуск'")
    dispatch({ type: 'SET_PROCESS', patch: { pumpN1: 'starting' } })
    if (pumpStartTimer.current) clearTimeout(pumpStartTimer.current)
    pumpStartTimer.current = window.setTimeout(() => {
      if (stateRef.current.process.pumpN1 === 'starting') {
        dispatch({ type: 'SET_PROCESS', patch: { pumpN1: 'running' } })
        dispatch({
          type: 'LOG_SYSTEM',
          description: 'Н-1 вышел на режим (Running).',
        })
      }
    }, 1500)
  }, [canControl, logAction])

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
    [canControl, logAction],
  )

  const closeValve = useCallback(
    (id: 'L-1' | 'L-2' | 'L-3') => {
      if (!canControl) return
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
    [canControl, logAction],
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
      const p = Math.max(0, Math.min(100, Math.round(percent)))
      logAction(`Печь 'П-1': Изменена подача топливного газа на ${p}%`)
      dispatch({ type: 'SET_PROCESS', patch: { fuelGasPercent: p } })
    },
    [canControl, logAction],
  )

  const openPanelForEquip = useCallback((equipId: string) => {
    dispatch({ type: 'SELECT_EQUIP', id: equipId })
    const node = equipmentById[equipId]
    if (!node) {
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

  const analogs = useMemo(() => getAnalogs(state.process), [state.process])

  const api: TrainerApi = {
    state,
    exercises,
    analogs,
    setRole: (role) => dispatch({ type: 'SET_ROLE', role }),
    setName: (name) => dispatch({ type: 'SET_NAME', name }),
    setExercise: (id) => dispatch({ type: 'SET_EXERCISE', id }),
    startSession: () => dispatch({ type: 'START_SESSION' }),
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
    completeExercise: () => dispatch({ type: 'COMPLETE' }),
    resetToStart: () => dispatch({ type: 'RESET_TO_START' }),
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
