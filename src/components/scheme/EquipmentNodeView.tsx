import type { EquipmentNode } from '../../scheme/types'
import { EquipmentSymbol } from './symbols/EquipmentSymbols'

interface Props {
  node: EquipmentNode
  selected: boolean
  hovered: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

export function EquipmentNodeView({
  node,
  selected,
  hovered,
  onSelect,
  onHover,
}: Props) {
  const lines = node.label.split('\n')
  const isBackground = node.type === 'group'
  const fontSize = node.type === 'label' ? 12 : node.type === 'column' ? 13 : 11

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node.id)
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      opacity={isBackground && !selected && !hovered ? 0.85 : 1}
    >
      <EquipmentSymbol
        type={node.type}
        w={node.w}
        h={node.h}
        selected={selected}
        hovered={hovered}
      />
      <text
        x={node.w / 2}
        y={node.h / 2 - ((lines.length - 1) * fontSize) / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={selected ? '#fff6d6' : '#e8eef4'}
        fontSize={fontSize}
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontWeight={selected ? 700 : 600}
        pointerEvents="none"
      >
        {lines.map((line, i) => (
          <tspan key={i} x={node.w / 2} dy={i === 0 ? 0 : fontSize + 2}>
            {line}
          </tspan>
        ))}
      </text>
      {/* larger hit area */}
      <rect
        x={0}
        y={0}
        width={node.w}
        height={node.h}
        fill="transparent"
      />
    </g>
  )
}
