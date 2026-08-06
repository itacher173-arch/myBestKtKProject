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
  } = useTrainer()
  const { role, userName, exerciseId } = state.session
  const selected = getExercise(exerciseId)
  const canStart = !!role && userName.trim().length >= 2 && !!exerciseId

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
              onClick={() => setRole('instructor')}
            >
              Инструктор
            </button>
          </div>
          <p className="hint">
            {role === 'instructor'
              ? 'Инструктор видит журналы и может управлять процессом для демонстрации.'
              : role === 'trainee'
                ? 'Обучаемый выполняет сценарий на мнемосхеме; действия фиксируются в журнале.'
                : 'Выберите роль для входа в упражнение.'}
          </p>
        </section>

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
      </div>
    </div>
  )
}
