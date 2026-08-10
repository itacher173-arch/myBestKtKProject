import { equipmentById } from './equipment'
import type { PipeEdge } from './types'

type Rect = { x: number; y: number; w: number; h: number }

export function equipCenter(id: string): [number, number] | null {
  const eq = equipmentById[id]
  if (!eq) return null
  return [eq.x + eq.w / 2, eq.y + eq.h / 2]
}

/** Ближайшая точка на границе прямоугольника (снаружи на `gap`). */
export function pointOnRectBorder(
  px: number,
  py: number,
  box: Rect,
  gap: number,
): [number, number] {
  const left = box.x - gap
  const right = box.x + box.w + gap
  const top = box.y - gap
  const bottom = box.y + box.h + gap
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const dx = px - cx
  const dy = py - cy
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return [Math.round(right), Math.round(cy)]
  }
  const hx = (right - left) / 2
  const hy = (bottom - top) / 2
  const sx = Math.abs(dx) / hx
  const sy = Math.abs(dy) / hy
  if (sx > sy) {
    return [Math.round(dx > 0 ? right : left), Math.round(cy + dy / sx)]
  }
  return [Math.round(cx + dx / sy), Math.round(dy > 0 ? bottom : top)]
}

/**
 * Пересечение луча `from → toward` с внешней границей box (±gap).
 * Если луч не попадает — стыкуем к ближайшей стороне.
 */
export function rayHitRectBorder(
  from: [number, number],
  toward: [number, number],
  box: Rect,
  gap: number,
): [number, number] {
  const left = box.x - gap
  const right = box.x + box.w + gap
  const top = box.y - gap
  const bottom = box.y + box.h + gap
  let dx = toward[0] - from[0]
  let dy = toward[1] - from[1]
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return pointOnRectBorder(from[0], from[1], box, gap)
  }
  // ортогональный луч (как трубы на схеме)
  if (Math.abs(dx) >= Math.abs(dy)) {
    dy = 0
    dx = dx === 0 ? 1 : Math.sign(dx)
  } else {
    dx = 0
    dy = dy === 0 ? 1 : Math.sign(dy)
  }

  const hits: [number, number, number][] = []
  if (dx !== 0) {
    for (const x of [left, right]) {
      const t = (x - from[0]) / dx
      if (t <= 0.01) continue
      const y = from[1]
      if (y >= top - 0.5 && y <= bottom + 0.5) {
        hits.push([t, x, Math.max(top, Math.min(bottom, y))])
      }
    }
  }
  if (dy !== 0) {
    for (const y of [top, bottom]) {
      const t = (y - from[1]) / dy
      if (t <= 0.01) continue
      const x = from[0]
      if (x >= left - 0.5 && x <= right + 0.5) {
        hits.push([t, Math.max(left, Math.min(right, x)), y])
      }
    }
  }
  if (hits.length) {
    hits.sort((a, b) => a[0] - b[0])
    return [Math.round(hits[0][1]), Math.round(hits[0][2])]
  }
  return pointOnRectBorder(from[0], from[1], box, gap)
}

function edgeGap(pt: [number, number], box: Rect): number {
  const cx = Math.max(box.x, Math.min(pt[0], box.x + box.w))
  const cy = Math.max(box.y, Math.min(pt[1], box.y + box.h))
  return Math.hypot(pt[0] - cx, pt[1] - cy)
}

function isInside(pt: [number, number], box: Rect, pad = 0): boolean {
  return (
    pt[0] >= box.x - pad &&
    pt[0] <= box.x + box.w + pad &&
    pt[1] >= box.y - pad &&
    pt[1] <= box.y + box.h + pad
  )
}

/** Ортогональный snap, без удлинения конца. */
export function sanitizePipePoints(
  pts: [number, number][],
): [number, number][] {
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

  const cleaned: [number, number][] = [out[0]]
  for (let i = 1; i < out.length; i++) {
    const prev = cleaned[cleaned.length - 1]
    if (out[i][0] !== prev[0] || out[i][1] !== prev[1]) cleaned.push(out[i])
  }
  if (cleaned.length < 2) return pts
  return cleaned.map(([x, y]) => [Math.round(x), Math.round(y)])
}

