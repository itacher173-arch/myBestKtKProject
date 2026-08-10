/**
 * Проверка стыковки стрелок труб к границам оборудования.
 * Запуск: npx tsx scripts/verify-pipe-arrows.mts
 */
import { equipmentById, pipes } from '../src/scheme'
import { orientedPipePoints } from '../src/scheme/pipeGeometry'

const TIP_GAP = 3
const TOL = 1.5

function edgeGap(
  pt: [number, number],
  box: { x: number; y: number; w: number; h: number },
): number {
  const cx = Math.max(box.x, Math.min(pt[0], box.x + box.w))
  const cy = Math.max(box.y, Math.min(pt[1], box.y + box.h))
  return Math.hypot(pt[0] - cx, pt[1] - cy)
}

function isDeepInside(
  pt: [number, number],
  box: { x: number; y: number; w: number; h: number },
  pad: number,
): boolean {
  return (
    pt[0] > box.x + pad &&
    pt[0] < box.x + box.w - pad &&
    pt[1] > box.y + pad &&
    pt[1] < box.y + box.h - pad
  )
}

console.log('=== Стыковка стрелок к элементам ===\n')

let fail = 0
for (const pipe of pipes) {
  const from = equipmentById[pipe.from]
  const to = equipmentById[pipe.to]
  if (!from || !to) {
    console.log(`✗ ${pipe.id}: нет узла ${!from ? pipe.from : pipe.to}`)
    fail++
    continue
  }
  const pts = orientedPipePoints(pipe)
  const start = pts[0]
  const end = pts[pts.length - 1]
  const startGap = edgeGap(start, from)
  const endGap = edgeGap(end, to)
  const startBad =
    isDeepInside(start, from, TIP_GAP + 2) ||
    startGap > TIP_GAP + TOL + 2
  const endBad =
    isDeepInside(end, to, TIP_GAP + 2) || endGap > TIP_GAP + TOL + 2
  if (startBad || endBad) {
    fail++
    console.log(
      `✗ ${pipe.id} ${pipe.from}→${pipe.to} startGap=${startGap.toFixed(1)} endGap=${endGap.toFixed(1)} start=${start} end=${end}`,
    )
  }
}

if (fail === 0) {
  console.log(`✓ Все ${pipes.length} труб стыкуются к границам узлов (±${TIP_GAP}px)`)
} else {
  console.log(`\nПроблем: ${fail} / ${pipes.length}`)
}
process.exit(fail === 0 ? 0 : 1)
