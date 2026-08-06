import { useTrainer } from '../sim/TrainerContext'
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

  return (
    <div className="start-screen">
      <div className="start-card">
        <h1>КТК ЭЛОУ-АВТ</h1>
        <p className="start-lead">
          Компьютерный тренажёрный комплекс · кейс Ч2026/ГПН
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
              <h2>Упражнение</h2>
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
