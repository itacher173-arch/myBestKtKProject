import { pipes } from '../scheme'
import type { MiniTraining } from './catalog'

/** Неориентированный граф труб: id → соседи */
function buildPipeGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    if (!graph.has(a)) graph.set(a, [])
    if (!graph.has(b)) graph.set(b, [])
    graph.get(a)!.push(b)
    graph.get(b)!.push(a)
  }
  for (const pipe of pipes) {
    link(pipe.from, pipe.to)
  }
  return graph
}

const PIPE_GRAPH = buildPipeGraph()

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Кратчайший путь между двумя узлами (BFS). */
function shortestPath(from: string, to: string): string[] | null {
  if (from === to) return [from]
  if (!PIPE_GRAPH.has(from) || !PIPE_GRAPH.has(to)) return null

  const queue = [from]
  const prev = new Map<string, string | null>([[from, null]])
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of PIPE_GRAPH.get(cur) ?? []) {
      if (prev.has(next)) continue
      prev.set(next, cur)
      if (next === to) {
        const path = [to]
        let step: string | null = to
        while (step) {
          const p: string | null | undefined = prev.get(step)
          if (p == null) break
          path.push(p)
          step = p
        }
        path.reverse()
        return path
      }
      queue.push(next)
    }
  }
  return null
}

export type MiniFocusPath = {
  equipmentIds: Set<string>
  pipeEdges: Set<string>
}

/**
 * Семена урока + все узлы и рёбра на кратчайших путях между ними.
 * Промежуточные аппараты остаются видимыми, стрелки на пути — подсвечены.
 */
export function expandMiniFocusPath(training: MiniTraining): MiniFocusPath {
  const seeds = [...new Set(training.equipmentIds)]
  const equipmentIds = new Set(seeds)
  const pipeEdges = new Set<string>()

  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const path = shortestPath(seeds[i], seeds[j])
      if (!path || path.length < 2) continue
      for (const id of path) equipmentIds.add(id)
      for (let k = 0; k < path.length - 1; k++) {
        pipeEdges.add(edgeKey(path[k], path[k + 1]))
      }
    }
  }

  return { equipmentIds, pipeEdges }
}

/** Совместимость: только набор узлов фокуса. */
export function expandMiniFocusEquipment(
  training: MiniTraining,
): Set<string> {
  return expandMiniFocusPath(training).equipmentIds
}

/** Труба на рабочем пути урока. */
export function isPipeOnMiniFocus(
  from: string,
  to: string,
  focus: MiniFocusPath | Set<string>,
): boolean {
  if (focus instanceof Set) {
    return focus.has(from) && focus.has(to)
  }
  return focus.pipeEdges.has(edgeKey(from, to))
}
