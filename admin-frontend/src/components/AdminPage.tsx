import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import {
  assignGroupInstructor,
  createAdminUser,
  deleteAdminGroup,
  deleteAdminUser,
  listAllGroups,
  listAllUsers,
  renameAdminGroup,
  updateAdminUser,
  type AdminGroup,
  type AdminUser,
} from '../sim/adminApi'
import {
  getAuthedUser,
  roleLabel,
  type UserRole,
  validateFullName,
  validatePassword,
} from '../sim/authApi'
import { appendAudit } from '../sim/auditStorage'
import {
  addGroupMember,
  createGroup,
  listGroupMembers,
  listTrainees,
  removeGroupMember,
  type GroupUser,
} from '../sim/groupsApi'
import './AdminPage.css'

type Tab = 'users' | 'groups'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'trainee', label: 'Обучаемый' },
  { value: 'instructor', label: 'Инструктор' },
  { value: 'admin', label: 'Администратор' },
]

export function AdminPage({ onLogout }: { onLogout: () => void }) {
  const admin = getAuthedUser()
  const [tab, setTab] = useState<Tab>('users')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [users, setUsers] = useState<AdminUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [formName, setFormName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('trainee')

  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [trainees, setTrainees] = useState<GroupUser[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupUser[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupInstructorId, setNewGroupInstructorId] = useState('')
  const [addTraineeId, setAddTraineeId] = useState('')

  const instructors = useMemo(
    () => users.filter((u) => u.role === 'instructor'),
    [users],
  )
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId],
  )
  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId],
  )

  const refreshUsers = useCallback(async () => {
    const list = await listAllUsers()
    setUsers(list)
  }, [])

  const refreshGroups = useCallback(async () => {
    const [g, t] = await Promise.all([listAllGroups(), listTrainees()])
    setGroups(g)
    setTrainees(t)
  }, [])

  const refreshMembers = useCallback(async (groupId: string) => {
    const list = await listGroupMembers(groupId)
    setMembers(list)
  }, [])

  useEffect(() => {
    if (!admin || admin.role !== 'admin') return
    void (async () => {
      setError('')
      try {
        await refreshUsers()
      } catch (err) {
        setError(
          err instanceof Error
            ? `Пользователи: ${err.message}`
            : 'Ошибка загрузки пользователей',
        )
      }
      try {
        await refreshGroups()
      } catch (err) {
        setError(
          err instanceof Error
            ? `Группы: ${err.message}`
            : 'Ошибка загрузки групп',
        )
      }
    })()
  }, [admin, refreshUsers, refreshGroups])

  useEffect(() => {
    if (!activeGroupId) {
      setMembers([])
      return
    }
    void refreshMembers(activeGroupId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Ошибка участников')
    })
  }, [activeGroupId, refreshMembers])

  useEffect(() => {
    if (instructors.length && !newGroupInstructorId) {
      setNewGroupInstructorId(instructors[0].id)
    }
  }, [instructors, newGroupInstructorId])

  const resetUserForm = () => {
    setEditMode(false)
    setSelectedUserId(null)
    setFormName('')
    setFormPassword('')
    setFormRole('trainee')
  }

  const startCreateUser = () => {
    setError('')
    setEditMode(false)
    setSelectedUserId(null)
    setFormName('')
    setFormPassword('')
    setFormRole('trainee')
  }

  const startEditUser = (user: AdminUser) => {
    setError('')
    setEditMode(true)
    setSelectedUserId(user.id)
    setFormName(user.fullName)
    setFormPassword('')
    setFormRole(user.role)
  }

  const saveUser = async () => {
    setError('')
    const nameErr = validateFullName(formName)
    if (nameErr) {
      setError(nameErr)
      return
    }
    if (!editMode) {
      const passErr = validatePassword(formPassword)
      if (passErr) {
        setError(passErr)
        return
      }
    } else if (formPassword && validatePassword(formPassword)) {
      setError(validatePassword(formPassword)!)
      return
    }
    setBusy(true)
    try {
      if (editMode && selectedUserId) {
        const payload: {
          fullName: string
          role: UserRole
          password?: string
        } = {
          fullName: formName.trim(),
          role: formRole,
        }
        if (formPassword.trim()) payload.password = formPassword
        const user = await updateAdminUser(selectedUserId, payload)
        void appendAudit({
          actor: admin?.fullName || 'admin',
          role: 'admin',
          action: 'admin_update_user',
          detail: `${user.fullName}:${user.role}`,
        })
      } else {
        const user = await createAdminUser({
          fullName: formName,
          password: formPassword,
          role: formRole,
        })
        void appendAudit({
          actor: admin?.fullName || 'admin',
          role: 'admin',
          action: 'admin_create_user',
          detail: `${user.fullName}:${user.role}`,
        })
      }
      await refreshUsers()
      resetUserForm()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Ошибка сохранения',
      )
    } finally {
      setBusy(false)
    }
  }

  const removeUser = async (user: AdminUser) => {
    if (!window.confirm(`Удалить пользователя «${user.fullName}»?`)) return
    setBusy(true)
    setError('')
    try {
      await deleteAdminUser(user.id)
      void appendAudit({
        actor: admin?.fullName || 'admin',
        role: 'admin',
        action: 'admin_delete_user',
        detail: user.fullName,
      })
      if (selectedUserId === user.id) resetUserForm()
      await refreshUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления')
    } finally {
      setBusy(false)
    }
  }

  const onCreateGroup = async () => {
    setError('')
    if (!newGroupName.trim() || !newGroupInstructorId) {
      setError('Укажите название и инструктора')
      return
    }
    setBusy(true)
    try {
      const group = await createGroup({
        name: newGroupName,
        instructorId: newGroupInstructorId,
      })
      void appendAudit({
        actor: admin?.fullName || 'admin',
        role: 'admin',
        action: 'admin_create_group',
        detail: group.name,
      })
      setNewGroupName('')
      await refreshGroups()
      setActiveGroupId(group.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания группы')
    } finally {
      setBusy(false)
    }
  }

  const onAssignInstructor = async (instructorId: string) => {
    if (!activeGroupId) return
    setBusy(true)
    setError('')
    try {
      await assignGroupInstructor(activeGroupId, instructorId)
      void appendAudit({
        actor: admin?.fullName || 'admin',
        role: 'admin',
        action: 'admin_assign_instructor',
        detail: `${activeGroupId}:${instructorId}`,
      })
      await refreshGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка назначения')
    } finally {
      setBusy(false)
    }
  }

  const onAddMember = async () => {
    if (!activeGroupId || !addTraineeId) return
    setBusy(true)
    setError('')
    try {
      await addGroupMember(activeGroupId, addTraineeId)
      setAddTraineeId('')
      await Promise.all([refreshMembers(activeGroupId), refreshGroups()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка добавления')
    } finally {
      setBusy(false)
    }
  }

  const onRemoveMember = async (userId: string) => {
    if (!activeGroupId) return
    setBusy(true)
    try {
      await removeGroupMember(activeGroupId, userId)
      await Promise.all([refreshMembers(activeGroupId), refreshGroups()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления')
    } finally {
      setBusy(false)
    }
  }

  const onDeleteGroup = async () => {
    if (!activeGroup) return
    if (!window.confirm(`Удалить группу «${activeGroup.name}»?`)) return
    setBusy(true)
    try {
      await deleteAdminGroup(activeGroup.id)
      setActiveGroupId(null)
      await refreshGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления группы')
    } finally {
      setBusy(false)
    }
  }

  const onRenameGroup = async () => {
    if (!activeGroup) return
    const name = window.prompt('Новое название группы', activeGroup.name)
    if (!name || name.trim() === activeGroup.name) return
    setBusy(true)
    try {
      await renameAdminGroup(activeGroup.id, name)
      await refreshGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка переименования')
    } finally {
      setBusy(false)
    }
  }

  const memberIds = new Set(members.map((m) => m.id))
  const availableTrainees = trainees.filter((t) => !memberIds.has(t.id))

  if (!admin || admin.role !== 'admin') {
    return (
      <div className="admin-page">
        <header className="admin-header">
          <div>
            <h1>Админ-панель</h1>
            <p>Доступ только для администратора</p>
          </div>
          <button type="button" className="hdr-btn ghost" onClick={onLogout}>
            Выйти
          </button>
        </header>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Админ-панель</h1>
          <p>
            {admin.fullName} · пользователи и группы
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className={tab === 'users' ? 'hdr-btn' : 'hdr-btn ghost'}
            onClick={() => setTab('users')}
          >
            Пользователи
          </button>
          <button
            type="button"
            className={tab === 'groups' ? 'hdr-btn' : 'hdr-btn ghost'}
            onClick={() => setTab('groups')}
          >
            Группы
          </button>
          <button type="button" className="hdr-btn ghost" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      {error && <p className="admin-error">{error}</p>}

      {tab === 'users' && (
        <div className="admin-layout">
          <aside className="admin-list">
            <div className="admin-list-head">
              <h2>Пользователи ({users.length})</h2>
              <button type="button" className="hdr-btn" onClick={startCreateUser}>
                Добавить
              </button>
            </div>
            <ul>
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={
                      selectedUserId === u.id ||
                      (!editMode && !selectedUserId && false)
                        ? 'active'
                        : ''
                    }
                    onClick={() => startEditUser(u)}
                  >
                    <strong>{u.fullName}</strong>
                    <span>{roleLabel(u.role)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="admin-detail">
            <h2>{editMode ? 'Редактирование пользователя' : 'Новый пользователь'}</h2>
            <label>
              ФИО
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={120}
                placeholder="Иванов Иван Иванович"
              />
            </label>
            <label>
              Пароль{editMode ? ' (оставьте пустым, чтобы не менять)' : ''}
              <input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                maxLength={64}
                placeholder={editMode ? 'Новый пароль' : 'Минимум 4 символа'}
                autoComplete="new-password"
              />
            </label>
            <fieldset className="admin-roles">
              <legend>Роль</legend>
              <div className="role-row">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={formRole === opt.value ? 'active' : ''}
                    onClick={() => setFormRole(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="admin-actions">
              <button
                type="button"
                className="hdr-btn"
                disabled={busy}
                onClick={() => void saveUser()}
              >
                {editMode ? 'Сохранить' : 'Создать'}
              </button>
              {editMode && selectedUser && (
                <button
                  type="button"
                  className="hdr-btn danger"
                  disabled={busy}
                  onClick={() => void removeUser(selectedUser)}
                >
                  Удалить
                </button>
              )}
              <button
                type="button"
                className="hdr-btn ghost"
                disabled={busy}
                onClick={startCreateUser}
              >
                Сброс формы
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'groups' && (
        <div className="admin-layout">
          <aside className="admin-list">
            <h2>Группы ({groups.length})</h2>
            <div className="admin-create-group">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Название группы"
              />
              <select
                value={newGroupInstructorId}
                onChange={(e) => setNewGroupInstructorId(e.target.value)}
              >
                {!instructors.length && (
                  <option value="">Нет инструкторов</option>
                )}
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.fullName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="hdr-btn"
                disabled={busy || !instructors.length}
                onClick={() => void onCreateGroup()}
              >
                Создать группу
              </button>
            </div>
            <ul>
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={activeGroupId === g.id ? 'active' : ''}
                    onClick={() => setActiveGroupId(g.id)}
                  >
                    <strong>{g.name}</strong>
                    <span>
                      {g.instructorName || '—'} · {g.memberCount} уч.
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="admin-detail">
            {!activeGroup ? (
              <p className="admin-empty">Выберите или создайте группу.</p>
            ) : (
              <>
                <div className="admin-detail-head">
                  <div>
                    <h2>{activeGroup.name}</h2>
                    <p>
                      Инструктор: {activeGroup.instructorName || '—'} · участников:{' '}
                      {activeGroup.memberCount}
                    </p>
                  </div>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="hdr-btn ghost"
                      disabled={busy}
                      onClick={() => void onRenameGroup()}
                    >
                      Переименовать
                    </button>
                    <button
                      type="button"
                      className="hdr-btn danger"
                      disabled={busy}
                      onClick={() => void onDeleteGroup()}
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                <label>
                  Назначить инструктора
                  <select
                    value={activeGroup.instructorId}
                    disabled={busy || !instructors.length}
                    onChange={(e) => void onAssignInstructor(e.target.value)}
                  >
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <h3>Участники</h3>
                <div className="admin-add-row">
                  <select
                    value={addTraineeId}
                    onChange={(e) => setAddTraineeId(e.target.value)}
                  >
                    <option value="">Выберите обучаемого</option>
                    {availableTrainees.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="hdr-btn"
                    disabled={busy || !addTraineeId}
                    onClick={() => void onAddMember()}
                  >
                    Добавить
                  </button>
                </div>
                <ul className="admin-members">
                  {!members.length && (
                    <li className="admin-empty">Пока никого нет</li>
                  )}
                  {members.map((m) => (
                    <li key={m.id}>
                      <span>{m.fullName}</span>
                      <button
                        type="button"
                        className="hdr-btn ghost"
                        disabled={busy}
                        onClick={() => void onRemoveMember(m.id)}
                      >
                        Убрать
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
