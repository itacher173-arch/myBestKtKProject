import { useEffect, useState } from 'react'
import {
  fetchSessionUser,
  getAuthedUser,
  hasRole,
  logoutUser,
  redirectToAuthPortal,
  resolveWorkRole,
  rolesLabel,
  setActiveWorkRole,
  type AuthUser,
} from '../../auth/authApi'
import { appendAudit, isInstructorAuthed } from '../../storage/auditStorage'
import { presenceBus } from '../../presence/presence'
import { useTrainer } from '../../simulator/TrainerContext'
import { SPEC_SCENARIOS } from '../../scenarios/catalog'
import { getExercise } from '../../scenarios/exercises'
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
  const [workRole, setWorkRole] = useState<'trainee' | 'instructor' | null>(
    () => {
      const user = getAuthedUser()
      return user ? resolveWorkRole(user) : null
    },
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const user = await fetchSessionUser()
      if (cancelled) return
      if (!user) {
        redirectToAuthPortal()
        return
      }
      setAuthed(user)
      const initialRole = resolveWorkRole(user)
      setWorkRole(initialRole)
      setActiveWorkRole(initialRole)
      setRole(initialRole)
      setName(user.fullName)
      setLoading(false)
      void appendAudit({
        actor: user.fullName,
        role: initialRole ?? user.role,
        action: 'auth_ok',
        detail: (user.roles ?? [user.role]).join(','),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [setName, setRole])

  const effectiveRole = workRole ?? role
  const effectiveName = userName.trim() || authed?.fullName.trim() || ''
  const canStart =
    effectiveRole === 'trainee' &&
    effectiveName.length >= 1 &&
    (trainingMode === 'mini'
      ? Boolean(selectedMiniTrainingId)
      : Boolean(exerciseId))

  const onLogout = () => {
    presenceBus.disconnect()
    void (async () => {
      await logoutUser()
      setAuthed(null)
      setWorkRole(null)
      setActiveWorkRole(null)
      setRole(null)
      setName('')
      redirectToAuthPortal()
    })()
  }

  const goInstructorCabinet = () => {
    if (!authed || !hasRole(authed, 'instructor') || !isInstructorAuthed()) return
    setWorkRole('instructor')
    setActiveWorkRole('instructor')
    setRole('instructor')
    void appendAudit({
      actor: authed.fullName,
      role: 'instructor',
      action: 'open_reports',
    })
    openReports()
  }

  const goTraining = () => {
    setWorkRole('trainee')
    setActiveWorkRole('trainee')
    setRole('trainee')
  }

  if (loading || !authed) {
    return (
      <div className="start-screen">
        <div className="start-card">
          <div className="corporate-mark">ГАЗПРОМ НЕФТЬ</div>
          <h1>КТК ЭЛОУ-АВТ</h1>
          <p className="hint">Проверка авторизации…</p>
        </div>
      </div>
    )
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

        <section className="auth-user-bar">
          <p>
            <strong>{authed.fullName}</strong>
            <span>
              {' '}
              · {rolesLabel(authed)}
            </span>
          </p>
          <button type="button" className="linkish" onClick={onLogout}>
            Выйти
          </button>
        </section>

        {hasRole(authed, 'trainee') && hasRole(authed, 'instructor') && (
          <section>
            <h2>Выберите режим работы</h2>
            <div className="role-row">
              <button
                type="button"
                className={effectiveRole === 'trainee' ? 'active' : ''}
                onClick={goTraining}
              >
                Перейти в обучение
              </button>
              <button
                type="button"
                className={effectiveRole === 'instructor' ? 'active' : ''}
                onClick={goInstructorCabinet}
              >
                Перейти в отчёты
              </button>
            </div>
          </section>
        )}

        {effectiveRole === 'instructor' && (
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

        {effectiveRole === 'trainee' && (
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
                        selectedMiniTrainingId === training.id ? 'active' : ''
                      }
                      onClick={() => setSelectedMiniTraining(training.id)}
                    >
                      <strong>{training.title}</strong>
                      <span>
                        {training.segment} · {training.durationMinutes} мин. ·{' '}
                        {training.difficulty}
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
      </div>
    </div>
  )
}
