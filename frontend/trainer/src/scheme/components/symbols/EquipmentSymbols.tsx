import type { EquipmentType } from '../../types'

const palette = {
  steel: 'var(--eq-steel)',
  steelLight: 'var(--eq-steel-light)',
  steelDark: 'var(--eq-steel-dark)',
  stroke: 'var(--eq-stroke)',
  accent: 'var(--eq-accent)',
  cyan: 'var(--eq-cyan)',
  teal: 'var(--eq-teal)',
  amber: 'var(--eq-amber)',
  flame: 'var(--eq-flame)',
  flameCore: 'var(--eq-flame-core)',
  liquid: 'var(--eq-liquid)',
  liquidBright: 'var(--eq-liquid-bright)',
  oil: 'var(--eq-oil)',
  green: 'var(--eq-green)',
}

interface SymbolProps {
  w: number
  h: number
  selected?: boolean
  hovered?: boolean
  controllable?: boolean
  /** Уникальный id для clipPath */
  clipId?: string
  /** 0…1 уровень заполнения (колонны, ёмкости, задвижки) */
  fillLevel?: number
  /** Активный режим (насос в работе, печь горит и т.п.) */
  active?: boolean
  /** Аварийный / тревожный вид */
  alarm?: boolean
}

function strokeColor(
  selected?: boolean,
  hovered?: boolean,
  controllable?: boolean,
  alarm?: boolean,
) {
  if (alarm) return 'var(--danger)'
  if (selected) return 'var(--warning)'
  if (hovered) return 'var(--accent)'
  if (controllable) return 'var(--success)'
  return palette.stroke
}

function sw(selected?: boolean) {
  return selected ? 2.4 : 1.4
}

/** Общие градиенты — один раз на схему (см. SchemeViewer defs). */
export function EquipmentSymbolDefs() {
  return (
    <defs>
      <linearGradient id="eq-steel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--eq-grad-0)" />
        <stop offset="45%" stopColor="var(--eq-grad-1)" />
        <stop offset="100%" stopColor="var(--eq-grad-2)" />
      </linearGradient>
      <linearGradient id="eq-steel-v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--eq-grad-0)" />
        <stop offset="100%" stopColor="var(--eq-grad-2)" />
      </linearGradient>
      <linearGradient id="eq-liquid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--eq-liquid-bright)" stopOpacity="0.85" />
        <stop offset="100%" stopColor="var(--eq-liquid)" stopOpacity="0.95" />
      </linearGradient>
      <linearGradient id="eq-oil" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--eq-amber)" stopOpacity="0.75" />
        <stop offset="100%" stopColor="var(--eq-oil)" stopOpacity="0.9" />
      </linearGradient>
      <linearGradient id="eq-flame" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#8a3018" />
        <stop offset="40%" stopColor="var(--eq-flame)" />
        <stop offset="100%" stopColor="var(--eq-flame-core)" />
      </linearGradient>
      <radialGradient id="eq-pump" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="var(--eq-pump-0)" />
        <stop offset="55%" stopColor="var(--eq-pump-1)" />
        <stop offset="100%" stopColor="var(--eq-pump-2)" />
      </radialGradient>
      <linearGradient id="eq-hx" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--eq-grad-0)" />
        <stop offset="50%" stopColor="var(--eq-grad-1)" />
        <stop offset="100%" stopColor="var(--eq-grad-0)" />
      </linearGradient>
      <linearGradient id="eq-signal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--eq-signal-0)" />
        <stop offset="100%" stopColor="var(--eq-signal-1)" />
      </linearGradient>
      <filter id="eq-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

