import { getUtilityAlarms } from '../processModel'
import { useTrainer } from '../TrainerContext'
import './AlarmBar.css'

function prioLabel(p: 1 | 2 | 3) {
  return p === 1 ? 'P1' : p === 2 ? 'P2' : 'P3'
}

export function AlarmBar() {
  const { state, ackAlarm } = useTrainer()
  if (state.session.view !== 'exercise' || !state.session.started) return null

  const alarms = getUtilityAlarms(state.process)
  const p1 = alarms.filter((a) => a.priority === 1).length

  return (
    <div className={`alarm-bar ${p1 ? 'has-p1' : ''}`}>
      <div className="alarm-bar-head">
        <strong>Тревоги</strong>
        <span>
          {alarms.length === 0
            ? 'нет'
            : `${alarms.length}${p1 ? ` · P1: ${p1}` : ''}`}
        </span>
      </div>
      {alarms.length === 0 ? (
        <p className="alarm-bar-ok">Активных тревог нет</p>
      ) : (
        <ul>
          {alarms.slice(0, 8).map((a) => {
            const acked = state.ackedAlarmKeys.includes(a.key)
            const raised = state.alarmRaisedAt[a.key]
            return (
              <li key={a.key} className={`prio-${a.priority}${acked ? ' acked' : ''}`}>
                <span className="ab-prio">{prioLabel(a.priority)}</span>
                <span className="ab-msg">{a.message}</span>
                {raised != null && (
                  <time>
                    {new Date(raised).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </time>
                )}
                {!acked && (
                  <button type="button" onClick={() => ackAlarm(a.key)}>
                    Квит
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
