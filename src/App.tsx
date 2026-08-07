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
import { TrainingPanel } from './miniTraining/TrainingPanel'
import { TrainerProvider, useTrainer } from './sim/TrainerContext'
import { getExercise } from './sim/scenarios'
import type { TimeScale } from './sim/types'
import './App.css'

function formatSimTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS: TimeScale[] = [0.25, 0.5, 1, 2, 4]

function TrainerApp() {
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
  } = useTrainer()
  const { session } = state

  if (session.view === 'start') {
    return (
      <>
        <StartScreen />
        <KnowledgeBase />
      </>
    )
  }

  if (session.view === 'reports') {
    return (
      <>
        <ReportsPage />
        <KnowledgeBase />
      </>
    )
  }

  const exercise = getExercise(session.exerciseId)
  const reactionSec =
    state.faultTriggered && state.faultAt && !state.faultResponded
      ? (Date.now() - state.faultAt) / 1000
      : null
  const norm = exercise?.normResponseSeconds
  const isMini = Boolean(activeMiniTraining)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-title">ГАЗПРОМ НЕФТЬ · КТК ЭЛОУ-АВТ</span>
          <span className="app-subtitle">
            {activeMiniTraining?.title ?? exercise?.name ?? 'Мнемосхема'} ·{' '}
            {session.userName}
          </span>
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
          <span className="app-meta">
            t={formatSimTime(state.process.simTimeSec)} · ×{session.timeScale}
            {session.paused ? ' · ПАУЗА' : ''}
            {state.faultTriggered && !state.faultResponded
              ? ' · ОТКАЗ'
              : ''}
            {reactionSec != null && session.mode === 'train' && norm != null
              ? ` · реакция ${reactionSec.toFixed(0)}/${norm} с`
              : ''}
          </span>
        </div>
        <div className="app-header-actions">
          <button
            type="button"
            className="hdr-btn knowledge"
            onClick={() => openKnowledge()}
          >
            База знаний
          </button>
          {!session.completed && (session.briefingAccepted || isMini) && (
            <>
              <div className="speed-group" title="Скорость времени">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`hdr-btn ghost speed-btn${
                      session.timeScale === s ? ' on' : ''
                    }`}
                    onClick={() => setTimeScale(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="hdr-btn ghost"
                onClick={() => setPaused(!session.paused)}
              >
                {session.paused ? 'Продолжить' : 'Пауза'}
              </button>
              <button
                type="button"
                className="hdr-btn ghost"
                onClick={saveSnapshot}
              >
                Снимок
              </button>
              <button
                type="button"
                className="hdr-btn ghost"
                disabled={!state.snapshot}
                onClick={restoreSnapshot}
              >
                Restore
              </button>
              {!isMini && (
                <button
                  type="button"
                  className="hdr-btn ghost"
                  onClick={() =>
                    setInstructorLiveOpen(!session.instructorLiveOpen)
                  }
                >
                  Инструктор
                </button>
              )}
              <button
                type="button"
                className="hdr-btn"
                onClick={completeExercise}
              >
                Завершить
              </button>
            </>
          )}
          <button type="button" className="hdr-btn ghost" onClick={resetToStart}>
            На старт
          </button>
        </div>
      </header>

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
      <KnowledgeBase />
    </div>
  )
}

export default function App() {
  return (
    <TrainerProvider>
      <TrainerApp />
    </TrainerProvider>
  )
}
