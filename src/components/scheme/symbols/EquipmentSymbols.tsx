import type { EquipmentType } from '../../../scheme/types'

const fill = {
  body: '#1e2a36',
  stroke: '#8fa3b5',
  accent: '#c9d6e2',
  highlight: '#3d8ebd',
}

interface SymbolProps {
  w: number
  h: number
  selected?: boolean
  hovered?: boolean
  controllable?: boolean
}

function strokeColor(
  selected?: boolean,
  hovered?: boolean,
  controllable?: boolean,
) {
  if (selected) return '#f0c14b'
  if (hovered) return '#6ec1ff'
  if (controllable) return '#4ecf9e'
  return fill.stroke
}

export function ColumnSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  const trays = Math.max(4, Math.min(12, Math.floor(h / 28)))
  return (
    <g>
      <rect
        x={2}
        y={2}
        width={w - 4}
        height={h - 4}
        rx={4}
        fill={fill.body}
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      {Array.from({ length: trays }, (_, i) => {
        const y = 10 + ((h - 24) * (i + 1)) / (trays + 1)
        return (
          <line
            key={i}
            x1={8}
            y1={y}
            x2={w - 8}
            y2={y}
            stroke={fill.accent}
            strokeWidth={1}
            opacity={0.55}
          />
        )
      })}
      <ellipse
        cx={w / 2}
        cy={6}
        rx={w / 2 - 6}
        ry={5}
        fill="none"
        stroke={s}
        strokeWidth={1}
      />
    </g>
  )
}

export function PumpSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) / 2 - 4
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill.body}
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <polygon
        points={`${cx - r * 0.35},${cy - r * 0.45} ${cx + r * 0.5},${cy} ${cx - r * 0.35},${cy + r * 0.45}`}
        fill={fill.highlight}
        opacity={0.9}
      />
    </g>
  )
}

export function FurnaceSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  const roof = 16
  return (
    <g>
      <path
        d={`M ${w / 2} 2 L ${w - 2} ${roof} L ${w - 2} ${h - 2} L 2 ${h - 2} L 2 ${roof} Z`}
        fill={fill.body}
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <path
        d={`M ${w * 0.28} ${h * 0.45} Q ${w * 0.5} ${h * 0.25} ${w * 0.72} ${h * 0.45} Q ${w * 0.5} ${h * 0.7} ${w * 0.28} ${h * 0.45}`}
        fill="none"
        stroke="#e07a3d"
        strokeWidth={1.5}
      />
      <line
        x1={w * 0.35}
        y1={h - 10}
        x2={w * 0.35}
        y2={h * 0.55}
        stroke="#e07a3d"
        strokeWidth={1.2}
      />
      <line
        x1={w * 0.65}
        y1={h - 10}
        x2={w * 0.65}
        y2={h * 0.55}
        stroke="#e07a3d"
        strokeWidth={1.2}
      />
    </g>
  )
}

export function HeatExchangerSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  return (
    <g>
      <rect
        x={2}
        y={2}
        width={w - 4}
        height={h - 4}
        rx={6}
        fill={fill.body}
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <circle
        cx={w / 2}
        cy={h / 2}
        r={Math.min(w, h) * 0.22}
        fill="none"
        stroke={fill.highlight}
        strokeWidth={1.5}
      />
      <line
        x1={w / 2 - 8}
        y1={h / 2 - 8}
        x2={w / 2 + 8}
        y2={h / 2 + 8}
        stroke={fill.highlight}
        strokeWidth={1.5}
      />
      <line
        x1={w / 2 + 8}
        y1={h / 2 - 8}
        x2={w / 2 - 8}
        y2={h / 2 + 8}
        stroke={fill.highlight}
        strokeWidth={1.5}
      />
    </g>
  )
}

export function VesselSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  return (
    <g>
      <rect
        x={4}
        y={8}
        width={w - 8}
        height={h - 16}
        rx={w / 2 - 4}
        fill={fill.body}
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <ellipse
        cx={w / 2}
        cy={10}
        rx={w / 2 - 6}
        ry={6}
        fill="none"
        stroke={s}
        strokeWidth={1}
      />
      <ellipse
        cx={w / 2}
        cy={h - 10}
        rx={w / 2 - 6}
        ry={6}
        fill="none"
        stroke={s}
        strokeWidth={1}
      />
    </g>
  )
}

export function DesalterSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  return (
    <g>
      <rect
        x={2}
        y={6}
        width={w - 4}
        height={h - 12}
        rx={h / 2 - 4}
        fill={fill.body}
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <line
        x1={10}
        y1={h / 2 - 4}
        x2={w - 10}
        y2={h / 2 - 4}
        stroke={fill.highlight}
        strokeWidth={1}
      />
      <line
        x1={10}
        y1={h / 2 + 4}
        x2={w - 10}
        y2={h / 2 + 4}
        stroke={fill.highlight}
        strokeWidth={1}
      />
    </g>
  )
}

export function GroupSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  return (
    <g>
      <rect
        x={2}
        y={2}
        width={w - 4}
        height={h - 4}
        rx={8}
        fill="rgba(30,42,54,0.55)"
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={selected ? undefined : '6 4'}
      />
    </g>
  )
}

export function LabelSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  return (
    <g>
      <rect
        x={1}
        y={1}
        width={w - 2}
        height={h - 2}
        rx={4}
        fill="rgba(20,28,36,0.75)"
        stroke={s}
        strokeWidth={selected ? 2 : 1}
      />
    </g>
  )
}

export function ValveSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  const cx = w / 2
  const cy = h / 2
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={Math.min(w, h) / 2 - 3}
        fill="#1e2a36"
        stroke={s}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <polygon
        points={`${cx},${cy - 10} ${cx + 10},${cy} ${cx},${cy + 10} ${cx - 10},${cy}`}
        fill="none"
        stroke="#e07a3d"
        strokeWidth={1.8}
      />
    </g>
  )
}

export function SignalSymbol({ w, h, selected, hovered, controllable }: SymbolProps) {
  const s = strokeColor(selected, hovered, controllable)
  return (
    <g>
      <rect
        x={1}
        y={1}
        width={w - 2}
        height={h - 2}
        rx={3}
        fill="#162028"
        stroke={s}
        strokeWidth={selected ? 2 : 1}
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
}: SymbolProps & { type: EquipmentType }) {
  const props = { w, h, selected, hovered, controllable }
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
      return <LabelSymbol {...props} />
    case 'valve':
      return <ValveSymbol {...props} />
    case 'signal':
      return <SignalSymbol {...props} />
  }
}
