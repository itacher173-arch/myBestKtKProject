import {
  EQUIPMENT_TYPE_LABELS,
  equipmentById,
} from '../../scheme'

interface Props {
  selectedId: string | null
}

export function EquipmentPanel({ selectedId }: Props) {
  const node = selectedId ? equipmentById[selectedId] : null

  if (!node) {
    return (
      <aside className="equip-panel">
        <h2>Оборудование</h2>
        <p className="equip-panel-empty">
          Выберите элемент на мнемосхеме, чтобы увидеть сведения. Управление
          (пуск/стоп, задвижки) будет добавлено на следующем этапе.
        </p>
        <div className="legend">
          <h3>Легенда</h3>
          <ul>
            <li>
              <span className="swatch oil" /> Нефть / сырьё
            </li>
            <li>
              <span className="swatch product" /> Продукт / фракция
            </li>
            <li>
              <span className="swatch steam" /> Пар
            </li>
          </ul>
        </div>
      </aside>
    )
  }

  const meta = node.meta

  return (
    <aside className="equip-panel">
      <h2>{node.label.replace(/\n/g, ' ')}</h2>
      <dl className="equip-meta">
        <div>
          <dt>Тип</dt>
          <dd>{EQUIPMENT_TYPE_LABELS[node.type]}</dd>
        </div>
        <div>
          <dt>Позиция</dt>
          <dd>{node.id}</dd>
        </div>
        {meta?.zone && (
          <div>
            <dt>Зона</dt>
            <dd>{meta.zone}</dd>
          </div>
        )}
        {meta?.description && (
          <div>
            <dt>Описание</dt>
            <dd>{meta.description}</dd>
          </div>
        )}
        {meta?.trays != null && (
          <div>
            <dt>Тарелки</dt>
            <dd>{meta.trays}</dd>
          </div>
        )}
        {meta?.reserves && meta.reserves.length > 0 && (
          <div>
            <dt>Резерв</dt>
            <dd>{meta.reserves.join(', ')}</dd>
          </div>
        )}
        {meta?.designPressure && (
          <div>
            <dt>Расч. давление</dt>
            <dd>{meta.designPressure}</dd>
          </div>
        )}
        {meta?.designTemp && (
          <div>
            <dt>Расч. температура</dt>
            <dd>{meta.designTemp}</dd>
          </div>
        )}
      </dl>
      <div className="equip-future">
        <strong>Взаимодействие</strong>
        <p>Панель управления элементом — на следующем этапе.</p>
      </div>
    </aside>
  )
}
