import { AiCoachPanel } from './components/AiCoachPanel'
import { ControlPanel } from './components/ControlPanel'
import { EmergencyPanel } from './components/EmergencyPanel'
import { ScenarioChecklist } from './components/ScenarioChecklist'
import { SchemeQuickBar } from './components/SchemeQuickBar'
import { TrendStrip } from './components/TrendStrip'
import { ReportsPage } from './components/ReportsPage'
import { StartScreen } from './components/StartScreen'
import { EquipmentPanel } from './components/scheme/EquipmentPanel'
import { SchemeViewer } from './components/scheme/SchemeViewer'
import { TrainerProvider, useTrainer } from './sim/TrainerContext'
import { getExercise } from './sim/scenarios'
import './App.css'

function formatSimTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TrainerApp() {
  const { state, completeExercise, resetToStart, setPaused } = useTrainer()
  const { session } = state

  if (session.view === 'start') {
    return <StartScreen />
  }

  if (session.view === 'reports') {
    return <ReportsPage />
  }

  const exercise = getExercise(session.exerciseId)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-title">КТК ЭЛОУ-АВТ</span>
          <span className="app-subtitle">
            {exercise?.name ?? 'Мнемосхема'} · {session.userName}
          </span>
          <span className="app-meta">
            t={formatSimTime(state.process.simTimeSec)}
            {session.paused ? ' · ПАУЗА' : ''}
            {state.faultTriggered && !state.faultResponded
              ? ' · ОТКАЗ'
              : ''}
          </span>
        </div>
        <div className="app-header-actions">
          {!session.completed && (
            <>
              <button
                type="button"
                className="hdr-btn ghost"
                onClick={() => setPaused(!session.paused)}
              >
                {session.paused ? 'Продолжить' : 'Пауза'}
              </button>
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
          выполнение {session.scorePercent}% · лишних: {session.penalty}
          {session.responseSeconds != null && (
            <>
              {' '}
              · реакция: {session.responseSeconds.toFixed(1)} с
              {session.respondedInTime === false ? ' (сверх нормы)' : ''}
            </>
          )}
          {session.recommendReason ? ` · ${session.recommendReason}` : ''}
        </div>
      )}

      <main className="app-main">
        <div className="scheme-wrap">
          <SchemeViewer />
          <TrendStrip />
          <EmergencyPanel />
          <ScenarioChecklist />
          <SchemeQuickBar />
          <AiCoachPanel />
        </div>
        <EquipmentPanel />
      </main>
      <ControlPanel />
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
