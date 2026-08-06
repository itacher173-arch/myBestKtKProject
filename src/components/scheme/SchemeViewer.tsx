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
import {
  SCHEME_ZONES,
  getZoneBounds,
  isZoneBanner,
  zoneById,
} from '../../scheme/zones'
import { useTrainer } from '../../sim/TrainerContext'
import { EquipmentNodeView } from './EquipmentNodeView'

const PIPE_COLORS: Record<PipeKind, string> = {
  oil: '#c48a3a',
  product: '#4aa3c9',
  steam: '#b8c4ce',
  utility: '#7a8f7a',
}

const ZONE_SEPARATORS = [300, 620, 1040, 1500, 1940, 2460, 2980]

export function SchemeViewer() {
  const { state, selectEquip, openPanelForEquip, closePanel } = useTrainer()
  const selectedId = state.selectedEquipId
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null)
  const [scale, setScale] = useState(0.48)
  const [pan, setPan] = useState({ x: 20, y: 10 })
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

  const focusZone = useCallback((zoneId: string) => {
    const zone = zoneById[zoneId]
    const bounds = zone ? getZoneBounds(zone.key) : null
    const el = containerRef.current
    if (!bounds || !el) return

    const rect = el.getBoundingClientRect()
    const nextScale = Math.min(
      0.85,
      Math.max(
        0.42,
        Math.min(
          (rect.width * 0.85) / Math.max(bounds.maxX - bounds.minX, 280),
          (rect.height * 0.75) / Math.max(bounds.maxY - bounds.minY, 280),
        ),
      ),
    )
    setScale(nextScale)
    setPan({
      x: rect.width / 2 - bounds.cx * nextScale,
      y: Math.max(12, rect.height * 0.42 - bounds.cy * nextScale),
    })
    setActiveZoneId(zoneId)
  }, [])

  const handleNodeSelect = useCallback(
    (id: string) => {
      if (isZoneBanner(id)) {
        selectEquip(id)
        closePanel()
        focusZone(id)
        return
      }
      setActiveZoneId(null)
      openPanelForEquip(id)
    },
    [closePanel, focusZone, openPanelForEquip, selectEquip],
  )

  const onSelect = useCallback(
    (id: string | null) => {
      if (!id) {
        selectEquip(null)
        closePanel()
        setActiveZoneId(null)
        return
      }
      handleNodeSelect(id)
    },
    [closePanel, handleNodeSelect, selectEquip],
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

  const activeZone = activeZoneId ? zoneById[activeZoneId] : null
  const activeBand = useMemo(() => {
    if (!activeZone) return null
    const idx = SCHEME_ZONES.findIndex((z) => z.id === activeZone.id)
    const left = activeZone.separatorX
    const right =
      idx >= 0 && idx < SCHEME_ZONES.length - 1
        ? SCHEME_ZONES[idx + 1].separatorX
        : VIEWBOX.width
    return { left, width: right - left }
  }, [activeZone])

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

          <rect width={VIEWBOX.width} height={VIEWBOX.height} fill="#141c24" />
          <rect
            width={VIEWBOX.width}
            height={VIEWBOX.height}
            fill="url(#grid)"
          />

          {activeBand && (
            <rect
              x={activeBand.left}
              y={70}
              width={activeBand.width}
              height={VIEWBOX.height - 110}
              fill="rgba(62, 148, 200, 0.06)"
              stroke="rgba(126, 200, 240, 0.22)"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}

          {ZONE_SEPARATORS.map((x) => (
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
                  process={state.process}
                  onSelect={handleNodeSelect}
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
                  selected={
                    selectedId === node.id || activeZoneId === node.id
                  }
                  hovered={hoveredId === node.id}
                  process={state.process}
                  onSelect={handleNodeSelect}
                  onHover={setHoveredId}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="scheme-hint">
        <span className="scheme-hint-ctrl" aria-hidden />
        Зелёный контур — управление · Клик по зоне сверху — переход к участку ·
        Колёсико — масштаб
      </div>
      <div className="scheme-zoom">
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(2.2, s * 1.15))}
        >
          +
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.25, s / 1.15))}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setScale(0.48)
            setPan({ x: 20, y: 10 })
            setActiveZoneId(null)
            selectEquip(null)
            closePanel()
          }}
        >
          Сброс
        </button>
      </div>
    </div>
  )
}
