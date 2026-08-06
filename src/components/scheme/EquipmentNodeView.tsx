import type { EquipmentNode } from '../../scheme/types'
import { isZoneBanner } from '../../scheme/zones'
import { isControllableEquip } from '../../sim/controllable'
import type { ProcessState } from '../../sim/types'
import { EquipmentSymbol } from './symbols/EquipmentSymbols'

interface Props {
  node: EquipmentNode
  selected: boolean
  hovered: boolean
  process: ProcessState
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

function statusFill(nodeId: string, p: ProcessState): string | undefined {
  if (nodeId === 'N-1') {
    if (p.pumpN1 === 'running') return '#2d6a3e'
    if (p.pumpN1 === 'starting') return '#8a7a2a'
    if (p.pumpN1 === 'tripped') return '#8a3030'
  }
  if (nodeId === 'L-1' && p.valveL1 > 5) return '#2d5a6a'
  if (nodeId === 'L-2' && p.valveL2 > 5) return '#2d5a6a'
  if (nodeId === 'L-3' && p.valveL3 > 5) return '#2d5a6a'
  return undefined
}

function overlayText(nodeId: string, p: ProcessState): string | null {
  if (nodeId === 'N-1') {
    if (p.pumpN1 === 'running') return `${p.pressureN1.toFixed(0)}`
    if (p.pumpN1 === 'tripped') return 'Авар'
    if (p.pumpN1 === 'starting') return '…'
  }
  if (nodeId === 'L-1') return `${p.valveL1.toFixed(0)}%`
  if (nodeId === 'L-2') return `${p.valveL2.toFixed(0)}%`
  if (nodeId === 'L-3') return `${p.valveL3.toFixed(0)}%`
  if (nodeId === 'PR_351') return p.pressureN1.toFixed(1)
  if (nodeId === 'TR_41_2') return p.tempElouIn.toFixed(0)
  if (nodeId === 'Q_ELOU') {
    return p.saltMgL < 10 ? p.saltMgL.toFixed(1) : p.saltMgL.toFixed(0)
  }
  if (nodeId === 'PRA_312') return p.pressureAfterElou.toFixed(1)
  if (nodeId === 'LRCA_602') return `${p.levelK1.toFixed(0)}%`
  if (nodeId === 'LRCA_604') return `${p.levelK2.toFixed(0)}%`
  if (nodeId === 'TR_55_1') return p.tempFurnaceOut.toFixed(0)
  if (nodeId === 'TR1K_21') return p.tempK1In.toFixed(0)
  if (nodeId === 'PRSA_204') return p.pressureK1.toFixed(2)
  if (nodeId === 'PRSA_213') return p.pressureK2.toFixed(2)
  return null
}

export function EquipmentNodeView({
  node,
  selected,
  hovered,
  process,
  onSelect,
  onHover,
}: Props) {
  const lines = node.label.split('\n')
  const isBackground = node.type === 'group'
  const fill = statusFill(node.id, process)
  const overlay = overlayText(node.id, process)
  const controllable = isControllableEquip(node.id)
  const zoneBanner = isZoneBanner(node.id)
  const pad = 3
  const fontSize = zoneBanner
    ? 12
    : node.type === 'label' || node.type === 'signal'
      ? 10
      : node.type === 'column'
        ? 13
        : 11

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      className={
        zoneBanner
          ? 'equip-zone-banner'
          : controllable
            ? 'equip-controllable'
            : undefined
      }
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node.id)
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      opacity={isBackground && !selected && !hovered ? 0.85 : 1}
    >
      {controllable && (
        <rect
          className="equip-control-ring"
          x={-pad}
          y={-pad}
          width={node.w + pad * 2}
          height={node.h + pad * 2}
          rx={node.type === 'pump' || node.type === 'valve' ? 22 : 6}
          fill="none"
          stroke="#3ecf9a"
          strokeWidth={1.6}
          strokeDasharray="5 3"
          pointerEvents="none"
        />
      )}
      {fill && (
        <rect
          x={2}
          y={2}
          width={node.w - 4}
          height={node.h - 4}
          rx={node.type === 'pump' || node.type === 'valve' ? 20 : 4}
          fill={fill}
          opacity={0.55}
        />
      )}
      <EquipmentSymbol
        type={node.type}
        w={node.w}
        h={node.h}
        selected={selected}
        hovered={hovered}
        controllable={controllable}
        zoneBanner={zoneBanner}
      />
      <text
        x={zoneBanner ? node.w / 2 + 2 : node.w / 2}
        y={
          overlay && node.type === 'signal'
            ? node.h / 2 - 6
            : node.h / 2 - ((lines.length - 1) * fontSize) / 2
        }
        textAnchor="middle"
        dominantBaseline="middle"
        fill={
          zoneBanner
            ? selected
              ? '#f0f7fc'
              : '#d5e6f2'
            : selected
              ? '#fff6d6'
              : '#e8eef4'
        }
        fontSize={fontSize}
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontWeight={selected || zoneBanner ? 700 : 600}
        pointerEvents="none"
      >
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={zoneBanner ? node.w / 2 + 2 : node.w / 2}
            dy={i === 0 ? 0 : fontSize + 2}
          >
            {line}
          </tspan>
        ))}
      </text>
      {overlay && (
        <text
          x={node.w / 2}
          y={
            node.type === 'signal' ||
            node.type === 'valve' ||
            node.type === 'pump'
              ? node.h - 8
              : node.h + 12
          }
          textAnchor="middle"
          fill="#9fd0ff"
          fontSize={9}
          fontFamily="IBM Plex Mono, monospace"
          pointerEvents="none"
        >
          {overlay}
        </text>
      )}
      <rect x={0} y={0} width={node.w} height={node.h} fill="transparent" />
    </g>
  )
}
