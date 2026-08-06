import type { PipeEdge } from './types'

/** Основные потоки между узлами мнемосхемы (не вся арматура P&ID). */
export const pipes: PipeEdge[] = [
  // Сырьё → Н-1 → подогрев
  {
    id: 'p-parks-n1',
    from: 'parks-55-5',
    to: 'N-1',
    kind: 'oil',
    points: [
      [180, 560],
      [200, 560],
    ],
    label: 'сырая нефть',
  },
  {
    id: 'p-n1-hx',
    from: 'N-1',
    to: 'HX-block-label',
    kind: 'oil',
    points: [
      [272, 556],
      [310, 556],
      [310, 425],
      [470, 425],
    ],
  },
  {
    id: 'p-n1-s1',
    from: 'N-1',
    to: 'HX-stream-1',
    kind: 'oil',
    points: [
      [272, 540],
      [300, 540],
      [300, 315],
      [340, 315],
    ],
  },
  {
    id: 'p-n1-s2',
    from: 'N-1',
    to: 'HX-stream-2',
    kind: 'oil',
    points: [
      [272, 556],
      [320, 556],
      [320, 455],
      [340, 455],
    ],
  },
  {
    id: 'p-n1-s3',
    from: 'N-1',
    to: 'HX-stream-3',
    kind: 'oil',
    points: [
      [272, 572],
      [300, 572],
      [300, 595],
      [340, 595],
    ],
  },

  // Подогрев → ЭЛОУ
  {
    id: 'p-hx-elou',
    from: 'HX-block-label',
    to: 'ELOU-block',
    kind: 'oil',
    points: [
      [590, 425],
      [640, 425],
      [640, 320],
    ],
  },
  {
    id: 'p-s1-e1',
    from: 'HX-stream-1',
    to: 'E-1',
    kind: 'oil',
    points: [
      [450, 315],
      [660, 315],
      [660, 285],
    ],
  },
  {
    id: 'p-s2-e3',
    from: 'HX-stream-2',
    to: 'E-3',
    kind: 'oil',
    points: [
      [450, 455],
      [620, 455],
      [620, 285],
      [750, 285],
    ],
  },
  {
    id: 'p-s3-e5',
    from: 'HX-stream-3',
    to: 'E-5',
    kind: 'oil',
    points: [
      [450, 595],
      [600, 595],
      [600, 285],
      [840, 285],
    ],
  },

  // ЭЛОУ → Е-15 → подогрев обесс. → К-1
  {
    id: 'p-elou-e15',
    from: 'ELOU-block',
    to: 'E-15',
    kind: 'oil',
    points: [
      [930, 320],
      [960, 320],
      [960, 350],
    ],
    label: 'обессол. нефть',
  },
  {
    id: 'p-e15-hx',
    from: 'E-15',
    to: 'HX-desalted',
    kind: 'oil',
    points: [
      [1040, 350],
      [1080, 350],
      [1080, 320],
    ],
  },
  {
    id: 'p-hx-k1',
    from: 'HX-desalted',
    to: 'K-1',
    kind: 'oil',
    points: [
      [1200, 320],
      [1260, 320],
    ],
  },

  // К-1 верх / низ
  {
    id: 'p-k1-e1',
    from: 'K-1',
    to: 'E-1-vessel',
    kind: 'product',
    points: [
      [1305, 200],
      [1305, 160],
      [1380, 160],
      [1380, 225],
    ],
    label: 'верх К-1',
  },
  {
    id: 'p-k1-x1',
    from: 'K-1',
    to: 'X-1',
    kind: 'product',
    points: [
      [1350, 220],
      [1380, 220],
      [1380, 155],
      [1380, 128],
    ],
  },
  {
    id: 'p-e1-n6',
    from: 'E-1-vessel',
    to: 'N-6',
    kind: 'product',
    points: [
      [1415, 270],
      [1415, 300],
    ],
  },
  {
    id: 'p-k1-n2',
    from: 'K-1',
    to: 'N-2',
    kind: 'oil',
    points: [
      [1305, 520],
      [1305, 560],
      [1212, 560],
      [1212, 580],
    ],
    label: 'отбензин. нефть',
  },
  {
    id: 'p-k1-n3',
    from: 'K-1',
    to: 'N-3',
    kind: 'oil',
    points: [
      [1305, 520],
      [1305, 560],
      [1312, 560],
      [1312, 580],
    ],
  },
  {
    id: 'p-n2-p1',
    from: 'N-2',
    to: 'P-1',
    kind: 'oil',
    points: [
      [1212, 644],
      [1212, 700],
    ],
  },
  {
    id: 'p-n2-p2',
    from: 'N-2',
    to: 'P-2',
    kind: 'oil',
    points: [
      [1244, 612],
      [1330, 612],
      [1330, 700],
    ],
  },
  {
    id: 'p-n3-p3',
    from: 'N-3',
    to: 'P-3',
    kind: 'oil',
    points: [
      [1312, 644],
      [1312, 680],
      [1450, 680],
      [1450, 700],
    ],
  },

  // Печи → К-2
  {
    id: 'p-p1-k2',
    from: 'P-1',
    to: 'K-2',
    kind: 'oil',
    points: [
      [1210, 790],
      [1210, 850],
      [1540, 850],
      [1540, 500],
      [1620, 500],
    ],
  },
  {
    id: 'p-p2-k2',
    from: 'P-2',
    to: 'K-2',
    kind: 'oil',
    points: [
      [1330, 790],
      [1330, 830],
      [1560, 830],
      [1560, 480],
      [1620, 480],
    ],
  },
  {
    id: 'p-p3-k2',
    from: 'P-3',
    to: 'K-2',
    kind: 'oil',
    points: [
      [1450, 790],
      [1450, 810],
      [1580, 810],
      [1580, 460],
      [1620, 460],
    ],
  },

  // К-2 контуры
  {
    id: 'p-k2-e2',
    from: 'K-2',
    to: 'E-2-vessel',
    kind: 'product',
    points: [
      [1670, 160],
      [1670, 120],
      [1760, 120],
      [1760, 185],
    ],
    label: 'верх К-2',
  },
  {
    id: 'p-e2-n7',
    from: 'E-2-vessel',
    to: 'N-7',
    kind: 'product',
    points: [
      [1795, 230],
      [1795, 260],
    ],
  },
  {
    id: 'p-n7-a1',
    from: 'N-7',
    to: 'A-1',
    kind: 'product',
    points: [
      [1792, 324],
      [1792, 640],
      [1720, 640],
      [1720, 620],
    ],
    label: 'бензин',
  },
  {
    id: 'p-k2-n12',
    from: 'K-2',
    to: 'N-12',
    kind: 'product',
    points: [
      [1720, 320],
      [1760, 320],
      [1760, 392],
    ],
    label: '1 ц.о.',
  },
  {
    id: 'p-k2-k31',
    from: 'K-2',
    to: 'K-3-1',
    kind: 'product',
    points: [
      [1720, 280],
      [1880, 280],
    ],
    label: 'фр. 140–240',
  },
  {
    id: 'p-k2-k32',
    from: 'K-2',
    to: 'K-3-2',
    kind: 'product',
    points: [
      [1720, 420],
      [1880, 420],
    ],
    label: 'фр. 240–300',
  },
  {
    id: 'p-k2-k33',
    from: 'K-2',
    to: 'K-3-3',
    kind: 'product',
    points: [
      [1720, 560],
      [1880, 560],
    ],
    label: 'фр. 300–350',
  },
  {
    id: 'p-k31-n14',
    from: 'K-3-1',
    to: 'N-14',
    kind: 'product',
    points: [
      [1950, 280],
      [1980, 280],
    ],
  },
  {
    id: 'p-k32-n15',
    from: 'K-3-2',
    to: 'N-15',
    kind: 'product',
    points: [
      [1950, 470],
      [1980, 470],
    ],
  },
  {
    id: 'p-k33-n16',
    from: 'K-3-3',
    to: 'N-16',
    kind: 'product',
    points: [
      [1950, 660],
      [1980, 660],
    ],
  },
  {
    id: 'p-k2-n4',
    from: 'K-2',
    to: 'N-4',
    kind: 'product',
    points: [
      [1670, 560],
      [1670, 650],
      [1760, 650],
    ],
    label: 'мазут',
  },
  {
    id: 'p-k2-n32',
    from: 'K-2',
    to: 'N-32',
    kind: 'product',
    points: [
      [1670, 560],
      [1670, 750],
      [1760, 750],
    ],
  },

  // К-1 / Н-6 → К-4
  {
    id: 'p-n6-k4',
    from: 'N-6',
    to: 'K-4',
    kind: 'product',
    points: [
      [1444, 332],
      [2140, 332],
      [2140, 360],
      [2180, 360],
    ],
    label: 'нестаб. НК-180',
  },
  {
    id: 'p-k4-e3',
    from: 'K-4',
    to: 'E-3-vessel',
    kind: 'product',
    points: [
      [2220, 220],
      [2220, 180],
      [2290, 180],
      [2290, 240],
    ],
  },
  {
    id: 'p-e3-n10',
    from: 'E-3-vessel',
    to: 'N-10',
    kind: 'product',
    points: [
      [2325, 280],
      [2325, 310],
    ],
  },
  {
    id: 'p-n14-k7',
    from: 'N-14',
    to: 'K-7',
    kind: 'product',
    points: [
      [2036, 278],
      [2100, 278],
      [2100, 670],
      [2180, 670],
    ],
  },
  {
    id: 'p-k7-n47',
    from: 'K-7',
    to: 'N-47',
    kind: 'product',
    points: [
      [2260, 670],
      [2290, 670],
      [2290, 652],
    ],
  },

  // Вторичная
  {
    id: 'p-n57-k9',
    from: 'N-57',
    to: 'K-9',
    kind: 'product',
    points: [
      [2524, 552],
      [2560, 552],
      [2560, 400],
      [2580, 400],
    ],
    label: 'сырьё К-9',
  },
  {
    id: 'p-k9-e18',
    from: 'K-9',
    to: 'E-18',
    kind: 'product',
    points: [
      [2625, 180],
      [2625, 155],
      [2700, 155],
    ],
  },
  {
    id: 'p-k10-e17',
    from: 'K-10',
    to: 'E-17',
    kind: 'product',
    points: [
      [2825, 180],
      [2825, 155],
      [2900, 155],
    ],
  },
  {
    id: 'p-k9-k10',
    from: 'K-9',
    to: 'K-10',
    kind: 'product',
    points: [
      [2670, 300],
      [2780, 300],
    ],
    label: 'фр. 62–105',
  },
  {
    id: 'p-k9-p4',
    from: 'K-9',
    to: 'P-4',
    kind: 'oil',
    points: [
      [2625, 540],
      [2625, 665],
      [2660, 665],
    ],
  },
  {
    id: 'p-k10-p4',
    from: 'K-10',
    to: 'P-4',
    kind: 'oil',
    points: [
      [2825, 540],
      [2825, 665],
      [2780, 665],
    ],
  },
  {
    id: 'p-p4-n76',
    from: 'P-4',
    to: 'N-76',
    kind: 'oil',
    points: [
      [2680, 710],
      [2680, 768],
      [2636, 768],
    ],
  },
  {
    id: 'p-p4-n77',
    from: 'P-4',
    to: 'N-77',
    kind: 'oil',
    points: [
      [2760, 710],
      [2760, 768],
      [2800, 768],
    ],
  },
  {
    id: 'p-k10-n58',
    from: 'K-10',
    to: 'N-58',
    kind: 'product',
    points: [
      [2870, 500],
      [2928, 500],
      [2928, 560],
    ],
  },
  {
    id: 'p-k10-x20',
    from: 'K-10',
    to: 'X-20',
    kind: 'product',
    points: [
      [2870, 310],
      [3000, 310],
    ],
  },

  // Steam samples
  {
    id: 'p-steam-k1',
    from: 'P-1',
    to: 'K-1',
    kind: 'steam',
    points: [
      [1210, 700],
      [1140, 700],
      [1140, 500],
      [1260, 500],
    ],
    label: 'пар',
  },
]
