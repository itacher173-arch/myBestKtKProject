import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
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
  hasRole,
  rolesLabel,
  type UserRole,
  validateFullName,
  validateLogin,
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
  // Стабильная ссылка: иначе useEffect([admin]) уходит в бесконечный GET /users
  const admin = useMemo(() => getAuthedUser(), [])
  const [tab, setTab] = useState<Tab>('users')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [users, setUsers] = useState<AdminUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [formLogin, setFormLogin] = useState('')
  const [formName, setFormName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRoles, setFormRoles] = useState<UserRole[]>(['trainee'])

  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [trainees, setTrainees] = useState<GroupUser[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupUser[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupInstructorId, setNewGroupInstructorId] = useState('')
  const [renamingGroup, setRenamingGroup] = useState(false)
  const [renameGroupName, setRenameGroupName] = useState('')
  const [membersTab, setMembersTab] = useState<'inGroup' | 'all'>('inGroup')
  const [memberSearch, setMemberSearch] = useState('')
  const [membersPage, setMembersPage] = useState(1)
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null)
  const PAGE_SIZE = 8

  const instructors = useMemo(
    () => users.filter((u) => u.roles.includes('instructor')),
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
    if (!admin || !hasRole(admin, 'admin')) return
    let cancelled = false
    void (async () => {
      try {
        await refreshUsers()
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Пользователи: ${err.message}`
              : 'Ошибка загрузки пользователей',
          )
        }
      }
      try {
        await refreshGroups()
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Группы: ${err.message}`
              : 'Ошибка загрузки групп',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [admin, refreshUsers, refreshGroups])

  useEffect(() => {
    if (!activeGroupId) {
      setMembers([])
      setRenamingGroup(false)
      setRenameGroupName('')
      return
    }
    setMembersTab('inGroup')
    setMemberSearch('')
    setMembersPage(1)
    void refreshMembers(activeGroupId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Ошибка участников')
    })
  }, [activeGroupId, refreshMembers])

  useEffect(() => {
    setRenamingGroup(false)
    setRenameGroupName(activeGroup?.name ?? '')
  }, [activeGroup?.id, activeGroup?.name])

  useEffect(() => {
    if (instructors.length && !newGroupInstructorId) {
      setNewGroupInstructorId(instructors[0].id)
    }
  }, [instructors, newGroupInstructorId])

  const resetUserForm = () => {
    setEditMode(false)
    setSelectedUserId(null)
    setFormLogin('')
    setFormName('')
    setFormPassword('')
    setFormRoles(['trainee'])
  }

  const startCreateUser = () => {
    setError('')
    setEditMode(false)
    setSelectedUserId(null)
    setFormLogin('')
    setFormName('')
    setFormPassword('')
    setFormRoles(['trainee'])
  }

  const startEditUser = (user: AdminUser) => {
    setError('')
    setEditMode(true)
    setSelectedUserId(user.id)
    setFormLogin(user.login || '')
    setFormName(user.fullName)
    setFormPassword('')
    setFormRoles(user.roles ?? [user.role])
  }

  const toggleFormRole = (role: UserRole) => {
    setFormRoles((current) => {
      if (current.includes(role)) {
        return current.length > 1 ? current.filter((item) => item !== role) : current
      }
      return [...current, role]
    })
  }

  const saveUser = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setError('')

    // FormData — актуальные значения из DOM (в т.ч. автозаполнение браузера)
    let loginValue = formLogin
    let nameValue = formName
    let passwordValue = formPassword
    if (event?.currentTarget) {
      const fd = new FormData(event.currentTarget)
      loginValue = String(fd.get('login') ?? loginValue)
      nameValue = String(fd.get('fullName') ?? nameValue)
      passwordValue = String(fd.get('password') ?? passwordValue)
      setFormLogin(loginValue)
      setFormName(nameValue)
      setFormPassword(passwordValue)
    }

    const loginErr = validateLogin(loginValue)
    if (loginErr) {
      setError(loginErr)
      return
    }
    const nameErr = validateFullName(nameValue)
    if (nameErr) {
      setError(nameErr)
      return
    }
    if (!editMode) {
      const passErr = validatePassword(passwordValue)
      if (passErr) {
        setError(passErr)
        return
      }
    } else if (passwordValue && validatePassword(passwordValue)) {
      setError(validatePassword(passwordValue)!)
      return
    }
    setBusy(true)
    try {
      if (editMode && selectedUserId) {
        const payload: {
          login: string
          fullName: string
          roles: UserRole[]
          password?: string
        } = {
          login: loginValue.trim().toLowerCase(),
          fullName: nameValue.trim(),
          roles: formRoles,
        }
        if (passwordValue.trim()) payload.password = passwordValue
        const user = await updateAdminUser(selectedUserId, payload)
        void appendAudit({
          actor: admin?.fullName || 'admin',
          role: 'admin',
          action: 'admin_update_user',
          detail: `${user.login}:${user.roles.join(',')}`,
        })
        await refreshUsers()
        startEditUser(user)
        setFormPassword('')
      } else {
        const user = await createAdminUser({
          login: loginValue.trim().toLowerCase(),
          fullName: nameValue.trim(),
          password: passwordValue,
          roles: formRoles,
        })
        void appendAudit({
          actor: admin?.fullName || 'admin',
          role: 'admin',
          action: 'admin_create_user',
          detail: `${user.login}:${user.roles.join(',')}`,
        })
        await refreshUsers()
        startEditUser(user)
        setFormPassword('')
      }
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
      setUserToDelete(null)
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

  const onAddMember = async (userId: string) => {
    if (!activeGroupId || !userId) return
    setBusy(true)
    setError('')
    try {
      await addGroupMember(activeGroupId, userId)
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
    const name = renameGroupName.trim()
    if (!name) {
      setError('Название группы не может быть пустым')
      return
    }
    if (name === activeGroup.name) {
      setRenamingGroup(false)
      return
    }
    setBusy(true)
    setError('')
    try {
      await renameAdminGroup(activeGroup.id, name)
      await refreshGroups()
      setRenamingGroup(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка переименования')
    } finally {
      setBusy(false)
    }
  }

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

  const filteredMembersList = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    const source =
      membersTab === 'inGroup'
        ? members
        : trainees.map((t) => ({
            ...t,
            inGroup: memberIds.has(t.id),
          }))
    const filtered = source.filter((u) => {
      if (!q) return true
      const login = (u.login || '').toLowerCase()
      const name = (u.fullName || '').toLowerCase()
      return login.includes(q) || name.includes(q)
    })
    return filtered
  }, [membersTab, members, trainees, memberSearch, memberIds])

  const membersTotalPages = Math.max(
    1,
    Math.ceil(filteredMembersList.length / PAGE_SIZE),
  )
  const membersPageSafe = Math.min(membersPage, membersTotalPages)
  const pagedMembers = filteredMembersList.slice(
    (membersPageSafe - 1) * PAGE_SIZE,
    membersPageSafe * PAGE_SIZE,
  )

  if (!admin || !hasRole(admin, 'admin')) {
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
                    <strong>
                      @{u.login || '—'} · {u.fullName}
                    </strong>
                    <span>{rolesLabel(u.roles ?? [u.role])}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="admin-detail">
            <h2>{editMode ? 'Редактирование пользователя' : 'Новый пользователь'}</h2>
            <form
              className="admin-user-form"
              onSubmit={(e) => void saveUser(e)}
            >
              <label>
                Логин
                <input
                  type="text"
                  name="login"
                  value={formLogin}
                  onChange={(e) => setFormLogin(e.target.value)}
                  maxLength={32}
                  placeholder="ivanov"
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                ФИО
                <input
                  type="text"
                  name="fullName"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={120}
                  placeholder="Иванов Иван Иванович"
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                Пароль{editMode ? ' (оставьте пустым, чтобы не менять)' : ''}
                <input
                  type="password"
                  name="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  maxLength={64}
                  placeholder={editMode ? 'Новый пароль' : 'Минимум 4 символа'}
                  autoComplete="new-password"
                  required={!editMode}
                />
              </label>
              <fieldset className="admin-roles">
                <legend>Роли (можно выбрать несколько)</legend>
                <div className="role-row">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={formRoles.includes(opt.value) ? 'active' : ''}
                      aria-pressed={formRoles.includes(opt.value)}
                      onClick={() => toggleFormRole(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="admin-actions">
                <button type="submit" className="hdr-btn" disabled={busy}>
                  {editMode ? 'Сохранить' : 'Создать'}
                </button>
                {editMode && selectedUser && (
                  <button
                    type="button"
                    className="hdr-btn danger"
                    disabled={busy}
                    onClick={() => setUserToDelete(selectedUser)}
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
            </form>
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
                    {renamingGroup ? (
                      <>
                        <input
                          type="text"
                          value={renameGroupName}
                          autoFocus
                          disabled={busy}
                          aria-label="Новое название группы"
                          onChange={(e) => setRenameGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void onRenameGroup()
                            if (e.key === 'Escape') setRenamingGroup(false)
                          }}
                        />
                        <button
                          type="button"
                          className="hdr-btn"
                          disabled={busy || !renameGroupName.trim()}
                          onClick={() => void onRenameGroup()}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="hdr-btn ghost"
                          disabled={busy}
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
                        disabled={busy}
                        onClick={() => {
                          setRenameGroupName(activeGroup.name)
                          setRenamingGroup(true)
                        }}
                      >
                        Переименовать
                      </button>
                    )}
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
                <div className="members-tabs">
                  <button
                    type="button"
                    className={membersTab === 'inGroup' ? 'active' : ''}
                    onClick={() => {
                      setMembersTab('inGroup')
                      setMembersPage(1)
                    }}
                  >
                    В группе ({members.length})
                  </button>
                  <button
                    type="button"
                    className={membersTab === 'all' ? 'active' : ''}
                    onClick={() => {
                      setMembersTab('all')
                      setMembersPage(1)
                    }}
                  >
                    Все ({trainees.length})
                  </button>
                </div>
                <input
                  type="search"
                  className="members-search"
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value)
                    setMembersPage(1)
                  }}
                  placeholder="Поиск по логину или ФИО"
                />
                <ul className="admin-members">
                  {!pagedMembers.length && (
                    <li className="admin-empty">Никого не найдено</li>
                  )}
                  {pagedMembers.map((m) => {
                    const inGroup = memberIds.has(m.id)
                    return (
                      <li key={m.id}>
                        <div className="member-info">
                          <strong>
                            @{m.login || '—'} · {m.fullName}
                          </strong>
                          {membersTab === 'all' && (
                            <span className="member-meta">
                              {inGroup ? 'в группе' : 'не в группе'}
                            </span>
                          )}
                        </div>
                        {inGroup ? (
                          <button
                            type="button"
                            className="hdr-btn ghost"
                            disabled={busy}
                            onClick={() => void onRemoveMember(m.id)}
                          >
                            Убрать
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="hdr-btn"
                            disabled={busy}
                            onClick={() => void onAddMember(m.id)}
                          >
                            Добавить
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <div className="members-pager">
                  <button
                    type="button"
                    className="hdr-btn ghost"
                    disabled={busy || membersPageSafe <= 1}
                    onClick={() => setMembersPage((p) => Math.max(1, p - 1))}
                  >
                    Назад
                  </button>
                  <span>
                    {membersPageSafe} / {membersTotalPages}
                  </span>
                  <button
                    type="button"
                    className="hdr-btn ghost"
                    disabled={busy || membersPageSafe >= membersTotalPages}
                    onClick={() =>
                      setMembersPage((p) => Math.min(membersTotalPages, p + 1))
                    }
                  >
                    Вперёд
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {userToDelete && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!busy) setUserToDelete(null)
          }}
        >
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="admin-delete-user-title">Удаление пользователя</h3>
            <p>
              Вы действительно хотите удалить &quot;{userToDelete.fullName}&quot;
              пользователя?
            </p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="hdr-btn ghost"
                disabled={busy}
                onClick={() => setUserToDelete(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="hdr-btn danger"
                disabled={busy}
                onClick={() => void removeUser(userToDelete)}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
