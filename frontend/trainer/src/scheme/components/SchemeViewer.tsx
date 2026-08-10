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
  equipmentById,
  pipes,
  type PipeEdge,
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
import { EquipmentNodeView } from './EquipmentNodeView'
import { EquipmentSymbolDefs } from './symbols/EquipmentSymbols'

const PIPE_COLORS: Record<PipeKind, string> = {
  oil: '#c48a3a',
  product: '#4aa3c9',
  steam: '#b8c4ce',
  utility: '#7a8f7a',
}

const ZONE_SEPARATORS = [300, 620, 1040, 1500, 1940, 2460, 2980]

function equipCenter(id: string): [number, number] | null {
  const eq = equipmentById[id]
  if (!eq) return null
  return [eq.x + eq.w / 2, eq.y + eq.h / 2]
}

/** Направление polyline от `from` к `to`, чтобы markerEnd смотрел на приёмник. */
function orientedPipePoints(pipe: PipeEdge): [number, number][] {
  const pts = pipe.points
  if (pts.length < 2) return pts
  const from = equipCenter(pipe.from)
  const to = equipCenter(pipe.to)
  if (!from || !to) return pts

  const dist2 = (a: [number, number], b: [number, number]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
  const first = pts[0]
  const last = pts[pts.length - 1]
  const forward =
    dist2(first, from) + dist2(last, to) <=
    dist2(last, from) + dist2(first, to)
  return sanitizePipePoints(forward ? pts : [...pts].reverse())
}

/** Ортогональный snap + достаточная длина последнего сегмента под стрелку. */
function sanitizePipePoints(pts: [number, number][]): [number, number][] {
  if (pts.length < 2) return pts
  const out: [number, number][] = pts.map(([x, y]) => [x, y])

  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]
    const cur = out[i]
    const dx = cur[0] - prev[0]
    const dy = cur[1] - prev[1]
    if (Math.abs(dx) <= Math.abs(dy)) cur[0] = prev[0]
    else cur[1] = prev[1]
  }

  // убрать совпадающие точки
  const cleaned: [number, number][] = [out[0]]
  for (let i = 1; i < out.length; i++) {
    const prev = cleaned[cleaned.length - 1]
    if (out[i][0] !== prev[0] || out[i][1] !== prev[1]) cleaned.push(out[i])
  }
  if (cleaned.length < 2) return pts

  const minTip = 18
  const a = cleaned[cleaned.length - 2]
  const b = cleaned[cleaned.length - 1]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len > 0.01 && len < minTip) {
    const s = minTip / len
    cleaned[cleaned.length - 1] = [a[0] + dx * s, a[1] + dy * s]
  }

  // целые координаты — без субпиксельного «перекоса» стрелок
  return cleaned.map(([x, y]) => [Math.round(x), Math.round(y)])
}

const ARROW_LEN = 11
const ARROW_HALF = 4

/** Наконечник стрелки как polygon — не ломается от CSS-scale родителя. */
function arrowHeadPoints(
  points: [number, number][],
): { line: [number, number][]; tip: string } | null {
  if (points.length < 2) return null
  const line = points.map(([x, y]) => [x, y] as [number, number])
  const a = line[line.length - 2]
  const b = line[line.length - 1]
  let dx = b[0] - a[0]
  let dy = b[1] - a[1]
  // строго ортогональный наконечник
  if (Math.abs(dx) >= Math.abs(dy)) {
    dy = 0
    dx = dx === 0 ? 1 : dx
  } else {
    dx = 0
    dy = dy === 0 ? 1 : dy
  }
  const len = Math.hypot(dx, dy)
  if (len < 0.01) return null
  const ux = dx / len
  const uy = dy / len
  const tipLen = ARROW_LEN
  line[line.length - 1] = [
    Math.round(b[0] - ux * (tipLen - 1)),
    Math.round(b[1] - uy * (tipLen - 1)),
  ]
  const baseX = b[0] - ux * tipLen
  const baseY = b[1] - uy * tipLen
  const p1x = Math.round(baseX - uy * ARROW_HALF)
  const p1y = Math.round(baseY + ux * ARROW_HALF)
  const p2x = Math.round(baseX + uy * ARROW_HALF)
  const p2y = Math.round(baseY - ux * ARROW_HALF)
  return {
    line,
    tip: `${b[0]},${b[1]} ${p1x},${p1y} ${p2x},${p2y}`,
  }
}

/** Подпись трубы — сбоку от сегмента, не поверх оборудования. */
function pipeLabelPos(
  points: [number, number][],
): { x: number; y: number } | null {
  if (points.length < 2) return null
  // на самом длинном сегменте
  let best = 0
  let bestLen = -1
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(
      points[i + 1][0] - points[i][0],
      points[i + 1][1] - points[i][1],
    )
    if (len > bestLen) {
      bestLen = len
      best = i
    }
  }
  const a = points[best]
  const b = points[best + 1]
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])
  return horiz
    ? { x: mx, y: my - 10 }
    : { x: mx + 8, y: my }
}

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
      if (target.closest('[data-equip], .scheme-zoom, .scheme-hint, button')) return
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
                  {arrow && (
                    <polygon points={arrow.tip} fill={color} stroke="none" />
                  )}
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

      <div className="scheme-hint">
        <span className="scheme-hint-ctrl" aria-hidden />
        Зелёный контур — управление · Клик — выбор · Двойной клик — полное окно
        · Зоны сверху — переход · Колёсико — масштаб
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
