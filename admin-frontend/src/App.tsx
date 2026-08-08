import { useState } from 'react'
import { ApiError } from './api/client'
import { AdminPage } from './components/AdminPage'
import {
  getAuthedUser,
  loginAdmin,
  logoutUser,
  type AuthUser,
  validateFullName,
  validatePassword,
} from './sim/authApi'
import { appendAudit } from './sim/auditStorage'
import './App.css'

export default function App() {
  const [authed, setAuthed] = useState<AuthUser | null>(() => getAuthedUser())
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onLogout = () => {
    logoutUser()
    setAuthed(null)
    setPassword('')
    setError('')
  }

  const onLogin = async () => {
    setError('')
    const nameErr = validateFullName(fullName)
    if (nameErr) {
      setError(nameErr)
      return
    }
    const passErr = validatePassword(password)
    if (passErr) {
      setError(passErr)
      return
    }
    setBusy(true)
    try {
      const user = await loginAdmin({ fullName, password })
      setAuthed(user)
      setPassword('')
      void appendAudit({
        actor: user.fullName,
        role: 'admin',
        action: 'admin_login',
      })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Ошибка входа',
      )
    } finally {
      setBusy(false)
    }
  }

  if (authed?.role === 'admin') {
    return <AdminPage onLogout={onLogout} />
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <div className="corporate-mark">ГАЗПРОМ НЕФТЬ</div>
        <h1>Админ-панель КТК</h1>
        <p className="lead">Управление пользователями и группами</p>

        <label>
          ФИО
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="admin"
            maxLength={120}
            autoComplete="username"
          />
        </label>
        <label>
          Пароль
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
        </label>

        {error && <p className="error">{error}</p>}

        <button type="button" disabled={busy} onClick={() => void onLogin()}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </div>
    </div>
  )
}
