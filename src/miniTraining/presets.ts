import {
  createInitialProcess,
  createWarmProcess,
  type ProcessState,
} from '../sim/types'

/** Стартовые пресеты мини-уроков (порт логики AVT_4.0 / commands.start_session). */
export function applyMiniPreset(trainingId: string): ProcessState {
  const warm = { ...createWarmProcess(), running: true, simTimeSec: 0 }
  const cold = { ...createInitialProcess(), running: true, simTimeSec: 0 }

  switch (trainingId) {
    case 'MT-FEED-01':
      return {
        ...cold,
        valveL2: 70,
        valveL3: 70,
        pumpN1: 'stopped',
        pressureN1: 0,
        feedFlow: 0,
      }
    case 'MT-FEED-02':
      return {
        ...warm,
        valveL1: 40,
        pumpN1: 'stopped',
        pressureN1: 0,
        feedFlow: 12,
      }
    case 'MT-ELOU-01':
      return {
        ...warm,
        demulsifierOn: false,
        electricFieldOn: false,
        washWaterOn: false,
        saltMgL: 28,
        waterAfterElou: 0.32,
      }
    case 'MT-ELOU-02':
      return {
        ...warm,
        demulsifierOn: false,
        electricFieldOn: true,
        washWaterOn: false,
        saltMgL: 19,
        waterAfterElou: 0.38,
      }
    case 'MT-E1-01':
      return {
        ...warm,
        coolingWaterOk: false,
        levelWaterE1: 78,
        pressureK1: 4.25,
      }
    case 'MT-K1-01':
      return {
        ...warm,
        coolingWaterOk: false,
        avoFanOn: false,
        fuelGasPercent: 80,
        pressureK1: 4.65,
        tempK1Bottom: 286,
      }
    case 'MT-K1-02':
      return {
        ...warm,
        levelK1: 8,
        levelSetpointK1: 25,
        fuelGasPercent: 72,
        tempFurnaceOut: 382,
      }
    case 'MT-FURN-01':
      return {
        ...warm,
        pumpN2: 'stopped',
        fuelGasPercent: 86,
        tempFurnaceOut: 402,
      }
    case 'MT-K2-01':
      return {
        ...warm,
        coolingWaterOk: false,
        fuelGasPercent: 82,
        pressureK2: 1.28,
      }
    case 'MT-K2-02':
      return {
        ...warm,
        levelK2: 8,
        levelSetpointK2: 22,
        fuelGasPercent: 70,
        pressureK2: 0.9,
      }
    case 'MT-UTIL-01':
      return {
        ...warm,
        instrumentAirOk: false,
        feedFlow: 18,
        pressureN1: 8,
      }
    case 'MT-VENT-01':
      return {
        ...warm,
        ventElouOk: false,
        gasPercent: 24,
      }
    case 'MT-SAFE-01':
      return {
        ...warm,
        coolingWaterOk: false,
        avoFanOn: false,
        fuelGasPercent: 78,
        pressureK1: 4.62,
      }
    default:
      return warm
  }
}
