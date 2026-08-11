import { useEffect, useState } from 'react'
import { ApiError } from './api/client'
import {
  clearClientSession,
  fetchMe,
  hasRole,
  loginAppUser,
  redirectTarget,
  validateLogin,
  validatePassword,
} from './sim/authApi'
import ktkMarkUrl from './assets/brand/ktk-mark.svg'
import './App.css'

export default function App() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const user = await fetchMe()
        if (user && !hasRole(user, 'admin')) {
          window.location.replace(redirectTarget())
          return
        }
      } catch {
        /* форма входа */
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  const onLogin = async () => {
    setError('')
    const loginErr = validateLogin(login)
    if (loginErr) {
      setError(loginErr)
      return
    }
    const passErr = validatePassword(password)
    if (passErr) {
      setError(passErr)
      return
    }
    setBusy(true)
    try {
      await loginAppUser({ login, password })
      window.location.replace(redirectTarget())
    } catch (err) {
      clearClientSession()
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

  if (checking) {
    return (
      <div className="auth-login">
        <div className="auth-login-card">
          <p className="lead">Проверка сессии…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-login">
      <div className="auth-login-card">
        <div className="login-brand">
          <img src={ktkMarkUrl} alt="КТК ЭЛОУ-АВТ" />
          <div className="corporate-mark">ГАЗПРОМ НЕФТЬ</div>
        </div>
        <h1>Вход в КТК</h1>
        <p className="lead">Авторизация обучаемого или инструктора</p>

        <label>
          Логин
          <input
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="ivanov"
            maxLength={32}
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

        <p className="hint">
          Администраторам — панель <a href="/admin/">/admin/</a>
        </p>
      </div>
    </div>
  )
}