export function ColumnSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  fillLevel = 0.45,
  active,
  alarm,
  clipId = 'col',
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable, alarm)
  const trays = Math.max(4, Math.min(14, Math.floor(h / 24)))
  const level = Math.max(0.08, Math.min(0.92, fillLevel))
  const liquidH = (h - 16) * level
  const liquidY = h - 8 - liquidH
  const cid = `col-clip-${clipId}`

  return (
    <g>
      <rect
        x={2}
        y={2}
        width={w - 4}
        height={h - 4}
        rx={5}
        fill="url(#eq-steel-v)"
        stroke={s}
        strokeWidth={sw(selected)}
      />
      <clipPath id={cid}>
        <rect x={4} y={8} width={w - 8} height={h - 14} rx={3} />
      </clipPath>
      <g clipPath={`url(#${cid})`}>
        <rect
          x={4}
          y={liquidY}
          width={w - 8}
          height={liquidH}
          fill="url(#eq-oil)"
          opacity={active ? 0.95 : 0.7}
        />
        <rect
          x={4}
          y={liquidY}
          width={w - 8}
          height={3}
          fill="var(--eq-amber)"
          opacity={0.5}
        />
      </g>
      {Array.from({ length: trays }, (_, i) => {
        const y = 14 + ((h - 28) * (i + 1)) / (trays + 1)
        return (
          <g key={i}>
            <line
              x1={8}
              y1={y}
              x2={w - 8}
              y2={y}
              stroke={palette.accent}
              strokeWidth={1}
              opacity={0.4}
            />
            <circle cx={10} cy={y} r={1.5} fill={palette.cyan} opacity={0.7} />
            <circle
              cx={w - 10}
              cy={y}
              r={1.5}
              fill={palette.cyan}
              opacity={0.7}
            />
          </g>
        )
      })}
      <ellipse
        cx={w / 2}
        cy={7}
        rx={w / 2 - 5}
        ry={5}
        fill={palette.steelLight}
        stroke={s}
        strokeWidth={1}
        opacity={0.9}
      />
      <rect
        x={w / 2 - 5}
        y={0}
        width={10}
        height={8}
        rx={2}
        fill={palette.steelDark}
        stroke={s}
        strokeWidth={0.8}
      />
    </g>
  )
}

export function PumpSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  active,
  alarm,
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable, alarm)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) / 2 - 3

  return (
    <g filter={active ? 'url(#eq-glow)' : undefined}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="url(#eq-pump)"
        stroke={s}
        strokeWidth={sw(selected)}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.72}
        fill="none"
        stroke={active ? palette.green : palette.steelLight}
        strokeWidth={1.2}
        opacity={0.85}
      />
      {/* крыльчатка */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const a = ((deg - 90) * Math.PI) / 180
        const x2 = cx + Math.cos(a) * r * 0.55
        const y2 = cy + Math.sin(a) * r * 0.55
        return (
          <line
            key={deg}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke={active ? 'var(--success)' : palette.cyan}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.9}
          />
        )
      })}
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.18}
        fill={active ? 'var(--success)' : palette.cyan}
        stroke={s}
        strokeWidth={0.8}
      />
      {/* патрубки */}
      <rect
        x={cx + r - 2}
        y={cy - 4}
        width={8}
        height={8}
        rx={1}
        fill={palette.steelLight}
        stroke={s}
        strokeWidth={0.8}
      />
      <rect
        x={cx - r - 6}
        y={cy - 4}
        width={8}
        height={8}
        rx={1}
        fill={palette.steelLight}
        stroke={s}
        strokeWidth={0.8}
      />
    </g>
  )
}

