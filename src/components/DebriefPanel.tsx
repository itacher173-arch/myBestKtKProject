import { getExercise } from '../sim/scenarios'
import { useTrainer } from '../sim/TrainerContext'
import './DebriefPanel.css'

function stepOk(step: string, done: Set<string>, doneList: string[]) {
  if (done.has(step)) return true
  if (step.includes('топливного газа')) {
    return doneList.some((d) => {
      const m = d.match(/топливного газа на (\d+)%/)
      return m != null && Number(m[1]) >= 40
    })
  }
  return false
}

export function DebriefPanel() {
  const { state, resetToStart } = useTrainer()
  const { session, actionsLog } = state
  if (session.view !== 'exercise' || !session.completed) return null

  const ex = getExercise(session.exerciseId)
  const doneList = actionsLog.map((a) => a.description)
  const done = new Set(doneList)
  const steps = ex?.scenarioSteps ?? []
  const missed = steps.filter((s) => !stepOk(s, done, doneList))
  const pd = session.penaltyDetail

  return (
    <aside className="debrief-panel">
      <header>
        <strong>Разбор сессии</strong>
        <span className={session.qualified ? 'ok' : 'bad'}>
          {session.qualified ? 'PASS' : 'FAIL'}
        </span>
      </header>

      <p className="debrief-summary">{session.qualificationSummary}</p>

      {session.criticalFailReason && (
        <p className="debrief-critical">{session.criticalFailReason}</p>
      )}

      <dl className="debrief-meta">
        <div>
          <dt>Балл</dt>
          <dd>{session.scorePercent}%</dd>
        </div>
        <div>
          <dt>Штрафы</dt>
          <dd>
            {session.penalty}
            {pd
              ? ` (u${pd.unsafe}/l${pd.late}/e${pd.extra}/m${pd.missed})`
              : ''}
          </dd>
        </div>
        <div>
          <dt>Реакция</dt>
          <dd>
            {session.responseSeconds == null
              ? '—'
              : `${session.responseSeconds.toFixed(1)} с${
                  session.respondedInTime === false ? ' · поздно' : ''
                }`}
          </dd>
        </div>
        <div>
          <dt>Режим</dt>
          <dd>{session.mode === 'exam' ? 'Экзамен' : 'Обучение'}</dd>
        </div>
      </dl>

      <h3>Эталон</h3>
      <ol className="debrief-steps">
        {steps.map((s, i) => {
          const ok = stepOk(s, done, doneList)
          return (
            <li key={`${i}-${s.slice(0, 20)}`} className={ok ? 'ok' : 'miss'}>
              <span>{ok ? '✓' : '✗'}</span>
              <span>{s}</span>
            </li>
          )
        })}
      </ol>

      {missed.length > 0 && (
        <p className="debrief-miss-note">
          Пропущено шагов: {missed.length}. Повторите сценарий в режиме
          обучения.
        </p>
      )}

      <h3>Ваши действия (последние)</h3>
      <ul className="debrief-log">
        {actionsLog.slice(-12).map((a) => (
          <li key={a.id}>
            <time>{new Date(a.at).toLocaleTimeString('ru-RU')}</time>
            {a.description}
          </li>
        ))}
        {!actionsLog.length && <li>Пусто</li>}
      </ul>

      <button type="button" className="debrief-btn" onClick={resetToStart}>
        На старт
      </button>
    </aside>
  )
}
