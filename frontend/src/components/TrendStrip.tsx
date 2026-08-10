import { useMemo, useState } from 'react'
import { usePreferences } from '../settings/PreferencesContext'
import { useTrainer } from '../sim/TrainerContext'
import type { AnalogHistorySample } from '../sim/types'
import './TrendStrip.css'

type HistKey = keyof Omit<AnalogHistorySample, 't'>

const SERIES: { key: HistKey; label: string; color: string }[] = [
  { key: 'pressureN1', label: 'PRA351', color: '#6ec1ff' },
  { key: 'tempFurnaceOut', label: 'TR55-1', color: '#e09060' },
  { key: 'saltMgL', label: 'Q-ELOU', color: '#c0a0ff' },
  { key: 'pressureK1', label: 'PRSA204', color: '#80d090' },
  { key: 'levelK1', label: 'LRCA602', color: '#e0c060' },
  { key: 'levelK2', label: 'LRCA604', color: '#90c0c8' },
  { key: 'feedFlow', label: 'F-feed', color: '#d080a0' },
  { key: 'pressureAfterElou', label: 'PRA312', color: '#a0b8ff' },
]

const DEFAULT_KEYS: HistKey[] = [
  'pressureN1',
  'tempFurnaceOut',
  'saltMgL',
]

function spark(values: number[], w: number, h: number): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * (h - 2) - 1
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function decimals(key: HistKey): number {
  if (key === 'pressureK1' || key === 'pressureAfterElou') return 2
  if (key === 'feedFlow') return 0
  return 1
}

export function TrendStrip() {
  const { state } = useTrainer()
  const { setPreference, t } = usePreferences()
  const [selected, setSelected] = useState<HistKey[]>(DEFAULT_KEYS)

  const hist = state.analogHistory
  const visible = useMemo(
    () => SERIES.filter((s) => selected.includes(s.key)),
    [selected],
  )

  if (state.session.view !== 'exercise' || !state.session.started) return null

  const hide = () => setPreference('showTrendStrip', false)

  if (hist.length < 2) {
    return (
      <div className="trend-strip">
        <div className="trend-strip-head">
          <span className="trend-empty">
            Тренды накопятся через несколько секунд…
          </span>
          <button
            type="button"
            className="trend-strip-close"
            onClick={hide}
            aria-label={t('close')}
            title="Скрыть панель трендов"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  const toggle = (key: HistKey) => {
    setSelected((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev
        return prev.filter((k) => k !== key)
      }
      if (prev.length >= 5) return prev
      return [...prev, key]
    })
  }

  return (
    <div className="trend-strip">
      <div className="trend-strip-head">
        <div className="trend-pick">
          {SERIES.map((s) => (
            <label key={s.key} className="trend-pick-item">
              <input
                type="checkbox"
                checked={selected.includes(s.key)}
                onChange={() => toggle(s.key)}
              />
              <span style={{ color: s.color }}>{s.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="trend-strip-close"
          onClick={hide}
          aria-label={t('close')}
          title="Скрыть панель трендов"
        >
          ×
        </button>
      </div>
      <div className="trend-charts">
        {visible.map((s) => {
          const vals = hist.map((h) => h[s.key])
          const last = vals[vals.length - 1]
          return (
            <div key={s.key} className="trend-item">
              <div className="trend-label">
                <span style={{ color: s.color }}>{s.label}</span>
                <strong>{last.toFixed(decimals(s.key))}</strong>
              </div>
              <svg viewBox="0 0 120 28" width="120" height="28" aria-hidden>
                <path
                  d={spark(vals, 120, 28)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          )
        })}
      </div>
    </div>
  )
}
