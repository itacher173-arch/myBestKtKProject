import { ControlPanel } from './components/ControlPanel'
import { EmergencyPanel } from './components/EmergencyPanel'
import { ReportsPage } from './components/ReportsPage'
import { StartScreen } from './components/StartScreen'
import { EquipmentPanel } from './components/scheme/EquipmentPanel'
import { SchemeViewer } from './components/scheme/SchemeViewer'
import { TrainerProvider, useTrainer } from './sim/TrainerContext'
import { getExercise } from './sim/scenarios'
import './App.css'

function TrainerApp() {
  const { state, completeExercise, resetToStart } = useTrainer()
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
            {exercise?.name ?? 'Мнемосхема'} · Обучаемый: {session.userName}
          </span>
        </div>
        <div className="app-header-actions">
          {!session.completed && (
            <button type="button" className="hdr-btn" onClick={completeExercise}>
              Завершить упражнение
            </button>
          )}
          <button type="button" className="hdr-btn ghost" onClick={resetToStart}>
            На старт
          </button>
        </div>
      </header>

      {session.completed && (
        <div className="result-banner">
          Результат сохранён для инструктора. Выполнение:{' '}
          {session.scorePercent}% · лишних действий: {session.penalty}
          {session.responseSeconds != null && (
            <>
              {' '}
              · реакция на отказ: {session.responseSeconds.toFixed(1)} с
              {session.respondedInTime === false ? ' (сверх нормы)' : ''}
            </>
          )}
        </div>
      )}

      <main className="app-main">
        <div className="scheme-wrap">
          <SchemeViewer />
          <EmergencyPanel />
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
