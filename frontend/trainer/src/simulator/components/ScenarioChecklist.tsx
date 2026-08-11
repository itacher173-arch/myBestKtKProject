import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getExercise } from '../../scenarios/exercises'
import { useTrainer } from '../TrainerContext'
import './ScenarioChecklist.css'

export function ScenarioChecklist() {
  const { state } = useTrainer()
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!modalOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [modalOpen])

  const ex = getExercise(state.session.exerciseId)
  if (!ex || state.session.view !== 'exercise') return null

  const isExam = state.session.mode === 'exam'
  const showEtalon = !isExam || state.session.completed

  const done = new Set(state.actionsLog.map((a) => a.description))
  const steps = ex.scenarioSteps
  const isStepDone = (step: string) => {
    if (done.has(step)) return true
    if (step.includes('топливного газа')) {
      return [...done].some((description) => {
        const match = description.match(/топливного газа на (\d+)%/)
        return match != null && Number(match[1]) >= 40
      })
    }
    return false
  }
  const doneCount = steps.filter(isStepDone).length
  const currentStepIndex = steps.findIndex((step) => !isStepDone(step))
  const currentStep =
    currentStepIndex >= 0 ? steps[currentStepIndex] : 'Все шаги выполнены'

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
    <>
      <aside className="sc-check compact">
        <header>
          <div>
            <strong>Шаги сценария</strong>
            <span className="sc-progress-text">
              {doneCount}/{steps.length}
            </span>
          </div>
          <button
            type="button"
            className="sc-toggle"
            aria-haspopup="dialog"
            onClick={() => setModalOpen(true)}
          >
            Все шаги
          </button>
        </header>

        <div
          className="sc-progress"
          role="progressbar"
          aria-label="Прогресс сценария"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
        >
          <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>

        <div className={`sc-current${currentStepIndex < 0 ? ' done' : ''}`}>
          <span className="mark">
            {currentStepIndex < 0 ? '✓' : currentStepIndex + 1}
          </span>
          <div>
            <small>
              {currentStepIndex < 0
                ? 'Сценарий завершён'
                : `Текущий шаг ${currentStepIndex + 1} из ${steps.length}`}
            </small>
            <span className="txt">{currentStep}</span>
          </div>
        </div>
      </aside>

      {modalOpen &&
        createPortal(
          <div
            className="sc-modal-backdrop"
            onMouseDown={() => setModalOpen(false)}
          >
            <section
              className="sc-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="scenario-steps-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <h2 id="scenario-steps-title">Шаги сценария</h2>
                  <span>
                    Выполнено {doneCount} из {steps.length}
                  </span>
                </div>
                <button
                  type="button"
                  className="sc-modal-close"
                  aria-label="Закрыть"
                  onClick={() => setModalOpen(false)}
                >
                  ×
                </button>
              </header>
              <div className="sc-progress">
                <span
                  style={{ width: `${(doneCount / steps.length) * 100}%` }}
                />
              </div>
              <ol className="sc-list">
                {steps.map((step, index) => {
                  const doneStep = isStepDone(step)
                  return (
                    <li
                      key={`${index}-${step.slice(0, 24)}`}
                      className={`${doneStep ? 'done' : ''}${
                        index === currentStepIndex ? ' current' : ''
                      }`}
                    >
                      <span className="mark">
                        {doneStep ? '✓' : index + 1}
                      </span>
                      <span className="txt">{step}</span>
                    </li>
                  )
                })}
              </ol>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}
