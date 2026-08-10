import { getExercise } from '../../scenarios/exercises'
import { useTrainer } from '../TrainerContext'
import './BriefingModal.css'

export function BriefingModal() {
  const { state, acceptBriefing } = useTrainer()
  const { session } = state
  if (session.view !== 'exercise' || !session.started) return null
  if (session.briefingAccepted || session.completed) return null

  const ex = getExercise(session.exerciseId)
  const isExam = session.mode === 'exam'

  return (
    <div className="briefing-overlay" role="dialog" aria-modal>
      <div className="briefing-card">
        <p className="briefing-mode">
          {isExam ? 'Режим: ЭКЗАМЕН' : 'Режим: ОБУЧЕНИЕ'}
        </p>
        <h2>{ex?.name ?? 'Упражнение'}</h2>
        <p className="briefing-desc">{ex?.description}</p>

        <h3>Цель</h3>
        <ul>
          {ex?.faultType ? (
            <>
              <li>Распознать нештатную ситуацию по приборам и тревогам</li>
              <li>Выполнить безопасные действия в норме времени</li>
              <li>
                Добиться допустимого исхода процесса (без эскалации аварии)
              </li>
            </>
          ) : (
            <>
              <li>Выполнить эталонную последовательность шагов</li>
              <li>Соблюдать блокировки пуска/останова</li>
              <li>Выйти на устойчивый режим по ключевым параметрам</li>
            </>
          )}
        </ul>

        <h3>Критерии успеха</h3>
        <ul>
          <li>Выполнение ≥70% эталона и допустимые штрафы</li>
          <li>Исход процесса по модели — в норме</li>
          {ex?.normResponseSeconds != null && (
            <li>
              Реакция на отказ в пределах {ex.normResponseSeconds} с
              {isExam ? '' : ' (в обучении видна норма)'}
            </li>
          )}
          {isExam && (
            <li>Эталон скрыт до завершения; критическая ошибка — FAIL</li>
          )}
        </ul>

        {!isExam && (
          <p className="briefing-tip">
            В обучении доступны чек-лист шагов и подсветка аварийных зон.
          </p>
        )}

        <button type="button" className="briefing-go" onClick={acceptBriefing}>
          Начать упражнение
        </button>
      </div>
    </div>
  )
}
