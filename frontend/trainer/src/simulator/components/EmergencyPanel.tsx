import { emergencyActionsForFault } from '../faultEngine'
import { getUtilityAlarms } from '../processModel'
import { getExercise } from '../../scenarios/exercises'
import { isInstructorAuthed } from '../../storage/auditStorage'
import { useTrainer } from '../TrainerContext'
import './EmergencyPanel.css'

function formatAlarmTime(ms: number) {
  return new Date(ms).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function priorityLabel(p: 1 | 2 | 3) {
  if (p === 1) return 'P1'
  if (p === 2) return 'P2'
  return 'P3'
}

export function EmergencyPanel() {
  const {
    state,
    canControl,
    performEmergencyAction,
    ackAlarm,
    injectCurrentFault,
  } = useTrainer()
  const ex = getExercise(state.session.exerciseId)
  const alarms = getUtilityAlarms(state.process)
  const actions = emergencyActionsForFault(
    state.faultTriggered ? ex?.faultType : null,
  )
  const instructor = isInstructorAuthed()
  const isExam = state.session.mode === 'exam' && !state.session.completed

  if (state.session.view !== 'exercise' || !state.session.started) return null

  return (
    <aside className="emerg-panel">
      <h3>Состояние / аварии</h3>
      {alarms.length === 0 && !state.faultTriggered && (
        <p className="emerg-ok">Утилиты в норме</p>
      )}
      {alarms.length > 0 && (
        <ul className="emerg-alarms">
          {alarms.map((a) => {
            const acked = state.ackedAlarmKeys.includes(a.key)
            const raised = state.alarmRaisedAt[a.key]
            return (
              <li key={a.key} className={acked ? 'acked' : ''}>
                <div className="emerg-alarm-main">
                  <span className={`prio prio-${a.priority}`}>
                    {priorityLabel(a.priority)}
                  </span>
                  <span className="emerg-alarm-msg">{a.message}</span>
                  {raised != null && (
                    <time className="emerg-alarm-time">
                      {formatAlarmTime(raised)}
                    </time>
                  )}
                </div>
                {!acked && (
                  <button type="button" onClick={() => ackAlarm(a.key)}>
                    Квит.
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {state.faultTriggered && !state.faultResponded && (
        <p className="emerg-hint">
          Нештатная ситуация активна
          {!isExam && ex?.normResponseSeconds != null
            ? ` · норма реакции ${ex.normResponseSeconds} с`
            : ''}
        </p>
      )}
      {state.faultResponded && (
        <p className="emerg-ok">
          Реакция зафиксирована
          {state.session.responseSeconds != null
            ? ` · ${state.session.responseSeconds.toFixed(1)} с`
            : ''}
        </p>
      )}

      {actions.length > 0 && (
        <>
          <h3>Аварийные действия</h3>
          <div className="emerg-actions">
            {actions.map((a) => {
              const done = state.actionsLog.some(
                (e) => e.description === a.logDescription,
              )
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={!canControl || state.faultResponded || done}
                  onClick={() => performEmergencyAction(a.id)}
                >
                  {a.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {instructor && ex?.faultType && !state.faultTriggered && (
        <div className="emerg-inject">
          <h3>Инструктор</h3>
          <button type="button" onClick={injectCurrentFault}>
            Ввести отказ сейчас
          </button>
        </div>
      )}
    </aside>
  )
}
