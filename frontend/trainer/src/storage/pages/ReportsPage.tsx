import { useEffect, useMemo, useState } from 'react'
import { apiPost } from '../../api/client'
import { AiReviewPanel } from '../../ai/AiReviewPanel'
import type { AiAnalysis } from '../../ai/types'
import { ApiError } from '../../api/client'
import {
  getAuthedUser,
  hasRole,
  logoutUser,
  redirectToAuthPortal,
  setActiveWorkRole,
} from '../../auth/authApi'
import {
  presenceBus,
  usePresenceMap,
  type PresenceUser,
} from '../../presence/presence'
import {
  appendAudit,
  isInstructorAuthed,
  setInstructorAuthed,
} from '../auditStorage'
import {
  addGroupMember,
  createGroup,
  listGroupMembers,
  listGroups,
  listTrainees,
  loadGroupReports,
  removeGroupMember,
  renameGroup,
  type GroupUser,
  type TrainingGroup,
} from '../groupsApi'
import { useConfirm } from '../../common/ui/ConfirmDialog'
import { useTrainer } from '../../simulator/TrainerContext'
import {
  clearReports,
  deleteReport,
  downloadSessionProtocol,
  printSessionProtocol,
  updateReportAnalysis,
  type TraineeReport,
} from '../reportsStorage'
import { usePreferences } from '../../settings/PreferencesContext'
import './ReportsPage.css'

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('ru-RU')
}

