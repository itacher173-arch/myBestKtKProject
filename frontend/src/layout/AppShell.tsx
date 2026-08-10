import { useEffect, useState, type ReactNode } from 'react'
import { apiGet } from '../api/client'
import {
  getAuthedUser,
  logoutUser,
  redirectToAuthPortal,
  rolesLabel,
  type AuthUser,
} from '../sim/authApi'
import { presenceBus } from '../sim/presence'
import { usePreferences } from '../settings/PreferencesContext'
import { Icon, type IconName } from '../ui/Icon'
import './AppShell.css'

export interface ShellNavItem {
  id: string
  label: string
  icon: IconName
  active?: boolean
  disabled?: boolean
  action: () => void
}

interface AppShellProps {
  title: string
  subtitle?: string
  navItems: ShellNavItem[]
  actions?: ReactNode
  children: ReactNode
  fullBleed?: boolean
  user?: AuthUser | null
  onOpenAi?: () => void
}

const EXPECTED_SERVICES = 5

export function AppShell({
  title,
  subtitle,
  navItems,
  actions,
  children,
  fullBleed,
  user: userProp,
  onOpenAi,
}: AppShellProps) {
  const preferences = usePreferences()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [serviceState, setServiceState] = useState<
    'checking' | 'ok' | 'degraded'
  >('checking')
  const [serviceCount, setServiceCount] = useState(0)
  const [user, setUser] = useState<AuthUser | null>(
    () => userProp ?? getAuthedUser(),
  )
  const showAi = Boolean(onOpenAi) && preferences.aiEnabled

  useEffect(() => {
    setUser(userProp ?? getAuthedUser())
  }, [userProp])

  useEffect(() => {
    const sync = () => setUser(userProp ?? getAuthedUser())
    window.addEventListener('ktk-auth-changed', sync)
    return () => window.removeEventListener('ktk-auth-changed', sync)
  }, [userProp])

  useEffect(() => {
    const check = () =>
      void apiGet<{
        status: string
        services?: Record<string, { status?: string }>
      }>('/health')
        .then((health) => {
          const services = health.services ?? {}
          const okCount = Object.values(services).filter(
            (service) => service.status === 'ok',
          ).length
          setServiceCount(okCount)
          setServiceState(health.status === 'ok' ? 'ok' : 'degraded')
        })
        .catch(() => setServiceState('degraded'))
    check()
    const timer = window.setInterval(check, 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!userMenuOpen) return
    const onDoc = () => setUserMenuOpen(false)
    window.addEventListener('click', onDoc)
    return () => window.removeEventListener('click', onDoc)
  }, [userMenuOpen])

  const onLogout = () => {
    presenceBus.disconnect()
    void (async () => {
      await logoutUser()
      redirectToAuthPortal()
    })()
  }

  const initials =
    user?.fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

  return (
    <div className="shell">
      <aside className="shell-rail">
        <div className="shell-logo" title="КТК ЭЛОУ-АВТ">
          <span>
            <i />
            <i />
            <i />
          </span>
        </div>
        <nav aria-label="Основная навигация">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.active ? 'active' : ''}
              disabled={item.disabled}
              onClick={item.action}
              title={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="shell-rail-bottom">
          <button
            type="button"
            onClick={preferences.openSettings}
            title={preferences.t('settings')}
          >
            <Icon name="settings" />
            <span>{preferences.t('settings')}</span>
          </button>
        </div>
      </aside>

      <div className="shell-stage">
        <header className="shell-topbar">
          <div className="shell-heading">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="shell-top-actions">
            {actions}
            {showAi && (
              <button
                type="button"
                className="ai-top-button"
                onClick={onOpenAi}
              >
                <Icon name="sparkles" />
                <span>{preferences.t('ai')}</span>
                <i />
              </button>
            )}
            <div className="user-menu-wrap">
              <button
                type="button"
                className="user-chip"
                onClick={(event) => {
                  event.stopPropagation()
                  setUserMenuOpen((value) => !value)
                }}
                aria-expanded={userMenuOpen}
              >
                <span className="user-avatar">{initials}</span>
                <span>
                  <strong>{user?.fullName ?? 'Пользователь'}</strong>
                  <small>
                    {user ? rolesLabel(user) : 'сессия'}
                  </small>
                </span>
                <Icon name="chevron" />
              </button>
              {userMenuOpen && (
                <div
                  className="user-popover"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div>
                    <span className="user-avatar large">
                      {user?.fullName?.slice(0, 1) ?? '?'}
                    </span>
                    <span>
                      <strong>{user?.fullName ?? 'Пользователь'}</strong>
                      <small>
                        {user?.login ? `${user.login} · ` : ''}
                        {user ? rolesLabel(user) : ''}
                      </small>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      preferences.openSettings()
                      setUserMenuOpen(false)
                    }}
                  >
                    <Icon name="settings" />
                    {preferences.t('settings')}
                  </button>
                  <button type="button" onClick={onLogout}>
                    <Icon name="logout" />
                    {preferences.t('logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={`service-strip ${serviceState}`}>
          <span>
            <i />
            {serviceState === 'checking'
              ? 'Проверка сервисов…'
              : serviceState === 'ok'
                ? `${preferences.t('systemReady')} · ${serviceCount}/${EXPECTED_SERVICES}`
                : `Часть сервисов недоступна · ${serviceCount}/${EXPECTED_SERVICES}`}
          </span>
          <span>
            <Icon name="shield" />
            {preferences.t('systemLocal')}
          </span>
        </div>

        <main
          className={
            fullBleed ? 'shell-content full-bleed' : 'shell-content'
          }
        >
          {children}
        </main>
      </div>
    </div>
  )
}
