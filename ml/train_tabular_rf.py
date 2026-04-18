"""
Train two Random Forest pipelines (pre-EQ and post-EQ), evaluate, export joblib + metadata.

Usage (from ml/):
  pip install -r requirements.txt
  python scripts/generate_synthetic_data.py
  python train_tabular_rf.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import (
    RandomizedSearchCV,
    StratifiedKFold,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

import sklearn

ML_ROOT = Path(__file__).resolve().parent
DATA_DIR = ML_ROOT / "data"
ARTIFACTS_DIR = ML_ROOT / "artifacts"

FEATURE_COLUMNS = [
    "year_built",
    "building_age",
    "number_of_stories",
    "building_use",
    "soil_classification",
    "distance_to_fault_km",
    "elevation_m",
    "slope_deg",
    "previous_retrofit",
    "structural_system",
    "foundation_type",
    "material",
]


def load_frame(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for c in FEATURE_COLUMNS:
        if c not in df.columns:
            raise ValueError(f"Missing column {c} in {path}")
    if "label" not in df.columns:
        raise ValueError(f"Missing label column in {path}")
    df["previous_retrofit"] = df["previous_retrofit"].astype(bool)
    return df


def build_pipeline(*, rf_params: dict | None = None) -> Pipeline:
    numeric_features = [
        "year_built",
        "building_age",
        "number_of_stories",
        "distance_to_fault_km",
        "elevation_m",
        "slope_deg",
        "previous_retrofit_as_int",
    ]
    categorical_features = [
        "building_use",
        "soil_classification",
        "structural_system",
        "foundation_type",
        "material",
    ]

    numeric_transformer = Pipeline([("imputer", SimpleImputer(strategy="median"))])
    categorical_transformer = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="unknown")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    preprocessor = ColumnTransformer([
        ("num", numeric_transformer, numeric_features),
        ("cat", categorical_transformer, categorical_features),
    ])

    defaults = dict(
        n_estimators=300,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    if rf_params:
        defaults.update(rf_params)

    return Pipeline([
        ("preprocess", preprocessor),
        ("classifier", RandomForestClassifier(**defaults)),
    ])


def prepare_x(df: pd.DataFrame) -> pd.DataFrame:
    x = df[FEATURE_COLUMNS].copy()
    x["previous_retrofit_as_int"] = x["previous_retrofit"].astype(int)
    x = x.drop(columns=["previous_retrofit"])
    return x


def train_one(csv_name: str, model_key: str) -> None:
    path = DATA_DIR / csv_name
    if not path.exists():
        print(f"Missing {path}; run: python scripts/generate_synthetic_data.py", file=sys.stderr)
        sys.exit(1)

    df = load_frame(path)
    X = prepare_x(df)
    y = df["label"].astype(str)

    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )

    # --- Hyperparameter search ---
    print(f"\n=== {model_key} ({csv_name}) ===")
    print("Running RandomizedSearchCV (50 iterations, 5-fold)...", flush=True)

    param_distributions = {
        "classifier__n_estimators": [200, 300, 400, 500],
        "classifier__max_depth": [10, 15, 20, 25, 30, None],
        "classifier__min_samples_leaf": [1, 2, 3, 5, 8],
        "classifier__min_samples_split": [2, 4, 6, 8],
        "classifier__max_features": ["sqrt", "log2", 0.5, 0.7, None],
    }

    base_pipeline = build_pipeline(rf_params={"n_jobs": 1})
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    search = RandomizedSearchCV(
        base_pipeline,
        param_distributions,
        n_iter=50,
        cv=skf,
        scoring="f1_macro",
        random_state=42,
        n_jobs=-1,
        verbose=0,
        refit=True,
    )
    search.fit(X_trainval, y_trainval)

    best_params = search.best_params_
    cv_f1 = search.best_score_
    print(f"Best CV macro-F1: {cv_f1:.4f}")
    print(f"Best params: {best_params}")

    pipeline = search.best_estimator_

    # --- Evaluate on held-out test ---
    y_pred = pipeline.predict(X_test)
    macro_f1 = f1_score(y_test, y_pred, average="macro")
    print(f"Hold-out test macro-F1: {macro_f1:.4f}")
    print("Classification report (test):\n")
    print(classification_report(y_test, y_pred, zero_division=0))
    print("Confusion matrix (test), labels order:", list(pipeline.classes_))
    print(confusion_matrix(y_test, y_pred, labels=list(pipeline.classes_)))

    # --- Feature importances ---
    preprocess = pipeline.named_steps["preprocess"]
    clf = pipeline.named_steps["classifier"]
    feature_names = preprocess.get_feature_names_out()
    importances = clf.feature_importances_
    importance_pairs = sorted(
        zip(feature_names, importances, strict=True),
        key=lambda t: t[1],
        reverse=True,
    )[:30]

    print("Top 30 feature importances (encoded space):")
    for name, imp in importance_pairs:
        print(f"  {name}: {imp:.4f}")

    # --- Save ---
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = ARTIFACTS_DIR / f"rf_{model_key}.joblib"
    joblib.dump(pipeline, model_path)
    print(f"\nSaved pipeline -> {model_path}")

    meta = {
        "model_key": model_key,
        "sklearn_version": sklearn.__version__,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_csv": path.relative_to(ML_ROOT).as_posix(),
        "label_classes": list(clf.classes_),
        "feature_columns_raw": FEATURE_COLUMNS,
        "best_hyperparameters": {k: (v if not isinstance(v, np.integer) else int(v)) for k, v in best_params.items()},
        "cv_macro_f1": float(cv_f1),
        "test_macro_f1": float(macro_f1),
        "top_feature_importances": [
            {"feature": str(n), "importance": float(i)} for n, i in importance_pairs
        ],
    }
    meta_path = ARTIFACTS_DIR / f"rf_{model_key}_metadata.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved metadata -> {meta_path}")


def main() -> None:
    train_one("train_pre.csv", "pre")
    train_one("train_post.csv", "post")


if __name__ == "__main__":
    main()
