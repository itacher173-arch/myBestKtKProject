import { getUtilityAlarms } from '../sim/processModel'
import { emergencyActionsForFault } from '../sim/faultEngine'
import { getExercise } from '../sim/scenarios'
import { useTrainer } from '../sim/TrainerContext'
import './EmergencyPanel.css'

export function EmergencyPanel() {
  const { state, canControl, performEmergencyAction } = useTrainer()
  const ex = getExercise(state.session.exerciseId)
  const alarms = getUtilityAlarms(state.process)
  const actions = emergencyActionsForFault(
    state.faultTriggered ? ex?.faultType : null,
  )

  if (state.session.view !== 'exercise' || !state.session.started) return null

  return (
    <aside className="emerg-panel">
      <h3>Состояние / аварии</h3>
      {alarms.length === 0 && !state.faultTriggered && (
        <p className="emerg-ok">Утилиты в норме</p>
      )}
      {alarms.length > 0 && (
        <ul className="emerg-alarms">
          {alarms.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {state.faultTriggered && !state.faultResponded && (
        <p className="emerg-hint">
          Нештатная ситуация активна
          {ex?.normResponseSeconds != null
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
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={!canControl || state.faultResponded}
                onClick={() => performEmergencyAction(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