export function ReportsPage() {
  const confirm = useConfirm()
  const { resetToStart, openKnowledge, assignMiniTraining } = useTrainer()
  const { aiEnabled } = usePreferences()
  const instructor = getAuthedUser()
  const [groups, setGroups] = useState<TrainingGroup[]>([])
  const [trainees, setTrainees] = useState<GroupUser[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupUser[]>([])
  const [groupReports, setGroupReports] = useState<TraineeReport[]>([])
  const [groupReportId, setGroupReportId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [groupError, setGroupError] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [renamingGroup, setRenamingGroup] = useState(false)
  const [renameGroupName, setRenameGroupName] = useState('')
  const presence = usePresenceMap()
  const [groupPanel, setGroupPanel] = useState<'members' | 'reports'>('members')
  const [analysisStatus, setAnalysisStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'disabled'
  >('idle')
  const [analysisError, setAnalysisError] = useState('')
  const [analysisDraft, setAnalysisDraft] = useState<AiAnalysis | null>(null)

  const refreshGroups = async () => {
    if (!instructor || !hasRole(instructor, 'instructor')) return
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
    void refreshGroups().catch(() => undefined)
  }, [])

  useEffect(() => {
    setRenamingGroup(false)
    setRenameGroupName(
      groups.find((g) => g.id === activeGroupId)?.name ?? '',
    )
    void refreshGroupDetail(activeGroupId).catch((err) => {
      setGroupError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Ошибка загрузки группы',
      )
    })
    // groups намеренно не в deps: иначе каждый refreshGroups сбросит форму
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId])

  const selectedGroupReport = useMemo(
    () => groupReports.find((r) => r.id === groupReportId) ?? null,
    [groupReports, groupReportId],
  )

  useEffect(() => {
    setAnalysisDraft(selectedGroupReport?.aiAnalysis ?? null)
    setAnalysisStatus(
      !aiEnabled
        ? 'disabled'
        : selectedGroupReport?.aiAnalysis
          ? 'ready'
          : 'idle',
    )
    setAnalysisError('')
  }, [aiEnabled, selectedGroupReport?.id, selectedGroupReport?.aiAnalysis])

  const analyzeReport = async (report: TraineeReport) => {
    if (!aiEnabled) {
      setAnalysisStatus('disabled')
      return
    }
    setAnalysisStatus('loading')
    setAnalysisError('')
    try {
      const analysis = await apiPost<AiAnalysis>('/ai/analyze', {
        sessionId: report.id,
        userName: report.userName,
        exerciseId: report.exerciseId,
        exerciseName: report.exerciseName,
        scorePercent: report.scorePercent,
        penalty: report.penalty,
        responseSeconds: report.responseSeconds,
        respondedInTime: report.respondedInTime,
        process: {},
        actionsLog: report.actionsLog,
        systemEvents: report.systemEvents,
      })
      await updateReportAnalysis(report.id, analysis)
      setAnalysisDraft(analysis)
      setAnalysisStatus('ready')
      if (activeGroupId) await refreshGroupDetail(activeGroupId)
    } catch (err) {
      setAnalysisError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Не удалось выполнить анализ',
      )
      setAnalysisStatus('error')
    }
  }
  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId],
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
    if (activeGroupId) await refreshGroupDetail(activeGroupId)
  }

  const onClear = async () => {
    if (!groupReports.length) return
    const ok = await confirm({
      title: 'Очистка отчётов',
      message: 'Удалить все отчёты обучаемых на сервере?',
      danger: true,
      confirmLabel: 'Удалить',
    })
    if (!ok) return
    await clearReports()
    await appendAudit({
      actor: instructor?.fullName || 'instructor',
      role: 'instructor',
      action: 'clear_reports',
    })
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

  const onGoTraining = () => {
    if (!instructor || !hasRole(instructor, 'trainee')) return
    setActiveWorkRole('trainee')
    resetToStart()
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

  const onRenameGroup = async () => {
    if (!activeGroup || !instructor) return
    const name = renameGroupName.trim()
    if (!name) {
      setGroupError('Название группы не может быть пустым')
      return
    }
    if (name === activeGroup.name) {
      setRenamingGroup(false)
      return
    }
    setGroupBusy(true)
    setGroupError('')
    try {
      await renameGroup(activeGroup.id, name)
      await refreshGroups()
      setRenamingGroup(false)
      void appendAudit({
        actor: instructor.fullName,
        role: 'instructor',
        action: 'rename_group',
        detail: `${activeGroup.name} → ${name}`,
      })
    } catch (err) {
      setGroupError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Не удалось переименовать',
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
              <dt>LCS / эталон</dt>
              <dd>
                {selectedReport.lcsTotal != null
                  ? `${selectedReport.lcsMatched ?? 0}/${selectedReport.lcsTotal}`
                  : '—'}
              </dd>
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

          {selectedReport.recommendExerciseId && (
            <p className="hint">
              Адаптивная рекомендация: {selectedReport.recommendExerciseId}
              {selectedReport.recommendReason
                ? ` — ${selectedReport.recommendReason}`
                : ''}
            </p>
          )}

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

          {aiEnabled && (
            <div className="reports-ai-block">
              <h3>ИИ-разбор</h3>
              {analysisStatus === 'idle' ? (
                <div className="report-ai-start">
                  <p>
                    Локальный ИИ сопоставит журнал действий с учебной моделью и
                    предложит точечные тренировки.
                  </p>
                  <button
                    type="button"
                    className="hdr-btn"
                    onClick={() => void analyzeReport(selectedReport)}
                  >
                    Проанализировать сессию
                  </button>
                </div>
              ) : (
                <AiReviewPanel
                  compact
                  analysis={analysisDraft ?? selectedReport.aiAnalysis ?? null}
                  status={analysisStatus}
                  error={analysisError}
                  onRetry={() => void analyzeReport(selectedReport)}
                  onOpenKnowledge={openKnowledge}
                  onOpenTraining={assignMiniTraining}
                />
              )}
            </div>
          )}
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
              ? `${instructor.fullName} · группы и отчёты`
              : 'Группы и отчёты'}
          </p>
        </div>
        <div className="reports-header-actions">
          <button
            type="button"
            className={groupPanel === 'members' ? 'hdr-btn' : 'hdr-btn ghost'}
            onClick={() => setGroupPanel('members')}
          >
            Управление группой
          </button>
          <button
            type="button"
            className={groupPanel === 'reports' ? 'hdr-btn' : 'hdr-btn ghost'}
            onClick={() => setGroupPanel('reports')}
          >
            Отчёты по группе
          </button>
          {instructor && hasRole(instructor, 'trainee') && (
            <button
              type="button"
              className="hdr-btn ghost"
              onClick={onGoTraining}
            >
              К обучению
            </button>
          )}
          <button type="button" className="hdr-btn" onClick={onExit}>
            Выход
          </button>
        </div>
      </header>

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

          {activeGroupId && activeGroup && (
            <>
              <div className="reports-detail-head">
                <h2>{activeGroup.name}</h2>
                <div className="reports-detail-actions">
                  {renamingGroup ? (
                    <>
                      <input
                        type="text"
                        value={renameGroupName}
                        autoFocus
                        disabled={groupBusy}
                        aria-label="Новое название группы"
                        maxLength={80}
                        onChange={(e) => setRenameGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void onRenameGroup()
                          if (e.key === 'Escape') {
                            setRenameGroupName(activeGroup.name)
                            setRenamingGroup(false)
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="hdr-btn"
                        disabled={groupBusy || !renameGroupName.trim()}
                        onClick={() => void onRenameGroup()}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className="hdr-btn ghost"
                        disabled={groupBusy}
                        onClick={() => {
                          setRenameGroupName(activeGroup.name)
                          setRenamingGroup(false)
                        }}
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="hdr-btn ghost"
                      disabled={groupBusy}
                      onClick={() => {
                        setRenameGroupName(activeGroup.name)
                        setRenamingGroup(true)
                        setGroupError('')
                      }}
                    >
                      Переименовать
                    </button>
                  )}
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
                    <div className="reports-list-head">
                      <h2>Отчёты группы ({groupReports.length})</h2>
                      <button
                        type="button"
                        className="hdr-btn ghost"
                        disabled={!groupReports.length}
                        onClick={() => void onClear()}
                      >
                        Очистить отчёты
                      </button>
                    </div>
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
    </div>
  )
}
