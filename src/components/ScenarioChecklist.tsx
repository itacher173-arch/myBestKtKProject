import { getExercise } from '../sim/scenarios'
import { useTrainer } from '../sim/TrainerContext'
import './ScenarioChecklist.css'

export function ScenarioChecklist() {
  const { state } = useTrainer()
  const ex = getExercise(state.session.exerciseId)
  if (!ex || state.session.view !== 'exercise') return null

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

  return (
    <aside className="sc-check">
      <header>
        <strong>Шаги сценария</strong>
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
