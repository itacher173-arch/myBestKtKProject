import { useState } from 'react'
import {
  appendAudit,
  isInstructorAuthed,
  setInstructorAuthed,
  verifyInstructorPin,
} from '../sim/auditStorage'
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
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  const goInstructor = () => {
    if (isInstructorAuthed()) {
      appendAudit({
        actor: 'instructor',
        role: 'instructor',
        action: 'open_reports',
        detail: 'session already authed',
      })
      openReports()
      return
    }
    setRole('instructor')
  }

  const submitPin = () => {
    if (!verifyInstructorPin(pin)) {
      setPinError('Неверный PIN. Учебный PIN по умолчанию: 2026')
      appendAudit({
        actor: 'unknown',
        role: 'instructor',
        action: 'auth_failed',
      })
      return
    }
    setInstructorAuthed(true)
    appendAudit({
      actor: 'instructor',
      role: 'instructor',
      action: 'auth_ok',
    })
    setPinError('')
    openReports()
  }

  return (
    <div className="start-screen">
      <div className="start-card">
        <h1>КТК ЭЛОУ-АВТ</h1>
        <p className="start-lead">
          Компьютерный тренажёрный комплекс · кейс Ч2026/ГПН
        </p>
        <p className="spec-badge">
          Сценарии SC-01…SC-15 ({playable}/{playable + planned}) · пуск /
          останов · журнал · разбор действий
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
              onClick={goInstructor}
            >
              Инструктор
            </button>
          </div>
          <p className="hint">
            {role === 'trainee'
              ? 'Упражнение на мнемосхеме, оценка квалификации и разбор ИИ.'
              : role === 'instructor'
                ? 'Доступ к отчётам по PIN (разграничение ролей / ИБ).'
                : 'Выберите роль.'}
          </p>
        </section>

        {role === 'instructor' && !isInstructorAuthed() && (
          <section>
            <h2>PIN инструктора</h2>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              maxLength={12}
            />
            {pinError && <p className="hint" style={{ color: '#e09090' }}>{pinError}</p>}
            <button type="button" className="start-btn" onClick={submitPin}>
              Войти в отчёты
            </button>
          </section>
        )}

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
      </div>
    </div>
  )
}
