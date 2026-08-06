import { useMemo, useState } from 'react'
import { useTrainer } from '../sim/TrainerContext'
import {
  clearReports,
  deleteReport,
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
  const [selectedId, setSelectedId] = useState<string | null>(
    reports[0]?.id ?? null,
  )

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  )

  const refresh = () => {
    const next = loadReports()
    setReports(next)
    if (selectedId && !next.some((r) => r.id === selectedId)) {
      setSelectedId(next[0]?.id ?? null)
    }
  }

  const onDelete = (id: string) => {
    deleteReport(id)
    refresh()
  }

  const onClear = () => {
    if (!reports.length) return
    if (!confirm('Удалить все отчёты обучаемых из localStorage?')) return
    clearReports()
    setReports([])
    setSelectedId(null)
  }

  return (
    <div className="reports-page">
      <header className="reports-header">
        <div>
          <h1>Отчёты обучаемых</h1>
          <p>Данные хранятся локально в браузере (localStorage)</p>
        </div>
        <div className="reports-header-actions">
          <button type="button" className="hdr-btn ghost" onClick={onClear}>
            Очистить всё
          </button>
          <button type="button" className="hdr-btn" onClick={resetToStart}>
            На старт
          </button>
        </div>
      </header>

      <div className="reports-layout">
        <aside className="reports-list">
          <h2>Список ({reports.length})</h2>
          {!reports.length && (
            <p className="reports-empty">
              Пока нет сохранённых результатов. Пусть обучаемый пройдёт
              упражнение до конца («Завершить упражнение»).
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
                <button
                  type="button"
                  className="hdr-btn ghost"
                  onClick={() => onDelete(selected.id)}
                >
                  Удалить
                </button>
              </div>

              <dl className="reports-meta">
                <div>
                  <dt>Дата</dt>
                  <dd>{formatDate(selected.completedAt)}</dd>
                </div>
                <div>
                  <dt>Выполнение эталона</dt>
                  <dd>{selected.scorePercent}%</dd>
                </div>
                <div>
                  <dt>Лишние действия</dt>
                  <dd>{selected.penalty}</dd>
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
            </>
          )}
        </section>
      </div>
    </div>
  )
}
