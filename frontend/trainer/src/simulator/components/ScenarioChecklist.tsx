import { getExercise } from '../../scenarios/exercises'
import { useTrainer } from '../TrainerContext'
import './ScenarioChecklist.css'

export function ScenarioChecklist() {
  const { state } = useTrainer()
  const ex = getExercise(state.session.exerciseId)
  if (!ex || state.session.view !== 'exercise') return null

  const isExam = state.session.mode === 'exam'
  const showEtalon = !isExam || state.session.completed

  const done = new Set(state.actionsLog.map((a) => a.description))
  const steps = ex.scenarioSteps
  const doneCount = steps.filter((s) => {
    if (done.has(s)) return true
    if (s.includes('топливного газа')) {
      return [...done].some((d) => {
        const m = d.match(/топливного газа на (\d+)%/)
        return m != null && Number(m[1]) >= 40
      })
    }
    return false
  }).length

  if (!showEtalon) {
    return (
      <aside className="sc-check exam">
        <header>
          <strong>Экзамен</strong>
          <span>эталон скрыт</span>
        </header>
        <p className="sc-exam-note">
          Действий в журнале: {state.actionsLog.length}. Эталон — после
          «Завершить».
        </p>
      </aside>
    )
  }

  return (
    <aside className="sc-check">
      <header>
        <strong>
          {isExam && state.session.completed ? 'Эталон (после экзамена)' : 'Шаги сценария'}
        </strong>
        <span>
          {doneCount}/{steps.length}
        </span>
      </header>
      <ol>
        {steps.map((step, i) => {
          const ok =
            done.has(step) ||
            (step.includes('топливного газа') &&
              [...done].some((d) => {
                const m = d.match(/топливного газа на (\d+)%/)
                return m != null && Number(m[1]) >= 40
              }))
          return (
            <li key={`${i}-${step.slice(0, 24)}`} className={ok ? 'done' : ''}>
              <span className="mark">{ok ? '✓' : i + 1}</span>
              <span className="txt">{step}</span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
