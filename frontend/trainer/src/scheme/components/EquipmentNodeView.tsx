import type { EquipmentNode } from '../types'
import { isZoneBanner } from '../zones'
import { isControllableEquip } from '../../simulator/controllable'
import { isAnalogAlarm } from '../../simulator/processModel'
import type { ProcessState } from '../../simulator/types'
import { EquipmentSymbol } from './symbols/EquipmentSymbols'

interface Props {
  node: EquipmentNode
  selected: boolean
  hovered: boolean
  process: ProcessState
  alarmHighlight?: boolean
  /** Зелёный контур управления; в мини-уроке — только для сегмента */
  showControlRing?: boolean
  onSelect: (id: string) => void
  onActivate?: (id: string) => void
  onHover: (id: string | null) => void
}

function visualState(
  node: EquipmentNode,
  p: ProcessState,
): { fillLevel?: number; active?: boolean; alarm?: boolean } {
  const id = node.id

  if (id === 'N-1') {
    return {
      active: p.pumpN1 === 'running' || p.pumpN1 === 'starting',
      alarm: p.pumpN1 === 'tripped' || p.pumpLeak,
    }
  }
  if (id === 'L-1') return { fillLevel: p.valveL1 / 100, active: p.valveL1 > 5 }
  if (id === 'L-2') return { fillLevel: p.valveL2 / 100, active: p.valveL2 > 5 }
  if (id === 'L-3') return { fillLevel: p.valveL3 / 100, active: p.valveL3 > 5 }
  if (id === 'K-1') {
    return {
      fillLevel: p.levelK1 / 100,
      active: p.feedFlow > 5,
      alarm: p.levelK1 < 20 || p.pressureK1 >= 4.5,
    }
  }
  if (id === 'K-2') {
    return {
      fillLevel: p.levelK2 / 100,
      active: p.fuelGasPercent > 5 && p.feedFlow > 5,
      alarm: p.levelK2 < 20 || p.pressureK2 >= 1,
    }
  }
  if (id === 'P-1' || id === 'P-2' || id === 'P-3') {
    return {
      fillLevel: p.fuelGasPercent / 100,
      active:
        p.fuelGasPercent > 5 &&
        p.steamOk &&
        !p.coilRupture &&
        !p.furnaceEsd,
      alarm: p.coilRupture || p.tempFurnaceOut >= 365,
    }
  }
  if (id === 'ELOU-block' || /^E-[1-6]$/.test(id)) {
    return {
      fillLevel: 0.55,
      active: p.electricFieldOn || p.demulsifierOn,
      alarm: p.saltMgL > 5 && p.feedFlow > 5,
    }
  }
  if (node.type === 'column') {
    return { fillLevel: 0.42, active: p.feedFlow > 5 }
  }
  if (node.type === 'vessel') {
    if (id === 'E-1-vessel')
      return { fillLevel: p.levelWaterE1 / 100, alarm: p.levelWaterE1 > 85 }
    if (id === 'E-2-vessel')
      return { fillLevel: p.levelWaterE2 / 100, alarm: p.levelWaterE2 > 85 }
    return { fillLevel: 0.4 }
  }
  if (node.type === 'heatExchanger') {
    return { active: p.feedFlow > 5 }
  }
  if (node.type === 'pump') {
    return { active: p.feedFlow > 20 }
  }
  if (node.type === 'furnace') {
    return {
      fillLevel: p.fuelGasPercent / 100,
      active: p.fuelGasPercent > 5 && p.steamOk,
    }
  }
  if (node.type === 'desalter') {
    return {
      fillLevel: 0.5,
      active: p.electricFieldOn,
      alarm: p.saltMgL > 5,
    }
  }
  if (node.type === 'signal') {
    const tags: {
      id: string
      value: number
      alarmLow?: number
      alarmHigh?: number
    }[] = [
      { id: 'PR_351', value: p.pressureN1, alarmLow: 2, alarmHigh: 22 },
      { id: 'TR_41_2', value: p.tempElouIn, alarmHigh: 140 },
      { id: 'Q_ELOU', value: p.saltMgL, alarmHigh: 5 },
      { id: 'PRA_312', value: p.pressureAfterElou, alarmHigh: 10 },
      { id: 'TR1K_21', value: p.tempK1In, alarmHigh: 280 },
      { id: 'PRSA_204', value: p.pressureK1, alarmHigh: 4.5 },
      { id: 'LRCA_602', value: p.levelK1, alarmLow: 20, alarmHigh: 80 },
      { id: 'TR_55_1', value: p.tempFurnaceOut, alarmHigh: 365 },
      { id: 'PRSA_213', value: p.pressureK2, alarmHigh: 1 },
      { id: 'LRCA_604', value: p.levelK2, alarmLow: 20, alarmHigh: 80 },
    ]
    const a = tags.find((x) => x.id === id)
    return { alarm: a ? isAnalogAlarm(a) : false }
  }
  if (node.type === 'valve') {
    return { fillLevel: 0.2 }
  }
  return {}
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
  alarmHighlight = false,
  showControlRing = true,
  onSelect,
  onActivate,
  onHover,
}: Props) {
  const showTrays =
    (selected || hovered) &&
    node.type === 'column' &&
    Boolean(node.meta?.trays)
  const traySuffix = showTrays ? `${node.meta!.trays} тар.` : null
  const rawLines = node.label.split('\n').filter((l) => l.trim().length > 0)
  const lines = traySuffix ? [...rawLines, traySuffix] : rawLines
  const isBackground = node.type === 'group'
  const isAnnotation =
    node.type === 'label' &&
    !isZoneBanner(node.id) &&
    (node.id.startsWith('frac-') ||
      node.id.startsWith('gas-') ||
      node.id.startsWith('reagent-') ||
      node.id.startsWith('UTIL-') ||
      node.id.startsWith('mazut-') ||
      [
        'lin-339',
        'butane',
        'pbf-gfu',
        'to-opu',
        'transfer-steam',
        'desalted-oil',
        'offspec-n10',
        'flare-stack',
        'nekonditsiya',
        'ELOU-2-label',
      ].includes(node.id))
  const overlay = overlayText(node.id, process)
  const controllable = isControllableEquip(node.id)
  const highlightControl = controllable && showControlRing
  const zoneBanner = isZoneBanner(node.id)
  const pad = 3
  const fontSize = zoneBanner
    ? 12
    : isAnnotation
      ? 9
      : node.type === 'label' || node.type === 'signal'
        ? 10
        : node.type === 'column'
          ? 13
          : 11

  const vs = visualState(node, process)
  const alarm = Boolean(vs.alarm || alarmHighlight)

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      className={
        zoneBanner
          ? 'equip-zone-banner'
          : highlightControl
            ? 'equip-controllable'
            : undefined
      }
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onActivate?.(node.id)
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      opacity={
        isBackground && !selected && !hovered
          ? 0.72
          : isAnnotation && !selected && !hovered
            ? 0.78
            : 1
      }
    >
      {alarmHighlight && (
        <rect
          className="equip-alarm-pulse"
          x={-pad - 2}
          y={-pad - 2}
          width={node.w + (pad + 2) * 2}
          height={node.h + (pad + 2) * 2}
          rx={6}
          fill="none"
          stroke="var(--danger)"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
      {highlightControl && (
        <rect
          className="equip-control-ring"
          x={-pad}
          y={-pad}
          width={node.w + pad * 2}
          height={node.h + pad * 2}
          rx={node.type === 'pump' || node.type === 'valve' ? 22 : 6}
          fill="none"
          stroke="var(--success)"
          strokeWidth={1.6}
          strokeDasharray="5 3"
          pointerEvents="none"
        />
      )}
      <EquipmentSymbol
        type={node.type}
        w={node.w}
        h={node.h}
        selected={selected}
        hovered={hovered}
        controllable={highlightControl}
        zoneBanner={zoneBanner}
        clipId={node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}
        fillLevel={vs.fillLevel}
        active={vs.active}
        alarm={alarm}
      />
      {lines.length > 0 && (
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
              ? 'var(--scheme-label)'
              : 'var(--scheme-label-zone)'
            : selected
              ? 'var(--scheme-label-selected)'
              : alarm
                ? 'var(--scheme-label-alarm)'
                : 'var(--scheme-label)'
        }
        fontSize={fontSize}
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontWeight={selected || zoneBanner ? 700 : 600}
        style={{
          textShadow: 'var(--scheme-label-shadow)',
        }}
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
      )}
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
          fill={alarm ? 'var(--scheme-overlay-alarm)' : 'var(--scheme-overlay)'}
          fontSize={9}
          fontFamily="IBM Plex Mono, monospace"
          fontWeight={600}
          pointerEvents="none"
        >
          {overlay}
        </text>
      )}
      <rect x={0} y={0} width={node.w} height={node.h} fill="transparent" />
    </g>
  )
}
