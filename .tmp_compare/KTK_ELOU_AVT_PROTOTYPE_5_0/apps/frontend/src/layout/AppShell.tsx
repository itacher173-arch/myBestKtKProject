import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiGet } from '../lib/api'
import { usePreferences } from '../settings/PreferencesContext'
import { Icon, type IconName } from '../ui/Icon'
import './AppShell.css'

interface NavItem {
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
  navItems: NavItem[]
  actions?: ReactNode
  children: ReactNode
  fullBleed?: boolean
  onOpenAi: () => void
}

export function AppShell({ title, subtitle, navItems, actions, children, fullBleed, onOpenAi }: AppShellProps) {
  const { user, logout } = useAuth()
  const preferences = usePreferences()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [serviceState, setServiceState] = useState<'checking' | 'ok' | 'degraded'>('checking')
  const [serviceCount, setServiceCount] = useState(0)

  useEffect(() => {
    const check = () => void apiGet<{ status: string; services: Record<string, { status?: string }> }>('/health')
      .then((health) => {
        setServiceState(health.status === 'ok' ? 'ok' : 'degraded')
        setServiceCount(Object.values(health.services).filter((service) => service.status === 'ok').length)
      })
      .catch(() => setServiceState('degraded'))
    check()
    const timer = window.setInterval(check, 15000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="shell">
      <aside className="shell-rail">
        <div className="shell-logo" title="КТК ЭЛОУ-АВТ"><span><i /><i /><i /></span></div>
        <nav aria-label="Основная навигация">
          {navItems.map((item) => (
            <button type="button" key={item.id} className={item.active ? 'active' : ''} disabled={item.disabled} onClick={item.action} title={item.label}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="shell-rail-bottom">
          <button type="button" onClick={preferences.openSettings} title={preferences.t('settings')}><Icon name="settings" /><span>{preferences.t('settings')}</span></button>
        </div>
      </aside>

      <div className="shell-stage">
        <header className="shell-topbar">
          <div className="shell-heading"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
          <div className="shell-top-actions">
            {actions}
            <button type="button" className="ai-top-button" onClick={onOpenAi}><Icon name="sparkles" /><span>{preferences.t('ai')}</span><i /></button>
            <div className="user-menu-wrap">
              <button type="button" className="user-chip" onClick={() => setUserMenuOpen((value) => !value)} aria-expanded={userMenuOpen}>
                <span className="user-avatar">{user?.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                <span><strong>{user?.displayName}</strong><small>{user?.position}</small></span><Icon name="chevron" />
              </button>
              {userMenuOpen && (
                <div className="user-popover">
                  <div><span className="user-avatar large">{user?.displayName.slice(0, 1)}</span><span><strong>{user?.displayName}</strong><small>{user?.username} · {user?.role}</small></span></div>
                  <button type="button" onClick={() => { preferences.openSettings(); setUserMenuOpen(false) }}><Icon name="settings" />{preferences.t('settings')}</button>
                  <button type="button" onClick={logout}><Icon name="logout" />{preferences.t('logout')}</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className={`service-strip ${serviceState}`}><span><i />{serviceState === 'checking' ? 'Проверка сервисов…' : serviceState === 'ok' ? `${preferences.t('systemReady')} · ${serviceCount}/6` : 'Часть сервисов недоступна'}</span><span><Icon name="shield" />{preferences.t('systemLocal')}</span></div>
        <main className={fullBleed ? 'shell-content full-bleed' : 'shell-content'}>{children}</main>
      </div>
    </div>
  )
}
