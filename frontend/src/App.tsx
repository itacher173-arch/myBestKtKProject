import { useMemo, type ReactNode } from 'react'
import { AlarmBar } from './components/AlarmBar'
import { BriefingModal } from './components/BriefingModal'
import { ControlPanel } from './components/ControlPanel'
import { DebriefPanel } from './components/DebriefPanel'
import { EmergencyPanel } from './components/EmergencyPanel'
import { InstructorLivePanel } from './components/InstructorLivePanel'
import { ScenarioChecklist } from './components/ScenarioChecklist'
import { SchemeQuickBar } from './components/SchemeQuickBar'
import { TrendStrip } from './components/TrendStrip'
import { ReportsPage } from './components/ReportsPage'
import { StartScreen } from './components/StartScreen'
import { EquipmentPanel } from './components/scheme/EquipmentPanel'
import { SchemeViewer } from './components/scheme/SchemeViewer'
import { KnowledgeBase } from './knowledge/KnowledgeBase'
import { AppShell } from './layout/AppShell'
import { TrainingPanel } from './miniTraining/TrainingPanel'
import { SettingsDrawer } from './settings/SettingsDrawer'
import { PreferencesProvider, usePreferences } from './settings/PreferencesContext'
import { PresenceBridge } from './sim/PresenceBridge'
import {
  getAuthedUser,
  hasRole,
} from './sim/authApi'
import { isInstructorAuthed } from './sim/auditStorage'
import { TrainerProvider, useTrainer } from './sim/TrainerContext'
import { getExercise } from './sim/scenarios'
import type { TimeScale } from './sim/types'
import { Icon } from './ui/Icon'
import './App.css'

function formatSimTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS: TimeScale[] = [0.25, 0.5, 1, 2, 4]

