import { useTrainer } from '../sim/TrainerContext'
import { SPEC_SCENARIOS } from '../sim/scenarioCatalog'
import { getExercise } from '../sim/scenarios'
import './StartScreen.css'

export function StartScreen() {
  const {
    state,
    exercises,
    setRole,
    setName,
    setExercise,
    startSession,
    openReports,
  } = useTrainer()
  const { role, userName, exerciseId } = state.session
  const selected = getExercise(exerciseId)
  const canStart =
    role === 'trainee' && userName.trim().length >= 2 && !!exerciseId
  const playable = SPEC_SCENARIOS.filter((s) => s.status === 'playable').length
  const planned = SPEC_SCENARIOS.filter((s) => s.status === 'planned').length

  return (
    <div className="start-screen">
      <div className="start-card">
        <h1>КТК ЭЛОУ-АВТ</h1>
        <p className="start-lead">
          Компьютерный тренажёрный комплекс · кейс Ч2026/ГПН
        </p>
        <p className="spec-badge">
          MVP по отчёту требований · каталог SC-01…SC-15 доступен в симуляции (
          {playable}/{playable + planned})
        </p>

        <section>
          <h2>Роль</h2>
          <div className="role-row">
            <button
              type="button"
              className={role === 'trainee' ? 'active' : ''}
              onClick={() => setRole('trainee')}
            >
              Обучаемый
            </button>
            <button
              type="button"
              className={role === 'instructor' ? 'active' : ''}
              onClick={() => openReports()}
            >
              Инструктор
            </button>
          </div>
          <p className="hint">
            {role === 'trainee'
              ? 'Выполните упражнение на мнемосхеме. Результат сохранится для инструктора.'
              : 'Инструктор сразу переходит к отчётам обучаемых (ФИО не требуется).'}
          </p>
        </section>

        {role === 'trainee' && (
          <>
            <section>
              <h2>ФИО / код</h2>
              <input
                type="text"
                value={userName}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Иванов И.И."
                maxLength={80}
              />
            </section>

            <section>
              <h2>Упражнение (доступные)</h2>
              <select
                value={exerciseId ?? ''}
                onChange={(e) => setExercise(e.target.value)}
              >
                <option value="" disabled>
                  Выберите упражнение…
                </option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
              {selected && <p className="hint">{selected.description}</p>}
            </section>

            <section>
              <h2>Каталог SC-01…SC-15</h2>
              <ul className="spec-list">
                {SPEC_SCENARIOS.map((s) => (
                  <li
                    key={s.specId}
                    className={
                      s.status === 'playable' ? 'playable' : 'planned'
                    }
                    title={s.learningGoal}
                  >
                    <span className="spec-id">{s.specId}</span>
                    <span className="spec-event">{s.event}</span>
                    <span className="spec-status">
                      {s.status === 'playable' ? 'доступен' : 'в плане'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Источник: docs/Отчет_по_требованиям_и_спецификации.docx §8.
                Эталоны подлежат утверждению владельцем процесса.
              </p>
            </section>

            <button
              type="button"
              className="start-btn"
              disabled={!canStart}
              onClick={startSession}
            >
              Начать упражнение
            </button>
          </>
        )}

        {!role && (
          <p className="hint" style={{ marginTop: 8 }}>
            Выберите роль, чтобы продолжить.
          </p>
        )}
      </div>
    </div>
  )
}
