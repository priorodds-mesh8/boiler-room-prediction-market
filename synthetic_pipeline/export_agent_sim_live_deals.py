from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from .common import DEFAULT_OUTPUT_DIR, TARGETS, TABLE_FILES, read_jsonl, write_jsonl
except ImportError:  # pragma: no cover
    from common import DEFAULT_OUTPUT_DIR, TARGETS, TABLE_FILES, read_jsonl, write_jsonl  # type: ignore


def main() -> None:
    parser = argparse.ArgumentParser(description="Export held-out live deals for Agent Sim.")
    parser.add_argument("--in", dest="input_dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--model-kind", default="full_random_forest_calibrated")
    args = parser.parse_args()

    live_rows = read_jsonl(args.input_dir / TABLE_FILES["agent_sim_live_deals"])
    predictions = read_jsonl(args.input_dir / TABLE_FILES["model_predictions"])
    prediction_lookup: dict[str, dict[str, float]] = {}
    for row in predictions:
        if row["model_kind"] != args.model_kind:
            continue
        prediction_lookup.setdefault(row["deal_id"], {})[row["target"]] = row["probability"]

    exported: list[dict[str, Any]] = []
    for row in live_rows[: args.limit]:
        baseline = {target: prediction_lookup.get(row["deal_id"], {}).get(target) for target in TARGETS}
        row = dict(row)
        row["baseline_probabilities"] = baseline
        exported.append(row)

    write_jsonl(args.input_dir / TABLE_FILES["agent_sim_live_deals"], exported)
    (args.input_dir / "agent_sim_live_deals.json").write_text(json.dumps(exported, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"exported_live_deals": len(exported), "model_kind": args.model_kind}, indent=2))


if __name__ == "__main__":
    main()
