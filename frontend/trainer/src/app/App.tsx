import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AiAssistant } from '../ai/AiAssistant'
import { AiReviewPanel } from '../ai/AiReviewPanel'
import { isInstructorAuthed } from '../storage/auditStorage'
import {
  getAuthedUser,
  hasRole,
} from '../auth/authApi'
import { KnowledgeBase } from '../knowledge/KnowledgeBase'
import { AppShell } from '../layout/AppShell'
import { PresenceBridge } from '../presence/PresenceBridge'
import { SettingsDrawer } from '../settings/SettingsDrawer'
import { PreferencesProvider, usePreferences } from '../settings/PreferencesContext'
import { TrainingPanel } from '../training/TrainingPanel'
import { Icon } from '../common/ui/Icon'
import { BriefingModal } from '../simulator/components/BriefingModal'
import { ControlPanel } from '../simulator/components/ControlPanel'
import { DebriefPanel } from '../simulator/components/DebriefPanel'
import { EmergencyPanel } from '../simulator/components/EmergencyPanel'
import { InstructorLivePanel } from '../simulator/components/InstructorLivePanel'
import { ScenarioChecklist } from '../simulator/components/ScenarioChecklist'
import { SchemeQuickBar } from '../simulator/components/SchemeQuickBar'
import { TrendStrip } from '../simulator/components/TrendStrip'
import { ReportsPage } from '../storage/pages/ReportsPage'
import { MyResultsPage } from '../storage/pages/MyResultsPage'
import { StartScreen } from './pages/StartScreen'
import { WorkRoleBar } from './components/WorkRoleBar'
import { EquipmentPanel } from '../scheme/components/EquipmentPanel'
import { SchemeViewer } from '../scheme/components/SchemeViewer'
import { ConfirmProvider } from '../common/ui/ConfirmDialog'
import { TrainerProvider, useTrainer } from '../simulator/TrainerContext'
import { getExercise } from '../scenarios/exercises'
import { TIME_SCALES, type TimeScale } from '../simulator/types'
import './App.css'

function formatSimTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TrainerApp() {
  const { t, showTrendStrip, aiEnabled } = usePreferences()
  const [aiOpen, setAiOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
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
    aiAnalysis,
    aiAnalysisStatus,
    aiAnalysisError,
    retryAiAnalysis,
    assignMiniTraining,
    sessionTransition,
  } = useTrainer()
  const { session } = state
  const user = getAuthedUser()
  const canViewInstructorReports = Boolean(
    user && hasRole(user, 'instructor') && isInstructorAuthed(),
  )
  const canViewOwnResults = Boolean(user && hasRole(user, 'trainee'))
  const canViewReports = canViewInstructorReports || canViewOwnResults

  useEffect(() => {
    setResultOpen(session.completed)
  }, [session.completed, session.exerciseId])

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
        label:
          canViewInstructorReports && session.role === 'instructor'
            ? t('reports')
            : 'Результаты',
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
      canViewInstructorReports,
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
    content = (
      <>
        <WorkRoleBar />
        <StartScreen />
      </>
    )
  } else if (session.view === 'reports') {
    if (canViewInstructorReports && session.role === 'instructor') {
      title = 'Кабинет инструктора'
      subtitle = 'Группы, отчёты квалификации и управление обучением'
      content = (
        <>
          <WorkRoleBar />
          <ReportsPage />
        </>
      )
    } else {
      title = 'Мои результаты'
      subtitle = 'Архив сессий, оценка и локальный ИИ-разбор'
      content = (
        <>
          <WorkRoleBar />
          <MyResultsPage />
        </>
      )
    }
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
              <label htmlFor="simulation-speed">Скорость</label>
              <select
                id="simulation-speed"
                className="shell-action speed-select"
                value={session.timeScale}
                onChange={(event) =>
                  setTimeScale(Number(event.target.value) as TimeScale)
                }
                aria-label="Скорость симуляции"
              >
                {TIME_SCALES.map((scale) => (
                  <option key={scale} value={scale}>
                    ×{scale}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="shell-action"
              disabled={sessionTransition !== null}
              onClick={() => setPaused(!session.paused)}
            >
              {sessionTransition
                ? sessionTransition === 'resume'
                  ? 'Запуск…'
                  : 'Пауза…'
                : session.paused
                  ? 'Продолжить'
                  : 'Пауза'}
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
        {session.completed && (
          <button
            type="button"
            className="shell-action primary"
            onClick={() => setResultOpen(true)}
          >
            <Icon name="chart" /> Результат
          </button>
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

        <main className="app-main">
          <div className="scheme-wrap">
            <SchemeViewer />
            <TrainingPanel />
            {!isMini && (
              <div className="scheme-overlay-top">
                {showTrendStrip && <TrendStrip />}
                <SchemeQuickBar />
              </div>
            )}
            {!isMini && (
              <div className="scheme-overlay-side">
                <InstructorLivePanel />
              </div>
            )}
            {!isMini && (
              <div className="scheme-overlay-bottom-center">
                <EmergencyPanel />
                {!session.completed && <ScenarioChecklist />}
              </div>
            )}
            {!(session.completed && aiEnabled) && <DebriefPanel />}
          </div>
          <EquipmentPanel />
        </main>
        {session.completed && resultOpen && (
          <div
            className="result-dialog-backdrop"
            onMouseDown={() => setResultOpen(false)}
          >
            <section
              className="result-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="result-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <span>Сессия завершена</span>
                  <h2 id="result-dialog-title">Результат тестирования</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setResultOpen(false)}
                  aria-label="Закрыть результат"
                >
                  <Icon name="close" />
                </button>
              </header>
              <div
                className={`result-dialog-summary ${
                  session.qualified ? 'pass' : 'fail'
                }`}
              >
                <strong>{session.scorePercent}%</strong>
                <div>
                  <h3>{session.qualified ? 'Тест пройден' : 'Требуется повторение'}</h3>
                  <p>
                    {session.criticalFailReason ||
                      session.qualificationSummary ||
                      'Результат сохранён в журнале обучения.'}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>Реакция</dt>
                    <dd>
                      {session.responseSeconds != null
                        ? `${session.responseSeconds.toFixed(1)} с`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Статус</dt>
                    <dd>{session.qualified ? 'PASS' : 'FAIL'}</dd>
                  </div>
                </dl>
              </div>
              <div className="result-dialog-content">
                {aiEnabled ? (
                  <AiReviewPanel
                    analysis={aiAnalysis}
                    status={aiAnalysisStatus}
                    error={aiAnalysisError}
                    onRetry={retryAiAnalysis}
                    onOpenKnowledge={openKnowledge}
                    onOpenTraining={assignMiniTraining}
                  />
                ) : (
                  <div className="result-dialog-ai-disabled">
                    <Icon name="sparkles" />
                    <p>
                      ИИ-интерпретация отключена. Её можно включить в настройках.
                    </p>
                  </div>
                )}
              </div>
              <footer>
                <button type="button" onClick={() => setResultOpen(false)}>
                  Вернуться к схеме
                </button>
                {canViewReports && (
                  <button type="button" className="primary" onClick={openReports}>
                    Открыть архив результатов
                  </button>
                )}
              </footer>
            </section>
          </div>
        )}
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
        onOpenAi={() => setAiOpen(true)}
      >
        {content}
      </AppShell>
      <KnowledgeBase />
      <SettingsDrawer />
      <AiAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <PreferencesProvider>
      <ConfirmProvider>
        <TrainerProvider>
          <PresenceBridge />
          <TrainerApp />
        </TrainerProvider>
      </ConfirmProvider>
    </PreferencesProvider>
  )
}
