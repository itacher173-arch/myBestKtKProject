import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Locale = 'ru' | 'en'
export type FontFamily = 'interface' | 'humanist' | 'system'
export type Density = 'comfortable' | 'compact'

interface Preferences {
  theme: ThemeMode
  locale: Locale
  fontFamily: FontFamily
  fontScale: number
  density: Density
  highContrast: boolean
  reducedMotion: boolean
  aiEnabled: boolean
  proactiveTips: boolean
}

interface PreferencesApi extends Preferences {
  settingsOpen: boolean
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  openSettings: () => void
  closeSettings: () => void
  resetPreferences: () => void
  t: (key: string) => string
}

const defaults: Preferences = {
  theme: 'dark',
  locale: 'ru',
  fontFamily: 'interface',
  fontScale: 1,
  density: 'comfortable',
  highContrast: false,
  reducedMotion: false,
  aiEnabled: true,
  proactiveTips: true,
}

const STORAGE_KEY = 'ktk-elou-avt-preferences-v5'

const translations: Record<Locale, Record<string, string>> = {
  ru: {
    home: 'Главная', trainer: 'Тренажёр', reports: 'Результаты', knowledge: 'База знаний', ai: 'ИИ-ассистент',
    settings: 'Настройки', logout: 'Выйти', systemReady: 'Все сервисы доступны', systemLocal: 'Локальный защищённый контур',
    startTraining: 'Начать тренировку', fullProcess: 'Полный сценарий', miniTraining: 'Мини-обучение',
    appearance: 'Внешний вид', language: 'Язык интерфейса', accessibility: 'Доступность', intelligence: 'ИИ и персонализация',
    saveAutomatic: 'Изменения применяются автоматически', close: 'Закрыть',
  },
  en: {
    home: 'Home', trainer: 'Simulator', reports: 'Results', knowledge: 'Knowledge base', ai: 'AI assistant',
    settings: 'Settings', logout: 'Sign out', systemReady: 'All services available', systemLocal: 'Local secure environment',
    startTraining: 'Start training', fullProcess: 'Full scenario', miniTraining: 'Microlearning',
    appearance: 'Appearance', language: 'Interface language', accessibility: 'Accessibility', intelligence: 'AI & personalization',
    saveAutomatic: 'Changes are applied automatically', close: 'Close',
  },
}

const PreferencesContext = createContext<PreferencesApi | null>(null)

function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Preferences>
    return { ...defaults, ...stored }
  } catch {
    return defaults
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    const root = document.documentElement
    const resolved = preferences.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : preferences.theme
    root.dataset.theme = resolved
    root.dataset.density = preferences.density
    root.dataset.contrast = preferences.highContrast ? 'high' : 'normal'
    root.dataset.motion = preferences.reducedMotion ? 'reduced' : 'normal'
    root.dataset.font = preferences.fontFamily
    root.lang = preferences.locale
    root.style.setProperty('--font-scale', String(preferences.fontScale))
  }, [preferences])

  const value = useMemo<PreferencesApi>(() => ({
    ...preferences,
    settingsOpen,
    setPreference: (key, value) => setPreferences((current) => ({ ...current, [key]: value })),
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    resetPreferences: () => setPreferences(defaults),
    t: (key) => translations[preferences.locale][key] || key,
  }), [preferences, settingsOpen])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences должен использоваться внутри PreferencesProvider')
  return context
}
