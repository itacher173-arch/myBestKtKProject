import { useTrainer } from '../simulator/TrainerContext'
import './TrainingPanel.css'

export function TrainingPanel() {
  const {
    activeMiniTraining,
    miniTrainingProgress,
    visibleHint,
    requestHint,
    hintsUsed,
    openKnowledge,
  } = useTrainer()

  if (!activeMiniTraining) return null

  return (
    <aside
      className="mini-training-panel"
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="mini-training-head">
        <span>Мини-обучение</span>
        <strong>{activeMiniTraining.segment}</strong>
      </div>
      <h2>{activeMiniTraining.title}</h2>
      <p>{activeMiniTraining.description}</p>

      <div className="mini-progress">
        <div style={{ width: `${miniTrainingProgress.progressPercent}%` }} />
      </div>
      <span className="mini-progress-label">
        Выполнено: {miniTrainingProgress.progressPercent}%
      </span>

      <ol className="mini-objectives">
        {activeMiniTraining.objectives.map((objective, index) => (
          <li
            key={objective}
            className={miniTrainingProgress.checks[index] ? 'done' : ''}
          >
            {objective}
          </li>
        ))}
      </ol>

      {visibleHint && (
        <div className="mini-hint">
          <span>Подсказка: {visibleHint.text}</span>
          <button
            type="button"
            onClick={() => openKnowledge(visibleHint.articleId)}
          >
            Подробнее в базе знаний
          </button>
        </div>
      )}
      <button type="button" onClick={requestHint}>
        Показать подсказку {hintsUsed ? `(${hintsUsed})` : ''}
      </button>

      {miniTrainingProgress.completed && (
        <div className="mini-success">
          Цель достигнута. Зафиксируйте результат кнопкой «Завершить».
        </div>
      )}
    </aside>
  )
}
