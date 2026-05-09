from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from .common import DEFAULT_OUTPUT_DIR, TABLE_FILES, TARGETS, read_jsonl
except ImportError:  # pragma: no cover
    from common import DEFAULT_OUTPUT_DIR, TABLE_FILES, TARGETS, read_jsonl  # type: ignore


REQUIRED_DEAL_FIELDS = [
    "deal_id",
    "opportunity_id",
    "account_name",
    "deal_amount_arr",
    "crm_stage",
    "close_date",
    "original_close_date",
    "account_segment",
    "region",
]

HIDDEN_OUTCOME_FIELDS = [
    "closed_won",
    "closed_won_by_original_date",
    "slipped_to_next_quarter",
    "legal_approved_by_date",
    "security_completed_by_date",
    "closed_above_threshold",
    "latent_win_probability",
    "latent_drivers",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate generated synthetic deal files.")
    parser.add_argument("--in", dest="input_dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--expected-training", type=int, default=10_000)
    args = parser.parse_args()

    deals = read_jsonl(args.input_dir / TABLE_FILES["synthetic_deals"])
    outcomes = read_jsonl(args.input_dir / TABLE_FILES["synthetic_deal_outcomes"])
    events = read_jsonl(args.input_dir / TABLE_FILES["synthetic_deal_events"])
    predictions = read_jsonl(args.input_dir / TABLE_FILES["model_predictions"])

    training_deals = [deal for deal in deals if deal["dataset_role"] == "training_pool"]
    live_deals = [deal for deal in deals if deal["dataset_role"] == "live_pool"]
    assert len(training_deals) == args.expected_training, f"Expected {args.expected_training} training deals, found {len(training_deals)}"
    assert live_deals, "Expected at least one live_pool deal"
    assert len({deal["deal_id"] for deal in deals}) == len(deals), "Duplicate deal_id values found"
    assert len(outcomes) == len(deals), "Every deal should have an outcome row, including hidden live outcomes"

    for deal in deals:
        for field in REQUIRED_DEAL_FIELDS:
            assert is_present(deal.get(field)), f"{deal['deal_id']} missing required field {field}"
        leaked = [field for field in HIDDEN_OUTCOME_FIELDS if field in deal]
        assert not leaked, f"{deal['deal_id']} leaks hidden outcome fields in observable table: {leaked}"

    missingness_rates = completeness_summary(training_deals)
    average_completeness = sum(missingness_rates.values()) / len(missingness_rates)
    assert 0.55 <= average_completeness <= 0.95, f"Average completeness out of expected range: {average_completeness:.3f}"

    late_stage = [deal for deal in training_deals if deal["crm_stage"] in {"Negotiation", "Procurement"}]
    early_stage = [deal for deal in training_deals if deal["crm_stage"] in {"Discovery", "Qualified"}]
    assert completeness(late_stage, "legal_status") >= completeness(early_stage, "legal_status"), "Late-stage legal completeness should exceed early-stage"
    assert completeness(late_stage, "procurement_status") >= completeness(early_stage, "procurement_status"), "Late-stage procurement completeness should exceed early-stage"

    target_counts = {target: sum(1 for row in outcomes if row[target]) for target in TARGETS}
    for target, positives in target_counts.items():
        assert positives > 0, f"No positive labels for {target}"

    result = {
        "training_deals": len(training_deals),
        "live_deals": len(live_deals),
        "outcomes": len(outcomes),
        "events": len(events),
        "predictions": len(predictions),
        "average_field_completeness": round(average_completeness, 4),
        "target_positive_counts": target_counts,
    }
    print(json.dumps(result, indent=2, sort_keys=True))


def completeness_summary(rows: list[dict]) -> dict[str, float]:
    skip = {"missingness_mask", "source_profile", "private_signal_profile"}
    fields = [field for field in rows[0].keys() if field not in skip]
    return {field: completeness(rows, field) for field in fields}


def completeness(rows: list[dict], field: str) -> float:
    if not rows:
        return 0.0
    present = sum(1 for row in rows if is_present(row.get(field)))
    return present / len(rows)


def is_present(value: object) -> bool:
    if value is None or value == "":
        return False
    if isinstance(value, (list, dict)) and len(value) == 0:
        return False
    return True


if __name__ == "__main__":
    main()
