import { aiClassLabel } from '../sim/aiCoach'
import { useTrainer } from '../sim/TrainerContext'
import './AiCoachPanel.css'

export function AiCoachPanel() {
  const { state, startAdaptiveRetrain } = useTrainer()
  const { session, aiFindings, aiRisk } = state
  if (session.view !== 'exercise') return null

  const latest = [...aiFindings].reverse().slice(0, 4)

  return (
    <aside className="ai-coach">
      <header className="ai-coach-head">
        <strong>Разбор действий</strong>
        <span>риски · ошибки · повтор</span>
      </header>

      {aiRisk && !session.completed && (
        <div className={`ai-risk ai-risk-${aiRisk.level}`}>
          <div className="ai-risk-title">Прогноз до ошибки: {aiRisk.title}</div>
          <p>{aiRisk.detail}</p>
          {aiRisk.relatedTag && (
            <span className="ai-tag">{aiRisk.relatedTag}</span>
          )}
        </div>
      )}

      {!aiRisk && !session.completed && (
        <p className="ai-ok">Риск-прогноз: критических предпосылок нет.</p>
      )}

      {latest.length > 0 && (
        <ul className="ai-findings">
          {latest.map((f) => (
            <li key={f.id} className={`sev-${f.severity}`}>
              <strong>{aiClassLabel(f.class)}</strong>
              <span>{f.title}</span>
              <p>{f.why}</p>
            </li>
          ))}
        </ul>
      )}

      {session.completed && (
        <div className="ai-result">
          <div
            className={
              session.qualified ? 'ai-verdict pass' : 'ai-verdict fail'
            }
          >
            {session.qualified ? 'КВАЛИФИЦИРОВАН' : 'НЕ КВАЛИФИЦИРОВАН'}
          </div>
          {session.recommendReason && session.recommendExerciseId && (
            <div className="ai-retrain">
              <p>{session.recommendReason}</p>
              <button type="button" onClick={startAdaptiveRetrain}>
                Повторить рекомендованное
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
