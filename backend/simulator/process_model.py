"""Process simulation tick — faithful port of frontend/trainer/src/simulator/processModel.ts."""

from __future__ import annotations

import copy
import math
from typing import Any

MODEL_VERSION = "processModel-1.2"

ProcessState = dict[str, Any]


def clamp(v: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, v))


def approach(current: float, target: float, rate_per_sec: float, dt: float) -> float:
    step = rate_per_sec * dt
    if abs(target - current) <= step:
        return target
    return current + math.copysign(step, target - current)


def create_initial_process() -> ProcessState:
    """Match createInitialProcess() from frontend/trainer/src/simulator/types.ts."""
    return {
        "valveL1": 0,
        "valveL2": 0,
        "valveL3": 0,
        "valveL1Motion": "idle",
        "valveL2Motion": "idle",
        "valveL3Motion": "idle",
        "pumpN1": "stopped",
        "pumpN2": "stopped",
        "pumpN3": "stopped",
        "demulsifierOn": False,
        "electricFieldOn": False,
        "washWaterOn": False,
        "fuelGasPercent": 0,
        "levelK1": 45,
        "levelK2": 45,
        "levelSetpointK1": 50,
        "levelSetpointK2": 50,
        "avoFanOn": True,
        "pressureN1": 0,
        "tempElouIn": 25,
        "saltMgL": 50,
        "waterAfterElou": 0.4,
        "pressureAfterElou": 0,
        "tempK1In": 25,
        "tempK1Bottom": 25,
        "pressureK1": 0.6,
        "tempFurnaceOut": 25,
        "pressureK2": 0.25,
        "gasPercent": 4,
        "feedFlow": 0,
        "running": False,
        "simTimeSec": 0,
        "steamOk": True,
        "powerOk": True,
        "opsPowerOk": True,
        "opsPowerOnBattery": False,
        "batteryMinutesLeft": 30,
        "coolingWaterOk": True,
        "instrumentAirOk": True,
        "ventOpsOk": True,
        "ventElouOk": True,
        "h2GasOk": True,
        "levelWaterE1": 40,
        "levelWaterE2": 40,
        "levelReflux": 50,
        "coilRupture": False,
        "pumpLeak": False,
        "furnaceEsd": False,
        "safeShutdownInitiated": False,
    }


def create_warm_process() -> ProcessState:
    """Match createWarmProcess() — normal mode for fault scenarios."""
    p = create_initial_process()
    p.update(
        {
            "running": True,
            "valveL1": 100,
            "valveL2": 70,
            "valveL3": 70,
            "pumpN1": "running",
            "pumpN2": "running",
            "pumpN3": "running",
            "demulsifierOn": True,
            "electricFieldOn": True,
            "washWaterOn": True,
            "fuelGasPercent": 60,
            "pressureN1": 17.3,
            "feedFlow": 113,
            "tempElouIn": 113,
            "saltMgL": 3,
            "waterAfterElou": 0.1,
            "pressureAfterElou": 7,
            "tempK1In": 135,
            "tempK1Bottom": 175,
            "pressureK1": 1.45,
            "tempFurnaceOut": 308,
            "pressureK2": 0.52,
            "gasPercent": 4,
            "levelK1": 50,
            "levelK2": 50,
            "levelSetpointK1": 50,
            "levelSetpointK2": 50,
            "avoFanOn": True,
            "levelWaterE1": 55,
            "levelWaterE2": 52,
            "levelReflux": 65,
        }
    )
    return p


