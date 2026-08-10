import { Icon } from '../ui/Icon'
import {
  usePreferences,
  type FontFamily,
  type Locale,
  type ThemeMode,
} from './PreferencesContext'
import './SettingsDrawer.css'

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="settings-toggle">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  )
}

export function SettingsDrawer() {
  const settings = usePreferences()
  if (!settings.settingsOpen) return null

  return (
    <div className="settings-overlay" onMouseDown={settings.closeSettings}>
      <aside
        className="settings-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Настройки приложения"
      >
        <header>
          <div>
            <span>Персонализация</span>
            <h2>Настройки приложения</h2>
          </div>
          <button
            type="button"
            onClick={settings.closeSettings}
            aria-label={settings.t('close')}
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="settings-content">
          <section>
            <h3>
              <Icon name="palette" />
              {settings.t('appearance')}
            </h3>
            <div className="theme-grid">
              {(
                [
                  ['light', 'Светлая'],
                  ['dark', 'Тёмная'],
                  ['system', 'Системная'],
                ] as [ThemeMode, string][]
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={settings.theme === value ? 'active' : ''}
                  onClick={() => settings.setPreference('theme', value)}
                >
                  <span className={`theme-preview ${value}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{label}</span>
                  {settings.theme === value && <Icon name="check" />}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>
              <Icon name="language" />
              {settings.t('language')}
            </h3>
            <div className="segmented settings-language">
              {(
                [
                  ['ru', 'Русский'],
                  ['en', 'English'],
                ] as [Locale, string][]
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={settings.locale === value ? 'active' : ''}
                  onClick={() => settings.setPreference('locale', value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>
              <Icon name="type" />
              Шрифт и масштаб
            </h3>
            <label className="settings-field">
              <span>Семейство шрифта</span>
              <select
                value={settings.fontFamily}
                onChange={(event) =>
                  settings.setPreference(
                    'fontFamily',
                    event.target.value as FontFamily,
                  )
                }
              >
                <option value="interface">IBM Plex Sans</option>
                <option value="humanist">PT Root UI / Arial</option>
                <option value="system">Системный шрифт</option>
              </select>
            </label>
            <label className="settings-range">
              <span>
                <strong>Масштаб текста</strong>
                <output>{Math.round(settings.fontScale * 100)}%</output>
              </span>
              <input
                type="range"
                min="0.9"
                max="1.15"
                step="0.05"
                value={settings.fontScale}
                onChange={(event) =>
                  settings.setPreference(
                    'fontScale',
                    Number(event.target.value),
                  )
                }
              />
            </label>
            <div className="segmented">
              <button
                type="button"
                className={
                  settings.density === 'comfortable' ? 'active' : ''
                }
                onClick={() =>
                  settings.setPreference('density', 'comfortable')
                }
              >
                Комфортно
              </button>
              <button
                type="button"
                className={settings.density === 'compact' ? 'active' : ''}
                onClick={() => settings.setPreference('density', 'compact')}
              >
                Компактно
              </button>
            </div>
          </section>

          <section>
            <h3>
              <Icon name="accessibility" />
              {settings.t('accessibility')}
            </h3>
            <Toggle
              checked={settings.highContrast}
              onChange={(value) =>
                settings.setPreference('highContrast', value)
              }
              label="Повышенный контраст"
              description="Усиленные границы и текстовые состояния"
            />
            <Toggle
              checked={settings.reducedMotion}
              onChange={(value) =>
                settings.setPreference('reducedMotion', value)
              }
              label="Минимум анимации"
              description="Отключает декоративные переходы и пульсацию"
            />
          </section>

          <section>
            <h3>
              <Icon name="sparkles" />
              {settings.t('intelligence')}
            </h3>
            <Toggle
              checked={settings.aiEnabled}
              onChange={(value) => settings.setPreference('aiEnabled', value)}
              label="Показывать кнопку ИИ"
              description="Интерфейс готов; серверный ИИ-модуль пока не подключён"
            />
            <Toggle
              checked={settings.proactiveTips}
              onChange={(value) =>
                settings.setPreference('proactiveTips', value)
              }
              label="Проактивные подсказки"
              description="Резерв для будущих подсказок по отклонению параметров"
            />
            <div className="settings-security-note">
              <Icon name="shield" />
              <span>
                <strong>Данные остаются в контуре КТК</strong>
                <small>
                  Сессия и отчёты обрабатываются локальными сервисами. Внешние
                  облачные модели не используются.
                </small>
              </span>
            </div>
          </section>
        </div>

        <footer>
          <span>{settings.t('saveAutomatic')}</span>
          <button type="button" onClick={settings.resetPreferences}>
            Сбросить настройки
          </button>
        </footer>
      </aside>
    </div>
  )
}
