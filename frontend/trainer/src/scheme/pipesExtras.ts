import type { PipeEdge } from './types'

/**
 * Только короткие функциональные связи extras.
 * Дальние утилиты намеренно без линий — иначе «спагетти».
 */
export const pipesExtras: PipeEdge[] = [
  {
    id: 'p-e44-flare',
    from: 'E-44',
    to: 'flare-stack',
    kind: 'utility',
    points: [
      [1890, 104],
      [1940, 104],
    ],
  },
  {
    id: 'p-e44k-flare',
    from: 'E-44k',
    to: 'E-44',
    kind: 'utility',
    points: [
      [1450, 135],
      [1450, 70],
      [1855, 70],
      [1855, 110],
    ],
  },
  {
    id: 'p-sm-k12-1',
    from: 'Sm-1k',
    to: 'K-12-1',
    kind: 'product',
    points: [
      [1575, 200],
      [1595, 200],
      [1595, 90],
      [1524, 90],
      [1524, 70],
    ],
  },
  {
    id: 'p-s1k-sm1k',
    from: 'S-1k',
    to: 'Sm-1k',
    kind: 'product',
    points: [
      [1732, 368],
      [1685, 368],
      [1685, 224],
      [1610, 224],
    ],
  },
  {
    id: 'p-k12-1-2',
    from: 'K-12-1',
    to: 'K-12-2',
    kind: 'product',
    points: [
      [1524, 150],
      [1525, 150],
      [1525, 280],
      [1540, 280],
    ],
  },
  {
    id: 'p-t23-n23',
    from: 'T-23',
    to: 'N-23',
    kind: 'utility',
    points: [
      [1815, 644],
      [1815, 568],
      [1676, 568],
    ],
  },
]