export function FurnaceSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  active,
  alarm,
  fillLevel = 0.6,
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable, alarm)
  const roof = Math.min(18, h * 0.18)
  const fireH = (h - roof - 12) * Math.max(0.15, fillLevel)

  return (
    <g>
      <path
        d={`M ${w / 2} 2 L ${w - 2} ${roof} L ${w - 2} ${h - 2} L 2 ${h - 2} L 2 ${roof} Z`}
        fill="url(#eq-steel)"
        stroke={s}
        strokeWidth={sw(selected)}
      />
      {/* топка */}
      <rect
        x={8}
        y={roof + 8}
        width={w - 16}
        height={h - roof - 16}
        rx={3}
        fill="var(--eq-steel-dark)"
        stroke={palette.steelLight}
        strokeWidth={0.8}
      />
      {active && (
        <g filter="url(#eq-glow)">
          <path
            d={`M ${w * 0.25} ${h - 10}
                Q ${w * 0.35} ${h - 10 - fireH} ${w * 0.42} ${h - 14}
                Q ${w * 0.5} ${h - 10 - fireH * 1.15} ${w * 0.58} ${h - 14}
                Q ${w * 0.65} ${h - 10 - fireH} ${w * 0.75} ${h - 10}
                Z`}
            fill="url(#eq-flame)"
            opacity={0.95}
          />
          <ellipse
            cx={w / 2}
            cy={h - 12}
            rx={w * 0.22}
            ry={5}
            fill={palette.flameCore}
            opacity={0.55}
          />
        </g>
      )}
      {!active && (
        <path
          d={`M ${w * 0.3} ${h * 0.55} Q ${w * 0.5} ${h * 0.4} ${w * 0.7} ${h * 0.55}`}
          fill="none"
          stroke={palette.flame}
          strokeWidth={1.2}
          opacity={0.35}
        />
      )}
      {/* змеевик намёк */}
      <path
        d={`M ${w * 0.2} ${roof + 14}
            C ${w * 0.35} ${roof + 22}, ${w * 0.35} ${roof + 34}, ${w * 0.2} ${roof + 42}
            M ${w * 0.8} ${roof + 14}
            C ${w * 0.65} ${roof + 22}, ${w * 0.65} ${roof + 34}, ${w * 0.8} ${roof + 42}`}
        fill="none"
        stroke={palette.amber}
        strokeWidth={1.4}
        opacity={0.65}
      />
      <rect
        x={w / 2 - 6}
        y={0}
        width={12}
        height={roof}
        fill={palette.steelDark}
        stroke={s}
        strokeWidth={0.8}
      />
    </g>
  )
}

export function HeatExchangerSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  active,
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  const tubes = Math.max(3, Math.min(7, Math.floor(w / 14)))

  return (
    <g>
      <rect
        x={2}
        y={2}
        width={w - 4}
        height={h - 4}
        rx={8}
        fill="url(#eq-hx)"
        stroke={s}
        strokeWidth={sw(selected)}
      />
      <ellipse
        cx={6}
        cy={h / 2}
        rx={5}
        ry={h / 2 - 6}
        fill={palette.steelDark}
        stroke={s}
        strokeWidth={0.8}
      />
      <ellipse
        cx={w - 6}
        cy={h / 2}
        rx={5}
        ry={h / 2 - 6}
        fill={palette.steelDark}
        stroke={s}
        strokeWidth={0.8}
      />
      {Array.from({ length: tubes }, (_, i) => {
        const y = 10 + ((h - 20) * (i + 0.5)) / tubes
        return (
          <line
            key={i}
            x1={12}
            y1={y}
            x2={w - 12}
            y2={y}
            stroke={active ? palette.liquidBright : palette.cyan}
            strokeWidth={1.6}
            opacity={0.55 + (i % 2) * 0.15}
          />
        )
      })}
      <circle
        cx={w / 2}
        cy={h / 2}
        r={Math.min(w, h) * 0.14}
        fill="none"
        stroke={palette.amber}
        strokeWidth={1.3}
        opacity={0.8}
      />
    </g>
  )
}

export function VesselSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  fillLevel = 0.4,
  active,
  clipId = 'ves',
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  const level = Math.max(0.05, Math.min(0.9, fillLevel))
  const bodyTop = 10
  const bodyBot = h - 10
  const bodyH = bodyBot - bodyTop
  const liquidH = bodyH * level
  const liquidY = bodyBot - liquidH
  const rx = Math.min(w / 2 - 4, 22)
  const cid = `ves-clip-${clipId}`

  return (
    <g>
      <rect
        x={4}
        y={bodyTop}
        width={w - 8}
        height={bodyH}
        rx={rx}
        fill="url(#eq-steel-v)"
        stroke={s}
        strokeWidth={sw(selected)}
      />
      <clipPath id={cid}>
        <rect x={5} y={bodyTop + 1} width={w - 10} height={bodyH - 2} rx={rx} />
      </clipPath>
      <g clipPath={`url(#${cid})`}>
        <rect
          x={5}
          y={liquidY}
          width={w - 10}
          height={liquidH}
          fill="url(#eq-liquid)"
          opacity={active ? 0.95 : 0.75}
        />
      </g>
      <ellipse
        cx={w / 2}
        cy={bodyTop + 2}
        rx={w / 2 - 6}
        ry={5}
        fill={palette.steelLight}
        stroke={s}
        strokeWidth={0.8}
        opacity={0.85}
      />
      <ellipse
        cx={w / 2}
        cy={bodyBot - 2}
        rx={w / 2 - 6}
        ry={5}
        fill={palette.steelDark}
        stroke={s}
        strokeWidth={0.8}
        opacity={0.85}
      />
      <line
        x1={w / 2}
        y1={4}
        x2={w / 2}
        y2={bodyTop}
        stroke={s}
        strokeWidth={1.2}
      />
    </g>
  )
}

