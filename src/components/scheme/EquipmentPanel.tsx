import { useTrainer } from '../../sim/TrainerContext'
import { EQUIPMENT_TYPE_LABELS, equipmentById } from '../../scheme'
import { isAnalogAlarm } from '../../sim/processModel'
import { isControllableEquip } from '../../sim/controllable'
import { EquipInlineControls } from '../EquipInlineControls'

export function EquipmentPanel() {
  const { state, analogs, openPanelForEquip, selectEquip } = useTrainer()
  const selectedId = state.selectedEquipId
  const node = selectedId ? equipmentById[selectedId] : null
  const p = state.process
  const controllable = selectedId ? isControllableEquip(selectedId) : false

  const liveBits: string[] = []
  if (selectedId === 'N-1') {
    liveBits.push(
      `Состояние: ${p.pumpN1}`,
      `P: ${p.pressureN1.toFixed(1)} кгс/см²`,
      `Питание: ${p.powerOk ? 'ок' : 'НЕТ'}`,
    )
  }
  if (selectedId === 'L-1') liveBits.push(`Открытие: ${p.valveL1.toFixed(0)}%`)
  if (selectedId === 'L-2') liveBits.push(`Открытие: ${p.valveL2.toFixed(0)}%`)
  if (selectedId === 'L-3') liveBits.push(`Открытие: ${p.valveL3.toFixed(0)}%`)
  if (selectedId === 'K-1') {
    liveBits.push(
      `Уровень: ${p.levelK1.toFixed(0)}%`,
      `P верха: ${p.pressureK1.toFixed(2)} кгс/см²`,
      `T пит.: ${p.tempK1In.toFixed(0)} °C`,
      `E-1/E-2 вода: ${p.levelWaterE1.toFixed(0)}/${p.levelWaterE2.toFixed(0)}%`,
    )
  }
  if (selectedId === 'K-2') {
    liveBits.push(
      `Уровень: ${p.levelK2.toFixed(0)}%`,
      `P верха: ${p.pressureK2.toFixed(2)} кгс/см²`,
      `Рефлюкс: ${p.levelReflux.toFixed(0)}%`,
    )
  }
  if (
    selectedId === 'ELOU-block' ||
    (selectedId != null && /^E-[1-6]$/.test(selectedId))
  ) {
    liveBits.push(
      `Деэмульг.: ${p.demulsifierOn ? 'вкл' : 'выкл'}`,
      `Эл.поле: ${p.electricFieldOn ? 'вкл' : 'выкл'}`,
      `Соли: ${p.saltMgL < 10 ? p.saltMgL.toFixed(1) : p.saltMgL.toFixed(0)} мг/л`,
    )
  }
  if (selectedId === 'P-1' || selectedId === 'P-2' || selectedId === 'P-3') {
    liveBits.push(
      `Топливо П-1…П-3: ${p.fuelGasPercent}%`,
      `T выхода: ${p.tempFurnaceOut.toFixed(0)} °C`,
      `Пар: ${p.steamOk ? 'ок' : 'НЕТ'}`,
    )
  }
  if (selectedId === 'P-4') {
    liveBits.push('Рибойлинг К-9/К-10 · вне сценария')
  }

  const analog = analogs.find((a) => a.id === selectedId)

  return (
    <aside className="equip-panel">
      <h2>{node ? node.label.replace(/\n/g, ' ') : 'Оборудование'}</h2>

      {!node && (
        <>
          <p className="equip-panel-empty">
            Клик по элементу — сведения и управление. Зелёный контур —
            интерактивные узлы (Н-1, Л-1…3, ЭЛОУ, П-1…3). Двойной клик —
            полное окно.
          </p>
          <div className="live-strip">
            <h3>Живые параметры</h3>
            <ul>
              {analogs.map((a) => (
                <li key={a.id} className={isAnalogAlarm(a) ? 'alarm' : ''}>
                  <button type="button" onClick={() => selectEquip(a.id)}>
                    {a.tag}: {a.value.toFixed(1)} {a.unit}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {node && (
        <>
          {controllable && (
            <p className="ctrl-badge">Управление доступно</p>
          )}

          <dl className="equip-meta">
            <div>
              <dt>Тип</dt>
              <dd>{EQUIPMENT_TYPE_LABELS[node.type]}</dd>
            </div>
            <div>
              <dt>Позиция</dt>
              <dd>{node.id}</dd>
            </div>
            {node.meta?.zone && (
              <div>
                <dt>Зона</dt>
                <dd>{node.meta.zone}</dd>
              </div>
            )}
            {node.meta?.description && (
              <div>
                <dt>Описание</dt>
                <dd>{node.meta.description}</dd>
              </div>
            )}
            {node.meta?.trays != null && (
              <div>
                <dt>Тарелки</dt>
                <dd>{node.meta.trays}</dd>
              </div>
            )}
            {node.meta?.reserves && (
              <div>
                <dt>Резерв</dt>
                <dd>{node.meta.reserves.join(', ')}</dd>
              </div>
            )}
          </dl>

          {selectedId && controllable && (
            <EquipInlineControls equipId={selectedId} />
          )}

          {liveBits.length > 0 && !controllable && (
            <div className="live-box">
              {liveBits.map((b) => (
                <div key={b}>{b}</div>
              ))}
            </div>
          )}

          {analog && (
            <div className={`live-box ${isAnalogAlarm(analog) ? 'alarm' : ''}`}>
              <div className="analog-big">
                {analog.value.toFixed(1)} {analog.unit}
              </div>
              <div className="analog-meta">
                {analog.tag} · {analog.description}
                {analog.alarmHigh != null
                  ? ` · тревога ≥ ${analog.alarmHigh}`
                  : ''}
                {analog.alarmLow != null
                  ? ` · тревога ≤ ${analog.alarmLow}`
                  : ''}
              </div>
            </div>
          )}

          {controllable && (
            <button
              type="button"
              className="open-ctrl-btn"
              onClick={() => openPanelForEquip(node.id)}
            >
              Полное окно управления
            </button>
          )}
        </>
      )}

      <div className="journals">
        <h3>Системные события</h3>
        <ul className="log-list">
          {[...state.systemEvents].reverse().slice(0, 12).map((e) => (
            <li key={e.id}>
              <time>{new Date(e.at).toLocaleTimeString()}</time> {e.description}
            </li>
          ))}
        </ul>
        <h3>Журнал действий</h3>
        <ul className="log-list">
          {[...state.actionsLog].reverse().slice(0, 12).map((e) => (
            <li key={e.id}>
              <time>{new Date(e.at).toLocaleTimeString()}</time> {e.description}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
