import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  VIEWBOX,
  equipment,
  pipes,
  PIPE_KIND_LABELS,
  type PipeKind,
} from '../../scheme'
import {
  SCHEME_ZONES,
  getZoneBounds,
  isZoneBanner,
  zoneById,
} from '../zones'
import { useTrainer } from '../../simulator/TrainerContext'
import { getUtilityAlarms } from '../../simulator/processModel'
import { highlightEquipIdsForAlarms } from '../../simulator/pazGuards'
import {
  expandMiniFocusPath,
  isPipeOnMiniFocus,
  type MiniFocusPath,
} from '../../training/focusPath'
import {
  arrowHeadPoints,
  orientedPipePoints,
  pipeLabelPos,
} from '../pipeGeometry'
import { EquipmentNodeView } from './EquipmentNodeView'
import { EquipmentSymbolDefs } from './symbols/EquipmentSymbols'

const PIPE_COLORS: Record<PipeKind, string> = {
  oil: '#c48a3a',
  product: '#4aa3c9',
  steam: '#b8c4ce',
  utility: '#7a8f7a',
}

const PIPE_LEGEND: { kind: PipeKind; short: string }[] = [
  { kind: 'oil', short: 'Нефть / сырьё' },
  { kind: 'product', short: 'Продукт / фракция' },
  { kind: 'steam', short: 'Пар' },
  { kind: 'utility', short: 'Вспом. поток' },
]

const ZONE_SEPARATORS = [300, 620, 1040, 1500, 1940, 2460, 2980]

