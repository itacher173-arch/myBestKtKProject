import { EQUIPMENT_TYPE_LABELS, equipmentById } from '../scheme'
import { EQUIPMENT_ARTICLES } from '../knowledge/links'
import { isAnalogAlarm } from '../sim/processModel'
import { useTrainer } from '../sim/TrainerContext'
import './ControlPanel.css'

export function ControlPanel() {
  const {
    state,
    analogs,
    closePanel,
    canControl,
    startPump,
    stopPump,
    openValve,
    closeValve,
    stopValve,
    setDemulsifier,
    setElectricField,
    setWashWater,
    setFuelGas,
    setLevelSetpoint,
    drainVesselWater,
    setAvoFan,
    setUtility,
    protectColumnLevel,
    openKnowledge,
  } = useTrainer()

  const panel = state.activePanel
  if (!panel) return null

  const p = state.process
  const node = equipmentById[panel.id]
  const articleId = EQUIPMENT_ARTICLES[panel.id]
  const title =
    panel.type === 'desalter'
      ? 'ЭЛОУ (Э-1…Э-6)'
      : panel.type === 'signal'
        ? node?.label ?? 'Показывающий прибор'
        : panel.type === 'info'
          ? node?.label.replace(/\n/g, ' ') ?? panel.id
          : `${
              panel.type === 'pump'
                ? 'Насос'
                : panel.type === 'valve'
                  ? 'Электрозадвижка'
                  : panel.type === 'furnace'
                    ? 'Печь'
                    : panel.type === 'column'
                      ? 'Колонна'
                      : 'Элемент'
            } ${node?.label.replace(/\n/g, ' ') ?? panel.id}`

  const controllableValve =
    panel.type === 'valve' &&
    (panel.id === 'L-1' || panel.id === 'L-2' || panel.id === 'L-3')
  const controllablePump =
    panel.type === 'pump' &&
    (panel.id === 'N-1' || panel.id === 'N-2' || panel.id === 'N-3')
  const pumpId = controllablePump
    ? (panel.id as 'N-1' | 'N-2' | 'N-3')
    : null
  const pumpState = pumpId
    ? pumpId === 'N-1'
      ? p.pumpN1
      : pumpId === 'N-2'
        ? p.pumpN2
        : p.pumpN3
    : null
  const atmFurnace =
    panel.type === 'furnace' &&
    (panel.id === 'P-1' || panel.id === 'P-2' || panel.id === 'P-3')
  const secondaryFurnace = panel.type === 'furnace' && panel.id === 'P-4'
  const valvePercent =
    panel.id === 'L-1'
      ? p.valveL1
      : panel.id === 'L-2'
        ? p.valveL2
        : panel.id === 'L-3'
          ? p.valveL3
          : null
  const valveMotion =
    panel.id === 'L-1'
      ? p.valveL1Motion
      : panel.id === 'L-2'
        ? p.valveL2Motion
        : panel.id === 'L-3'
          ? p.valveL3Motion
          : null

  return (
    <div className="ctrl-overlay" onClick={closePanel}>
      <div className="ctrl-window" onClick={(e) => e.stopPropagation()}>
        <header className="ctrl-header">
          <h3>{title}</h3>
          <button type="button" className="ctrl-close" onClick={closePanel}>
            ×
          </button>
        </header>

        <div className="ctrl-body">
          {node?.meta?.description && (
            <p className="ctrl-desc">{node.meta.description}</p>
          )}
          {articleId && (
            <button
              type="button"
              className="ctrl-knowledge-btn"
              onClick={() => openKnowledge(articleId)}
            >
              Открыть связанную статью
            </button>
          )}

          {panel.type === 'pump' && controllablePump && pumpId && pumpState && (
            <>
              <p>
                Состояние:{' '}
                <strong>
                  {pumpState === 'running'
                    ? 'В работе'
                    : pumpState === 'starting'
                      ? 'Пуск…'
                      : pumpState === 'tripped'
                        ? 'Аварийный останов'
                        : 'Остановлен'}
                </strong>
              </p>
              {pumpId === 'N-1' && (
                <p>Давление нагнетания: {p.pressureN1.toFixed(1)} кгс/см²</p>
              )}
              {(pumpId === 'N-2' || pumpId === 'N-3') && (
                <p className="hint">
                  Насос подачи в печной тракт (нужен для нагрева П-1…П-3).
                </p>
              )}
              <div className="ctrl-actions">
                <button
                  type="button"
                  disabled={
                    !canControl ||
                    pumpState === 'running' ||
                    pumpState === 'starting'
                  }
                  onClick={() => startPump(pumpId)}
                >
                  Пуск
                </button>
                <button
                  type="button"
                  disabled={
                    !canControl ||
                    pumpState === 'stopped' ||
                    pumpState === 'tripped'
                  }
                  onClick={() => stopPump(pumpId)}
                >
                  Стоп
                </button>
              </div>
            </>
          )}

          {panel.type === 'pump' && !controllablePump && (
            <>
              <p>
                Тип: {EQUIPMENT_TYPE_LABELS.pump}
                {node?.meta?.reserves
                  ? ` · резерв: ${node.meta.reserves.join(', ')}`
                  : ''}
              </p>
              <p className="hint">
                Управление в симуляции: Н-1 (сырьё), Н-2 / Н-3 (подача в печи).
              </p>
            </>
          )}

          {panel.type === 'valve' && controllableValve && (
            <>
              <p>
                Открытие: <strong>{valvePercent?.toFixed(0)}%</strong>
              </p>
              <p>
                Привод:{' '}
                {valveMotion === 'opening'
                  ? 'открытие'
                  : valveMotion === 'closing'
                    ? 'закрытие'
                    : 'стоп'}
              </p>
              <div className="ctrl-actions">
                <button
                  type="button"
                  disabled={
                    !canControl ||
                    valveMotion === 'opening' ||
                    (valvePercent ?? 0) >= 99.5
                  }
                  onClick={() => openValve(panel.id as 'L-1' | 'L-2' | 'L-3')}
                >
                  Открыть
                </button>
                <button
                  type="button"
                  disabled={
                    !canControl ||
                    valveMotion === 'closing' ||
                    (valvePercent ?? 0) <= 0.5
                  }
                  onClick={() => closeValve(panel.id as 'L-1' | 'L-2' | 'L-3')}
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  disabled={!canControl || valveMotion === 'idle'}
                  onClick={() => stopValve(panel.id as 'L-1' | 'L-2' | 'L-3')}
                >
                  Стоп
                </button>
              </div>
            </>
          )}

          {panel.type === 'valve' && !controllableValve && (
            <p className="hint">
              Электрозадвижка отображается на схеме. Управление в сценарии —
              для Л-1, Л-2, Л-3.
            </p>
          )}

          {panel.type === 'desalter' && (
            <>
              <p>
                Соли на выходе:{' '}
                <strong>
                  {p.saltMgL < 10
                    ? p.saltMgL.toFixed(1)
                    : p.saltMgL.toFixed(0)}{' '}
                  мг/л
                </strong>
                {p.saltMgL > 5 ? ' · тревога (>5)' : ' · норма ≤5'}
              </p>
              <p>Температура входа: {p.tempElouIn.toFixed(0)} °C (норма ≤140)</p>
              <p>
                Давление после ЭЛОУ: {p.pressureAfterElou.toFixed(1)} кгс/см²
                (рабочее 4,5–10)
              </p>
              <div className="ctrl-actions">
                <button
                  type="button"
                  disabled={!canControl}
                  className={p.demulsifierOn ? 'on' : ''}
                  onClick={() => setDemulsifier(!p.demulsifierOn)}
                >
                  Деэмульгатор: {p.demulsifierOn ? 'Вкл' : 'Выкл'}
                </button>
                <button
                  type="button"
                  disabled={!canControl}
                  className={p.electricFieldOn ? 'on' : ''}
                  onClick={() => setElectricField(!p.electricFieldOn)}
                >
                  Эл. поле: {p.electricFieldOn ? 'Вкл' : 'Выкл'}
                </button>
                <button
                  type="button"
                  disabled={!canControl}
                  className={p.washWaterOn ? 'on' : ''}
                  onClick={() => setWashWater(!p.washWaterOn)}
                >
                  Пром. вода: {p.washWaterOn ? 'Вкл' : 'Выкл'}
                </button>
              </div>
            </>
          )}

          {panel.type === 'furnace' && atmFurnace && (
            <>
              <p>
                Контур топливного газа печей <strong>П-1…П-3</strong> (нагрев к
                К-2)
              </p>
              <p>Подача топливного газа: {p.fuelGasPercent}%</p>
              <p>
                Температура выхода (TR55-1): {p.tempFurnaceOut.toFixed(0)} °C
                (норма ≤365)
              </p>
              <input
                type="range"
                min={0}
                max={100}
                value={p.fuelGasPercent}
                disabled={!canControl}
                onChange={(e) => setFuelGas(Number(e.target.value))}
              />
              <div className="ctrl-actions">
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={() => setFuelGas(60)}
                >
                  60%
                </button>
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={() => {
                    if (
                      p.fuelGasPercent > 0 &&
                      !window.confirm(
                        'Подтвердите отсечение топливного газа (0%)?',
                      )
                    ) {
                      return
                    }
                    setFuelGas(0)
                  }}
                >
                  0%
                </button>
              </div>
            </>
          )}

          {panel.type === 'furnace' && secondaryFurnace && (
            <>
              <p>
                П-4 — печь рибойлинга вторичного блока (К-9 / К-10), зона 7.
              </p>
              <p className="hint">
                Не входит в атмосферный тракт упражнений. Топливный газ П-1…П-3
                здесь не регулируется.
              </p>
            </>
          )}

          {panel.type === 'furnace' && !atmFurnace && !secondaryFurnace && (
            <p className="hint">Панель печи вне модели текущего сценария.</p>
          )}

          {panel.type === 'column' && (
            <>
              {panel.id === 'K-1' || panel.id === 'K-2' ? (
                <>
                  <p>
                    Уровень куба:{' '}
                    <strong>
                      {(panel.id === 'K-1' ? p.levelK1 : p.levelK2).toFixed(0)}%
                    </strong>
                  </p>
                  <p>
                    Задание:{' '}
                    <strong>
                      {panel.id === 'K-1'
                        ? p.levelSetpointK1
                        : p.levelSetpointK2}
                      %
                    </strong>
                  </p>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    value={
                      panel.id === 'K-1' ? p.levelSetpointK1 : p.levelSetpointK2
                    }
                    disabled={!canControl}
                    onChange={(e) =>
                      setLevelSetpoint(
                        panel.id as 'K-1' | 'K-2',
                        Number(e.target.value),
                      )
                    }
                  />
                  <p>
                    Давление верха (
                    {panel.id === 'K-1' ? 'PRSA204' : 'PRSA213'}):{' '}
                    <strong>
                      {(panel.id === 'K-1' ? p.pressureK1 : p.pressureK2).toFixed(
                        2,
                      )}{' '}
                      кгс/см²
                    </strong>
                  </p>
                  <p className="hint">
                    {panel.id === 'K-1'
                      ? 'Норма верха К-1: 1–4,5 кгс/см²; t низа ≤280 °C; t верха ≤150 °C'
                      : 'Норма верха К-2: 0,2–1 кгс/см²; t низа ≤350 °C; t верха ≤148 °C'}
                  </p>
                  {panel.id === 'K-1' && (
                    <>
                      <p>Питание (TR1K-21): {p.tempK1In.toFixed(0)} °C</p>
                      <p>Температура низа: {p.tempK1Bottom.toFixed(0)} °C</p>
                    </>
                  )}
                  <div className="ctrl-actions">
                    <button
                      type="button"
                      disabled={!canControl}
                      onClick={() =>
                        protectColumnLevel(panel.id as 'K-1' | 'K-2')
                      }
                    >
                      {panel.id === 'K-1'
                        ? 'Разгрузка / защита уровня'
                        : 'Рефлюкс / снижение нагрузки'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {node?.meta?.trays != null && (
                    <p>Число тарелок: {node.meta.trays}</p>
                  )}
                  {node?.meta?.designPressure && (
                    <p>Расч. давление: {node.meta.designPressure}</p>
                  )}
                  {node?.meta?.designTemp && (
                    <p>Расч. температура: {node.meta.designTemp}</p>
                  )}
                  <p className="hint">
                    Динамика уровня в симуляции сейчас для К-1 и К-2.
                  </p>
                </>
              )}
            </>
          )}
          {panel.type === 'signal' && (
            <>
              {analogs
                .filter((a) => a.id === panel.id)
                .map((a) => (
                  <div key={a.id}>
                    <p className="signal-tag">{a.tag}</p>
                    <p>{a.description}</p>
                    <p
                      className={
                        isAnalogAlarm(a) ? 'signal-value alarm' : 'signal-value'
                      }
                    >
                      {a.value.toFixed(1)} {a.unit}
                    </p>
                    <p className="hint">
                      Диапазон {a.min}…{a.max}
                      {a.alarmHigh != null
                        ? ` · тревога ≥ ${a.alarmHigh}`
                        : ''}
                      {a.alarmLow != null ? ` · тревога ≤ ${a.alarmLow}` : ''}
                    </p>
                  </div>
                ))}
              {analogs.every((a) => a.id !== panel.id) && (
                <p className="hint">Нет живого тега для этого прибора.</p>
              )}
            </>
          )}

          {panel.type === 'info' && panel.id === 'UTIL-block' && (
            <>
              <p>Учебный блок утилит (пар, вода, воздух, вентиляция).</p>
              <div className="ctrl-actions">
                {(
                  [
                    ['steamOk', 'Технологический пар', p.steamOk],
                    ['powerOk', 'Электропитание', p.powerOk],
                    ['coolingWaterOk', 'Оборотная вода', p.coolingWaterOk],
                    ['instrumentAirOk', 'Приборный воздух', p.instrumentAirOk],
                    ['ventOpsOk', 'Вентиляция РУ', p.ventOpsOk],
                    ['ventElouOk', 'Вентиляция ЭЛОУ', p.ventElouOk],
                  ] as const
                ).map(([key, label, ok]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!canControl}
                    className={ok ? 'on' : ''}
                    onClick={() => setUtility(key, !ok)}
                  >
                    {label}: {ok ? 'ОК' : 'НЕТ'}
                  </button>
                ))}
              </div>
            </>
          )}

          {panel.type === 'info' &&
            (panel.id === 'E-1-vessel' || panel.id === 'E-2-vessel') && (
              <>
                <p>
                  Уровень воды:{' '}
                  <strong>
                    {(panel.id === 'E-1-vessel'
                      ? p.levelWaterE1
                      : p.levelWaterE2
                    ).toFixed(0)}
                    %
                  </strong>
                </p>
                <div className="ctrl-actions">
                  <button
                    type="button"
                    disabled={!canControl}
                    onClick={() =>
                      drainVesselWater(
                        panel.id as 'E-1-vessel' | 'E-2-vessel',
                      )
                    }
                  >
                    Дренаж воды E-1/E-2
                  </button>
                </div>
              </>
            )}

          {panel.type === 'info' && panel.id === 'AVZ-3' && (
            <>
              <p>
                Вентилятор АВО:{' '}
                <strong>{p.avoFanOn ? 'Включён' : 'Отключён'}</strong>
              </p>
              <div className="ctrl-actions">
                <button
                  type="button"
                  disabled={!canControl || p.avoFanOn}
                  className={p.avoFanOn ? 'on' : ''}
                  onClick={() => setAvoFan(true)}
                >
                  Вкл
                </button>
                <button
                  type="button"
                  disabled={!canControl || !p.avoFanOn}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Подтвердите отключение вентилятора АВО АВЗ-3?',
                      )
                    ) {
                      return
                    }
                    setAvoFan(false)
                  }}
                >
                  Выкл
                </button>
              </div>
            </>
          )}

          {panel.type === 'info' &&
            panel.id !== 'UTIL-block' &&
            panel.id !== 'E-1-vessel' &&
            panel.id !== 'E-2-vessel' &&
            panel.id !== 'AVZ-3' && (
              <>
                <p>
                  Тип:{' '}
                  {EQUIPMENT_TYPE_LABELS[
                    panel.equipType as keyof typeof EQUIPMENT_TYPE_LABELS
                  ] ?? panel.equipType}
                </p>
                {node?.meta?.zone && <p>Зона: {node.meta.zone}</p>}
                {node?.meta?.reserves && (
                  <p>Резерв: {node.meta.reserves.join(', ')}</p>
                )}
                <p className="hint">
                  Панель сведений. Управление доступно для выделенных органов
                  сценария (зелёная обводка).
                </p>
              </>
            )}
        </div>
      </div>
    </div>
  )
}
