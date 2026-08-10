import type { PipeEdge } from './types'
import { pipesExtras } from './pipesExtras'

/** Основные потоки между узлами мнемосхемы (не вся арматура P&ID). */
export const pipes: PipeEdge[] = [
  // Сырьё → Н-1 → один представительный поток подогрева → ЭЛОУ → Е-15 → К-1
  {
    id: 'p-parks-n1',
    from: 'parks-55-5',
    to: 'N-1',
    kind: 'oil',
    points: [
      [150, 600],
      [230, 600],
    ],
    label: 'сырая нефть',
  },
  {
    id: 'p-n1-s2',
    from: 'N-1',
    to: 'HX-stream-2',
    kind: 'oil',
    points: [
      [272, 596],
      [320, 596],
      [320, 475],
      [340, 475],
    ],
    label: 'на подогрев',
  },
  {
    id: 'p-s2-e3',
    from: 'HX-stream-2',
    to: 'E-3',
    kind: 'oil',
    points: [
      [450, 475],
      [620, 475],
      [620, 350],
      [750, 350],
    ],
  },
  {
    id: 'p-elou-e15',
    from: 'E-3',
    to: 'E-15',
    kind: 'oil',
    points: [
      [820, 350],
      [940, 350],
      [940, 370],
      [958, 370],
    ],
  },
  {
    id: 'p-e15-hx',
    from: 'E-15',
    to: 'HX-desalted',
    kind: 'oil',
    points: [
      [1042, 370],
      [1060, 370],
      [1060, 340],
      [1078, 340],
    ],
  },
  {
    id: 'p-hx-k1',
    from: 'HX-desalted',
    to: 'K-1',
    kind: 'oil',
    points: [
      [1200, 340],
      [1260, 340],
    ],
  },

  // К-1 верх / низ
  {
    id: 'p-k1-e1',
    from: 'K-1',
    to: 'E-1-vessel',
    kind: 'product',
    points: [
      [1305, 220],
      [1305, 180],
      [1380, 180],
      [1380, 245],
    ],
    label: 'верх К-1',
  },
  {
    id: 'p-k1-x1',
    from: 'K-1',
    to: 'X-1',
    kind: 'product',
    points: [
      [1260, 240],
      [1225, 240],
      [1225, 132],
      [1170, 132],
    ],
  },
  {
    id: 'p-k1-e44k',
    from: 'K-1',
    to: 'E-44k',
    kind: 'utility',
    points: [
      [1350, 220],
      [1365, 220],
      [1365, 135],
      [1415, 135],
      [1415, 170],
    ],
  },
  {
    id: 'p-e1-n6',
    from: 'E-1-vessel',
    to: 'N-6',
    kind: 'product',
    points: [
      [1415, 290],
      [1415, 320],
    ],
  },
  {
    id: 'p-n6-n6k',
    from: 'N-6',
    to: 'N-6K',
    kind: 'product',
    points: [
      [1444, 352],
      [1460, 352],
      [1460, 400],
    ],
  },
  {
    id: 'p-k1-n2',
    from: 'K-1',
    to: 'N-2',
    kind: 'oil',
    points: [
      [1305, 540],
      [1305, 580],
      [1212, 580],
      [1212, 600],
    ],
    label: 'отбензин. нефть',
  },
  {
    id: 'p-n2-p1',
    from: 'N-2',
    to: 'P-1',
    kind: 'oil',
    points: [
      [1212, 664],
      [1212, 740],
    ],
  },

  // Печной тракт → К-2 (обход ХВ-31к справа)
  {
    id: 'p-p1-k2',
    from: 'P-1',
    to: 'K-2',
    kind: 'oil',
    points: [
      [1210, 830],
      [1210, 880],
      [1955, 880],
      [1955, 520],
      [1980, 520],
    ],
    label: 'в К-2',
  },

  // ГДМ / К-12 — обход К-1 снизу (коридор y=545, отдельно от НК-180)
  {
    id: 'p-hx-k12',
    from: 'HX-desalted',
    to: 'K-12-2',
    kind: 'oil',
    points: [
      [1200, 370],
      [1235, 370],
      [1235, 545],
      [1525, 545],
      [1525, 340],
      [1540, 340],
    ],
  },
  {
    id: 'p-k12-2-3',
    from: 'K-12-2',
    to: 'K-12-3',
    kind: 'product',
    points: [
      [1572, 400],
      [1572, 420],
    ],
  },
  {
    id: 'p-k12-3-4',
    from: 'K-12-3',
    to: 'K-12-4',
    kind: 'product',
    points: [
      [1572, 540],
      [1572, 560],
    ],
  },
  {
    id: 'p-k12-n68',
    from: 'K-12-4',
    to: 'N-68',
    kind: 'product',
    points: [
      [1604, 610],
      [1620, 610],
      [1620, 620],
    ],
  },
  {
    id: 'p-k12-s1',
    from: 'K-12-2',
    to: 'S-1k',
    kind: 'product',
    points: [
      [1604, 340],
      [1700, 340],
      [1700, 368],
    ],
  },

  // К-2 контуры
  {
    id: 'p-k2-e2',
    from: 'K-2',
    to: 'E-2-vessel',
    kind: 'product',
    points: [
      [2030, 180],
      [2030, 140],
      [2120, 140],
      [2120, 185],
    ],
    label: 'верх К-2',
  },
  {
    id: 'p-e2-x2',
    from: 'E-2-vessel',
    to: 'X-2',
    kind: 'product',
    points: [
      [2155, 140],
      [2155, 104],
    ],
  },
  {
    id: 'p-e2-n7',
    from: 'E-2-vessel',
    to: 'N-7',
    kind: 'product',
    points: [
      [2155, 230],
      [2155, 260],
    ],
  },
  {
    id: 'p-n7-a1',
    from: 'N-7',
    to: 'A-1',
    kind: 'product',
    points: [
      [2152, 324],
      [2195, 324],
      [2195, 710],
      [2035, 710],
      [2035, 696],
    ],
    label: 'бензин',
  },
  {
    id: 'p-a1-a21',
    from: 'A-1',
    to: 'A-2-1',
    kind: 'product',
    points: [
      [2005, 696],
      [2005, 720],
    ],
  },
  {
    id: 'p-a21-a22',
    from: 'A-2-1',
    to: 'A-2-2',
    kind: 'product',
    points: [
      [2060, 776],
      [2060, 970],
      [2615, 970],
      [2615, 928],
    ],
  },
  {
    id: 'p-k2-n12',
    from: 'K-2',
    to: 'N-12',
    kind: 'product',
    points: [
      [2080, 392],
      [2120, 392],
    ],
    label: '1 ц.о.',
  },
  {
    id: 'p-k2-n13',
    from: 'K-2',
    to: 'N-13',
    kind: 'product',
    points: [
      [2080, 430],
      [2228, 430],
      [2228, 416],
    ],
    label: '2 ц.о.',
  },
  {
    id: 'p-k2-n17',
    from: 'K-2',
    to: 'N-17',
    kind: 'product',
    points: [
      [2080, 468],
      [2200, 468],
    ],
    label: '3 ц.о.',
  },
  {
    id: 'p-k2-k31',
    from: 'K-2',
    to: 'K-3-1',
    kind: 'product',
    points: [
      [2080, 250],
      [2195, 250],
      [2195, 280],
      [2300, 280],
    ],
    label: 'фр. 140–240',
  },
  {
    id: 'p-k2-k32',
    from: 'K-2',
    to: 'K-3-2',
    kind: 'product',
    points: [
      [2080, 420],
      [2300, 420],
    ],
    label: 'фр. 240–300',
  },
  {
    id: 'p-k2-k33',
    from: 'K-2',
    to: 'K-3-3',
    kind: 'product',
    points: [
      [2080, 575],
      [2290, 575],
      [2290, 580],
      [2300, 580],
    ],
    label: 'фр. 300–350',
  },
  {
    id: 'p-k31-n14',
    from: 'K-3-1',
    to: 'N-14',
    kind: 'product',
    points: [
      [2370, 280],
      [2400, 280],
    ],
  },
  {
    id: 'p-k32-n15',
    from: 'K-3-2',
    to: 'N-15',
    kind: 'product',
    points: [
      [2370, 470],
      [2400, 470],
    ],
  },
  {
    id: 'p-k33-n16',
    from: 'K-3-3',
    to: 'N-16',
    kind: 'product',
    points: [
      [2370, 660],
      [2400, 660],
    ],
  },
  {
    id: 'p-k2-n4',
    from: 'K-2',
    to: 'N-4',
    kind: 'product',
    points: [
      [2030, 580],
      [2030, 635],
      [2120, 635],
      [2120, 640],
    ],
    label: 'мазут',
  },
  {
    id: 'p-k2-n32',
    from: 'K-2',
    to: 'N-32',
    kind: 'product',
    points: [
      [2030, 580],
      [2065, 580],
      [2065, 772],
      [2120, 772],
    ],
  },

  // Н-6 → К-4: вниз мимо К-1 (коридор y=590), слева от печей, снизу к К-4
  {
    id: 'p-n6-k4',
    from: 'N-6',
    to: 'K-4',
    kind: 'product',
    points: [
      [1412, 384],
      [1412, 590],
      [1140, 590],
      [1140, 990],
      [2460, 990],
      [2460, 360],
      [2580, 360],
    ],
    label: 'нестаб. НК-180',
  },
  {
    id: 'p-k4-e3',
    from: 'K-4',
    to: 'E-3-vessel',
    kind: 'product',
    points: [
      [2630, 220],
      [2630, 180],
      [2690, 180],
      [2690, 240],
    ],
  },
  {
    id: 'p-k4-e1k',
    from: 'K-4',
    to: 'E-1K',
    kind: 'product',
    points: [
      [2610, 220],
      [2610, 135],
      [2690, 135],
    ],
  },
  {
    id: 'p-e3-n10',
    from: 'E-3-vessel',
    to: 'N-10',
    kind: 'product',
    points: [
      [2725, 280],
      [2725, 310],
    ],
  },
  {
    id: 'p-n14-k7',
    from: 'N-14',
    to: 'K-7',
    kind: 'product',
    points: [
      [2456, 278],
      [2485, 278],
      [2485, 670],
      [2580, 670],
    ],
  },
  {
    id: 'p-k7-n47',
    from: 'K-7',
    to: 'N-47',
    kind: 'product',
    points: [
      [2660, 670],
      [2690, 670],
      [2690, 652],
    ],
  },
  {
    id: 'p-n47-n78',
    from: 'N-47',
    to: 'N-78',
    kind: 'product',
    points: [
      [2722, 684],
      [2722, 720],
    ],
  },
  {
    id: 'p-k4-x4',
    from: 'K-4',
    to: 'X-4',
    kind: 'product',
    points: [
      [2580, 260],
      [2545, 260],
      [2545, 168],
    ],
  },

  // Вторичная
  {
    id: 'p-n57-k9',
    from: 'N-57',
    to: 'K-9',
    kind: 'product',
    points: [
      [2984, 552],
      [3000, 552],
      [3000, 400],
      [3020, 400],
    ],
    label: 'сырьё К-9',
  },
  {
    id: 'p-k9-e18',
    from: 'K-9',
    to: 'E-18',
    kind: 'product',
    points: [
      [3065, 180],
      [3065, 135],
      [3140, 135],
    ],
  },
  {
    id: 'p-k10-e17',
    from: 'K-10',
    to: 'E-17',
    kind: 'product',
    points: [
      [3265, 180],
      [3265, 135],
      [3320, 135],
    ],
  },
  {
    id: 'p-k9-k10',
    from: 'K-9',
    to: 'K-10',
    kind: 'product',
    points: [
      [3110, 300],
      [3220, 300],
    ],
    label: 'фр. 62–105',
  },
  {
    id: 'p-k9-p4',
    from: 'K-9',
    to: 'P-4',
    kind: 'oil',
    points: [
      [3065, 540],
      [3065, 665],
      [3100, 665],
    ],
  },
  {
    id: 'p-k10-p4',
    from: 'K-10',
    to: 'P-4',
    kind: 'oil',
    points: [
      [3265, 540],
      [3265, 665],
      [3220, 665],
    ],
  },
  {
    id: 'p-p4-n76',
    from: 'P-4',
    to: 'N-76',
    kind: 'oil',
    points: [
      [3120, 710],
      [3120, 768],
      [3076, 768],
    ],
  },
  {
    id: 'p-p4-n77',
    from: 'P-4',
    to: 'N-77',
    kind: 'oil',
    points: [
      [3200, 710],
      [3200, 768],
      [3240, 768],
    ],
  },
  {
    id: 'p-k10-n58',
    from: 'K-10',
    to: 'N-58',
    kind: 'product',
    points: [
      [3310, 500],
      [3348, 500],
      [3348, 560],
    ],
  },
  {
    id: 'p-k9-x20',
    from: 'K-9',
    to: 'X-20',
    kind: 'product',
    points: [
      [3110, 304],
      [3140, 304],
    ],
  },
  {
    id: 'p-k10-x22',
    from: 'K-10',
    to: 'X-22',
    kind: 'product',
    points: [
      [3310, 244],
      [3360, 244],
    ],
  },
  {
    id: 'p-a22-a3',
    from: 'A-2-2',
    to: 'A-3',
    kind: 'product',
    points: [
      [2650, 928],
      [2660, 928],
    ],
  },
  {
    id: 'p-a3-a4',
    from: 'A-3',
    to: 'A-4',
    kind: 'product',
    points: [
      [2724, 928],
      [2740, 928],
    ],
  },
  {
    id: 'p-a4-a5',
    from: 'A-4',
    to: 'A-5',
    kind: 'product',
    points: [
      [2804, 928],
      [2820, 928],
    ],
  },

  ...pipesExtras,
]