export function SchemeViewer() {
  const {
    state,
    selectEquip,
    openPanelForEquip,
    closePanel,
    activeMiniTraining,
  } = useTrainer()
  const selectedId = state.selectedEquipId
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null)
  const [scale, setScale] = useState(0.48)
  const [pan, setPan] = useState({ x: 20, y: 10 })
  const scaleRef = useRef(scale)
  const panRef = useRef(pan)
  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])
  useEffect(() => {
    panRef.current = pan
  }, [pan])

  const groups = useMemo(
    () => equipment.filter((e) => e.type === 'group'),
    [],
  )
  const nodes = useMemo(
    () => equipment.filter((e) => e.type !== 'group'),
    [],
  )
  const alarmHighlightIds = useMemo(() => {
    const keys = getUtilityAlarms(state.process)
      .filter((a) => a.priority === 1)
      .map((a) => a.key)
    return highlightEquipIdsForAlarms(keys)
  }, [state.process])

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

  useEffect(() => {
    if (!activeMiniTraining) return
    const focused = equipment.filter((node) =>
      activeMiniTraining.equipmentIds.includes(node.id),
    )
    const el = containerRef.current
    if (!focused.length || !el) return
    const minX = Math.min(...focused.map((node) => node.x))
    const minY = Math.min(...focused.map((node) => node.y))
    const maxX = Math.max(...focused.map((node) => node.x + node.w))
    const maxY = Math.max(...focused.map((node) => node.y + node.h))
    const rect = el.getBoundingClientRect()
    const nextScale = Math.min(
      1.3,
      Math.max(
        0.5,
        Math.min(
          (rect.width * 0.62) / Math.max(maxX - minX, 220),
          (rect.height * 0.72) / Math.max(maxY - minY, 220),
        ),
      ),
    )
    setScale(nextScale)
    setPan({
      x: rect.width * 0.65 - ((minX + maxX) / 2) * nextScale,
      y: rect.height * 0.52 - ((minY + maxY) / 2) * nextScale,
    })
  }, [activeMiniTraining])

  const focusPath = useMemo((): MiniFocusPath | null => {
    if (!activeMiniTraining) return null
    return expandMiniFocusPath(activeMiniTraining)
  }, [activeMiniTraining])

  const inMiniFocus = useCallback(
    (id: string) =>
      !activeMiniTraining ||
      Boolean(focusPath?.equipmentIds.has(id)) ||
      activeMiniTraining.zoneIds.includes(id),
    [activeMiniTraining, focusPath],
  )

  const interactiveEquipIds = useMemo(() => {
    if (!activeMiniTraining) return null
    return new Set(activeMiniTraining.equipmentIds)
  }, [activeMiniTraining])

  const showControlFor = useCallback(
    (id: string) =>
      !interactiveEquipIds || interactiveEquipIds.has(id),
    [interactiveEquipIds],
  )

  const pipeInFocus = useCallback(
    (from: string, to: string) => {
      if (!focusPath) return true
      return isPipeOnMiniFocus(from, to, focusPath)
    },
    [focusPath],
  )

  const handleNodeSelect = useCallback(
    (id: string) => {
      if (activeMiniTraining && !inMiniFocus(id)) return
      if (isZoneBanner(id)) {
        selectEquip(id)
        closePanel()
        focusZone(id)
        return
      }
      setActiveZoneId(null)
      closePanel()
      selectEquip(id)
    },
    [activeMiniTraining, closePanel, focusZone, inMiniFocus, selectEquip],
  )

  const handleNodeActivate = useCallback(
    (id: string) => {
      if (isZoneBanner(id)) {
        handleNodeSelect(id)
        return
      }
      setActiveZoneId(null)
      openPanelForEquip(id)
    },
    [handleNodeSelect, openPanelForEquip],
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

  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const s = scaleRef.current
    const p = panRef.current
    const next = Math.min(2.2, Math.max(0.25, s * factor))
    if (next === s) return
    const ratio = next / s
    // Точка под курсором остаётся на месте: pan' = m - (m - pan) * (s'/s)
    setScale(next)
    setPan({
      x: mx - (mx - p.x) * ratio,
      y: my - (my - p.y) * ratio,
    })
  }, [])

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      zoomAt(factor, e.clientX, e.clientY)
    },
    [zoomAt],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as Element
      if (target.closest('[data-equip], .scheme-zoom, .scheme-footer, .scheme-hint, button')) return
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
    <div className="scheme-viewer-shell">
      <div
        ref={containerRef}
        className="scheme-viewer"
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
            <EquipmentSymbolDefs />
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="var(--scheme-grid)"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect width={VIEWBOX.width} height={VIEWBOX.height} fill="var(--scheme-canvas)" />
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
              fill="var(--scheme-zone)"
              stroke="var(--scheme-zone-stroke)"
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
              stroke="var(--scheme-sep)"
              strokeDasharray="4 8"
            />
          ))}

          <g className="pipes-layer">
            {pipes.map((pipe) => {
              const focused = pipeInFocus(pipe.from, pipe.to)
              const points = orientedPipePoints(pipe)
              const arrow = focused ? arrowHeadPoints(points) : null
              const drawPts = arrow?.line ?? points
              const d = drawPts
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
                .join(' ')
              const color = PIPE_COLORS[pipe.kind]
              return (
                <g key={pipe.id} opacity={focused ? 0.9 : 0.12}>
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={pipe.kind === 'steam' ? 1.5 : 2.5}
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                  />
                </g>
              )
            })}
          </g>

          <g className="groups-layer">
            {groups.map((node) => (
              <g
                key={node.id}
                data-equip={node.id}
                opacity={inMiniFocus(node.id) ? 1 : 0.12}
                pointerEvents={inMiniFocus(node.id) ? 'auto' : 'none'}
              >
                <EquipmentNodeView
                  node={node}
                  selected={selectedId === node.id}
                  hovered={hoveredId === node.id}
                  process={state.process}
                  alarmHighlight={alarmHighlightIds.has(node.id)}
                  showControlRing={showControlFor(node.id)}
                  onSelect={handleNodeSelect}
                  onActivate={handleNodeActivate}
                  onHover={setHoveredId}
                />
              </g>
            ))}
          </g>

          <g className="nodes-layer">
            {nodes.map((node) => (
              <g
                key={node.id}
                data-equip={node.id}
                opacity={inMiniFocus(node.id) ? 1 : 0.12}
                pointerEvents={inMiniFocus(node.id) ? 'auto' : 'none'}
              >
                <EquipmentNodeView
                  node={node}
                  selected={
                    selectedId === node.id || activeZoneId === node.id
                  }
                  hovered={hoveredId === node.id}
                  process={state.process}
                  alarmHighlight={alarmHighlightIds.has(node.id)}
                  showControlRing={showControlFor(node.id)}
                  onSelect={handleNodeSelect}
                  onActivate={handleNodeActivate}
                  onHover={setHoveredId}
                />
              </g>
            ))}
          </g>

          {/* Наконечники поверх узлов — стыкуются к границе приёмника */}
          <g className="pipe-arrows-layer" pointerEvents="none">
            {pipes.map((pipe) => {
              if (!pipeInFocus(pipe.from, pipe.to)) return null
              const points = orientedPipePoints(pipe)
              const arrow = arrowHeadPoints(points)
              if (!arrow) return null
              return (
                <polygon
                  key={`arr-${pipe.id}`}
                  points={arrow.tip}
                  fill={PIPE_COLORS[pipe.kind]}
                  stroke="none"
                  opacity={0.95}
                />
              )
            })}
          </g>

          {/* Подписи труб поверх оборудования — не уходят «под» узлы */}
          <g className="pipe-labels-layer" pointerEvents="none">
            {pipes.map((pipe) => {
              if (!pipe.label || !pipeInFocus(pipe.from, pipe.to)) return null
              const points = orientedPipePoints(pipe)
              const pos = pipeLabelPos(points)
              if (!pos) return null
              return (
                <text
                  key={`lbl-${pipe.id}`}
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={PIPE_COLORS[pipe.kind]}
                  fontSize={10}
                  fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                  opacity={0.9}
                  style={{ paintOrder: 'stroke', stroke: 'var(--scheme-canvas)', strokeWidth: 3 }}
                >
                  {pipe.label}
                </text>
              )
            })}
          </g>
        </svg>
      </div>
      </div>

      <div className="scheme-footer">
        <div className="scheme-hint">
          <span className="scheme-hint-ctrl" aria-hidden />
          Зелёный контур — управление · Клик — выбор · Двойной клик — полное окно
          · Зоны сверху — переход · Колёсико — масштаб
        </div>
        <div className="scheme-pipe-legend" aria-label="Цвета трубопроводов">
          {PIPE_LEGEND.map(({ kind, short }) => (
            <span key={kind} className="scheme-pipe-legend-item" title={PIPE_KIND_LABELS[kind]}>
              <span
                className="scheme-pipe-legend-swatch"
                style={{ background: PIPE_COLORS[kind] }}
                aria-hidden
              />
              {short}
            </span>
          ))}
        </div>
      </div>
      <div className="scheme-zoom">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            const el = containerRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            zoomAt(1.15, rect.left + rect.width / 2, rect.top + rect.height / 2)
          }}
        >
          +
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            const el = containerRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            zoomAt(1 / 1.15, rect.left + rect.width / 2, rect.top + rect.height / 2)
          }}
        >
          −
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
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
