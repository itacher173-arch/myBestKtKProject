import { useState } from 'react'
import {
  appendAudit,
  isInstructorAuthed,
  setInstructorAuthed,
  verifyInstructorPin,
} from '../sim/auditStorage'
import { getAnalogs } from '../sim/processModel'
import { getExercise } from '../sim/scenarios'
import { useTrainer } from '../sim/TrainerContext'
import './InstructorLivePanel.css'

export function InstructorLivePanel() {
  const {
    state,
    setInstructorLiveOpen,
    injectCurrentFault,
    setPaused,
    setTimeScale,
  } = useTrainer()
  const { session, process, actionsLog, systemEvents } = state
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')

  if (session.view !== 'exercise' || !session.started) return null
  if (!session.instructorLiveOpen) return null

  const authed = isInstructorAuthed()
  const ex = getExercise(session.exerciseId)
  const analogs = getAnalogs(process).slice(0, 6)

  const unlock = () => {
    if (!verifyInstructorPin(pin)) {
      setErr('Неверный PIN')
      appendAudit({
        actor: 'unknown',
        role: 'instructor',
        action: 'auth_failed',
        detail: 'live panel',
      })
      return
    }
    setInstructorAuthed(true)
    setErr('')
    appendAudit({
      actor: 'instructor',
      role: 'instructor',
      action: 'auth_ok',
      detail: 'live panel',
    })
  }

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
          <p>PIN для наблюдения и скрытого ввода события</p>
          <input
            type="password"
            value={pin}
            maxLength={12}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
          />
          {err && <p className="instr-err">{err}</p>}
          <button type="button" onClick={unlock}>
            Войти
          </button>
        </div>
      ) : (
        <>
          <p className="instr-ex">
            {ex?.name} · t={process.simTimeSec.toFixed(0)} с · ×
            {session.timeScale}
            {state.faultTriggered ? ' · ОТКАЗ' : ''}
          </p>

          <div className="instr-actions">
            <button type="button" onClick={() => setPaused(!session.paused)}>
              {session.paused ? 'Resume' : 'Freeze'}
            </button>
            {([0.25, 0.5, 1, 2, 4] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={session.timeScale === s ? 'on' : ''}
                onClick={() => setTimeScale(s)}
              >
                {s}×
              </button>
            ))}
          </div>

          {ex?.faultType && !state.faultTriggered && !session.completed && (
            <button
              type="button"
              className="instr-inject"
              onClick={() => {
                injectCurrentFault()
                appendAudit({
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
