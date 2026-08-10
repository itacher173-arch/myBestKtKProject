from __future__ import annotations

from typing import Any

from .model import Model


def _pump_state(model: Model, equipment_id: str) -> str:
    mapping = {"N-1": "Н-1", "N-2": "Н-2", "N-3": "Н-20"}
    pump = model.pumps[mapping[equipment_id]]
    if pump["trip"]:
        return "tripped"
    return "running" if pump["running"] else "stopped"


def frontend_process(model: Model) -> dict[str, Any]:
    s, c, u, ui = model.s, model.c, model.u, model.ui
    fuel = (c["p1_fuel"] + c["p2_fuel"] + c["p3_fuel"]) / 3
    furnace_out = (s["p1_out"] + s["p2_out"] + s["p3_out"]) / 3
    return {
        "valveL1": ui["valveL1"],
        "valveL2": ui["valveL2"],
        "valveL3": ui["valveL3"],
        "valveL1Motion": ui["valveL1Motion"],
        "valveL2Motion": ui["valveL2Motion"],
        "valveL3Motion": ui["valveL3Motion"],
        "pumpN1": _pump_state(model, "N-1"),
        "pumpN2": _pump_state(model, "N-2"),
        "pumpN3": _pump_state(model, "N-3"),
        "demulsifierOn": ui["demulsifierOn"],
        "electricFieldOn": ui["electricFieldOn"],
        "washWaterOn": ui["washWaterOn"],
        "fuelGasPercent": round(fuel, 2),
        "levelK1": s["k1_level"],
        "levelK2": s["k2_level"],
        "levelSetpointK1": ui["levelSetpointK1"],
        "levelSetpointK2": ui["levelSetpointK2"],
        "avoFanOn": ui["avoFanOn"],
        "pressureN1": round(17.3 * min(1.15, s["feed"] / max(c["feed_sp"], 1)), 2),
        "tempElouIn": s["preheat"],
        "saltMgL": s["desalt_salt"],
        "waterAfterElou": s["desalt_water"],
        "pressureAfterElou": round(4.5 + 3.0 * min(1, s["feed"] / 850), 2),
        "tempK1In": min(290, s["preheat"] + 8),
        "tempK1Bottom": s["k1_bottom"],
        "pressureK1": s["k1_p"],
        "tempFurnaceOut": furnace_out,
        "pressureK2": s["k2_p"],
        "feedFlow": s["feed"],
        "running": model.running,
        "simTimeSec": model.t,
        "steamOk": u["steam"] >= 4,
        "powerOk": u["power_6kv"] >= 80 and u["power_04kv"] >= 80,
        "opsPowerOk": "SC-04" not in model.active,
        "opsPowerOnBattery": "SC-04" in model.active and u["ups"] > 0,
        "batteryMinutesLeft": u["ups"],
        "coolingWaterOk": u["cooling"] >= 60,
        "instrumentAirOk": u["air"] >= 4,
        "ventOpsOk": bool(u["vent_control"]),
        "ventElouOk": bool(u["vent_elou"]),
        "h2GasOk": "SC-15" not in model.active,
        "levelWaterE1": s["e1_water"],
        "levelWaterE2": s["e2_water"],
        "levelReflux": min(100, max(0, s["e1_hc"])),
        "gasPercent": s["gas"],
        "coilRupture": bool(ui["coilRupture"] or "SC-07" in model.active),
        "pumpLeak": bool(ui["pumpLeak"] or "SC-08" in model.active),
        "furnaceEsd": bool(ui["furnaceEsd"]),
        "safeShutdownInitiated": bool(ui["safeShutdownInitiated"]),
    }


def public_state(model: Model) -> dict[str, Any]:
    data = model.public()
    data["process"] = frontend_process(model)
    data["actionsLog"] = list(model.events)
    data["systemEvents"] = [
        {"id": f"alarm-{i}", "at": int(a.get("wallTime", 0)), "description": a["message"]}
        for i, a in enumerate(model.alarms.values())
    ]
    return data