/** Если последний сегмент короткий — отодвигаем предпоследнюю точку (не заходя в from). */
export function ensureTipLength(
  pts: [number, number][],
  fromId?: string,
): [number, number][] {
  if (pts.length < 2) return pts
  const out = pts.map(([x, y]) => [x, y] as [number, number])
  const minTip = 18
  const a = out[out.length - 2]
  const b = out[out.length - 1]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len > 0.01 && len < minTip) {
    const s = minTip / len
    const candidate: [number, number] = [
      Math.round(b[0] - dx * s),
      Math.round(b[1] - dy * s),
    ]
    const fromEq = fromId ? equipmentById[fromId] : undefined
    // на коротких связях не вталкиваем опору обратно в источник
    if (fromEq && isInside(candidate, fromEq, 2)) {
      return out
    }
    out[out.length - 2] = candidate
  }
  return out
}

/** Стыкует конец полилинии к границе приёмника; старт — к источнику. */
export function dockPipeToEquipment(
  pts: [number, number][],
  fromId: string,
  toId: string,
): [number, number][] {
  const fromEq = equipmentById[fromId]
  const toEq = equipmentById[toId]
  if (!fromEq || !toEq || pts.length < 2) return pts

  const out = pts.map(([x, y]) => [x, y] as [number, number])
  const tipGap = 3

  {
    let prev = out[out.length - 2]
    let tip = out[out.length - 1]
    if (isInside(prev, toEq, tipGap + 1)) {
      for (let i = out.length - 3; i >= 0; i--) {
        if (!isInside(out[i], toEq, tipGap + 1)) {
          out.splice(i + 1, out.length - i - 1, tip)
          break
        }
      }
      prev = out[out.length - 2]
      tip = out[out.length - 1]
    }
    const aim =
      edgeGap(tip, toEq) > 14 || isInside(tip, toEq, -2)
        ? ([toEq.x + toEq.w / 2, toEq.y + toEq.h / 2] as [number, number])
        : tip
    out[out.length - 1] = rayHitRectBorder(prev, aim, toEq, tipGap)
  }

  {
    let tip = out[0]
    let next = out[1]
    if (isInside(next, fromEq, tipGap + 1)) {
      for (let i = 2; i < out.length; i++) {
        if (!isInside(out[i], fromEq, tipGap + 1)) {
          out.splice(0, i, tip)
          break
        }
      }
      tip = out[0]
      next = out[1]
    }
    const aim =
      edgeGap(tip, fromEq) > 14 || isInside(tip, fromEq, -2)
        ? ([
            fromEq.x + fromEq.w / 2,
            fromEq.y + fromEq.h / 2,
          ] as [number, number])
        : tip
    out[0] = rayHitRectBorder(next, aim, fromEq, tipGap)
  }

  return out
}

/** Направление polyline от `from` к `to` + стыковка к границам узлов. */
export function orientedPipePoints(pipe: PipeEdge): [number, number][] {
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
  const oriented = sanitizePipePoints(forward ? pts : [...pts].reverse())
  return ensureTipLength(
    dockPipeToEquipment(oriented, pipe.from, pipe.to),
    pipe.from,
  )
}

export const ARROW_LEN = 11
export const ARROW_HALF = 4

/** Наконечник стрелки как polygon — не ломается от CSS-scale родителя. */
export function arrowHeadPoints(
  points: [number, number][],
): { line: [number, number][]; tip: string } | null {
  if (points.length < 2) return null
  const line = points.map(([x, y]) => [x, y] as [number, number])
  const a = line[line.length - 2]
  const b = line[line.length - 1]
  let dx = b[0] - a[0]
  let dy = b[1] - a[1]
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
  const tipLen = Math.min(ARROW_LEN, Math.max(6, len * 0.55))
  line[line.length - 1] = [
    Math.round(b[0] - ux * (tipLen - 1)),
    Math.round(b[1] - uy * (tipLen - 1)),
  ]
  const baseX = b[0] - ux * tipLen
  const baseY = b[1] - uy * tipLen
  const half = Math.min(ARROW_HALF, tipLen * 0.4)
  const p1x = Math.round(baseX - uy * half)
  const p1y = Math.round(baseY + ux * half)
  const p2x = Math.round(baseX + uy * half)
  const p2y = Math.round(baseY - ux * half)
  return {
    line,
    tip: `${b[0]},${b[1]} ${p1x},${p1y} ${p2x},${p2y}`,
  }
}

/** Подпись трубы — сбоку от сегмента, не поверх оборудования. */
export function pipeLabelPos(
  points: [number, number][],
): { x: number; y: number } | null {
  if (points.length < 2) return null
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
  return horiz ? { x: mx, y: my - 10 } : { x: mx + 8, y: my }
}
