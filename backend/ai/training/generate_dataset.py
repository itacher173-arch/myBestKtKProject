from __future__ import annotations

import csv
import random
from pathlib import Path

SEED = 20260810
ACTION_COUNTS = {
    "NORMAL": 2500,
    "SEQUENCE_ERROR": 1500,
    "RESPONSE_TIME_ERROR": 1500,
    "DUPLICATE_COMMAND": 1000,
    "PARAMETER_ERROR": 1500,
    "EQUIPMENT_NOT_READY": 1000,
    "CRITICAL_OPERATION_ERROR": 1000,
}
SCENARIOS = ["SC-01", "SC-05", "SC-06", "SC-07", "SC-08", "SC-10", "SC-12", "SC-13", "SC-14"]


def b(probability: float) -> bool:
    return random.random() < probability


def base_row(index: int, label: str) -> dict:
    scenario = random.choice(SCENARIOS)
    action = random.choice(
        [
            "start-N1",
            "start-N2",
            "set-fuel",
            "restore-cooling",
            "restore-ventilation",
            "protect-K1",
            "protect-K2",
            "toggle-electric-field",
        ]
    )
    expected = action
    return {
        "sessionId": f"synthetic-{index // 12 + 1:05d}",
        "operatorId": f"operator-{random.randint(1, 24):02d}",
        "scenarioId": scenario,
        "sequencePosition": index % 12 + 1,
        "action": action,
        "previousAction": random.choice(
            ["open-L1", "start-N1", "restore-cooling", "check-alarm", "set-fuel-45"]
        ),
        "expectedAction": expected,
        "responseSeconds": round(random.uniform(4, 28), 2),
        "pauseSeconds": round(random.uniform(2, 25), 2),
        "duplicateCount": 0,
        "actionValue": round(random.uniform(20, 55), 1),
        "valveL1": round(random.uniform(95, 100), 1),
        "feedFlow": round(random.uniform(420, 900), 1),
        "pressureK1": round(random.uniform(1.8, 3.2), 2),
        "pressureK2": round(random.uniform(0.35, 0.8), 2),
        "levelK1": round(random.uniform(35, 75), 1),
        "levelK2": round(random.uniform(35, 75), 1),
        "temperatureFurnace": round(random.uniform(300, 355), 1),
        "gasPercent": round(random.uniform(0, 12), 1),
        "saltMgL": round(random.uniform(2, 5), 2),
        "waterAfterElou": round(random.uniform(0.04, 0.15), 3),
        "powerOk": True,
        "instrumentAirOk": True,
        "coolingWaterOk": True,
        "ventElouOk": True,
        "label": label,
    }


