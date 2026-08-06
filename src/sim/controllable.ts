/** Оборудование с живым управлением в текущей модели сценария. */
export const CONTROLLABLE_EQUIP_IDS = new Set([
  'N-1',
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
  // Атмосферные печи (общий контур топливного газа). П-4 — рибойлинг К-9/К-10, вне модели.
  'P-1',
  'P-2',
  'P-3',
])

export function isControllableEquip(id: string): boolean {
  return CONTROLLABLE_EQUIP_IDS.has(id)
}