def tick_process(state: ProcessState, dt: float) -> ProcessState:
    """
    Faithful port of tickProcess(p, dtSec).

    Chain: feed → ELOU → K-1 → N-2/N-3 → furnaces → K-2,
    with utilities, AVO, reflux and LIC level control.
    """
    if not state.get("running"):
        return state

    next_p = copy.copy(state)
    next_p["simTimeSec"] = float(state.get("simTimeSec", 0)) + dt

    # ——— SC-04: operator battery ———
    if next_p.get("opsPowerOnBattery") and not next_p.get("opsPowerOk"):
        next_p["batteryMinutesLeft"] = max(
            0.0, float(next_p.get("batteryMinutesLeft", 0)) - dt / 60.0
        )

    air_ok = bool(next_p.get("instrumentAirOk"))
    power_ok = bool(next_p.get("powerOk"))
    steam_ok = bool(next_p.get("steamOk"))

    # Valve actuators ~12–15 s full stroke (no air → stop)
    valve_step = 7.5 * dt if air_ok else 0.0
    for key in ("L1", "L2", "L3"):
        motion_key = f"valve{key}Motion"
        val_key = f"valve{key}"
        if not air_ok:
            next_p[motion_key] = "idle"
            continue
        motion = next_p.get(motion_key)
        if motion == "opening":
            next_p[val_key] = clamp(float(next_p.get(val_key, 0)) + valve_step, 0, 100)
            if next_p[val_key] >= 100:
                next_p[motion_key] = "idle"
        elif motion == "closing":
            next_p[val_key] = clamp(float(next_p.get(val_key, 0)) - valve_step, 0, 100)
            if next_p[val_key] <= 0:
                next_p[motion_key] = "idle"

    # Power loss → trip pumps
    if not power_ok:
        for pump_key in ("pumpN1", "pumpN2", "pumpN3"):
            if next_p.get(pump_key) in ("running", "starting"):
                next_p[pump_key] = "tripped"

    # ——— Feed pump N-1: flow and head ———
    l1 = float(next_p.get("valveL1", 0)) / 100.0
    leak_factor = 0.65 if next_p.get("pumpLeak") else 1.0
    flow_target = 0.0
    p_n1_target = 0.0

    pump_n1 = next_p.get("pumpN1")
    if pump_n1 == "starting" and power_ok:
        p_n1_target = 6 + 4 * l1
        flow_target = 15 * l1 * leak_factor
    elif pump_n1 == "running" and power_ok:
        if l1 < 0.03:
            p_n1_target = 22.5 * leak_factor
            flow_target = 0.0
        else:
            flow_target = (105 * l1 + 8) * leak_factor
            p_n1_target = (19.5 - 2.2 * l1) * leak_factor
    else:
        flow_target = 0.0
        p_n1_target = 0.0

    if not air_ok and flow_target > 0:
        flow_target *= 0.18
        p_n1_target *= 0.55

    next_p["feedFlow"] = approach(float(next_p.get("feedFlow", 0)), flow_target, 28, dt)
    next_p["pressureN1"] = approach(
        float(next_p.get("pressureN1", 0)), p_n1_target, 5.5, dt
    )

    f = float(next_p["feedFlow"])
    has_feed = f > 4

    # ——— ELOU inlet temperature ———
    preheat_duty = (
        0.35 * clamp((float(next_p.get("tempK1Bottom", 0)) - 40) / 140, 0, 1)
        + 0.45 * clamp((float(next_p.get("tempFurnaceOut", 0)) - 50) / 280, 0, 1)
        + 0.2 * clamp(f / 100, 0, 1)
    )
    t_elou_target = 22.0
    if has_feed:
        t_elou_target = 48 + 62 * preheat_duty + f * 0.05
        if not next_p.get("coolingWaterOk"):
            t_elou_target += 8
    next_p["tempElouIn"] = approach(
        float(next_p.get("tempElouIn", 0)),
        clamp(t_elou_target, 20, 138),
        3.2,
        dt,
    )

    # Salts
    salt_target = 180.0 if has_feed else 45.0
    if has_feed:
        dem = bool(next_p.get("demulsifierOn"))
        field = bool(next_p.get("electricFieldOn"))
        wash = bool(next_p.get("washWaterOn"))
        overload = clamp((f - 95) / 80, 0, 1)
        if dem and field and wash:
            salt_target = 2.6 + overload * 1.8
        elif dem and field:
            salt_target = 18 + overload * 12
        elif dem and wash:
            salt_target = 48 + overload * 20
        elif field and wash:
            salt_target = 60 + overload * 25
        elif dem or field or wash:
            salt_target = 130 + overload * 40
        else:
            salt_target = 850
    next_p["saltMgL"] = approach(float(next_p.get("saltMgL", 0)), salt_target, 18, dt)

    water_target = 0.55 if has_feed else 0.2
    if has_feed:
        dem = bool(next_p.get("demulsifierOn"))
        field = bool(next_p.get("electricFieldOn"))
        wash = bool(next_p.get("washWaterOn"))
        if dem and field and wash:
            water_target = 0.09
        elif dem and field:
            water_target = 0.22
        elif dem or field or wash:
            water_target = 0.35
        else:
            water_target = 0.7
    next_p["waterAfterElou"] = approach(
        float(next_p.get("waterAfterElou", 0)), water_target, 0.04, dt
    )

    gas_target = 4.0 if next_p.get("ventElouOk") else 28.0
    next_p["gasPercent"] = approach(
        float(next_p.get("gasPercent", 0)), gas_target, 1.2, dt
    )

    p_elou_target = 0.0
    if has_feed and next_p.get("pumpN1") == "running":
        p_elou_target = clamp(
            2.2 + f * 0.042 - (0.8 if next_p.get("pumpLeak") else 0),
            1.5,
            9.5,
        )
    next_p["pressureAfterElou"] = approach(
        float(next_p.get("pressureAfterElou", 0)), p_elou_target, 1.4, dt
    )

    # Water separators
    lw1 = float(next_p.get("levelWaterE1", 0))
    lw2 = float(next_p.get("levelWaterE2", 0))
    if lw1 > 82 or lw2 > 82:
        if lw1 > 82:
            next_p["levelWaterE1"] = clamp(lw1 + 0.4 * dt, 0, 98)
        if lw2 > 82:
            next_p["levelWaterE2"] = clamp(lw2 + 0.4 * dt, 0, 98)
    elif next_p.get("washWaterOn") and has_feed:
        next_p["levelWaterE1"] = approach(lw1, 58, 0.12, dt)
        next_p["levelWaterE2"] = approach(lw2, 55, 0.1, dt)
    elif has_feed:
        next_p["levelWaterE1"] = approach(lw1, 40, 0.4, dt)
        next_p["levelWaterE2"] = approach(lw2, 40, 0.4, dt)

    # ——— K-1 feed temperature ———
    t_k1_in_target = 22.0
    if has_feed:
        t_k1_in_target = (
            float(next_p["tempElouIn"])
            + 6
            + 18 * clamp((float(next_p.get("tempFurnaceOut", 0)) - 80) / 250, 0, 1)
        )
    next_p["tempK1In"] = approach(
        float(next_p.get("tempK1In", 0)),
        clamp(t_k1_in_target, 20, 290),
        2.8,
        dt,
    )

    # ——— Furnace charge via N-2/N-3 ———
    pumps_furnace = int(next_p.get("pumpN2") == "running" and power_ok) + int(
        next_p.get("pumpN3") == "running" and power_ok
    )
    level_feed_factor = clamp((float(next_p.get("levelK1", 0)) - 8) / 40, 0, 1.15)
    if pumps_furnace > 0 and has_feed:
        furnace_charge = (
            (38 + f * 0.22)
            * (1.05 if pumps_furnace == 2 else 0.78)
            * level_feed_factor
        )
    else:
        furnace_charge = 0.0

    burners_ok = (
        steam_ok
        and not next_p.get("coilRupture")
        and not next_p.get("furnaceEsd")
        and power_ok
        and pumps_furnace > 0
    )
    fuel = float(next_p.get("fuelGasPercent", 0))
    furnace_firing = burners_ok and fuel > 4 and furnace_charge > 5

    t_furn_target = 35.0
    if furnace_firing:
        heat = 155 + fuel * 3.05
        quench = furnace_charge * 0.72
        t_furn_target = heat - quench + float(next_p.get("tempK1Bottom", 0)) * 0.12
        if not next_p.get("coolingWaterOk"):
            t_furn_target += 18
        if not next_p.get("avoFanOn"):
            t_furn_target += 8
    elif next_p.get("coilRupture"):
        t_furn_target = 70.0
    elif burners_ok and fuel > 4 and furnace_charge <= 5:
        t_furn_target = 140 + fuel * 3.1
    next_p["tempFurnaceOut"] = approach(
        float(next_p.get("tempFurnaceOut", 0)),
        clamp(t_furn_target, 25, 395),
        4.5 if furnace_firing else 6.5,
        dt,
    )

    t_bottom_target = 28.0
    if has_feed:
        t_bottom_target = (
            70
            + float(next_p["tempElouIn"]) * 0.25
            + (float(next_p["tempFurnaceOut"]) * 0.22 if furnace_firing else 0)
            + fuel * 0.15
        )
        if not next_p.get("coolingWaterOk"):
            t_bottom_target += 28
        if not next_p.get("avoFanOn"):
            t_bottom_target += 12
    next_p["tempK1Bottom"] = approach(
        float(next_p.get("tempK1Bottom", 0)),
        clamp(t_bottom_target, 25, 275),
        2.5,
        dt,
    )

    # ——— Reflux / top condensation ———
    condensing = (
        (1.0 if next_p.get("avoFanOn") else 0.15)
        * (1.0 if next_p.get("coolingWaterOk") else 0.35)
        * (1.0 if has_feed else 0.2)
    )
    if furnace_firing:
        reflux_target = clamp(
            25 + condensing * 45 - (1 - float(next_p.get("valveL2", 0)) / 100) * 8,
            5,
            85,
        )
    elif has_feed:
        reflux_target = 35 * condensing
    else:
        reflux_target = 50.0
    next_p["levelReflux"] = approach(
        float(next_p.get("levelReflux", 0)), reflux_target, 1.8, dt
    )
    if next_p["levelReflux"] < 18 and has_feed:
        next_p["levelReflux"] = clamp(float(next_p["levelReflux"]) - 0.25 * dt, 0, 100)

    # ——— K-1 top pressure ———
    lw1 = float(next_p.get("levelWaterE1", 0))
    lw2 = float(next_p.get("levelWaterE2", 0))
    if lw1 > 85 or lw2 > 85:
        water_carry = 1.6 + 0.02 * max(lw1, lw2)
    else:
        water_carry = 0.0
    vapor_load = (
        (0.9 if has_feed else 0)
        + (0.7 + fuel * 0.008 if furnace_firing else 0)
        + clamp((float(next_p["tempK1Bottom"]) - 100) / 120, 0, 1.2)
    )
    condensation = (
        condensing * 1.1
        + clamp(float(next_p["levelReflux"]) / 55, 0, 1.2)
        + (float(next_p.get("valveL2", 0)) / 100) * 0.35
    )
    p_k1_target = 0.55 + vapor_load * 0.85 - condensation * 0.55 + water_carry
    if not next_p.get("h2GasOk"):
        p_k1_target += 0.1
    p_k1_target = clamp(p_k1_target, 0.4, 5.8)
    next_p["pressureK1"] = approach(
        float(next_p.get("pressureK1", 0)), p_k1_target, 0.28, dt
    )

    # ——— K-2 top pressure ———
    p_k2_target = 0.22
    if furnace_firing:
        p_k2_target = (
            0.35
            + fuel * 0.0035
            + furnace_charge * 0.0012
            - (0.08 if next_p.get("coolingWaterOk") else -0.25)
            - (0.04 if next_p.get("avoFanOn") else -0.12)
        )
    if not next_p.get("h2GasOk"):
        p_k2_target += 0.12
    next_p["pressureK2"] = approach(
        float(next_p.get("pressureK2", 0)),
        clamp(p_k2_target, 0.15, 1.6),
        0.12,
        dt,
    )

    # ——— Level balance K-1 / K-2 + LIC ———
    in_k1 = f * 0.012 * dt
    out_top = (
        (float(next_p.get("valveL2", 0)) / 100)
        * (0.0035 * f + 0.28 * clamp(float(next_p["pressureK1"]) - 0.8, 0, 3))
        * dt
    )
    out_to_furnace = furnace_charge * 0.011 * dt

    err_k1 = float(next_p.get("levelK1", 0)) - float(next_p.get("levelSetpointK1", 50))
    lic_out_k1 = clamp(0.7 + err_k1 * 0.08, 0.12, 2.2) * (1.0 if has_feed else 0.12)
    out_lic_k1 = lic_out_k1 * 0.85 * dt

    level_k1 = float(next_p.get("levelK1", 0)) + in_k1 - out_top - out_to_furnace - out_lic_k1
    if float(next_p.get("levelK1", 0)) < 22 and furnace_firing:
        level_k1 -= 0.22 * dt * (fuel / 60)
    if has_feed:
        level_k1 = approach(level_k1, float(next_p.get("levelSetpointK1", 50)), 0.55, dt)
    next_p["levelK1"] = clamp(level_k1, 4, 96)

    in_k2 = (out_to_furnace * 0.9 + out_lic_k1 * 0.65) if furnace_firing else 0.0
    err_k2 = float(next_p.get("levelK2", 0)) - float(next_p.get("levelSetpointK2", 50))
    lic_out_k2 = clamp(0.85 + err_k2 * 0.09, 0.2, 2.4)
    out_k2_prod = (
        (float(next_p.get("valveL3", 0)) / 100)
        * (1.35 if furnace_firing else 0.08)
        * lic_out_k2
        * dt
    )
    level_k2 = float(next_p.get("levelK2", 0)) + in_k2 - out_k2_prod
    if furnace_firing or has_feed:
        level_k2 = approach(level_k2, float(next_p.get("levelSetpointK2", 50)), 0.5, dt)
    else:
        level_k2 = approach(level_k2, 42, 0.35, dt)
    next_p["levelK2"] = clamp(level_k2, 4, 96)

    return next_p
