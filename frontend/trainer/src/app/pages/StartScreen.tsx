import { useEffect, useMemo, useState } from 'react'
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
import { loadReports, loadReportsSync } from '../../storage/reportsStorage'
import { presenceBus } from '../../presence/presence'
import { useTrainer } from '../../simulator/TrainerContext'
import { usePreferences } from '../../settings/PreferencesContext'
import { SPEC_SCENARIOS } from '../../scenarios/catalog'
import { getExercise } from '../../scenarios/exercises'
import { Icon } from '../../common/ui/Icon'
import './StartScreen.css'

export function StartScreen() {
  const { t } = usePreferences()
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
    assignMiniTraining,
  } = useTrainer()

  const { exerciseId, mode } = state.session
  const [authed, setAuthed] = useState<AuthUser | null>(() => getAuthedUser())
  const [workRole, setWorkRole] = useState<'trainee' | 'instructor' | null>(
    () => {
      const user = getAuthedUser()
      return user ? resolveWorkRole(user) : null
    },
  )
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState('Все сегменты')
  const [reports, setReports] = useState(() => loadReportsSync())

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
      const initialRole = resolveWorkRole(user) ?? 'trainee'
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

  useEffect(() => {
    void loadReports().then(setReports)
  }, [])

  const effectiveRole = workRole ?? state.session.role
  const effectiveName =
    state.session.userName.trim() || authed?.fullName.trim() || ''
  const selectedExercise = getExercise(exerciseId)
  const selectedTraining =
    miniTrainings.find((item) => item.id === selectedMiniTrainingId) ?? null
  const hasTraineeRole = Boolean(authed && hasRole(authed, 'trainee'))
  const hasInstructorRole = Boolean(authed && hasRole(authed, 'instructor'))
  const hasDualRole = hasTraineeRole && hasInstructorRole
  const showTraining = effectiveRole === 'trainee' && hasTraineeRole
  const showInstructorCabinet =
    effectiveRole === 'instructor' && hasInstructorRole

  const averageScore = reports.length
    ? Math.round(
        reports.reduce((sum, item) => sum + item.scorePercent, 0) /
          reports.length,
      )
    : 0
  const lastReport = reports[0]
  const recommendations = useMemo(() => {
    const seen = new Set<string>()
    return reports
      .flatMap((report) => report.aiAnalysis?.recommendations ?? [])
      .filter((item) => {
        if (seen.has(item.trainingId)) return false
        seen.add(item.trainingId)
        return true
      })
      .slice(0, 3)
  }, [reports])

  const segments = useMemo(
    () => [
      'Все сегменты',
      ...Array.from(new Set(miniTrainings.map((item) => item.segment))),
    ],
    [miniTrainings],
  )

  const filteredTrainings = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru-RU')
    return miniTrainings.filter((item) => {
      const matchesSegment =
        segment === 'Все сегменты' || item.segment === segment
      const matchesSearch =
        !needle ||
        `${item.title} ${item.description} ${item.segment}`
          .toLocaleLowerCase('ru-RU')
          .includes(needle)
      return matchesSegment && matchesSearch
    })
  }, [miniTrainings, search, segment])

  const canStart =
    showTraining &&
    effectiveName.length >= 1 &&
    (trainingMode === 'mini'
      ? Boolean(selectedTraining)
      : Boolean(selectedExercise))

  const selectedTitle =
    trainingMode === 'mini' ? selectedTraining?.title : selectedExercise?.name
  const selectedDescription =
    trainingMode === 'mini'
      ? selectedTraining?.description
      : selectedExercise?.description

  const welcomeName =
    authed?.fullName.split(/\s+/).filter(Boolean)[0] ?? 'оператор'

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
    if (!authed || !hasInstructorRole || !isInstructorAuthed()) return
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

  if (loading || !authed) {
    return (
      <div className="dashboard dashboard-loading">
        <p>Проверка авторизации…</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">
            <i /> Учебный контур · ЭЛОУ-АВТ
          </span>
          <h2>Добро пожаловать, {welcomeName}</h2>
          <p>
            {showInstructorCabinet
              ? 'Кабинет инструктора: отчёты квалификации, группы и журнал аудита.'
              : 'Выберите комплексный сценарий или короткую тренировку по конкретному технологическому сегменту.'}
          </p>
          {!hasDualRole && (
            <p className="dashboard-user-meta">
              <strong>{authed.fullName}</strong>
              <span> · {rolesLabel(authed)}</span>
              <button type="button" onClick={onLogout}>Выйти</button>
            </p>
          )}
        </div>
      </section>

      <section className="dashboard-stats" aria-label="Сводка обучения">
        <article>
          <span className="stat-icon blue">
            <Icon name="trainer" />
          </span>
          <div>
            <strong>{miniTrainings.length + exercises.length}</strong>
            <small>доступных тренировок</small>
          </div>
          <em>актуальный каталог</em>
        </article>
        <article>
          <span className="stat-icon green">
            <Icon name="check" />
          </span>
          <div>
            <strong>{reports.length}</strong>
            <small>завершено сессий</small>
          </div>
          <em>
            {lastReport
              ? `последняя — ${new Date(lastReport.completedAt).toLocaleDateString('ru-RU')}`
              : 'начните первую'}
          </em>
        </article>
        <article>
          <span className="stat-icon violet">
            <Icon name="target" />
          </span>
          <div>
            <strong>
              {averageScore || '—'}
              {averageScore ? '%' : ''}
            </strong>
            <small>средний результат</small>
          </div>
          <em>
            {averageScore >= 85
              ? 'устойчивая динамика'
              : 'есть потенциал роста'}
          </em>
        </article>
        <article>
          <span className="stat-icon amber">
            <Icon name="clock" />
          </span>
          <div>
            <strong>{recommendations.length}</strong>
            <small>рекомендаций ИИ</small>
          </div>
          <em>персональный маршрут</em>
        </article>
      </section>

      {showTraining && !!recommendations.length && (
        <section className="personal-route">
          <header>
            <div>
              <span>
                <Icon name="sparkles" /> Персональный маршрут
              </span>
              <h3>Продолжить точечную отработку</h3>
            </div>
            <button type="button" onClick={openReports}>
              {showInstructorCabinet
                ? 'Посмотреть полный разбор'
                : 'Мои результаты'}{' '}
              <Icon name="chevron" />
            </button>
          </header>
          <div>
            {recommendations.map((item) => (
              <button
                type="button"
                key={item.trainingId}
                onClick={() => assignMiniTraining(item.trainingId)}
              >
                <span>{item.segment}</span>
                <strong>{item.trainingTitle}</strong>
                <small>
                  {item.durationMinutes} мин. · {item.reason}
                </small>
                <i>
                  <Icon name="chevron" />
                </i>
              </button>
            ))}
          </div>
        </section>
      )}

      {showInstructorCabinet && (
        <section className="instructor-launch-panel">
          <div>
            <span>Кабинет инструктора</span>
            <h3>Отчёты, группы и аудит</h3>
            <p>
              Управление обучением, квалификационные отчёты и журнал действий
              обучаемых.
            </p>
          </div>
          <button type="button" className="launch-button" onClick={goInstructorCabinet}>
            <Icon name="chart" />
            Открыть отчёты
          </button>
        </section>
      )}

      {showTraining && (
        <section className="instructor-launch-panel">
          <div>
            <span>Архив обучаемого</span>
            <h3>Мои результаты и ИИ-разбор</h3>
            <p>
              Просмотр завершённых сессий, оценка, журнал действий и локальный
              анализ траектории.
            </p>
          </div>
          <button
            type="button"
            className="launch-button"
            onClick={openReports}
          >
            <Icon name="chart" />
            Открыть результаты
          </button>
        </section>
      )}

      {showTraining && (
        <section className="training-workspace">
          <div className="training-catalog">
            <header className="catalog-header">
              <div>
                <span>Каталог программ</span>
                <h3>Выберите формат обучения</h3>
              </div>
              <div className="mode-switch" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={trainingMode === 'full'}
                  className={trainingMode === 'full' ? 'active' : ''}
                  onClick={() => setTrainingMode('full')}
                >
                  <Icon name="activity" />
                  {t('fullProcess')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={trainingMode === 'mini'}
                  className={trainingMode === 'mini' ? 'active' : ''}
                  onClick={() => setTrainingMode('mini')}
                >
                  <Icon name="target" />
                  {t('miniTraining')}
                </button>
              </div>
            </header>

            {trainingMode === 'full' ? (
              <>
                <div className="session-mode-row">
                  <span>Режим сессии</span>
                  <div className="mode-switch compact" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'train'}
                      className={mode === 'train' ? 'active' : ''}
                      onClick={() => setSessionMode('train')}
                    >
                      Обучение
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'exam'}
                      className={mode === 'exam' ? 'active' : ''}
                      onClick={() => setSessionMode('exam')}
                    >
                      Экзамен
                    </button>
                  </div>
                  <em>
                    {mode === 'exam'
                      ? 'Эталон скрыт до завершения'
                      : 'Доступен чек-лист эталона'}
                  </em>
                </div>
                <div className="scenario-grid">
                  {exercises.map((exercise, index) => {
                    const spec = SPEC_SCENARIOS.find(
                      (item) => item.specId === exercise.specId,
                    )
                    const active = exercise.id === exerciseId
                    return (
                      <button
                        type="button"
                        key={exercise.id}
                        className={active ? 'active' : ''}
                        onClick={() => setExercise(exercise.id)}
                      >
                        <span className="scenario-number">
                          {exercise.specId ||
                            `SC-${String(index + 1).padStart(2, '0')}`}
                        </span>
                        <span
                          className={`scenario-level ${
                            index % 3 === 0
                              ? 'critical'
                              : index % 3 === 1
                                ? 'medium'
                                : 'base'
                          }`}
                        >
                          {index % 3 === 0
                            ? 'Аварийный'
                            : index % 3 === 1
                              ? 'Отклонение'
                              : 'Базовый'}
                        </span>
                        <strong>{exercise.name}</strong>
                        <p>{exercise.description}</p>
                        <small>
                          <Icon name="clock" /> 15–25 мин. <i />
                          {spec?.status === 'playable'
                            ? 'Интерактивный'
                            : 'Учебный'}
                        </small>
                        {active && (
                          <em>
                            <Icon name="check" />
                          </em>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="catalog-tools">
                  <label>
                    <Icon name="search" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Найти мини-тренировку…"
                    />
                  </label>
                  <select
                    value={segment}
                    onChange={(event) => setSegment(event.target.value)}
                  >
                    {segments.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <span>Найдено: {filteredTrainings.length}</span>
                </div>
                <div className="mini-grid">
                  {filteredTrainings.map((training) => {
                    const active = training.id === selectedMiniTrainingId
                    return (
                      <button
                        type="button"
                        key={training.id}
                        className={active ? 'active' : ''}
                        onClick={() => setSelectedMiniTraining(training.id)}
                      >
                        <span className="mini-card-top">
                          <i>{training.segment.slice(0, 2).toUpperCase()}</i>
                          <em>{training.segment}</em>
                          {active && <Icon name="check" />}
                        </span>
                        <strong>{training.title}</strong>
                        <p>{training.description}</p>
                        <span className="mini-card-meta">
                          <small>
                            <Icon name="clock" /> {training.durationMinutes} мин.
                          </small>
                          <small>
                            <Icon name="target" /> {training.objectives.length}{' '}
                            цели
                          </small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <aside className="launch-card">
            <span className="launch-kicker">Выбрано</span>
            {selectedTitle ? (
              <>
                <div className="launch-icon">
                  <Icon
                    name={trainingMode === 'mini' ? 'target' : 'trainer'}
                  />
                </div>
                <h3>{selectedTitle}</h3>
                <p>{selectedDescription}</p>
                <dl>
                  <div>
                    <dt>Формат</dt>
                    <dd>
                      {trainingMode === 'mini'
                        ? 'Точечная отработка'
                        : 'Комплексный сценарий'}
                    </dd>
                  </div>
                  <div>
                    <dt>Роль</dt>
                    <dd>{rolesLabel(authed)}</dd>
                  </div>
                  <div>
                    <dt>Оценка</dt>
                    <dd>Журнал + ИИ-разбор</dd>
                  </div>
                  {trainingMode === 'full' && (
                    <div>
                      <dt>Режим</dt>
                      <dd>
                        {mode === 'exam' ? 'Экзамен' : 'Обучение'}
                      </dd>
                    </div>
                  )}
                </dl>
                <button
                  type="button"
                  className="launch-button"
                  disabled={!canStart}
                  onClick={startSession}
                >
                  <Icon name="trainer" />
                  {t('startTraining')}
                </button>
              </>
            ) : (
              <div className="launch-empty">
                <Icon name="target" />
                <h3>Выберите программу</h3>
                <p>Карточка запуска появится после выбора упражнения.</p>
              </div>
            )}
            <button
              type="button"
              className="launch-link"
              onClick={() => openKnowledge()}
            >
              <Icon name="book" /> Открыть базу знаний
            </button>
            {(hasInstructorRole || hasRole(authed, 'admin')) && (
              <button
                type="button"
                className="launch-link"
                onClick={goInstructorCabinet}
              >
                <Icon name="chart" /> Отчёты обучаемых
              </button>
            )}
            <footer>
              <Icon name="shield" /> Симуляция не подключена к реальной АСУ ТП
            </footer>
          </aside>
        </section>
      )}
    </div>
  )
}
