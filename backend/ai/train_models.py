from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

RANDOM_STATE = 20260810


def split_by_session(frame: pd.DataFrame, target: str):
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_STATE)
    features = frame.drop(columns=[target])
    train_idx, test_idx = next(splitter.split(features, frame[target], groups=frame["sessionId"]))
    return frame.iloc[train_idx].copy(), frame.iloc[test_idx].copy()


def build_pipeline(categorical: list[str], numeric: list[str]) -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical),
            ("numeric", "passthrough", numeric),
        ],
        remainder="drop",
    )
    model = RandomForestClassifier(
        n_estimators=350,
        max_depth=18,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )
    return Pipeline([("preprocessor", preprocessor), ("model", model)])


def metrics(y_true, y_pred) -> dict:
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    labels = sorted(set(y_true) | set(y_pred))
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precisionWeighted": round(float(precision), 4),
        "recallWeighted": round(float(recall), 4),
        "f1Weighted": round(float(f1), 4),
        "classificationReport": classification_report(y_true, y_pred, output_dict=True, zero_division=0),
        "labels": labels,
        "confusionMatrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }


def train_action_model(data_dir: Path, output_dir: Path) -> dict:
    frame = pd.read_csv(data_dir / "dataset_actions.csv")
    target = "label"
    train, test = split_by_session(frame, target)
    excluded = {"sessionId", "operatorId", target}
    categorical = ["scenarioId", "action", "previousAction"]
    numeric = [column for column in frame.columns if column not in excluded | set(categorical)]
    pipeline = build_pipeline(categorical, numeric)
    pipeline.fit(train[categorical + numeric], train[target])
    predicted = pipeline.predict(test[categorical + numeric])
    result = metrics(test[target], predicted)
    result.update({"trainRows": len(train), "testRows": len(test), "target": target})
    joblib.dump(
        {"pipeline": pipeline, "features": categorical + numeric, "target": target, "labels": sorted(frame[target].unique())},
        output_dir / "action_error_classifier.joblib",
    )
    return result


def train_risk_model(data_dir: Path, output_dir: Path) -> dict:
    frame = pd.read_csv(data_dir / "dataset_risk.csv")
    target = "willError"
    train, test = split_by_session(frame, target)
    leakage = {"riskId", "sessionId", "operatorId", target, "riskClass", "riskScore", "predictedErrorLabel"}
    categorical = ["scenarioId", "candidateAction", "previousAction"]
    numeric = [column for column in frame.columns if column not in leakage | set(categorical)]
    pipeline = build_pipeline(categorical, numeric)
    pipeline.fit(train[categorical + numeric], train[target])
    predicted = pipeline.predict(test[categorical + numeric])
    probabilities = pipeline.predict_proba(test[categorical + numeric])
    result = metrics(test[target], predicted)
    result.update({
        "trainRows": len(train),
        "testRows": len(test),
        "target": target,
        "probabilityClassOrder": pipeline.named_steps["model"].classes_.tolist(),
        "meanErrorProbability": round(float(probabilities[:, list(pipeline.named_steps["model"].classes_).index(1)].mean()), 4),
    })
    joblib.dump(
        {"pipeline": pipeline, "features": categorical + numeric, "target": target, "positiveClass": 1},
        output_dir / "risk_predictor.joblib",
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent / "models")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "split": "GroupShuffleSplit by sessionId, test_size=0.2",
        "randomState": RANDOM_STATE,
        "actionClassifier": train_action_model(args.data_dir, args.output_dir),
        "riskPredictor": train_risk_model(args.data_dir, args.output_dir),
    }
    (args.output_dir / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "actionF1": report["actionClassifier"]["f1Weighted"],
        "riskF1": report["riskPredictor"]["f1Weighted"],
        "outputDir": str(args.output_dir),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