export function DesalterSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  fillLevel = 0.5,
  active,
  clipId = 'des',
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  const level = Math.max(0.15, Math.min(0.85, fillLevel))
  const bodyY = 6
  const bodyH = h - 12
  const waterH = bodyH * 0.28
  const oilH = bodyH * level * 0.55
  const cid = `des-clip-${clipId}`

  return (
    <g>
      <rect
        x={2}
        y={bodyY}
        width={w - 4}
        height={bodyH}
        rx={bodyH / 2}
        fill="url(#eq-steel)"
        stroke={s}
        strokeWidth={sw(selected)}
      />
      <clipPath id={cid}>
        <rect
          x={4}
          y={bodyY + 2}
          width={w - 8}
          height={bodyH - 4}
          rx={bodyH / 2 - 2}
        />
      </clipPath>
      <g clipPath={`url(#${cid})`}>
        <rect
          x={4}
          y={bodyY + bodyH - waterH}
          width={w - 8}
          height={waterH}
          fill="var(--eq-liquid)"
          opacity={0.85}
        />
        <rect
          x={4}
          y={bodyY + bodyH - waterH - oilH}
          width={w - 8}
          height={oilH}
          fill="url(#eq-oil)"
          opacity={0.8}
        />
      </g>
      {/* электроды */}
      {[0.28, 0.5, 0.72].map((t) => (
        <line
          key={t}
          x1={w * t}
          y1={bodyY + 10}
          x2={w * t}
          y2={bodyY + bodyH - waterH - 4}
          stroke={active ? 'var(--accent)' : palette.cyan}
          strokeWidth={1.4}
          opacity={active ? 0.95 : 0.45}
          strokeDasharray={active ? undefined : '3 2'}
        />
      ))}
      {active && (
        <text
          x={w / 2}
          y={bodyY + 14}
          textAnchor="middle"
          fill="var(--eq-liquid-bright)"
          fontSize={8}
          opacity={0.8}
          pointerEvents="none"
        >
          HV
        </text>
      )}
    </g>
  )
}

export function GroupSymbol({ w, h, selected, hovered }: SymbolProps) {
  const s = strokeColor(selected, hovered)
  return (
    <g>
      <rect
        x={2}
        y={2}
        width={w - 4}
        height={h - 4}
        rx={10}
        fill="var(--eq-body-dim)"
        stroke={s}
        strokeWidth={selected ? 2 : 1.2}
        strokeDasharray={selected ? undefined : '7 5'}
      />
      <rect
        x={6}
        y={6}
        width={w - 12}
        height={h - 12}
        rx={8}
        fill="var(--scheme-zone)"
        stroke="var(--scheme-sep)"
        strokeWidth={1}
      />
    </g>
  )
}

export function LabelSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  zoneBanner,
}: SymbolProps & { zoneBanner?: boolean }) {
  if (zoneBanner) {
    const bg = selected
      ? 'var(--zone-banner-bg-selected)'
      : hovered
        ? 'var(--zone-banner-bg-hover)'
        : 'var(--zone-banner-bg)'
    const stroke = selected ? 'var(--accent)' : hovered ? 'var(--eq-cyan)' : 'var(--border)'
    return (
      <g>
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={6}
          fill={bg}
          stroke={stroke}
          strokeWidth={selected ? 1.8 : 1.2}
        />
        <rect
          x={0}
          y={0}
          width={4}
          height={h}
          rx={2}
          fill={selected ? 'var(--accent)' : 'var(--eq-cyan)'}
        />
      </g>
    )
  }
  const s = strokeColor(selected, hovered, controllable)
  return (
    <g>
      <rect
        x={1}
        y={1}
        width={w - 2}
        height={h - 2}
        rx={4}
        fill="url(#eq-signal)"
        stroke={s}
        strokeWidth={selected ? 2 : 1}
      />
    </g>
  )
}

