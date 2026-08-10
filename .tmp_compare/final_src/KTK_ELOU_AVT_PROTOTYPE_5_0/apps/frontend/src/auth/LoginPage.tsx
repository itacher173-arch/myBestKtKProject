import { useState, type FormEvent } from 'react'
import { usePreferences } from '../settings/PreferencesContext'
import { Icon } from '../ui/Icon'
import { useAuth } from './AuthContext'
import './LoginPage.css'

const demoAccounts = [
  { username: 'trainee', password: 'Ktk2026!', label: 'Обучаемый', description: 'Тренировки и персональный разбор' },
  { username: 'instructor', password: 'Instructor2026!', label: 'Инструктор', description: 'Результаты и методический контроль' },
  { username: 'admin', password: 'Admin2026!', label: 'Администратор', description: 'Контроль приложения и сервисов' },
]

export function LoginPage() {
  const { login, loading, error, clearError } = useAuth()
  const { theme, locale, setPreference } = usePreferences()
  const [username, setUsername] = useState('trainee')
  const [password, setPassword] = useState('Ktk2026!')
  const [showPassword, setShowPassword] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void login(username, password).catch(() => undefined)
  }

  const choose = (account: typeof demoAccounts[number]) => {
    clearError()
    setUsername(account.username)
    setPassword(account.password)
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Описание КТК">
        <div className="login-brand">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span><strong>КТК ЭЛОУ-АВТ</strong><small>Цифровой полигон подготовки персонала</small></span>
        </div>
        <div className="login-story-content">
          <span className="login-eyebrow"><Icon name="shield" /> Локальный защищённый контур</span>
          <h1>Учебная симуляция,<br />которая объясняет <em>почему</em>.</h1>
          <p>Динамическая модель процесса, сегментные тренировки и персональный AI-разбор — без подключения к реальной АСУ ТП.</p>
          <div className="login-features">
            <article><strong>15</strong><span>аварийных сценариев</span></article>
            <article><strong>13</strong><span>мини-тренировок</span></article>
            <article><strong>22</strong><span>статьи базы знаний</span></article>
          </div>
        </div>
        <p className="login-disclaimer">Учебный прототип · ИТ-кластер · 2026</p>
      </section>

      <section className="login-panel">
        <div className="login-quick-settings">
          <button type="button" onClick={() => setPreference('locale', locale === 'ru' ? 'en' : 'ru')}><Icon name="language" />{locale.toUpperCase()}</button>
          <button type="button" onClick={() => setPreference('theme', theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        </div>
        <form className="login-form" onSubmit={submit}>
          <span className="login-mobile-brand">КТК ЭЛОУ-АВТ</span>
          <h2>Вход в систему</h2>
          <p>Используйте корпоративную учётную запись. Для прототипа доступны демонстрационные роли.</p>

          <label>
            <span>Логин</span>
            <div className="login-input"><Icon name="user" /><input value={username} onChange={(event) => { setUsername(event.target.value); clearError() }} autoComplete="username" /></div>
          </label>
          <label>
            <span>Пароль</span>
            <div className="login-input"><Icon name="shield" /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); clearError() }} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Скрыть' : 'Показать'}</button></div>
          </label>
          {error && <div className="login-error"><Icon name="alert" />{error}</div>}
          <button type="submit" className="login-submit" disabled={loading || !username || !password}>{loading ? <><span className="spinner" /> Проверка…</> : <>Войти <Icon name="chevron" /></>}</button>

          <div className="demo-divider"><span>Демонстрационные профили</span></div>
          <div className="demo-accounts">
            {demoAccounts.map((account) => (
              <button type="button" key={account.username} className={username === account.username ? 'active' : ''} onClick={() => choose(account)}>
                <span className="demo-avatar">{account.label.slice(0, 1)}</span>
                <span><strong>{account.label}</strong><small>{account.description}</small></span>
                {username === account.username && <Icon name="check" />}
              </button>
            ))}
          </div>
        </form>
      </section>
    </main>
  )
}
