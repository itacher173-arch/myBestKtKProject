import type { PipeEdge } from './types'

/**
 * Только функциональные связи extras.
 * Подписи фракций/газа — без линий (иначе схема превращается в «спагетти»).
 */
export const pipesExtras: PipeEdge[] = [
  {
    id: 'p-util-steam-elou',
    from: 'UTIL-block',
    to: 'ELOU-block',
    kind: 'steam',
    points: [
      [140, 115],
      [400, 115],
      [400, 320],
      [640, 320],
    ],
    label: 'пар',
  },
  {
    id: 'p-p5-util',
    from: 'P-5',
    to: 'UTIL-block',
    kind: 'steam',
    points: [
      [218, 960],
      [218, 150],
      [140, 150],
      [140, 115],
    ],
    label: 'пар 10 ати',
  },
  {
    id: 'p-river-x18',
    from: 'UTIL-river',
    to: 'X-18',
    kind: 'utility',
    points: [
      [150, 995],
      [220, 995],
      [220, 225],
      [280, 225],
    ],
    label: 'речная вода',
  },
  {
    id: 'p-reagent-elou',
    from: 'reagent-panel',
    to: 'ELOU-block',
    kind: 'utility',
    points: [
      [790, 700],
      [790, 480],
    ],
    label: 'реагенты',
  },
  {
    id: 'p-k1-e44',
    from: 'K-1',
    to: 'E-44',
    kind: 'utility',
    points: [
      [1350, 200],
      [1820, 200],
      [1820, 110],
    ],
    label: 'некондиция',
  },
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
      [1820, 135],
      [1820, 110],
    ],
  },
  {
    id: 'p-sm-k12-1',
    from: 'Sm-1k',
    to: 'K-12-1',
    kind: 'product',
    points: [
      [1575, 200],
      [1575, 110],
      [1492, 110],
    ],
  },
  {
    id: 'p-k12-1-2',
    from: 'K-12-1',
    to: 'K-12-2',
    kind: 'product',
    points: [
      [1492, 150],
      [1492, 280],
      [1572, 280],
    ],
  },
  {
    id: 'p-river-t23',
    from: 'UTIL-river',
    to: 'T-23',
    kind: 'utility',
    points: [
      [150, 995],
      [1780, 995],
      [1780, 644],
    ],
    label: 'вода в Т-23',
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
