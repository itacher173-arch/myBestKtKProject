from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

def load(relative: str):
    return json.loads((DATA / relative).read_text(encoding="utf-8"))

def unique(items, name: str):
    ids = [item["id"] for item in items]
    assert len(ids) == len(set(ids)), f"Duplicate IDs in {name}"
    return set(ids)

def main() -> None:
    equipment = load("domain/equipment.json")
    scenarios = load("training/scenarios.json")
    trainings = load("training/mini_trainings.json")
    articles = load("knowledge/index.json")
    sources = load("sources/source_registry.json")
    actions = load("domain/actions.json")

    equipment_ids = unique(equipment, "equipment")
    scenario_ids = unique(scenarios, "scenarios")
    training_ids = unique(trainings, "trainings")
    article_ids = unique(articles, "knowledge")
    source_ids = unique(sources, "sources")
    action_ids = unique(actions, "actions")

    for training in trainings:
        assert set(training.get("equipmentIds", [])) <= equipment_ids, training["id"]
        assert set(training.get("knowledgeArticleIds", [])) <= article_ids, training["id"]
        assert set(training.get("sourceRefs", [])) <= source_ids, training["id"]
    for scenario in scenarios:
        assert set(scenario.get("recommendedTrainingIds", [])) <= training_ids, scenario["id"]
        assert set(scenario.get("knowledgeArticleIds", [])) <= article_ids, scenario["id"]
        assert set(scenario.get("sourceRefs", [])) <= source_ids, scenario["id"]
        assert set(scenario.get("expectedActionIds", [])) <= action_ids, scenario["id"]

    matrix = DATA / "traceability" / "scenario_training_knowledge.csv"
    with matrix.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle, delimiter=";"))
    assert {row["scenarioId"] for row in rows} == scenario_ids
    print(f"OK: {len(scenarios)} scenarios, {len(trainings)} trainings, {len(articles)} articles, {len(equipment)} equipment items")

if __name__ == "__main__":
    main()
