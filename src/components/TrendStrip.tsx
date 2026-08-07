import { useTrainer } from '../sim/TrainerContext'
import './TrendStrip.css'

type HistKey =
  | 'pressureN1'
  | 'tempFurnaceOut'
  | 'saltMgL'
  | 'pressureK1'
  | 'levelK1'

const SERIES: { key: HistKey; label: string; color: string }[] = [
  { key: 'pressureN1', label: 'PRA351', color: '#6ec1ff' },
  { key: 'tempFurnaceOut', label: 'TR55-1', color: '#e09060' },
  { key: 'saltMgL', label: 'Q-ELOU', color: '#c0a0ff' },
  { key: 'pressureK1', label: 'PRSA204', color: '#80d090' },
  { key: 'levelK1', label: 'LRCA602', color: '#e0c060' },
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

export function TrendStrip() {
  const { state } = useTrainer()
  if (state.session.view !== 'exercise' || !state.session.started) return null
  const hist = state.analogHistory
  if (hist.length < 2) {
    return (
      <div className="trend-strip">
        <span className="trend-empty">
          Тренды накопятся через несколько секунд…
        </span>
      </div>
    )
  }

  return (
    <div className="trend-strip">
      {SERIES.map((s) => {
        const vals = hist.map((h) => h[s.key])
        const last = vals[vals.length - 1]
        return (
          <div key={s.key} className="trend-item">
            <div className="trend-label">
              <span style={{ color: s.color }}>{s.label}</span>
              <strong>
                {last.toFixed(s.key === 'pressureK1' ? 2 : 1)}
              </strong>
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
  )
}
