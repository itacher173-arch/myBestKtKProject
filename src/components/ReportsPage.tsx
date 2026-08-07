import { useEffect, useMemo, useState } from 'react'
import {
  appendAudit,
  clearAudit,
  isInstructorAuthed,
  loadAudit,
  setInstructorAuthed,
} from '../sim/auditStorage'
import { useTrainer } from '../sim/TrainerContext'
import {
  clearReports,
  deleteReport,
  downloadSessionProtocol,
  loadReports,
  type TraineeReport,
} from '../sim/reportsStorage'
import './ReportsPage.css'

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('ru-RU')
}

export function ReportsPage() {
  const { resetToStart } = useTrainer()
  const [reports, setReports] = useState<TraineeReport[]>(() => loadReports())
  const [audit, setAudit] = useState(() => loadAudit())
  const [selectedId, setSelectedId] = useState<string | null>(
    reports[0]?.id ?? null,
  )
  const [tab, setTab] = useState<'reports' | 'audit'>('reports')

  useEffect(() => {
    if (!isInstructorAuthed()) {
      resetToStart()
    }
  }, [resetToStart])

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  )

  const refresh = () => {
    const next = loadReports()
    setReports(next)
    setAudit(loadAudit())
    if (selectedId && !next.some((r) => r.id === selectedId)) {
      setSelectedId(next[0]?.id ?? null)
    }
  }

  const onDelete = (id: string) => {
    deleteReport(id)
    appendAudit({
      actor: 'instructor',
      role: 'instructor',
      action: 'delete_report',
      detail: id,
    })
    refresh()
  }

  const onClear = () => {
    if (!reports.length) return
    if (!confirm('Удалить все отчёты обучаемых из localStorage?')) return
    clearReports()
    appendAudit({
      actor: 'instructor',
      role: 'instructor',
      action: 'clear_reports',
    })
    setReports([])
    setSelectedId(null)
    setAudit(loadAudit())
  }

  const onDownloadProtocol = (r: TraineeReport) => {
    downloadSessionProtocol(r)
    appendAudit({
      actor: 'instructor',
      role: 'instructor',
      action: 'download_protocol',
      detail: r.id,
    })
  }

  const onExit = () => {
    setInstructorAuthed(false)
    appendAudit({
      actor: 'instructor',
      role: 'instructor',
      action: 'logout',
    })
    resetToStart()
  }

  return (
    <div className="reports-page">
      <header className="reports-header">
        <div>
          <h1>Кабинет инструктора</h1>
          <p>Отчёты квалификации · протокол JSON · аудит ИБ</p>
        </div>
        <div className="reports-header-actions">
          <button
            type="button"
            className={tab === 'reports' ? 'hdr-btn' : 'hdr-btn ghost'}
            onClick={() => setTab('reports')}
          >
            Отчёты
          </button>
          <button
            type="button"
            className={tab === 'audit' ? 'hdr-btn' : 'hdr-btn ghost'}
            onClick={() => setTab('audit')}
          >
            Аудит
          </button>
          <button type="button" className="hdr-btn ghost" onClick={onClear}>
            Очистить отчёты
          </button>
          <button type="button" className="hdr-btn" onClick={onExit}>
            Выход
          </button>
        </div>
      </header>

      {tab === 'audit' && (
        <section className="reports-detail" style={{ margin: 16 }}>
          <div className="reports-detail-head">
            <h2>Журнал аудита</h2>
            <button
              type="button"
              className="hdr-btn ghost"
              onClick={() => {
                if (!confirm('Очистить журнал аудита?')) return
                clearAudit()
                setAudit([])
              }}
            >
              Очистить аудит
            </button>
          </div>
          <ul className="reports-log">
            {audit.map((e) => (
              <li key={e.id}>
                <time>{formatDate(e.at)}</time>
                [{e.role}] {e.actor}: {e.action}
                {e.detail ? ` — ${e.detail}` : ''}
              </li>
            ))}
            {!audit.length && <li>Пусто</li>}
          </ul>
        </section>
      )}

      {tab === 'reports' && (
        <div className="reports-layout">
          <aside className="reports-list">
            <h2>Список ({reports.length})</h2>
            {!reports.length && (
              <p className="reports-empty">
                Нет сохранённых результатов. Обучаемый завершает упражнение
                кнопкой «Завершить».
              </p>
            )}
            <ul>
              {reports.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={r.id === selectedId ? 'active' : ''}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <strong>{r.userName}</strong>
                    <span>{r.exerciseName}</span>
                    <span className="meta">
                      {r.qualified === false
                        ? 'FAIL'
                        : r.qualified
                          ? 'PASS'
                          : '—'}{' '}
                      · {r.sessionMode === 'exam' ? 'экзамен' : 'обучение'} ·{' '}
                      {r.scorePercent}% · {formatDate(r.completedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="reports-detail">
            {!selected && (
              <p className="reports-empty">Выберите отчёт слева.</p>
            )}
            {selected && (
              <>
                <div className="reports-detail-head">
                  <div>
                    <h2>{selected.userName}</h2>
                    <p>{selected.exerciseName}</p>
                  </div>
                  <div className="reports-detail-actions">
                    <button
                      type="button"
                      className="hdr-btn"
                      onClick={() => onDownloadProtocol(selected)}
                    >
                      Скачать протокол JSON
                    </button>
                    <button
                      type="button"
                      className="hdr-btn ghost"
                      onClick={() => onDelete(selected.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                <dl className="reports-meta">
                  <div>
                    <dt>Квалификация</dt>
                    <dd>
                      {selected.qualified ? 'КВАЛИФИЦИРОВАН' : 'НЕ КВАЛИФИЦИРОВАН'}
                    </dd>
                  </div>
                  <div>
                    <dt>Режим</dt>
                    <dd>
                      {selected.sessionMode === 'exam' ? 'Экзамен' : 'Обучение'}
                    </dd>
                  </div>
                  <div>
                    <dt>Дата</dt>
                    <dd>{formatDate(selected.completedAt)}</dd>
                  </div>
                  <div>
                    <dt>Выполнение / исход</dt>
                    <dd>{selected.scorePercent}%</dd>
                  </div>
                  <div>
                    <dt>Штрафы</dt>
                    <dd>
                      {selected.penalty}
                      {selected.penaltyDetail
                        ? ` (u${selected.penaltyDetail.unsafe}/l${selected.penaltyDetail.late}/e${selected.penaltyDetail.extra}/m${selected.penaltyDetail.missed})`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Версии</dt>
                    <dd>
                      {[
                        selected.protocolVersion,
                        selected.modelVersion,
                        selected.scenarioVersion,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Время симуляции</dt>
                    <dd>{selected.simTimeSec} с</dd>
                  </div>
                  <div>
                    <dt>Реакция на отказ</dt>
                    <dd>
                      {selected.responseSeconds == null
                        ? '—'
                        : `${selected.responseSeconds.toFixed(1)} с${
                            selected.respondedInTime === false
                              ? ' (сверх нормы)'
                              : selected.respondedInTime
                                ? ' (в норме)'
                                : ''
                          }`}
                    </dd>
                  </div>
                </dl>

                {selected.qualificationSummary && (
                  <p className="hint">{selected.qualificationSummary}</p>
                )}

                <h3>Журнал действий</h3>
                <ul className="reports-log">
                  {selected.actionsLog.map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      <time>{new Date(e.at).toLocaleTimeString('ru-RU')}</time>
                      {e.description}
                    </li>
                  ))}
                  {!selected.actionsLog.length && <li>Пусто</li>}
                </ul>

                <h3>Системные события</h3>
                <ul className="reports-log">
                  {selected.systemEvents.map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      <time>{new Date(e.at).toLocaleTimeString('ru-RU')}</time>
                      {e.description}
                    </li>
                  ))}
                  {!selected.systemEvents.length && <li>Пусто</li>}
                </ul>

                {selected.analogSample && selected.analogSample.length > 0 && (
                  <>
                    <h3>Тренды (выборка)</h3>
                    <p className="hint">
                      {selected.analogSample.length} точек в протоколе JSON
                    </p>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