function TrainerApp() {
  const { t } = usePreferences()
  const {
    state,
    completeExercise,
    resetToStart,
    setPaused,
    setTimeScale,
    saveSnapshot,
    restoreSnapshot,
    setInstructorLiveOpen,
    activeMiniTraining,
    openKnowledge,
    openReports,
  } = useTrainer()
  const { session } = state
  const user = getAuthedUser()
  const canViewReports =
    Boolean(user && hasRole(user, 'instructor') && isInstructorAuthed())

  const navItems = useMemo(
    () => [
      {
        id: 'home',
        label: t('home'),
        icon: 'home' as const,
        active: session.view === 'start',
        action: resetToStart,
      },
      {
        id: 'trainer',
        label: t('trainer'),
        icon: 'trainer' as const,
        active: session.view === 'exercise',
        disabled: session.view !== 'exercise',
        action: (): void => {},
      },
      {
        id: 'reports',
        label: t('reports'),
        icon: 'chart' as const,
        active: session.view === 'reports',
        disabled: !canViewReports,
        action: openReports,
      },
      {
        id: 'knowledge',
        label: t('knowledge'),
        icon: 'book' as const,
        action: (): void => {
          openKnowledge()
        },
      },
    ],
    [
      canViewReports,
      openKnowledge,
      openReports,
      resetToStart,
      session.view,
      t,
    ],
  )

  let title = 'Учебный центр ЭЛОУ-АВТ'
  let subtitle = 'Модульный цифровой тренажёр технологического процесса'
  let content: ReactNode
  let actions: ReactNode = null
  let fullBleed = false

  if (session.view === 'start') {
    content = <StartScreen />
  } else if (session.view === 'reports') {
    title = 'Кабинет инструктора'
    subtitle = 'Группы, отчёты квалификации и управление обучением'
    content = <ReportsPage />
  } else {
    fullBleed = true
    const exercise = getExercise(session.exerciseId)
    const reactionSec =
      state.faultTriggered && state.faultAt && !state.faultResponded
        ? (Date.now() - state.faultAt) / 1000
        : null
    const norm = exercise?.normResponseSeconds
    const isMini = Boolean(activeMiniTraining)

    title = activeMiniTraining?.title ?? exercise?.name ?? 'Мнемосхема'
    subtitle = `${session.userName} · t=${formatSimTime(state.process.simTimeSec)} · ×${session.timeScale}${
      session.paused ? ' · ПАУЗА' : ''
    }${
      state.faultTriggered && !state.faultResponded ? ' · ОТКАЗ' : ''
    }${
      reactionSec != null && session.mode === 'train' && norm != null
        ? ` · реакция ${reactionSec.toFixed(0)}/${norm} с`
        : ''
    }`

    actions = (
      <>
        {!session.completed && (session.briefingAccepted || isMini) && (
          <>
            <div className="speed-group shell-speed" title="Скорость времени">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`shell-action${session.timeScale === s ? ' primary' : ''}`}
                  onClick={() => setTimeScale(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
            <button
              type="button"
              className="shell-action"
              onClick={() => setPaused(!session.paused)}
            >
              {session.paused ? 'Продолжить' : 'Пауза'}
            </button>
            {session.role === 'instructor' && (
              <>
                <button
                  type="button"
                  className="shell-action"
                  onClick={saveSnapshot}
                >
                  Снимок
                </button>
                <button
                  type="button"
                  className="shell-action"
                  disabled={!state.snapshot}
                  onClick={restoreSnapshot}
                >
                  Restore
                </button>
                {!isMini && (
                  <button
                    type="button"
                    className="shell-action"
                    onClick={() =>
                      setInstructorLiveOpen(!session.instructorLiveOpen)
                    }
                  >
                    Инструктор
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="shell-action primary"
              onClick={completeExercise}
            >
              <Icon name="check" /> Завершить
            </button>
          </>
        )}
        <button type="button" className="shell-action" onClick={resetToStart}>
          <Icon name="home" /> На главную
        </button>
      </>
    )

    content = (
      <div className="app in-shell">
        <div className="exercise-statusbar">
          <span
            className={`mode-pill ${
              isMini ? 'mini' : session.mode === 'exam' ? 'exam' : 'train'
            }`}
          >
            {isMini
              ? 'МИНИ'
              : session.mode === 'exam'
                ? 'ЭКЗАМЕН'
                : 'ОБУЧЕНИЕ'}
          </span>
          <span>
            {state.process.running
              ? 'Симуляция выполняется'
              : session.completed
                ? 'Сессия завершена'
                : 'Симуляция приостановлена'}
          </span>
          <span>
            Действий <strong>{state.actionsLog.length}</strong>
          </span>
        </div>

        {session.completed && (
          <div
            className={
              session.qualified ? 'result-banner pass' : 'result-banner fail'
            }
          >
            {session.qualified ? 'КВАЛИФИЦИРОВАН' : 'НЕ КВАЛИФИЦИРОВАН'} ·
            баллы {session.scorePercent}% · штрафы: {session.penalty}
            {session.responseSeconds != null && (
              <>
                {' '}
                · реакция: {session.responseSeconds.toFixed(1)} с
                {session.respondedInTime === false ? ' (сверх нормы)' : ''}
              </>
            )}
            {session.criticalFailReason
              ? ` · ${session.criticalFailReason}`
              : session.qualificationSummary
                ? ` · ${session.qualificationSummary}`
                : ''}
          </div>
        )}

        <main className="app-main">
          <div className="scheme-wrap">
            <SchemeViewer />
            <TrainingPanel />
            {!isMini && <AlarmBar />}
            {!isMini && <TrendStrip />}
            {!isMini && <EmergencyPanel />}
            {!isMini && !session.completed && <ScenarioChecklist />}
            {!isMini && <SchemeQuickBar />}
            {!isMini && <InstructorLivePanel />}
            <DebriefPanel />
          </div>
          <EquipmentPanel />
        </main>
        <ControlPanel />
        {!isMini && <BriefingModal />}
      </div>
    )
  }

  return (
    <>
      <AppShell
        title={title}
        subtitle={subtitle}
        navItems={navItems}
        actions={actions}
        fullBleed={fullBleed}
      >
        {content}
      </AppShell>
      <KnowledgeBase />
      <SettingsDrawer />
    </>
  )
}

export default function App() {
  return (
    <PreferencesProvider>
      <TrainerProvider>
        <PresenceBridge />
        <TrainerApp />
      </TrainerProvider>
    </PreferencesProvider>
  )
}
