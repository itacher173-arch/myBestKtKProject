import { isControllableEquip } from '../sim/controllable'
import { useTrainer } from '../sim/TrainerContext'
import './EquipInlineControls.css'

interface Props {
  equipId: string
  compact?: boolean
}

function pumpStatusLabel(s: string) {
  if (s === 'running') return 'В работе'
  if (s === 'starting') return 'Пуск…'
  if (s === 'tripped') return 'Авария'
  return 'Стоп'
}

function valveMotionLabel(s: string) {
  if (s === 'opening') return 'открытие'
  if (s === 'closing') return 'закрытие'
  return 'стоп'
}

export function EquipInlineControls({ equipId, compact }: Props) {
  const {
    state,
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
  } = useTrainer()

  if (!isControllableEquip(equipId)) return null

  const p = state.process
  const disabled = !canControl
  const cls = `inline-ctrl ${compact ? 'compact' : ''}`

  if (equipId === 'N-1' || equipId === 'N-2' || equipId === 'N-3') {
    const id = equipId as 'N-1' | 'N-2' | 'N-3'
    const st =
      id === 'N-1' ? p.pumpN1 : id === 'N-2' ? p.pumpN2 : p.pumpN3
    const running = st === 'running' || st === 'starting'
    const stopped = st === 'stopped' || st === 'tripped'
    return (
      <div className={cls}>
        <div className="inline-ctrl-status">
          {id}: <strong>{pumpStatusLabel(st)}</strong>
          {id === 'N-1' && (
            <>
              {' · '}
              {p.pressureN1.toFixed(1)} кгс/см²
            </>
          )}
          {(id === 'N-2' || id === 'N-3') && (
            <span className="hint-inline"> · подача в печи</span>
          )}
          {!p.powerOk && <span className="warn"> · нет питания</span>}
        </div>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled || running}
            onClick={() => startPump(id)}
          >
            Пуск
          </button>
          <button
            type="button"
            disabled={disabled || stopped}
            onClick={() => stopPump(id)}
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
      <div className={cls}>
        <div className="inline-ctrl-status">
          {equipId}: <strong>{pct.toFixed(0)}%</strong> · привод:{' '}
          {valveMotionLabel(motion)}
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

  if (equipId === 'ELOU-block' || /^E-[1-6]$/.test(equipId)) {
    return (
      <div className={cls}>
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
          <button
            type="button"
            disabled={disabled}
            className={p.washWaterOn ? 'on' : ''}
            onClick={() => setWashWater(!p.washWaterOn)}
          >
            Пром. вода: {p.washWaterOn ? 'Вкл' : 'Выкл'}
          </button>
        </div>
      </div>
    )
  }

  if (equipId === 'E-1-vessel' || equipId === 'E-2-vessel') {
    const level =
      equipId === 'E-1-vessel' ? p.levelWaterE1 : p.levelWaterE2
    const label = equipId === 'E-1-vessel' ? 'E-1' : 'E-2'
    return (
      <div className={cls}>
        <div className="inline-ctrl-status">
          Вода {label}: <strong>{level.toFixed(0)}%</strong>
          {level > 75 ? <span className="warn"> · высоко</span> : null}
        </div>
        <div className="inline-bar" aria-hidden>
          <span style={{ width: `${Math.min(100, level)}%` }} />
        </div>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              drainVesselWater(equipId as 'E-1-vessel' | 'E-2-vessel')
            }
          >
            Дренаж воды
          </button>
        </div>
      </div>
    )
  }

  if (equipId === 'K-1' || equipId === 'K-2') {
    const col = equipId as 'K-1' | 'K-2'
    const level = col === 'K-1' ? p.levelK1 : p.levelK2
    const sp = col === 'K-1' ? p.levelSetpointK1 : p.levelSetpointK2
    return (
      <div className={cls}>
        <div className="inline-ctrl-status">
          {col} уровень: <strong>{level.toFixed(0)}%</strong> · задание{' '}
          <strong>{sp}%</strong>
          {level < 25 ? <span className="warn"> · низко</span> : null}
        </div>
        <label className="inline-slider">
          <span>10%</span>
          <input
            type="range"
            min={10}
            max={90}
            value={sp}
            disabled={disabled}
            onChange={(e) => setLevelSetpoint(col, Number(e.target.value))}
          />
          <span>90%</span>
        </label>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setLevelSetpoint(col, 50)}
          >
            50%
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => protectColumnLevel(col)}
          >
            {col === 'K-1' ? 'Разгрузка / защита' : 'Рефлюкс / разгрузка'}
          </button>
        </div>
      </div>
    )
  }

  if (equipId === 'P-1' || equipId === 'P-2' || equipId === 'P-3') {
    return (
      <div className={cls}>
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
            onClick={() => {
              if (
                p.fuelGasPercent > 0 &&
                !window.confirm('Подтвердите отсечение топливного газа (0%)?')
              ) {
                return
              }
              setFuelGas(0)
            }}
          >
            0%
          </button>
        </div>
      </div>
    )
  }

  if (equipId === 'AVZ-3') {
    return (
      <div className={cls}>
        <div className="inline-ctrl-status">
          АВО АВЗ-3:{' '}
          <strong>{p.avoFanOn ? 'Вентилятор Вкл' : 'Вентилятор Выкл'}</strong>
          {!p.avoFanOn && <span className="warn"> · перегрев риска</span>}
        </div>
        <div className="inline-ctrl-row">
          <button
            type="button"
            disabled={disabled || p.avoFanOn}
            className={p.avoFanOn ? 'on' : ''}
            onClick={() => setAvoFan(true)}
          >
            Вкл
          </button>
          <button
            type="button"
            disabled={disabled || !p.avoFanOn}
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
      </div>
    )
  }

  if (equipId === 'UTIL-block') {
    const rows: {
      key:
        | 'steamOk'
        | 'powerOk'
        | 'coolingWaterOk'
        | 'instrumentAirOk'
        | 'ventOpsOk'
        | 'ventElouOk'
      label: string
      ok: boolean
    }[] = [
      { key: 'steamOk', label: 'Пар', ok: p.steamOk },
      { key: 'powerOk', label: 'Эл.пит.', ok: p.powerOk },
      { key: 'coolingWaterOk', label: 'Обор.вода', ok: p.coolingWaterOk },
      { key: 'instrumentAirOk', label: 'Воздух', ok: p.instrumentAirOk },
      { key: 'ventOpsOk', label: 'Вент.РУ', ok: p.ventOpsOk },
      { key: 'ventElouOk', label: 'Вент.ЭЛОУ', ok: p.ventElouOk },
    ]
    return (
      <div className={cls}>
        <div className="inline-ctrl-status">Утилиты установки</div>
        <div className="inline-ctrl-row wrap">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={disabled}
              className={r.ok ? 'on' : ''}
              onClick={() => setUtility(r.key, !r.ok)}
              title={r.ok ? 'Отключить' : 'Включить'}
            >
              {r.label}: {r.ok ? 'ОК' : 'НЕТ'}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}
