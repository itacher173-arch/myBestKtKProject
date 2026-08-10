import { equipment } from './equipment'
import type { EquipmentNode } from './types'

export interface SchemeZone {
  id: string
  /** Совпадает с meta.zone у оборудования */
  key: string
  title: string
  /** X разделителя слева (совпадает с линиями на схеме) */
  separatorX: number
}

/** Баннеры зон сверху мнемосхемы — навигация по участкам КТС. */
export const SCHEME_ZONES: SchemeZone[] = [
  { id: 'zone-1', key: '1. Сырьё', title: '1. Сырьё', separatorX: 0 },
  { id: 'zone-2', key: '2. Подогрев', title: '2. Подогрев', separatorX: 300 },
  { id: 'zone-3', key: '3. ЭЛОУ', title: '3. ЭЛОУ', separatorX: 620 },
  {
    id: 'zone-4',
    key: '4. Атмосферный',
    title: '4. Атмосферный',
    separatorX: 1040,
  },
  { id: 'zone-gdm', key: '4–5. ГДМ', title: 'ГДМ / К-12', separatorX: 1500 },
  {
    id: 'zone-5',
    key: '5. К-2 / стриппинги',
    title: '5. К-2 / стриппинги',
    separatorX: 1940,
  },
  {
    id: 'zone-6',
    key: '6. Стабилизация',
    title: '6. Стабилизация',
    separatorX: 2460,
  },
  {
    id: 'zone-7',
    key: '7. Вторичная',
    title: '7. Вторичная',
    separatorX: 2980,
  },
]

export const zoneById = Object.fromEntries(
  SCHEME_ZONES.map((z) => [z.id, z]),
) as Record<string, SchemeZone>

export function isZoneBanner(id: string): boolean {
  return id.startsWith('zone-')
}

export function getZoneBounds(zoneKey: string): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  cx: number
  cy: number
} | null {
  const nodes = equipment.filter(
    (e) =>
      e.meta?.zone === zoneKey &&
      e.type !== 'label' &&
      e.type !== 'group',
  )
  if (!nodes.length) {
    const banner = equipment.find(
      (e) => e.type === 'label' && e.meta?.zone === zoneKey,
    )
    if (!banner) return null
    return {
      minX: banner.x,
      minY: banner.y,
      maxX: banner.x + banner.w,
      maxY: banner.y + 400,
      cx: banner.x + banner.w / 2,
      cy: 420,
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.w)
    maxY = Math.max(maxY, n.y + n.h)
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

export function getZoneBanner(id: string): EquipmentNode | undefined {
  return equipment.find((e) => e.id === id && e.type === 'label')
}
