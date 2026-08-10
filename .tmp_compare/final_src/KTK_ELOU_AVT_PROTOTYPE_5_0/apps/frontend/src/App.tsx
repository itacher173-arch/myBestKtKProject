import { useMemo, useState, type ReactNode } from 'react'
import { AiAssistant } from './ai/AiAssistant'
import { AiReviewPanel } from './ai/AiReviewPanel'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { ControlPanel } from './components/ControlPanel'
import { EmergencyPanel } from './components/EmergencyPanel'
import { ReportsPage } from './components/ReportsPage'
import { SchemeQuickBar } from './components/SchemeQuickBar'
import { StartScreen } from './components/StartScreen'
import { EquipmentPanel } from './components/scheme/EquipmentPanel'
import { SchemeViewer } from './components/scheme/SchemeViewer'
import { KnowledgeBase } from './knowledge/KnowledgeBase'
import { AppShell } from './layout/AppShell'
import { TrainingPanel } from './miniTraining/TrainingPanel'
import { PreferencesProvider, usePreferences } from './settings/PreferencesContext'
import { SettingsDrawer } from './settings/SettingsDrawer'
import { TrainerProvider, useTrainer } from './sim/TrainerContext'
import { getExercise } from './sim/scenarios'
import { Icon } from './ui/Icon'
import './App.css'

function TrainerApp() {
  const { user } = useAuth()
  const { t } = usePreferences()
  const [aiOpen, setAiOpen] = useState(false)
  const {
    state,
    completeExercise,
    resetToStart,
    openReports,
    activeMiniTraining,
    openKnowledge,
    aiAnalysis,
    aiAnalysisStatus,
    aiAnalysisError,
    retryAiAnalysis,
    assignMiniTraining,
  } = useTrainer()
  const { session } = state
  const exercise = getExercise(session.exerciseId)
  const canViewReports = user?.role === 'instructor' || user?.role === 'admin'
  const navItems = useMemo(() => [
    { id: 'home', label: t('home'), icon: 'home' as const, active: session.view === 'start', action: resetToStart },
    { id: 'trainer', label: t('trainer'), icon: 'trainer' as const, active: session.view === 'exercise', disabled: session.view !== 'exercise', action: (): void => {} },
    { id: 'reports', label: t('reports'), icon: 'chart' as const, active: session.view === 'reports', disabled: !canViewReports, action: openReports },
    { id: 'knowledge', label: t('knowledge'), icon: 'book' as const, action: (): void => { openKnowledge() } },
  ], [canViewReports, openKnowledge, openReports, resetToStart, session.view, t])

  let title = 'Учебный центр ЭЛОУ-АВТ'
  let subtitle = 'Модульный цифровой тренажёр технологического процесса'
  let content: ReactNode
  let actions: ReactNode = null
  let fullBleed = false

  if (session.view === 'start') {
    content = <StartScreen />
  } else if (session.view === 'reports') {
    title = 'Результаты и аналитика'
    subtitle = 'Учебные сессии, история действий и персональные рекомендации'
    content = <ReportsPage />
  } else {
    fullBleed = true
    title = activeMiniTraining?.title ?? exercise?.name ?? 'Технологическая симуляция'
    subtitle = `${activeMiniTraining ? activeMiniTraining.segment : exercise?.specId || 'Сценарий'} · ${session.userName}`
    actions = <>
      {!session.completed && <button type="button" className="shell-action primary" onClick={completeExercise}><Icon name="check" /> Завершить</button>}
      <button type="button" className="shell-action" onClick={resetToStart}><Icon name="home" /> На главную</button>
    </>
    content = (
      <div className="app">
        <div className="exercise-statusbar">
          <span><i className={state.process.running ? 'running' : ''} />{state.process.running ? 'Симуляция выполняется' : session.completed ? 'Сессия завершена' : 'Симуляция приостановлена'}</span>
          <span>Модельное время <strong>{state.process.simTimeSec} с</strong></span>
          <span>Действий <strong>{state.actionsLog.length}</strong></span>
          <span className="training-safety"><Icon name="shield" /> Учебная среда</span>
        </div>
        {session.completed && <div className="result-banner"><div><Icon name="check" /><span><strong>Результат сохранён</strong><small>Выполнение {session.scorePercent}% · штрафных действий {session.penalty}{session.responseSeconds != null ? ` · реакция ${session.responseSeconds.toFixed(1)} с` : ''}</small></span></div><button type="button" onClick={canViewReports ? openReports : resetToStart}>{canViewReports ? 'Открыть отчёт' : 'К выбору программ'} <Icon name="chevron" /></button></div>}
        <main className={`app-main ${session.completed ? 'with-ai-review' : ''}`}>
          <div className="scheme-wrap">
            <SchemeViewer />
            <TrainingPanel />
            {!activeMiniTraining && <EmergencyPanel />}
            {!activeMiniTraining && <SchemeQuickBar />}
          </div>
          {session.completed ? <aside className="exercise-ai-review"><AiReviewPanel compact analysis={aiAnalysis} status={aiAnalysisStatus} error={aiAnalysisError} onRetry={retryAiAnalysis} onOpenKnowledge={openKnowledge} onOpenTraining={assignMiniTraining} /></aside> : <EquipmentPanel />}
        </main>
        <ControlPanel />
      </div>
    )
  }

  return <>
    <AppShell title={title} subtitle={subtitle} navItems={navItems} actions={actions} fullBleed={fullBleed} onOpenAi={() => setAiOpen(true)}>{content}</AppShell>
    <KnowledgeBase />
    <SettingsDrawer />
    <AiAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
  </>
}

function AuthenticatedApplication() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading"><span><i /><i /><i /></span><strong>КТК ЭЛОУ-АВТ</strong><small>Проверка защищённой сессии…</small></div>
  if (!user) return <LoginPage />
  return <TrainerProvider><TrainerApp /></TrainerProvider>
}

export default function App() {
  return <PreferencesProvider><AuthProvider><AuthenticatedApplication /></AuthProvider></PreferencesProvider>
}
