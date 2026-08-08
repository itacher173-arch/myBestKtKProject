import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import { getAuthedUser, logoutUser, redirectToAuthPortal } from '../sim/authApi'
import {
  presenceBus,
  usePresenceMap,
  type PresenceUser,
} from '../sim/presence'
import {
  appendAudit,
  clearAudit,
  isInstructorAuthed,
  loadAudit,
  setInstructorAuthed,
} from '../sim/auditStorage'
import {
  addGroupMember,
  createGroup,
  listGroupMembers,
  listGroups,
  listTrainees,
  loadGroupReports,
  removeGroupMember,
  type GroupUser,
  type TrainingGroup,
} from '../sim/groupsApi'
import { useTrainer } from '../sim/TrainerContext'
import {
  clearReports,
  deleteReport,
  downloadSessionProtocol,
  printSessionProtocol,
  loadReports,
  type TraineeReport,
} from '../sim/reportsStorage'
import './ReportsPage.css'

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('ru-RU')
}

type Tab = 'reports' | 'groups' | 'audit'

export function ReportsPage() {
  const { resetToStart } = useTrainer()
  const instructor = getAuthedUser()
  const [reports, setReports] = useState<TraineeReport[]>([])
  const [audit, setAudit] = useState<
    Awaited<ReturnType<typeof loadAudit>>
  >([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('reports')

  const [groups, setGroups] = useState<TrainingGroup[]>([])
  const [trainees, setTrainees] = useState<GroupUser[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupUser[]>([])
  const [groupReports, setGroupReports] = useState<TraineeReport[]>([])
  const [groupReportId, setGroupReportId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [groupError, setGroupError] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const presence = usePresenceMap()
  const [groupPanel, setGroupPanel] = useState<'members' | 'reports'>('members')


  const refresh = async () => {
    const next = await loadReports()
    const nextAudit = await loadAudit()
    setReports(next)
    setAudit(nextAudit)
    setSelectedId((prev) => {
      if (prev && next.some((r) => r.id === prev)) return prev
      return next[0]?.id ?? null
    })
  }

  const refreshGroups = async () => {
    if (!instructor || instructor.role !== 'instructor') return
    const [nextGroups, nextTrainees] = await Promise.all([
      listGroups(instructor.id),
      listTrainees(),
    ])
    setGroups(nextGroups)
    setTrainees(nextTrainees)
    setActiveGroupId((prev) => {
      if (prev && nextGroups.some((g) => g.id === prev)) return prev
      return nextGroups[0]?.id ?? null
    })
  }

  const refreshGroupDetail = async (groupId: string | null) => {
    if (!groupId) {
      setMembers([])
      setGroupReports([])
      setGroupReportId(null)
      return
    }
    const [nextMembers, nextReports] = await Promise.all([
      listGroupMembers(groupId),
      loadGroupReports<TraineeReport>(groupId),
    ])
    setMembers(nextMembers)
    setGroupReports(nextReports)
    setGroupReportId((prev) => {
      if (prev && nextReports.some((r) => r.id === prev)) return prev
      return nextReports[0]?.id ?? null
    })
  }

  useEffect(() => {
    if (!isInstructorAuthed()) {
      resetToStart()
    }
  }, [resetToStart])

  useEffect(() => {
    void refresh()
    void refreshGroups().catch(() => undefined)
  }, [])

  useEffect(() => {
    void refreshGroupDetail(activeGroupId).catch((err) => {
      setGroupError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Ошибка загрузки группы',
      )
    })
  }, [activeGroupId])

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  )
  const selectedGroupReport = useMemo(
    () => groupReports.find((r) => r.id === groupReportId) ?? null,
    [groupReports, groupReportId],
  )
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])
  const availableTrainees = useMemo(
    () => trainees.filter((t) => !memberIds.has(t.id)),
    [trainees, memberIds],
  )

  const onDelete = async (id: string) => {
    await deleteReport(id)
    await appendAudit({
      actor: instructor?.fullName || 'instructor',
      role: 'instructor',
      action: 'delete_report',
      detail: id,
    })
    await refresh()
    if (activeGroupId) await refreshGroupDetail(activeGroupId)
  }

  const onClear = async () => {
    if (!reports.length) return
    if (!confirm('Удалить все отчёты обучаемых на сервере?')) return
    await clearReports()
    await appendAudit({
      actor: instructor?.fullName || 'instructor',
      role: 'instructor',
      action: 'clear_reports',
    })
    setReports([])
    setSelectedId(null)
    setAudit(await loadAudit())
    if (activeGroupId) await refreshGroupDetail(activeGroupId)
  }

  const onDownloadProtocol = (r: TraineeReport) => {
    void downloadSessionProtocol(r)
    void appendAudit({
      actor: instructor?.fullName || 'instructor',
      role: 'instructor',
      action: 'download_protocol',
      detail: r.id,
    })
  }

  const onPrintProtocol = (r: TraineeReport) => {
    printSessionProtocol(r)
    void appendAudit({
      actor: instructor?.fullName || 'instructor',
      role: 'instructor',
      action: 'print_protocol',
      detail: r.id,
    })
  }

  const onExit = () => {
    presenceBus.disconnect()
    void appendAudit({
      actor: instructor?.fullName || 'instructor',
      role: 'instructor',
      action: 'logout',
    })
    void (async () => {
      await logoutUser()
      setInstructorAuthed(false)
      redirectToAuthPortal()
    })()
  }

  const memberPresence = (userId: string): PresenceUser | undefined =>
    presence.get(userId)

  const presenceTitle = (p?: PresenceUser) => {
    if (!p || !p.online) return 'Не в сети'
    if (p.activity === 'exam') {
      return `Экзамен: ${p.catalogTitle || p.catalogId || 'сценарий'}`
    }
    if (p.activity === 'training') {
      return `Обучение: ${p.catalogTitle || p.catalogId || 'сценарий'}`
    }
    return 'В сети'
  }

  const onCreateGroup = async () => {
    if (!instructor) return
    setGroupError('')
    setGroupBusy(true)
    try {
      const group = await createGroup({
        name: newGroupName,
        instructorId: instructor.id,
      })
      setNewGroupName('')
      await refreshGroups()
      setActiveGroupId(group.id)
      void appendAudit({
        actor: instructor.fullName,
        role: 'instructor',
        action: 'create_group',
        detail: group.name,
      })
    } catch (err) {
      setGroupError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Не удалось создать группу',
      )
    } finally {
      setGroupBusy(false)
    }
  }

  const onAddMember = async (userId: string) => {
    if (!activeGroupId || !instructor) return
    setGroupError('')
    setGroupBusy(true)
    try {
      await addGroupMember(activeGroupId, userId)
      await Promise.all([refreshGroups(), refreshGroupDetail(activeGroupId)])
      void appendAudit({
        actor: instructor.fullName,
        role: 'instructor',
        action: 'group_add_member',
        detail: `${activeGroupId}:${userId}`,
      })
    } catch (err) {
      setGroupError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Не удалось добавить',
      )
    } finally {
      setGroupBusy(false)
    }
  }

  const onRemoveMember = async (userId: string) => {
    if (!activeGroupId || !instructor) return
    setGroupBusy(true)
    try {
      await removeGroupMember(activeGroupId, userId)
      await Promise.all([refreshGroups(), refreshGroupDetail(activeGroupId)])
    } catch (err) {
      setGroupError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Не удалось удалить',
      )
    } finally {
      setGroupBusy(false)
    }
  }

  const renderReportDetail = (
    selectedReport: TraineeReport | null,
    onRemove: (id: string) => void,
  ) => (
    <section className="reports-detail">
      {!selectedReport && (
        <p className="reports-empty">Выберите отчёт слева.</p>
      )}
      {selectedReport && (
        <>
          <div className="reports-detail-head">
            <div>
              <h2>{selectedReport.userName}</h2>
              <p>{selectedReport.exerciseName}</p>
            </div>
            <div className="reports-detail-actions">
              <button
                type="button"
                className="hdr-btn"
                onClick={() => onDownloadProtocol(selectedReport)}
              >
                Скачать протокол JSON
              </button>
              <button
                type="button"
                className="hdr-btn ghost"
                onClick={() => onPrintProtocol(selectedReport)}
              >
                Печать
              </button>
              <button
                type="button"
                className="hdr-btn ghost"
                onClick={() => onRemove(selectedReport.id)}
              >
                Удалить
              </button>
            </div>
          </div>

          <dl className="reports-meta">
            <div>
              <dt>Квалификация</dt>
              <dd>
                {selectedReport.qualified
                  ? 'КВАЛИФИЦИРОВАН'
                  : 'НЕ КВАЛИФИЦИРОВАН'}
              </dd>
            </div>
            <div>
              <dt>Режим</dt>
              <dd>
                {selectedReport.sessionMode === 'exam' ? 'Экзамен' : 'Обучение'}
              </dd>
            </div>
            <div>
              <dt>Дата</dt>
              <dd>{formatDate(selectedReport.completedAt)}</dd>
            </div>
            <div>
              <dt>Выполнение / исход</dt>
              <dd>{selectedReport.scorePercent}%</dd>
            </div>
            <div>
              <dt>Штрафы</dt>
              <dd>{selectedReport.penalty}</dd>
            </div>
            <div>
              <dt>Время симуляции</dt>
              <dd>{selectedReport.simTimeSec} с</dd>
            </div>
          </dl>

          {selectedReport.qualificationSummary && (
            <p className="hint">{selectedReport.qualificationSummary}</p>
          )}

          <h3>Журнал действий</h3>
          <ul className="reports-log">
            {selectedReport.actionsLog.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <time>{new Date(e.at).toLocaleTimeString('ru-RU')}</time>
                {e.description}
              </li>
            ))}
            {!selectedReport.actionsLog.length && <li>Пусто</li>}
          </ul>
        </>
      )}
    </section>
  )

  return (
    <div className="reports-page">
      <header className="reports-header">
        <div>
          <h1>Кабинет инструктора</h1>
          <p>
            {instructor?.fullName
              ? `${instructor.fullName} · отчёты · группы · аудит`
              : 'Отчёты · группы · аудит'}
          </p>
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
            className={tab === 'groups' ? 'hdr-btn' : 'hdr-btn ghost'}
            onClick={() => setTab('groups')}
          >
            Мои группы
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
                void clearAudit().then(() => setAudit([]))
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
          {renderReportDetail(selected, (id) => {
            void onDelete(id)
          })}
        </div>
      )}

      {tab === 'groups' && (
        <div className="reports-layout groups-layout">
          <aside className="reports-list">
            <h2>Мои группы ({groups.length})</h2>
            <div className="group-create">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Название группы"
                maxLength={80}
              />
              <button
                type="button"
                className="hdr-btn"
                disabled={groupBusy || !newGroupName.trim()}
                onClick={() => void onCreateGroup()}
              >
                Создать
              </button>
            </div>
            {!groups.length && (
              <p className="reports-empty">Создайте первую группу.</p>
            )}
            <ul>
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={g.id === activeGroupId ? 'active' : ''}
                    onClick={() => setActiveGroupId(g.id)}
                  >
                    <strong>{g.name}</strong>
                    <span className="meta">{g.memberCount} уч.</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="reports-detail">
            {groupError && <p className="group-error">{groupError}</p>}
            {!activeGroupId && (
              <p className="reports-empty">Выберите или создайте группу.</p>
            )}

            {activeGroupId && (
              <>
                <div className="reports-detail-head">
                  <h2>
                    {groups.find((g) => g.id === activeGroupId)?.name ?? 'Группа'}
                  </h2>
                  <div className="reports-detail-actions">
                    <button
                      type="button"
                      className={
                        groupPanel === 'members' ? 'hdr-btn' : 'hdr-btn ghost'
                      }
                      onClick={() => setGroupPanel('members')}
                    >
                      Участники
                    </button>
                    <button
                      type="button"
                      className={
                        groupPanel === 'reports' ? 'hdr-btn' : 'hdr-btn ghost'
                      }
                      onClick={() => setGroupPanel('reports')}
                    >
                      Отчёты группы
                    </button>
                  </div>
                </div>

                {groupPanel === 'members' && (
                  <div className="group-columns">
                    <div>
                      <h3>В группе ({members.length})</h3>
                      <ul className="group-people">
                        {members.map((m) => {
                          const p = memberPresence(m.id)
                          const online = Boolean(p?.online)
                          const activity = p?.activity ?? 'offline'
                          const tip = presenceTitle(p)
                          return (
                            <li key={m.id}>
                              <div className="member-main">
                                <span className="member-name">{m.fullName}</span>
                                <div className="member-markers">
                                  <span
                                    className={`presence-dot ${online ? 'on' : 'off'}`}
                                    title={online ? 'В сети' : 'Не в сети'}
                                  />
                                  <span
                                    className={`presence-chip ${
                                      activity === 'exam'
                                        ? 'exam'
                                        : activity === 'training'
                                          ? 'train'
                                          : online
                                            ? 'online'
                                            : 'off'
                                    }`}
                                    title={tip}
                                  >
                                    {!online
                                      ? 'офлайн'
                                      : activity === 'exam'
                                        ? 'экзамен'
                                        : activity === 'training'
                                          ? 'обучение'
                                          : 'в сети'}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="hdr-btn ghost"
                                disabled={groupBusy}
                                onClick={() => void onRemoveMember(m.id)}
                              >
                                Убрать
                              </button>
                            </li>
                          )
                        })}
                        {!members.length && <li>Пока никого нет</li>}
                      </ul>
                    </div>
                    <div>
                      <h3>Добавить обучаемого</h3>
                      <ul className="group-people">
                        {availableTrainees.map((t) => (
                          <li key={t.id}>
                            <span>{t.fullName}</span>
                            <button
                              type="button"
                              className="hdr-btn"
                              disabled={groupBusy}
                              onClick={() => void onAddMember(t.id)}
                            >
                              В группу
                            </button>
                          </li>
                        ))}
                        {!availableTrainees.length && (
                          <li>Нет свободных обучаемых</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                {groupPanel === 'reports' && (
                  <div className="group-reports-split">
                    <aside className="reports-list nested">
                      <h2>Отчёты группы ({groupReports.length})</h2>
                      {!groupReports.length && (
                        <p className="reports-empty">
                          Нет отчётов у участников этой группы.
                        </p>
                      )}
                      <ul>
                        {groupReports.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              className={r.id === groupReportId ? 'active' : ''}
                              onClick={() => setGroupReportId(r.id)}
                            >
                              <strong>{r.userName}</strong>
                              <span>{r.exerciseName}</span>
                              <span className="meta">
                                {r.qualified ? 'PASS' : 'FAIL'} · {r.scorePercent}% ·{' '}
                                {formatDate(r.completedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </aside>
                    {renderReportDetail(selectedGroupReport, (id) => {
                      void onDelete(id)
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
