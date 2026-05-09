from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    from .common import DATASET_VERSION, DEFAULT_MODEL_DIR, DEFAULT_OUTPUT_DIR, TARGETS, TABLE_FILES, write_jsonl
except ImportError:  # pragma: no cover
    from common import DATASET_VERSION, DEFAULT_MODEL_DIR, DEFAULT_OUTPUT_DIR, TARGETS, TABLE_FILES, write_jsonl  # type: ignore


DROP_FEATURES = {
    "deal_id",
    "run_id",
    "dataset_version",
    "dataset_role",
    "ml_split",
    "opportunity_id",
    "account_name",
    "account_domain",
    "created_at",
    "missingness_mask",
    "source_profile",
    "private_signal_profile",
    "compliance_requirements",
    "integration_requirements",
    "account_team_members",
    "stakeholder_map",
}

DATE_COLUMNS = ["created_date", "close_date", "original_close_date", "last_activity_date"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Train calibrated baseline models for synthetic deals.")
    parser.add_argument("--in", dest="input_dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--models", dest="model_dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--seed", type=int, default=20260509)
    args = parser.parse_args()

    deals = pd.read_json(args.input_dir / TABLE_FILES["synthetic_deals"], lines=True)
    outcomes = pd.read_json(args.input_dir / TABLE_FILES["synthetic_deal_outcomes"], lines=True)
    if deals.empty or outcomes.empty:
        raise SystemExit("No generated deals/outcomes found. Run generate_synthetic_deals.py first.")

    frame = deals.merge(outcomes[["deal_id", *TARGETS]], on="deal_id", how="inner")
    frame = add_date_features(frame)
    args.model_dir.mkdir(parents=True, exist_ok=True)

    model_runs: list[dict[str, Any]] = []
    predictions: list[dict[str, Any]] = []
    run_id = str(frame["run_id"].iloc[0])

    for target in TARGETS:
        if frame[target].nunique() < 2:
            print(f"Skipping {target}: only one class present")
            continue

        for model_kind, feature_columns, pipeline in [
            ("stage_only_logistic", ["crm_stage"], stage_pipeline()),
            ("full_random_forest_calibrated", feature_columns_for(frame), full_pipeline(args.seed)),
        ]:
            model_run_id = f"model_{run_id}_{target}_{model_kind}"
            train_rows = frame[(frame["dataset_role"] == "training_pool") & (frame["ml_split"] == "train")]
            test_rows = frame[(frame["dataset_role"] == "training_pool") & (frame["ml_split"] == "test")]
            x_train = train_rows[feature_columns]
            y_train = train_rows[target].astype(int)
            x_test = test_rows[feature_columns]
            y_test = test_rows[target].astype(int)

            pipeline.fit(x_train, y_train)
            test_proba = pipeline.predict_proba(x_test)[:, 1]
            metrics = score_predictions(y_test, test_proba)
            model_path = args.model_dir / f"{model_run_id}.joblib"
            joblib.dump(pipeline, model_path)

            model_runs.append(
                {
                    "model_run_id": model_run_id,
                    "run_id": run_id,
                    "dataset_version": DATASET_VERSION,
                    "target": target,
                    "model_kind": model_kind,
                    "model_version": "v1",
                    "training_config": {
                        "seed": args.seed,
                        "train_rows": int(len(train_rows)),
                        "test_rows": int(len(test_rows)),
                        "model_path": str(model_path.relative_to(args.model_dir.parents[0])),
                    },
                    "metrics": metrics,
                    "feature_columns": feature_columns,
                }
            )

            all_proba = pipeline.predict_proba(frame[feature_columns])[:, 1]
            for deal_id, split, probability in zip(frame["deal_id"], frame["ml_split"], all_proba):
                predictions.append(
                    {
                        "prediction_id": f"pred_{model_run_id}_{deal_id}",
                        "model_run_id": model_run_id,
                        "run_id": run_id,
                        "deal_id": deal_id,
                        "target": target,
                        "model_kind": model_kind,
                        "probability": round(float(probability), 6),
                        "calibration_band": calibration_band(float(probability)),
                        "ml_split": split,
                    }
                )
            print(f"{target} {model_kind}: {json.dumps(metrics, sort_keys=True)}")

    write_jsonl(args.input_dir / TABLE_FILES["model_runs"], model_runs)
    write_jsonl(args.input_dir / TABLE_FILES["model_predictions"], predictions)
    print(json.dumps({"model_runs": len(model_runs), "predictions": len(predictions)}, indent=2))


def add_date_features(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    reference = pd.Timestamp("2026-05-09")
    for column in DATE_COLUMNS:
        parsed = pd.to_datetime(frame[column], errors="coerce")
        frame[f"{column}_ordinal"] = parsed.map(lambda value: value.toordinal() if pd.notna(value) else np.nan)
        frame[f"{column}_days_from_reference"] = (parsed - reference).dt.days
    return frame


def feature_columns_for(frame: pd.DataFrame) -> list[str]:
    columns: list[str] = []
    for column in frame.columns:
        if column in DROP_FEATURES or column in TARGETS or column in DATE_COLUMNS:
            continue
        if frame[column].map(lambda value: isinstance(value, (dict, list))).any():
            continue
        columns.append(column)
    return columns


def stage_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("prep", ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), ["crm_stage"])])),
            ("model", LogisticRegression(max_iter=1000)),
        ]
    )