def mutate_action(row: dict) -> dict:
    label = row["label"]
    if label == "SEQUENCE_ERROR":
        row.update(
            action="start-N1",
            previousAction=random.choice(["set-fuel-70", "check-alarm", "drain-E1"]),
            expectedAction="open-L1",
            valveL1=round(random.uniform(0, 88), 1),
            feedFlow=round(random.uniform(0, 280), 1),
        )
    elif label == "RESPONSE_TIME_ERROR":
        row.update(
            responseSeconds=round(random.uniform(61, 150), 2),
            pauseSeconds=round(random.uniform(61, 150), 2),
            previousAction="alarm-K1-high",
            expectedAction=random.choice(["restore-cooling", "protect-K1", "cut-fuel"]),
        )
        if b(0.5):
            row.update(pressureK1=round(random.uniform(4.05, 4.7), 2), coolingWaterOk=False)
        else:
            row.update(gasPercent=round(random.uniform(18, 30), 1), ventElouOk=False)
    elif label == "DUPLICATE_COMMAND":
        repeated = random.choice(
            ["set-fuel-45", "restore-cooling", "start-N1", "toggle-electric-field"]
        )
        row.update(
            action=repeated,
            previousAction=repeated,
            expectedAction="check-process-state",
            duplicateCount=random.randint(2, 5),
            pauseSeconds=round(random.uniform(0.2, 3), 2),
        )
    elif label == "PARAMETER_ERROR":
        row.update(
            action="set-fuel",
            actionValue=round(random.uniform(70, 100), 1),
            expectedAction="set-fuel-45",
            feedFlow=round(random.uniform(100, 420), 1),
            temperatureFurnace=round(random.uniform(366, 430), 1),
        )
        if b(0.45):
            row["pressureK1"] = round(random.uniform(4.0, 4.8), 2)
    elif label == "EQUIPMENT_NOT_READY":
        variant = random.choice(["power", "air", "valve", "cooling"])
        row.update(
            action=random.choice(["start-N1", "start-N2", "set-fuel"]),
            expectedAction="restore-utility-or-prepare-equipment",
        )
        if variant == "power":
            row["powerOk"] = False
        elif variant == "air":
            row["instrumentAirOk"] = False
        elif variant == "valve":
            row["valveL1"] = round(random.uniform(0, 85), 1)
        else:
            row.update(coolingWaterOk=False, pressureK1=round(random.uniform(3.8, 4.5), 2))
    elif label == "CRITICAL_OPERATION_ERROR":
        variant = random.choice(["furnace", "k1", "k2", "gas"])
        if variant == "furnace":
            row.update(
                action="set-fuel",
                actionValue=round(random.uniform(75, 100), 1),
                feedFlow=round(random.uniform(0, 180), 1),
                temperatureFurnace=round(random.uniform(390, 455), 1),
                expectedAction="restore-circulation-and-reduce-fuel",
            )
        elif variant == "k1":
            row.update(
                action="set-fuel",
                actionValue=round(random.uniform(50, 90), 1),
                levelK1=round(random.uniform(2, 14), 1),
                expectedAction="protect-K1",
            )
        elif variant == "k2":
            row.update(
                action="set-fuel",
                actionValue=round(random.uniform(50, 90), 1),
                levelK2=round(random.uniform(2, 14), 1),
                expectedAction="protect-K2",
            )
        else:
            row.update(
                action="disable-ventilation",
                gasPercent=round(random.uniform(15, 35), 1),
                ventElouOk=False,
                expectedAction="restore-ventilation",
            )
    return row


def build_actions() -> list[dict]:
    rows = []
    index = 0
    for label, count in ACTION_COUNTS.items():
        for _ in range(count):
            row = mutate_action(base_row(index, label))
            rows.append(row)
            index += 1
    random.shuffle(rows)
    return rows


def build_risk(actions: list[dict]) -> list[dict]:
    rows = []
    for index, source in enumerate(actions, 1):
        row = {key: value for key, value in source.items() if key != "label"}
        actual_label = source["label"]
        is_risky = actual_label != "NORMAL"
        if actual_label == "DUPLICATE_COMMAND":
            risk_score = random.randint(35, 55)
        elif actual_label in {
            "SEQUENCE_ERROR",
            "RESPONSE_TIME_ERROR",
            "PARAMETER_ERROR",
            "EQUIPMENT_NOT_READY",
        }:
            risk_score = random.randint(55, 82)
        elif actual_label == "CRITICAL_OPERATION_ERROR":
            risk_score = random.randint(83, 99)
        else:
            risk_score = random.randint(1, 24)
        row.update(
            {
                "riskId": f"risk-{index:06d}",
                "candidateAction": row.pop("action"),
                "willError": int(is_risky),
                "riskClass": "HIGH"
                if risk_score >= 70
                else "MEDIUM"
                if risk_score >= 35
                else "LOW",
                "riskScore": risk_score,
                "predictedErrorLabel": actual_label if is_risky else "NORMAL",
            }
        )
        rows.append(row)
    random.shuffle(rows)
    return rows


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    random.seed(SEED)
    output = Path(__file__).resolve().parent / "data"
    output.mkdir(parents=True, exist_ok=True)
    actions = build_actions()
    risks = build_risk(actions)
    write_csv(output / "dataset_actions.csv", actions)
    write_csv(output / "dataset_risk.csv", risks)
    print(f"dataset_actions.csv: {len(actions)} rows")
    print(f"dataset_risk.csv: {len(risks)} rows")


if __name__ == "__main__":
    main()
