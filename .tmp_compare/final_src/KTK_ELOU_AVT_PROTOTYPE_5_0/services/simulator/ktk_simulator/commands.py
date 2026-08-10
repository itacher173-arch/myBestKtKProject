from __future__ import annotations

import time
from typing import Any

from .model import CONTROL_META, Model, clamp


def _log(model: Model, description: str) -> None:
    model.events.append({
        "id": f"evt-{time.time_ns()}",
        "at": int(time.time() * 1000),
        "description": description,
    })


def set_control(model: Model, control_id: str, value: float) -> None:
    lo, hi, _ = CONTROL_META[control_id]
    model.c[control_id] = clamp(value, lo, hi)
    _log(model, f"Уставка {control_id} изменена на {model.c[control_id]:.2f}")


def set_utility(model: Model, utility_id: str, value: Any) -> None:
    aliases = {
        "steamOk": ("steam", 10.0, 0.0),
        "powerOk": ("power_6kv", 100.0, 0.0),
        "coolingWaterOk": ("cooling", 100.0, 0.0),
        "instrumentAirOk": ("air", 6.0, 0.0),
        "ventOpsOk": ("vent_control", True, False),
        "ventElouOk": ("vent_elou", True, False),
    }
    if utility_id in aliases:
        key, on, off = aliases[utility_id]
        model.u[key] = on if bool(value) else off
        if utility_id == "powerOk":
            model.u["power_04kv"] = model.u["power_6kv"]
    else:
        current = model.u[utility_id]
        model.u[utility_id] = bool(value) if isinstance(current, bool) else float(value)
    _log(model, f"Инженерная среда {utility_id}: {value}")


def set_pump(model: Model, equipment_id: str, action: str) -> None:
    mapping = {"N-1": "Н-1", "N-2": "Н-2", "N-3": "Н-20"}
    pump_id = mapping.get(equipment_id, equipment_id)
    pump = model.pumps[pump_id]
    if action == "reset":
        pump["trip"] = False
    elif action == "start":
        pump.update(running=True, trip=False)
    elif action == "stop":
        pump["running"] = False
    else:
        raise ValueError(f"Неизвестное действие насоса: {action}")
    _log(model, f"Насос {equipment_id}: {action}")


def start_session(model: Model, scenario_id: str | None) -> None:
    mini_training = bool(scenario_id and scenario_id.startswith("MT-"))
    cold = scenario_id in {"SC-14", "startup", "MT-FEED-01"}
    model.reset("cold" if cold else "normal")
    model.running = True
    if scenario_id and not cold and not mini_training:
        model.active.add(scenario_id)
    if scenario_id == "MT-FEED-01":
        model.ui.update(valveL1=0.0, valveL2=70.0, valveL3=70.0)
        for pump_id in ("Н-1", "Н-1А", "Н-1Б"):
            model.pumps[pump_id].update(running=False, trip=False)
        model.c.update(feed_sp=650, n20_flow=620, k2_feed=450, branch_1=0, branch_2=0, branch_3=0)
    if scenario_id == "MT-FEED-02":
        model.ui["valveL1"] = 40.0
        model.c.update(feed_sp=720, branch_1=0, branch_2=0, branch_3=0)
        model.s["feed"] = 80.0
        for pump_id in ("Н-1", "Н-1А", "Н-1Б"):
            model.pumps[pump_id].update(running=False, trip=False)
    if scenario_id == "MT-ELOU-01":
        model.ui.update(demulsifierOn=False, electricFieldOn=False, washWaterOn=False)
        model.c.update(demulsifier=0, wash_water=0, voltage_s1=0, voltage_s2=0, raw_salt=85)
        model.s.update(desalt_salt=28.0, desalt_water=0.32)
    if scenario_id == "MT-ELOU-02":
        model.ui.update(demulsifierOn=False, electricFieldOn=True, washWaterOn=False)
        model.c.update(demulsifier=0, wash_water=0, voltage_s1=4.8, voltage_s2=16.5, raw_salt=78, raw_water=1.1)
        model.s.update(desalt_salt=19.0, desalt_water=0.38)
    if scenario_id == "MT-E1-01":
        model.u["cooling"] = 45.0
        model.s.update(e1_water=78.0, k1_p=4.25)
    if scenario_id == "MT-K1-01":
        model.u["cooling"] = 20.0
        model.ui["avoFanOn"] = False
        model.c.update(avz3=0, p3_fuel=82, p4_fuel=76)
        model.s.update(k1_p=4.65, k1_top=164.0, k1_bottom=286.0)
    if scenario_id == "MT-K1-02":
        model.s.update(k1_level=8.0, p3_out=382.0, p4_out=374.0)
        model.ui["levelSetpointK1"] = 25.0
        model.c.update(p3_fuel=74, p4_fuel=70)
    if scenario_id == "MT-FURN-01":
        model.pumps["Н-2"].update(running=False, trip=False)
        model.c.update(p1_fuel=86, p2_fuel=84, p3_fuel=82)
        model.s.update(p1_out=402.0, p2_out=398.0, p3_out=395.0)
    if scenario_id == "MT-K2-01":
        model.u["cooling"] = 20.0
        model.c.update(p1_fuel=82, p2_fuel=80, p3_fuel=72)
        model.s.update(k2_p=1.28, k2_top=158.0)
    if scenario_id == "MT-K2-02":
        model.s["k2_level"] = 8.0
        model.ui["levelSetpointK2"] = 22.0
        model.c.update(p1_fuel=72, p2_fuel=70, p3_fuel=45)
    if scenario_id == "MT-UTIL-01":
        model.u["air"] = 1.0
        model.s["feed"] = 90.0
    if scenario_id == "MT-VENT-01":
        model.u["vent_elou"] = False
        model.s["gas"] = 24.0
    if scenario_id == "MT-SAFE-01":
        model.u["cooling"] = 0.0
        model.ui["avoFanOn"] = False
        model.c.update(avz3=0, p1_fuel=78, p2_fuel=76, p3_fuel=74, p4_fuel=70)
        model.s.update(k1_p=4.62, k1_top=162.0)
    if scenario_id == "MVP-ELOU-01":
        model.ui["demulsifierOn"] = False
        model.c["demulsifier"] = 0
    if scenario_id == "MVP-FURN-01":
        model.c["p1_fuel"] = model.c["p2_fuel"] = model.c["p3_fuel"] = 0
    if scenario_id == "SC-07":
        model.ui["coilRupture"] = True
    if scenario_id == "SC-08":
        model.ui["pumpLeak"] = True
    _log(model, f"Запущено упражнение {scenario_id or 'normal'}")


