import { appendAudit, isInstructorAuthed } from '../../storage/auditStorage'
import { getAnalogs } from '../processModel'
import { getExercise } from '../../scenarios/exercises'
import { useTrainer } from '../TrainerContext'
import { TIME_SCALES, type TimeScale } from '../types'
import './InstructorLivePanel.css'

export function InstructorLivePanel() {
  const {
    state,
    setInstructorLiveOpen,
    injectCurrentFault,
    setPaused,
    setTimeScale,
    sessionTransition,
  } = useTrainer()
  const { session, process, actionsLog, systemEvents } = state

  if (session.view !== 'exercise' || !session.started) return null
  if (!session.instructorLiveOpen) return null

  const authed = isInstructorAuthed()
  const ex = getExercise(session.exerciseId)
  const analogs = getAnalogs(process).slice(0, 6)

  return (
    <aside className="instr-live">
      <header>
        <strong>Инструктор · live</strong>
        <button
          type="button"
          className="instr-x"
          onClick={() => setInstructorLiveOpen(false)}
        >
          ×
        </button>
      </header>

      {!authed ? (
        <div className="instr-auth">
          <p>Доступ разрешён только подтверждённой роли инструктора.</p>
        </div>
      ) : (
        <>
          <p className="instr-ex">
            {ex?.name} · t={process.simTimeSec.toFixed(0)} с · ×
            {session.timeScale}
            {state.faultTriggered ? ' · ОТКАЗ' : ''}
          </p>

          <div className="instr-actions">
            <button
              type="button"
              disabled={sessionTransition !== null}
              onClick={() => setPaused(!session.paused)}
            >
              {sessionTransition
                ? 'Ожидание…'
                : session.paused
                  ? 'Resume'
                  : 'Freeze'}
            </button>
            <select
              value={session.timeScale}
              onChange={(event) =>
                setTimeScale(Number(event.target.value) as TimeScale)
              }
              aria-label="Скорость симуляции"
              title="Скорость симуляции"
            >
              {TIME_SCALES.map((scale) => (
                <option key={scale} value={scale}>
                  ×{scale}
                </option>
              ))}
            </select>
          </div>

          {ex?.faultType && !state.faultTriggered && !session.completed && (
            <button
              type="button"
              className="instr-inject"
              onClick={() => {
                injectCurrentFault()
                void appendAudit({
                  actor: 'instructor',
                  role: 'instructor',
                  action: 'inject_fault_hidden',
                  detail: ex.faultType ?? undefined,
                })
              }}
            >
              Скрытый ввод отказа
            </button>
          )}

          <h4>Приборы</h4>
          <ul className="instr-tags">
            {analogs.map((a) => (
              <li key={a.id}>
                <span>{a.tag}</span>
                <strong>
                  {a.value.toFixed(a.unit.includes('кгс') ? 2 : 1)} {a.unit}
                </strong>
              </li>
            ))}
          </ul>

          <h4>Действия обучаемого</h4>
          <ul className="instr-log">
            {actionsLog.slice(-8).map((a) => (
              <li key={a.id}>{a.description}</li>
            ))}
            {!actionsLog.length && <li>—</li>}
          </ul>

          <h4>Система</h4>
          <ul className="instr-log">
            {systemEvents.slice(-5).map((a) => (
              <li key={a.id}>{a.description}</li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
