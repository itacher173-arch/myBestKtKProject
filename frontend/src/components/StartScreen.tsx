import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import {
  getAuthedUser,
  loginUser,
  logoutUser,
  roleLabel,
  type AuthUser,
  validateFullName,
  validatePassword,
} from '../sim/authApi'
import { appendAudit, isInstructorAuthed } from '../sim/auditStorage'
import { presenceBus } from '../sim/presence'
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
    setSessionMode,
    startSession,
    openReports,
    trainingMode,
    setTrainingMode,
    miniTrainings,
    selectedMiniTrainingId,
    setSelectedMiniTraining,
    openKnowledge,
  } = useTrainer()
  const { role, userName, exerciseId, mode } = state.session
  const [authed, setAuthed] = useState<AuthUser | null>(() => getAuthedUser())
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    const user = getAuthedUser()
    if (!user) return
    setAuthed(user)
    setRole(user.role)
    setName(user.fullName)
  }, [setName, setRole])

  const effectiveRole = role ?? authed?.role ?? null
  const effectiveName = userName.trim() || authed?.fullName.trim() || ''
  const canStart =
    effectiveRole === 'trainee' &&
    effectiveName.length >= 1 &&
    (trainingMode === 'mini'
      ? Boolean(selectedMiniTrainingId)
      : Boolean(exerciseId))

  const applyUser = (user: AuthUser) => {
    setAuthed(user)
    setRole(user.role)
    setName(user.fullName)
    void appendAudit({
      actor: user.fullName,
      role: user.role,
      action: 'auth_ok',
      detail: user.role,
    })
  }

  const onLogin = async () => {
    setAuthError('')
    const nameErr = validateFullName(fullName)
    if (nameErr) {
      setAuthError(nameErr)
      return
    }
    const passErr = validatePassword(password)
    if (passErr) {
      setAuthError(passErr)
      return
    }
    setAuthBusy(true)
    try {
      const user = await loginUser({ fullName, password })
      applyUser(user)
      setPassword('')
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Ошибка входа'
      setAuthError(message)
      void appendAudit({
        actor: fullName.trim() || 'unknown',
        role: 'system',
        action: 'auth_failed',
        detail: message,
      })
    } finally {
      setAuthBusy(false)
    }
  }

  const onLogout = () => {
    presenceBus.disconnect()
    logoutUser()
    setAuthed(null)
    setRole(null)
    setName('')
    setPassword('')
    setAuthError('')
  }

  const goInstructorCabinet = () => {
    if (!authed || authed.role !== 'instructor' || !isInstructorAuthed()) return
    void appendAudit({
      actor: authed.fullName,
      role: 'instructor',
      action: 'open_reports',
    })
    openReports()
  }

  return (
    <div className="start-screen">
      <div className="start-card">
        <div className="corporate-mark">ГАЗПРОМ НЕФТЬ</div>
        <h1>КТК ЭЛОУ-АВТ</h1>
        <button
          type="button"
          className="knowledge-start-btn"
          onClick={() => openKnowledge()}
        >
          Открыть базу знаний ЭЛОУ-АВТ
        </button>

        {!authed ? (
          <section className="auth-section">
            <h2>Вход</h2>
            <p className="hint">
              Учётные записи создаёт администратор в отдельной админ-панели.
            </p>

            <h2>ФИО</h2>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Например: Иванов Иван Иванович"
              maxLength={120}
              autoComplete="username"
            />
            <p className="hint">Минимум 1 символ</p>

            <h2>Пароль</h2>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 4 символа"
              maxLength={64}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onLogin()
              }}
            />
            <p className="hint">Минимум 4 символа</p>

            {authError && <p className="hint auth-error">{authError}</p>}

            <button
              type="button"
              className="start-btn"
              disabled={authBusy}
              onClick={() => void onLogin()}
            >
              {authBusy ? 'Подождите…' : 'Войти'}
            </button>
          </section>
        ) : (
          <>
            <section className="auth-user-bar">
              <p>
                <strong>{authed.fullName}</strong>
                <span>
                  {' '}
                  · {roleLabel(authed.role)}
                </span>
              </p>
              <button type="button" className="linkish" onClick={onLogout}>
                Выйти
              </button>
            </section>

            {authed.role === 'instructor' && (
              <section>
                <h2>Кабинет инструктора</h2>
                <p className="hint">
                  Отчёты квалификации, группы и журнал аудита.
                </p>
                <button
                  type="button"
                  className="start-btn"
                  onClick={goInstructorCabinet}
                >
                  Открыть отчёты
                </button>
              </section>
            )}

            {authed.role === 'trainee' && (
              <>
                <section>
                  <h2>Формат обучения</h2>
                  <div className="training-mode-row">
                    <button
                      type="button"
                      className={trainingMode === 'full' ? 'active' : ''}
                      onClick={() => setTrainingMode('full')}
                    >
                      Полный процесс
                    </button>
                    <button
                      type="button"
                      className={trainingMode === 'mini' ? 'active' : ''}
                      onClick={() => setTrainingMode('mini')}
                    >
                      Мини-обучение
                    </button>
                  </div>
                </section>

                {trainingMode === 'full' && (
                  <>
                    <section>
                      <h2>Режим</h2>
                      <div className="role-row">
                        <button
                          type="button"
                          className={mode === 'train' ? 'active' : ''}
                          onClick={() => setSessionMode('train')}
                        >
                          Обучение
                        </button>
                        <button
                          type="button"
                          className={mode === 'exam' ? 'active' : ''}
                          onClick={() => setSessionMode('exam')}
                        >
                          Экзамен
                        </button>
                      </div>
                      <p className="hint">
                        {mode === 'exam'
                          ? 'Эталон скрыт до завершения.'
                          : 'Доступен чек-лист эталона сценария.'}
                      </p>
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
                      {getExercise(exerciseId) && (
                        <p className="hint">
                          {getExercise(exerciseId)?.description}
                        </p>
                      )}
                      {!exerciseId && (
                        <p className="hint">Выберите упражнение, чтобы начать.</p>
                      )}
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
                  </>
                )}

                {trainingMode === 'mini' && (
                  <section>
                    <h2>
                      Сегмент · доступно {miniTrainings.length} мини-уроков
                    </h2>
                    {!selectedMiniTrainingId && (
                      <p className="hint">Выберите мини-урок, чтобы начать.</p>
                    )}
                    <div className="mini-training-cards">
                      {miniTrainings.map((training) => (
                        <button
                          type="button"
                          key={training.id}
                          className={
                            selectedMiniTrainingId === training.id
                              ? 'active'
                              : ''
                          }
                          onClick={() => setSelectedMiniTraining(training.id)}
                        >
                          <strong>{training.title}</strong>
                          <span>
                            {training.segment} · {training.durationMinutes} мин.
                            · {training.difficulty}
                          </span>
                          <small>{training.description}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <button
                  type="button"
                  className="start-btn"
                  disabled={!canStart}
                  title={
                    !canStart
                      ? trainingMode === 'mini'
                        ? 'Выберите мини-урок'
                        : 'Выберите упражнение'
                      : undefined
                  }
                  onClick={startSession}
                >
                  {trainingMode === 'mini'
                    ? 'Начать мини-обучение'
                    : 'Начать упражнение'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