def apply_command(model: Model, body: dict[str, Any]) -> None:
    command = body.get("command")
    if command == "pump":
        set_pump(model, str(body["id"]), str(body["action"]))
    elif command == "valve":
        valve = str(body["id"]).replace("-", "")
        key = f"valve{valve}"
        motion_key = f"{key}Motion"
        action = str(body["action"])
        if action == "open":
            model.ui[key], model.ui[motion_key] = 100.0, "idle"
            if body["id"] == "L-1":
                model.c.update(branch_1=85, branch_2=85, branch_3=85)
        elif action == "close":
            model.ui[key], model.ui[motion_key] = 0.0, "idle"
            if body["id"] == "L-1":
                model.c.update(branch_1=0, branch_2=0, branch_3=0)
        elif action == "stop":
            model.ui[motion_key] = "idle"
        else:
            raise ValueError(action)
        _log(model, f"Задвижка {body['id']}: {action}")
    elif command == "toggle":
        key, value = str(body["id"]), bool(body["value"])
        model.ui[key] = value
        if key == "demulsifierOn":
            model.c["demulsifier"] = 15 if value else 0
        elif key == "electricFieldOn":
            model.c["voltage_s1"] = 4.8 if value else 0
            model.c["voltage_s2"] = 16.5 if value else 0
        elif key == "washWaterOn":
            model.c["wash_water"] = 7.5 if value else 0
        elif key == "avoFanOn":
            model.c["avz3"] = 72 if value else 0
        _log(model, f"{key}: {'включено' if value else 'отключено'}")
    elif command == "fuel":
        value = clamp(body["value"], 0, 100)
        model.c["p1_fuel"] = model.c["p2_fuel"] = model.c["p3_fuel"] = value
        _log(model, f"Подача топливного газа: {value:.0f}%")
    elif command == "level-setpoint":
        column = str(body["column"])
        model.ui[f"levelSetpoint{column.replace('-', '')}"] = clamp(body["value"], 10, 90)
        _log(model, f"Уставка уровня {column}: {body['value']}%")
    elif command == "drain":
        vessel = str(body["id"])
        if vessel == "E-1-vessel":
            model.s["e1_water"] = max(0, model.s["e1_water"] - 25)
        else:
            model.s["e2_water"] = max(0, model.s["e2_water"] - 25)
        _log(model, f"Дренирование воды {vessel}")
    elif command == "protect-level":
        column = str(body["column"])
        model.ui[f"levelSetpoint{column.replace('-', '')}"] = 50
        if column == "K-1":
            model.c["p3_fuel"] = model.c["p4_fuel"] = 0
        else:
            model.c["p1_fuel"] = model.c["p2_fuel"] = 0
        _log(model, f"Защита уровня {column}")
    elif command == "emergency":
        action = str(body["id"])
        model.ui["safeShutdownInitiated"] = True
        if action in {"esd-coil", "cut-fuel-steam", "unload-cooling", "safe-stop-air", "safe-stop-power"}:
            model.c["p1_fuel"] = model.c["p2_fuel"] = model.c["p3_fuel"] = model.c["p4_fuel"] = 0
        if action == "esd-coil":
            model.ui["furnaceEsd"] = True
        if action == "isolate-leak":
            set_pump(model, "N-1", "stop")
            model.ui["pumpLeak"] = False
        _log(model, f"Аварийное действие: {action}")
    else:
        raise ValueError(f"Неизвестная команда: {command}")
