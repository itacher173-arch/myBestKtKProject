"""ПАЗ / cause-and-effect interlocks — port of frontend/src/sim/pazGuards.ts."""

from __future__ import annotations

from typing import Any, Optional

# GuardedAction values from scenarioGuards.ts
GuardedAction = str

ProcessState = dict[str, Any]


def interlock_reason(
    process: ProcessState,
    action: GuardedAction,
    fuel_target: Optional[float] = None,
) -> Optional[str]:
    """
    Port of processInterlockReason(process, action, fuelTarget?).

    Returns a blocking reason string, or None if the action is allowed.
    """
    p = process
    fuel = float(p.get("fuelGasPercent", 0))

    if not p.get("powerOk"):
        if action in ("start-N1", "start-N2", "start-N3"):
            return "ПАЗ: пуск насосов запрещён — нет электропитания 0,4/6 кВ."

    if not p.get("steamOk"):
        if action == "fuel" and (fuel_target if fuel_target is not None else 0) > fuel + 0.5:
            return "ПАЗ: при потере технологического пара увеличение топлива запрещено."

    if p.get("coilRupture") or p.get("furnaceEsd"):
        if action == "fuel" and (fuel_target if fuel_target is not None else 0) > 5:
            return "ПАЗ: ESD/разрыв змеевика — топливо должно быть отсечено."
        if action in ("start-N2", "start-N3"):
            return "ПАЗ: при ESD печи пуск печных насосов запрещён."

    if not p.get("instrumentAirOk"):
        if action in ("open-L1", "open-L2", "open-L3"):
            return (
                "ПАЗ: нет приборного воздуха — открытие задвижек заблокировано (fail-safe)."
            )

    if (
        not p.get("coolingWaterOk")
        and action == "fuel"
        and (fuel_target if fuel_target is not None else 0) > 40
    ):
        return "ПАЗ: при потере оборотной воды запрещён рост топлива выше 40%."

    if p.get("pumpN1") == "running" and float(p.get("valveL1", 0)) < 3 and action == "start-N1":
        return "ПАЗ: Н-1 уже в работе на закрытую задвижку — устраните режим."

    if (
        action in ("start-N2", "start-N3")
        and float(p.get("levelK1", 0)) < 18
        and fuel > 10
    ):
        return "ПАЗ: низкий уровень К-1 — сначала разгрузите печь / восстановите уровень."

    if p.get("pumpLeak") and action in ("start-N1", "open-L1"):
        return "ПАЗ: при разгерметизации насоса пуск Н-1 / открытие Л-1 запрещены."

    return None


# Alias matching TS export name
process_interlock_reason = interlock_reason