def full_pipeline(seed: int) -> Pipeline:
    # The ColumnTransformer columns are inferred at fit time by selector lambdas.
    return Pipeline(
        steps=[
            ("prep", DynamicPreprocessor()),
            (
                "model",
                CalibratedClassifierCV(
                    estimator=RandomForestClassifier(
                        n_estimators=220,
                        min_samples_leaf=8,
                        class_weight="balanced_subsample",
                        random_state=seed,
                        n_jobs=-1,
                    ),
                    method="isotonic",
                    cv=3,
                ),
            ),
        ]
    )


class DynamicPreprocessor(BaseEstimator, TransformerMixin):
    """Small sklearn-compatible wrapper that builds preprocessing from a DataFrame."""

    def fit(self, X: pd.DataFrame, y: pd.Series | None = None) -> "DynamicPreprocessor":
        self.numeric_columns_ = X.select_dtypes(include=["number", "bool"]).columns.tolist()
        self.categorical_columns_ = [column for column in X.columns if column not in self.numeric_columns_]
        self.transformer_ = ColumnTransformer(
            transformers=[
                (
                    "num",
                    Pipeline(
                        steps=[
                            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                            ("scaler", StandardScaler(with_mean=False)),
                        ]
                    ),
                    self.numeric_columns_,
                ),
                (
                    "cat",
                    Pipeline(
                        steps=[
                            ("imputer", SimpleImputer(strategy="constant", fill_value="__missing__")),
                            ("onehot", OneHotEncoder(handle_unknown="ignore", min_frequency=10)),
                        ]
                    ),
                    self.categorical_columns_,
                ),
            ]
        )
        self.transformer_.fit(X, y)
        return self

    def transform(self, X: pd.DataFrame) -> Any:
        return self.transformer_.transform(X)

    def fit_transform(self, X: pd.DataFrame, y: pd.Series | None = None) -> Any:
        return self.fit(X, y).transform(X)


def score_predictions(y_true: pd.Series, probability: np.ndarray) -> dict[str, float | None]:
    scores: dict[str, float | None] = {
        "brier": round(float(brier_score_loss(y_true, probability)), 6),
        "log_loss": round(float(log_loss(y_true, np.clip(probability, 1e-6, 1 - 1e-6))), 6),
    }
    try:
        scores["roc_auc"] = round(float(roc_auc_score(y_true, probability)), 6)
    except ValueError:
        scores["roc_auc"] = None
    try:
        scores["pr_auc"] = round(float(average_precision_score(y_true, probability)), 6)
    except ValueError:
        scores["pr_auc"] = None
    return scores


def calibration_band(probability: float) -> str:
    if probability < 0.25:
        return "low"
    if probability < 0.55:
        return "medium"
    if probability < 0.80:
        return "high"
    return "very_high"


if __name__ == "__main__":
    main()
