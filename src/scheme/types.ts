export type EquipmentType =
  | 'column'
  | 'pump'
  | 'furnace'
  | 'heatExchanger'
  | 'vessel'
  | 'desalter'
  | 'group'
  | 'label'

export type PipeKind = 'oil' | 'product' | 'steam' | 'utility'

export interface EquipmentMeta {
  description?: string
  trays?: number
  reserves?: string[]
  designPressure?: string
  designTemp?: string
  zone?: string
}

export interface EquipmentNode {
  id: string
  type: EquipmentType
  label: string
  x: number
  y: number
  w: number
  h: number
  meta?: EquipmentMeta
}

export interface PipeEdge {
  id: string
  from: string
  to: string
  kind: PipeKind
  /** Absolute SVG path points as [x,y] polyline */
  points: [number, number][]
  label?: string
}

export const VIEWBOX = { width: 3200, height: 1200 } as const

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  column: 'Колонна',
  pump: 'Насос',
  furnace: 'Печь',
  heatExchanger: 'Теплообменник / холодильник',
  vessel: 'Ёмкость / отстойник',
  desalter: 'Электродегидратор',
  group: 'Блок оборудования',
  label: 'Подпись',
}

export const PIPE_KIND_LABELS: Record<PipeKind, string> = {
  oil: 'Нефть / сырьё',
  product: 'Продукт / фракция',
  steam: 'Пар',
  utility: 'Вспомогательный поток',
}