export function ValveSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  fillLevel = 0,
  active,
  alarm,
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable, alarm)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) / 2 - 2
  const open = Math.max(0, Math.min(1, fillLevel))

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="url(#eq-pump)"
        stroke={s}
        strokeWidth={sw(selected)}
      />
      {/* корпус «бабочка» */}
      <polygon
        points={`${cx},${cy - r * 0.55} ${cx + r * 0.55},${cy} ${cx},${cy + r * 0.55} ${cx - r * 0.55},${cy}`}
        fill={active || open > 0.05 ? 'rgba(45,120,90,0.55)' : 'rgba(60,40,30,0.5)'}
        stroke={open > 0.05 ? palette.green : palette.flame}
        strokeWidth={1.8}
      />
      <line
        x1={cx - r * 0.35}
        y1={cy}
        x2={cx + r * 0.35}
        y2={cy}
        stroke={palette.accent}
        strokeWidth={1.5}
        opacity={0.7}
      />
      {/* шпиндель */}
      <rect
        x={cx - 2}
        y={cy - r - 2}
        width={4}
        height={8}
        rx={1}
        fill={palette.steelLight}
        stroke={s}
        strokeWidth={0.7}
      />
      {/* индикатор открытия */}
      <circle
        cx={cx}
        cy={cy + r * 0.62}
        r={3}
        fill={open > 0.5 ? palette.green : open > 0.05 ? palette.amber : '#6a3030'}
      />
    </g>
  )
}

export function SignalSymbol({
  w,
  h,
  selected,
  hovered,
  controllable,
  alarm,
}: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable, alarm)
  return (
    <g>
      <rect
        x={1}
        y={1}
        width={w - 2}
        height={h - 2}
        rx={4}
        fill="url(#eq-signal)"
        stroke={s}
        strokeWidth={selected ? 2 : 1.1}
      />
      <rect
        x={3}
        y={3}
        width={4}
        height={h - 6}
        rx={1}
        fill={alarm ? '#e07070' : '#3d8ebd'}
        opacity={0.9}
      />
      <line
        x1={12}
        y1={h * 0.35}
        x2={w - 6}
        y2={h * 0.35}
        stroke={palette.steelLight}
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={12}
        y1={h * 0.55}
        x2={w - 10}
        y2={h * 0.55}
        stroke={palette.steelLight}
        strokeWidth={1}
        opacity={0.35}
      />
    </g>
  )
}

export function EquipmentSymbol({
  type,
  w,
  h,
  selected,
  hovered,
  controllable,
  zoneBanner,
  fillLevel,
  active,
  alarm,
  clipId,
}: SymbolProps & { type: EquipmentType; zoneBanner?: boolean }) {
  const props = {
    w,
    h,
    selected,
    hovered,
    controllable,
    fillLevel,
    active,
    alarm,
    clipId,
  }
  switch (type) {
    case 'column':
      return <ColumnSymbol {...props} />
    case 'pump':
      return <PumpSymbol {...props} />
    case 'furnace':
      return <FurnaceSymbol {...props} />
    case 'heatExchanger':
      return <HeatExchangerSymbol {...props} />
    case 'vessel':
      return <VesselSymbol {...props} />
    case 'desalter':
      return <DesalterSymbol {...props} />
    case 'group':
      return <GroupSymbol {...props} />
    case 'label':
      return <LabelSymbol {...props} zoneBanner={zoneBanner} />
    case 'valve':
      return <ValveSymbol {...props} />
    case 'signal':
      return <SignalSymbol {...props} />
  }
}
