import { isControllableEquip } from '../sim/controllable'
import { useTrainer } from '../sim/TrainerContext'
import './EquipInlineControls.css'

interface Props {
  equipId: string
  compact?: boolean
}

export function EquipInlineControls({ equipId, compact }: Props) {
  const {
    state,
    canControl,
    startPumpN1,
    stopPumpN1,
    openValve,
    closeValve,
    stopValve,
    setDemulsifier,
    setElectricField,
    setFuelGas,
  } = useTrainer()

  if (!isControllableEquip(equipId)) return null

  const p = state.process
  const disabled = !canControl

  if (equipId === 'N-1') {
    const running = p.pumpN1 === 'running' || p.pumpN1 === 'starting'
    const stopped = p.pumpN1 === 'stopped' || p.pumpN1 === 'tripped'
    return (
      <div className={`inline-ctrl ${compact ? 'compact' : ''}`}>
        <div className="inline-ctrl-status">
          Н-1:{' '}
          <strong>
            {p.pumpN1 === 'running'
              ? 'В работе'
              : p.pumpN1 === 'starting'
                ? 'Пуск…'
                : p.pumpN1 === 'tripped'
                  ? 'Авария'
                  : 'Стоп'}
          </strong>
          {' · '}
          {p.pressureN1.toFixed(1)} кгс/см²
          {!p.powerOk && <span className="warn"> · нет питания</span>}
        </div>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled || running}
            onClick={startPumpN1}
          >
            Пуск
          </button>
          <button
            type="button"
            disabled={disabled || stopped}
            onClick={stopPumpN1}
          >
            Стоп
          </button>
        </div>
      </div>
    )
  }

  if (equipId === 'L-1' || equipId === 'L-2' || equipId === 'L-3') {
    const pct =
      equipId === 'L-1'
        ? p.valveL1
        : equipId === 'L-2'
          ? p.valveL2
          : p.valveL3
    const motion =
      equipId === 'L-1'
        ? p.valveL1Motion
        : equipId === 'L-2'
          ? p.valveL2Motion
          : p.valveL3Motion
    const id = equipId as 'L-1' | 'L-2' | 'L-3'
    return (
      <div className={`inline-ctrl ${compact ? 'compact' : ''}`}>
        <div className="inline-ctrl-status">
          {equipId}: <strong>{pct.toFixed(0)}%</strong> · привод: {motion}
          {!p.instrumentAirOk && (
            <span className="warn"> · нет воздуха</span>
          )}
        </div>
        <div className="inline-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled || motion === 'opening' || pct >= 99.5}
            onClick={() => openValve(id)}
          >
            Открыть
          </button>
          <button
            type="button"
            disabled={disabled || motion === 'closing' || pct <= 0.5}
            onClick={() => closeValve(id)}
          >
            Закрыть
          </button>
          <button
            type="button"
            disabled={disabled || motion === 'idle'}
            onClick={() => stopValve(id)}
          >
            Стоп
          </button>
        </div>
      </div>
    )
  }

  if (
    equipId === 'ELOU-block' ||
    /^E-[1-6]$/.test(equipId)
  ) {
    return (
      <div className={`inline-ctrl ${compact ? 'compact' : ''}`}>
        <div className="inline-ctrl-status">
          Соли:{' '}
          <strong>
            {p.saltMgL < 10 ? p.saltMgL.toFixed(1) : p.saltMgL.toFixed(0)} мг/л
          </strong>
          {p.saltMgL > 5 ? <span className="warn"> · тревога</span> : ' · норма'}
        </div>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled}
            className={p.demulsifierOn ? 'on' : ''}
            onClick={() => setDemulsifier(!p.demulsifierOn)}
          >
            Деэмульгатор: {p.demulsifierOn ? 'Вкл' : 'Выкл'}
          </button>
          <button
            type="button"
            disabled={disabled}
            className={p.electricFieldOn ? 'on' : ''}
            onClick={() => setElectricField(!p.electricFieldOn)}
          >
            Эл. поле: {p.electricFieldOn ? 'Вкл' : 'Выкл'}
          </button>
        </div>
      </div>
    )
  }

  if (equipId === 'P-1' || equipId === 'P-2' || equipId === 'P-3') {
    return (
      <div className={`inline-ctrl ${compact ? 'compact' : ''}`}>
        <div className="inline-ctrl-status">
          Топливо П-1…П-3: <strong>{p.fuelGasPercent}%</strong> · TR55-1:{' '}
          {p.tempFurnaceOut.toFixed(0)} °C
          {!p.steamOk && <span className="warn"> · нет пара</span>}
          {(p.coilRupture || p.furnaceEsd) && (
            <span className="warn"> · ESD</span>
          )}
        </div>
        <label className="inline-slider">
          <span>0%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={p.fuelGasPercent}
            disabled={disabled || !p.steamOk || p.coilRupture || p.furnaceEsd}
            onChange={(e) => setFuelGas(Number(e.target.value))}
          />
          <span>100%</span>
        </label>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setFuelGas(60)}
          >
            60%
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setFuelGas(40)}
          >
            40%
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setFuelGas(0)}
          >
            0%
          </button>
        </div>
      </div>
    )
  }

  return null
}
