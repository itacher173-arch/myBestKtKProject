import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  VIEWBOX,
  equipment,
  pipes,
  type PipeKind,
} from '../../scheme'
import { EquipmentNodeView } from './EquipmentNodeView'

const PIPE_COLORS: Record<PipeKind, string> = {
  oil: '#c48a3a',
  product: '#4aa3c9',
  steam: '#b8c4ce',
  utility: '#7a8f7a',
}

interface Props {
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function SchemeViewer({ selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [scale, setScale] = useState(0.55)
  const [pan, setPan] = useState({ x: 40, y: 20 })
  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)

  const groups = useMemo(
    () => equipment.filter((e) => e.type === 'group'),
    [],
  )
  const nodes = useMemo(
    () => equipment.filter((e) => e.type !== 'group'),
    [],
  )

  const onWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    setScale((s) => Math.min(2.2, Math.max(0.25, s * delta)))
  }, [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as Element
      // allow drag on background only
      if (target.closest('[data-equip]')) return
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [pan.x, pan.y],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d?.active) return
    setPan({
      x: d.panX + (e.clientX - d.startX),
      y: d.panY + (e.clientY - d.startY),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    if (dragRef.current) dragRef.current.active = false
  }, [])

  return (
    <div
      ref={containerRef}
      className="scheme-viewer"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => onSelect(null)}
    >
      <div
        className="scheme-transform"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        <svg
          width={VIEWBOX.width}
          height={VIEWBOX.height}
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="scheme-svg"
        >
          <defs>
            <marker
              id="arrow-oil"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill={PIPE_COLORS.oil} />
            </marker>
            <marker
              id="arrow-product"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill={PIPE_COLORS.product} />
            </marker>
            <marker
              id="arrow-steam"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill={PIPE_COLORS.steam} />
            </marker>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect
            width={VIEWBOX.width}
            height={VIEWBOX.height}
            fill="#141c24"
          />
          <rect
            width={VIEWBOX.width}
            height={VIEWBOX.height}
            fill="url(#grid)"
          />

          {/* zone separators */}
          {[300, 620, 1040, 1560, 2060, 2440].map((x) => (
            <line
              key={x}
              x1={x}
              y1={70}
              x2={x}
              y2={VIEWBOX.height - 40}
              stroke="rgba(143,163,181,0.18)"
              strokeDasharray="4 8"
            />
          ))}

          <g className="pipes-layer">
            {pipes.map((pipe) => {
              const d = pipe.points
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
                .join(' ')
              const marker =
                pipe.kind === 'oil'
                  ? 'url(#arrow-oil)'
                  : pipe.kind === 'steam'
                    ? 'url(#arrow-steam)'
                    : 'url(#arrow-product)'
              const mid = pipe.points[Math.floor(pipe.points.length / 2)]
              return (
                <g key={pipe.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={PIPE_COLORS[pipe.kind]}
                    strokeWidth={pipe.kind === 'steam' ? 1.5 : 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd={marker}
                    opacity={0.9}
                  />
                  {pipe.label && mid && (
                    <text
                      x={mid[0] + 4}
                      y={mid[1] - 6}
                      fill={PIPE_COLORS[pipe.kind]}
                      fontSize={10}
                      fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                      opacity={0.85}
                    >
                      {pipe.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          <g className="groups-layer">
            {groups.map((node) => (
              <g key={node.id} data-equip={node.id}>
                <EquipmentNodeView
                  node={node}
                  selected={selectedId === node.id}
                  hovered={hoveredId === node.id}
                  onSelect={onSelect}
                  onHover={setHoveredId}
                />
              </g>
            ))}
          </g>

          <g className="nodes-layer">
            {nodes.map((node) => (
              <g key={node.id} data-equip={node.id}>
                <EquipmentNodeView
                  node={node}
                  selected={selectedId === node.id}
                  hovered={hoveredId === node.id}
                  onSelect={onSelect}
                  onHover={setHoveredId}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="scheme-hint">
        Колёсико — масштаб · ЛКМ по фону — перетаскивание · Клик по элементу —
        сведения
      </div>
      <div className="scheme-zoom">
        <button type="button" onClick={() => setScale((s) => Math.min(2.2, s * 1.15))}>
          +
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((s) => Math.max(0.25, s / 1.15))}>
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setScale(0.55)
            setPan({ x: 40, y: 20 })
          }}
        >
          Сброс
        </button>
      </div>
    </div>
  )
}
