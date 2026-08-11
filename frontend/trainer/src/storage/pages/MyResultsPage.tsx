import { useEffect, useMemo, useState } from 'react'
import { apiPost } from '../../api/client'
import { AiReviewPanel } from '../../ai/AiReviewPanel'
import type { AiAnalysis } from '../../ai/types'
import {
  getAuthedUser,
  hasRole,
} from '../../auth/authApi'
import { useConfirm } from '../../common/ui/ConfirmDialog'
import { Icon } from '../../common/ui/Icon'
import { useTrainer } from '../../simulator/TrainerContext'
import {
  deleteReport,
  loadReports,
  updateReportAnalysis,
  type TraineeReport,
} from '../reportsStorage'
import { usePreferences } from '../../settings/PreferencesContext'
import './MyResultsPage.css'

type ReportTab = 'overview' | 'ai' | 'actions' | 'events'

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function scoreTone(score: number) {
  if (score >= 85) return 'success'
  if (score >= 65) return 'warning'
  return 'danger'
}

export function MyResultsPage() {
  const { openKnowledge, assignMiniTraining, resetToStart } = useTrainer()
  const { aiEnabled } = usePreferences()
  const confirm = useConfirm()
  const user = getAuthedUser()
  const [reports, setReports] = useState<TraineeReport[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<ReportTab>('overview')
  const [query, setQuery] = useState('')
  const [analysisStatus, setAnalysisStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'disabled'
  >('idle')
  const [analysisError, setAnalysisError] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = useMemo(
    () => reports.find((report) => report.id === selectedId) ?? null,
    [reports, selectedId],
  )
  const visibleReports = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU')
    if (!needle) return reports
    return reports.filter((report) =>
      `${report.exerciseName} ${report.exerciseId}`
        .toLocaleLowerCase('ru-RU')
        .includes(needle),
    )
  }, [query, reports])
  const averageScore = reports.length
    ? Math.round(
        reports.reduce((sum, report) => sum + report.scorePercent, 0) /
          reports.length,
      )
    : 0
  const readyCount = reports.filter((report) => report.scorePercent >= 85).length

  const refresh = async () => {
    setBusy(true)
    try {
      const next = await loadReports({ mine: true })
      const mine = user
        ? next.filter((report) => {
            if (report.userId && user.id) return report.userId === user.id
            const names = [user.fullName, user.login]
              .map((v) => (v || '').trim().toLocaleLowerCase('ru-RU'))
              .filter(Boolean)
            return names.includes(
              (report.userName || '').trim().toLocaleLowerCase('ru-RU'),
            )
          })
        : next
      setReports(mine)
      setSelectedId((prev) => {
        if (prev && mine.some((report) => report.id === prev)) return prev
        return mine[0]?.id ?? null
      })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!user || !hasRole(user, 'trainee')) {
      resetToStart()
      return
    }
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    setAnalysisStatus(
      !aiEnabled ? 'disabled' : selected?.aiAnalysis ? 'ready' : 'idle',
    )
    setAnalysisError('')
  }, [aiEnabled, selected?.aiAnalysis, selectedId])

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Удаление отчёта',
      message: 'Удалить этот отчёт из вашего архива?',
      danger: true,
      confirmLabel: 'Удалить',
    })
    if (!ok) return
    await deleteReport(id)
    await refresh()
  }

  const analyzeSelected = async () => {
    if (!selected || !aiEnabled) return
    const reportId = selected.id
    setAnalysisStatus('loading')
    setAnalysisError('')
    try {
      const analysis = await apiPost<AiAnalysis>('/ai/analyze', {
        sessionId: selected.id,
        userName: selected.userName,
        exerciseId: selected.exerciseId,
        exerciseName: selected.exerciseName,
        scorePercent: selected.scorePercent,
        penalty: selected.penalty,
        responseSeconds: selected.responseSeconds,
        respondedInTime: selected.respondedInTime,
        process: selected.processSnapshot ?? {},
        actionsLog: selected.actionsLog,
        systemEvents: selected.systemEvents,
      })
      // Сразу показываем разбор в UI, не дожидаясь refresh
      setReports((prev) =>
        prev.map((report) =>
          report.id === reportId ? { ...report, aiAnalysis: analysis } : report,
        ),
      )
      setAnalysisStatus('ready')
      try {
        await updateReportAnalysis(reportId, analysis)
        await refresh()
      } catch {
        // Разбор уже на экране; ошибка сохранения не должна прятать результат
      }
    } catch (reason) {
      setAnalysisError(
        reason instanceof Error ? reason.message : String(reason),
      )
      setAnalysisStatus('error')
    }
  }

  return (
    <div className="my-results-workspace">
      <section className="report-summary-cards">
        <article>
          <span>
            <Icon name="chart" />
          </span>
          <div>
            <small>Мои сессии</small>
            <strong>{busy ? '…' : reports.length}</strong>
          </div>
        </article>
        <article>
          <span className="green">
            <Icon name="check" />
          </span>
          <div>
            <small>Готовность ≥ 85%</small>
            <strong>{readyCount}</strong>
          </div>
        </article>
        <article>
          <span className="violet">
            <Icon name="target" />
          </span>
          <div>
            <small>Средний результат</small>
            <strong>
              {averageScore || '—'}
              {averageScore ? '%' : ''}
            </strong>
          </div>
        </article>
        <article>
          <span className="amber">
            <Icon name="sparkles" />
          </span>
          <div>
            <small>Разобрано ИИ</small>
            <strong>
              {reports.filter((report) => report.aiAnalysis).length}
            </strong>
          </div>
        </article>
      </section>

      <div className="reports-layout my-results-layout">
        <aside className="reports-list my-results-list">
          <header>
            <div>
              <span>Архив</span>
              <h2>Мои результаты</h2>
            </div>
          </header>
          <label className="reports-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Упражнение или сценарий"
            />
          </label>
          <div className="reports-list-scroll">
            {!visibleReports.length && (
              <div className="reports-empty">
                <Icon name="chart" />
                <p>
                  {reports.length
                    ? 'Ничего не найдено.'
                    : 'Отчёты появятся после завершения первой тренировки.'}
                </p>
              </div>
            )}
            {visibleReports.map((report) => (
              <button
                type="button"
                key={report.id}
                className={report.id === selectedId ? 'active' : ''}
                onClick={() => {
                  setSelectedId(report.id)
                  setTab('overview')
                }}
              >
                <span
                  className={`report-score ${scoreTone(report.scorePercent)}`}
                >
                  {report.scorePercent}%
                </span>
                <span>
                  <strong>{report.exerciseName}</strong>
                  <small>
                    {report.qualified ? 'Зачёт' : 'Незачёт'} ·{' '}
                    {report.sessionMode === 'exam' ? 'экзамен' : 'обучение'}
                  </small>
                  <em>{formatDate(report.completedAt)}</em>
                </span>
                {report.aiAnalysis && <Icon name="sparkles" />}
              </button>
            ))}
          </div>
        </aside>

        <section className="reports-detail">
          {!selected ? (
            <div className="reports-detail-empty">
              <Icon name="chart" />
              <h2>Выберите сессию</h2>
              <p>
                Здесь появятся результат, история действий и локальный
                ИИ-разбор.
              </p>
            </div>
          ) : (
            <>
              <header className="report-detail-head">
                <div>
                  <span>Отчёт · {selected.exerciseId}</span>
                  <h2>{selected.exerciseName}</h2>
                  <p>
                    {selected.userName} · {formatDate(selected.completedAt)}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void onDelete(selected.id)}
                  >
                    <Icon name="close" /> Удалить
                  </button>
                </div>
              </header>

              <nav className="report-tabs" aria-label="Разделы отчёта">
                {(
                  [
                    ['overview', 'Сводка', 'activity'],
                    ['ai', 'ИИ-разбор', 'sparkles'],
                    ['actions', 'Действия', 'target'],
                    ['events', 'События', 'alert'],
                  ] as Array<[ReportTab, string, 'activity' | 'sparkles' | 'target' | 'alert']>
                ).map(([id, label, icon]) => (
                  <button
                    type="button"
                    key={id}
                    className={tab === id ? 'active' : ''}
                    onClick={() => setTab(id)}
                  >
                    <Icon name={icon} />
                    {label}
                    {id === 'ai' && selected.aiAnalysis && <i />}
                  </button>
                ))}
              </nav>

              <div className="report-tab-content">
                {tab === 'overview' && (
                  <>
                    <div className="report-score-hero">
                      <div
                        className={`report-big-score ${scoreTone(selected.scorePercent)}`}
                        style={
                          {
                            '--score': selected.scorePercent,
                          } as React.CSSProperties
                        }
                      >
                        <span>
                          {selected.scorePercent}
                          <small>%</small>
                        </span>
                      </div>
                      <div>
                        <span>Итоговая оценка</span>
                        <h3>
                          {selected.qualificationSummary ||
                            (selected.qualified
                              ? 'Квалификация подтверждена'
                              : 'Требуется повторная отработка')}
                        </h3>
                        <p>
                          Оценка сформирована из выполнения целевой
                          последовательности, штрафов и реакции на отклонение.
                        </p>
                      </div>
                    </div>
                    <dl className="report-metrics">
                      <div>
                        <dt>Штраф</dt>
                        <dd>{selected.penalty}</dd>
                      </div>
                      <div>
                        <dt>Время симуляции</dt>
                        <dd>{Math.round(selected.simTimeSec)} с</dd>
                      </div>
                      <div>
                        <dt>Реакция на отказ</dt>
                        <dd>
                          {selected.responseSeconds == null
                            ? '—'
                            : `${selected.responseSeconds.toFixed(1)} с`}
                        </dd>
                      </div>
                      <div>
                        <dt>Норматив реакции</dt>
                        <dd>
                          {selected.respondedInTime == null
                            ? 'Не применимо'
                            : selected.respondedInTime
                              ? 'Соблюдён'
                              : 'Превышен'}
                        </dd>
                      </div>
                    </dl>
                    <section className="report-preview">
                      <header>
                        <h3>
                          <Icon name="sparkles" /> Интерпретация результата
                        </h3>
                        <button type="button" onClick={() => setTab('ai')}>
                          {selected.aiAnalysis
                            ? 'Открыть полный разбор'
                            : 'Запустить анализ'}{' '}
                          <Icon name="chevron" />
                        </button>
                      </header>
                      {selected.aiAnalysis ? (
                        <>
                          <strong>{selected.aiAnalysis.overallLevel}</strong>
                          <p>{selected.aiAnalysis.summary}</p>
                        </>
                      ) : (
                        <p>
                          Локальный ИИ сопоставит историю действий и состояние
                          процесса, затем предложит точечные тренировки и
                          материалы базы знаний.
                        </p>
                      )}
                    </section>
                  </>
                )}

                {tab === 'ai' &&
                  (analysisStatus === 'idle' ? (
                    <div className="report-ai-start">
                      <Icon name="sparkles" />
                      <h3>Готово к детальному разбору</h3>
                      <p>
                        ИИ проанализирует журнал, параметры и результат. Данные
                        не покинут локальный контур.
                      </p>
                      <button
                        type="button"
                        onClick={() => void analyzeSelected()}
                      >
                        Проанализировать сессию
                      </button>
                    </div>
                  ) : (
                    <AiReviewPanel
                      analysis={selected.aiAnalysis ?? null}
                      status={analysisStatus}
                      error={analysisError}
                      onRetry={() => void analyzeSelected()}
                      onOpenKnowledge={openKnowledge}
                      onOpenTraining={assignMiniTraining}
                    />
                  ))}

                {tab === 'actions' && (
                  <LogTimeline
                    entries={selected.actionsLog}
                    empty="Действия не зафиксированы."
                  />
                )}
                {tab === 'events' && (
                  <LogTimeline
                    entries={selected.systemEvents}
                    empty="Системные события отсутствуют."
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function LogTimeline({
  entries,
  empty,
}: {
  entries: TraineeReport['actionsLog']
  empty: string
}) {
  if (!entries.length) {
    return (
      <div className="reports-empty">
        <Icon name="activity" />
        <p>{empty}</p>
      </div>
    )
  }
  return (
    <ol className="report-timeline">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`}>
          <time>{new Date(entry.at).toLocaleTimeString('ru-RU')}</time>
          <i />
          <div>
            <span>Шаг {String(index + 1).padStart(2, '0')}</span>
            <p>{entry.description}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
