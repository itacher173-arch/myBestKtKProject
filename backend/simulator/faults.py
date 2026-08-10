"""Fault injection — port of frontend/trainer faultEngine.applyFault."""

from __future__ import annotations

from typing import Any

FaultPatch = dict[str, Any]


def apply_fault(fault_type: str) -> tuple[FaultPatch, list[str]]:
    """Return (process_patch, system_messages) for a known fault type."""
    t = fault_type.strip()
    table: dict[str, tuple[FaultPatch, list[str]]] = {
        "demulsifier": (
            {"demulsifierOn": False},
            [
                "ОТКАЗ: остановлен насос-дозатор деэмульгатора на ЭЛОУ. Ожидается рост солей (Q-ELOU)."
            ],
        ),
        "fuelGas": (
            {"fuelGasPercent": 0},
            [
                "ОТКАЗ: прекращена подача топливного газа к печам П-1…П-3. Температура (TR55-1) будет падать."
            ],
        ),
        "pumpTrip": (
            {"pumpN1": "tripped", "pressureN1": 0},
            [
                "ОТКАЗ: аварийная остановка Н-1 (защита электродвигателя). Давление PRA351 падает."
            ],
        ),
        "steamLoss": (
            {"steamOk": False, "fuelGasPercent": 0},
            [
                "ОТКАЗ SC-02: потеря технологического пара. Горелки погасли; риск накопления топлива."
            ],
        ),
        "powerLoss": (
            {
                "powerOk": False,
                "pumpN1": "tripped",
                "pressureN1": 0,
                "feedFlow": 0,
            },
            [
                "ОТКАЗ SC-03: потеря электропитания 0,4/6 кВ. Останов насосов, АВО, вентиляции."
            ],
        ),
        "opsPowerLoss": (
            {
                "opsPowerOk": False,
                "opsPowerOnBattery": True,
                "batteryMinutesLeft": 30,
            },
            [
                "ОТКАЗ SC-04: потеря питания операторной. Переход на резерв/АКБ (~0,5 ч)."
            ],
        ),
        "coolingWaterLoss": (
            {"coolingWaterOk": False},
            [
                "ОТКАЗ SC-05: потеря оборотной воды. Рост температур и давлений в теплообменном контуре."
            ],
        ),
        "airLoss": (
            {
                "instrumentAirOk": False,
                "valveL1Motion": "idle",
                "valveL2Motion": "idle",
                "valveL3Motion": "idle",
                "valveL1": 0,
            },
            [
                "ОТКАЗ SC-06: потеря приборного воздуха. Клапаны в fail-safe (Л-1 закрыта); резерв А-6 ограничен."
            ],
        ),
        "coilRupture": (
            {"coilRupture": True, "fuelGasPercent": 0, "furnaceEsd": True},
            [
                "АВАРИЯ SC-07: разрыв змеевика печи. Выброс продукта / пожар в топке — немедленный ESD."
            ],
        ),
        "pumpLeak": (
            {"pumpLeak": True},
            [
                "АВАРИЯ SC-08: разгерметизация насоса/фланца (лужа/облако УВ). Необходима локализация."
            ],
        ),
        "ventOpsLoss": (
            {"ventOpsOk": False},
            [
                "ОТКАЗ SC-09: потеря вентиляции операторной/РУ. Риск накопления взрывоопасной смеси."
            ],
        ),
        "ventElouLoss": (
            {"ventElouOk": False},
            [
                "ОТКАЗ SC-10: потеря вентиляции насосных ЭЛОУ. Газонакопление в помещении."
            ],
        ),
        "highWaterE12": (
            {"levelWaterE1": 92, "levelWaterE2": 90},
            [
                "ОТКАЗ SC-11: высокий уровень воды E-1/E-2. Риск попадания воды в K-1/K-2 и скачка давления."
            ],
        ),
        "lowLevelK1": (
            {"levelK1": 12, "levelK2": 40},
            [
                "ОТКАЗ SC-12: низкий уровень K-1. Риск срыва насосов и прогара змеевиков печей."
            ],
        ),
        "lowReflux": (
            {"levelReflux": 8},
            [
                "ОТКАЗ SC-13: низкий уровень УВ в рефлюксных ёмкостях. Риск срыва рефлюксных насосов."
            ],
        ),
        "h2Loss": (
            {"h2GasOk": False},
            [
                "ОТКАЗ SC-15: потеря водородсодержащего газа (блок K-12). Риск коксования / роста давления."
            ],
        ),
    }
    if t not in table:
        raise ValueError(f"Unknown fault type: {fault_type}")
    return table[t]
