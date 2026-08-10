import { equipmentById } from '../../scheme'
import { isControllableEquip } from '../controllable'
import { useTrainer } from '../TrainerContext'
import { EquipInlineControls } from './EquipInlineControls'
import './SchemeQuickBar.css'

/** Быстрое управление выбранным элементом поверх схемы. */
export function SchemeQuickBar() {
  const { state, openPanelForEquip, closePanel, selectEquip } = useTrainer()
  const id = state.selectedEquipId
  if (!id || !isControllableEquip(id)) return null
  if (id.startsWith('zone-')) return null

  const node = equipmentById[id]
  if (!node) return null

  return (
    <div className="scheme-quickbar" onClick={(e) => e.stopPropagation()}>
      <header className="scheme-quickbar-head">
        <div>
          <strong>{node.label.replace(/\n/g, ' ')}</strong>
          <span>{node.id}</span>
        </div>
        <div className="scheme-quickbar-actions">
          <button type="button" onClick={() => openPanelForEquip(id)}>
            Полная панель
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              closePanel()
              selectEquip(null)
            }}
          >
            ×
          </button>
        </div>
      </header>
      <EquipInlineControls equipId={id} compact />
    </div>
  )
}
