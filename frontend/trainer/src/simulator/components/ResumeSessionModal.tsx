import type { ActiveSimCheckpoint } from '../serverSimApi'
import './ResumeSessionModal.css'

function formatSimTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

export function ResumeSessionModal({
  checkpoint,
  exerciseName,
  pending,
  error,
  onCancel,
  onContinue,
}: {
  checkpoint: ActiveSimCheckpoint
  exerciseName: string
  pending: boolean
  error: string
  onCancel: () => void
  onContinue: () => void
}) {
  return (
    <div
      className="resume-session-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-session-title"
      aria-describedby="resume-session-description"
    >
      <section className="resume-session-card">
        <span className="resume-session-kicker">Незавершённое обучение</span>
        <h2 id="resume-session-title">Продолжить последнее прохождение?</h2>
        <p id="resume-session-description">
          Прогресс был сохранён после прерывания соединения. Вы можете вернуться
          к упражнению с последней подтверждённой точки.
        </p>
        <dl>
          <div>
            <dt>Упражнение</dt>
            <dd>{exerciseName}</dd>
          </div>
          <div>
            <dt>Модельное время</dt>
            <dd>{formatSimTime(checkpoint.session.simTimeSec)}</dd>
          </div>
          <div>
            <dt>Сохранено</dt>
            <dd>{new Date(checkpoint.savedAt).toLocaleString('ru-RU')}</dd>
          </div>
        </dl>
        {error && <p className="resume-session-error">{error}</p>}
        <footer>
          <button type="button" disabled={pending} onClick={onCancel}>
            Отменить прохождение
          </button>
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={onContinue}
            autoFocus
          >
            {pending ? 'Восстановление…' : 'Продолжить прохождение'}
          </button>
        </footer>
      </section>
    </div>
  )
}
