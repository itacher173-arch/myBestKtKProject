/** Оборудование с живым управлением в модели сценария. */
export const CONTROLLABLE_EQUIP_IDS = new Set([
  'N-1',
  'N-2',
  'N-3',
  'L-1',
  'L-2',
  'L-3',
  'ELOU-block',
  'E-1',
  'E-2',
  'E-3',
  'E-4',
  'E-5',
  'E-6',
  'E-1-vessel',
  'E-2-vessel',
  'K-1',
  'K-2',
  'P-1',
  'P-2',
  'P-3',
  'AVZ-3',
  'UTIL-block',
])

export function isControllableEquip(id: string): boolean {
  return CONTROLLABLE_EQUIP_IDS.has(id)
}

export function needsCriticalConfirm(action: string): boolean {
  return (
    action === 'pump-start' ||
    action === 'esd' ||
    action === 'safe-shutdown' ||
    action === 'utility-cut'
  )
}
