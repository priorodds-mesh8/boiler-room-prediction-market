from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from datetime import date, timedelta
from pathlib import Path
from typing import Any

try:
    from .common import (
        DATASET_VERSION,
        DEFAULT_OUTPUT_DIR,
        TARGETS,
        clamp,
        fiscal_quarter,
        quarter_end,
        sigmoid,
        write_jsonl,
    )
except ImportError:  # pragma: no cover - lets the file run as a script
    from common import (  # type: ignore
        DATASET_VERSION,
        DEFAULT_OUTPUT_DIR,
        TARGETS,
        clamp,
        fiscal_quarter,
        quarter_end,
        sigmoid,
        write_jsonl,
    )


STAGES = ["Discovery", "Qualified", "Technical Validation", "Business Case", "Negotiation", "Procurement"]
STAGE_BASE = {
    "Discovery": 0.16,
    "Qualified": 0.28,
    "Technical Validation": 0.45,
    "Business Case": 0.57,
    "Negotiation": 0.70,
    "Procurement": 0.78,
}
STAGE_INDEX = {stage: index for index, stage in enumerate(STAGES)}

SEGMENTS = ["Commercial", "Enterprise", "Strategic", "Public Sector"]
REGIONS = ["East", "Central", "West", "EMEA", "APAC"]
INDUSTRIES = [
    "Financial Services",
    "Healthcare",
    "Manufacturing",
    "Retail",
    "Technology",
    "Public Sector",
    "Energy",
    "Education",
    "Transportation",
    "Pharmaceuticals",
]
PRODUCTS = ["Revenue Intelligence", "Workflow Automation", "Data Cloud", "Security Suite", "Enterprise Platform"]
DEAL_TYPES = ["New Logo", "Expansion", "Renewal", "Pilot", "Upsell"]
FORECAST_CATEGORIES = ["Pipeline", "Best Case", "Commit", "Omitted"]
LEAD_SOURCES = ["Outbound", "Inbound", "Partner", "Event", "Executive Referral", "Expansion Signal"]
PROCUREMENT_STATUSES = ["Not started", "Vendor setup", "PO requested", "Approved", "Blocked"]
LEGAL_STATUSES = ["Not started", "Redlines pending", "In review", "Approved", "Blocked"]
SECURITY_STATUSES = ["Not required", "Questionnaire sent", "Review scheduled", "Passed", "Blocked"]
MAP_STATUSES = ["Not started", "Drafted", "Shared", "Mutual", "Stale"]
PAYMENT_TERMS = ["Net 30", "Net 45", "Net 60", "Annual upfront", "Quarterly", "Multi-year prepaid"]
PAPER_TYPES = ["Vendor paper", "Customer paper", "Marketplace order", "Reseller paper"]
COMPETITORS = ["Clari", "Salesforce", "Anaplan", "Spreadsheet process", "In-house build", "No decision", "Other"]
INCUMBENTS = ["None", "Weak incumbent", "Entrenched incumbent", "Homegrown", "Competitive rip-and-replace"]
COMPLIANCE = ["SOC 2", "GDPR", "HIPAA", "PCI", "FedRAMP", "ISO 27001", "Data residency"]
INTEGRATIONS = ["Salesforce", "HubSpot", "Snowflake", "Gong", "Okta", "Slack", "Workday", "NetSuite"]
LOSS_REASONS = ["No decision", "Budget", "Competitor", "Security blocker", "Timing", "No champion", "Price"]

ACCOUNT_PREFIXES = [
    "Apex",
    "Northstar",
    "Redwood",
    "BluePeak",
    "Summit",
    "Keystone",
    "Cobalt",
    "Harbor",
    "Meridian",
    "Crescent",
    "Pioneer",
    "Nimbus",
    "Vector",
    "Prairie",
    "Frontier",
    "Vista",
    "Orion",
    "Helix",
    "Strata",
    "Forge",
]
ACCOUNT_SUFFIXES = [
    "Health",
    "Bank",
    "Logistics",
    "Systems",
    "Energy",
    "Retail",
    "BioSystems",
    "Manufacturing",
    "Capital",
    "Cloud",
    "Transit",
    "Foods",
    "Pharma",
    "Insurance",
    "Robotics",
]

SCALAR_FIELDS = [
    "account_domain",
    "industry",
    "employee_count",
    "annual_revenue_band",
    "existing_customer_flag",
    "account_health_score",
    "lead_source",
    "partner_sourced_flag",
    "deal_type",
    "product_line",
    "forecast_category",
    "rep_stated_probability",
    "crm_model_probability",
    "historical_win_rate_similar_deals",
    "days_to_close",
    "close_date_change_count",
    "sales_cycle_age_days",
    "stage_age_days",
    "stage_regression_count",
    "prior_slipped_quarter_count",
    "last_activity_date",
    "activity_count_last_14_days",
    "next_step_quality",
    "mutual_action_plan_status",
    "champion_strength",
    "champion_seniority",
    "champion_responsiveness",
    "economic_buyer_identified",
    "executive_sponsor_engaged",
    "executive_meeting_completed",
    "buyer_stakeholder_count",
    "buying_committee_contact_count",
    "active_detractor_count",
    "decision_process_clarity",
    "decision_criteria_known",
    "compelling_event_strength",
    "business_pain_severity",
    "quantified_value_roi_present",
    "urgency_score",
    "budget_confirmed",
    "budget_owner_identified",
    "procurement_status",
    "legal_status",
    "security_review_status",
    "contract_paper_type",
    "data_residency_requirement",
    "sso_saml_requirement",
    "infosec_questionnaire_length",
    "implementation_complexity",
    "pilot_completed_flag",
    "pilot_success_score",
    "implementation_start_date_dependency",
    "discount_requested",
    "required_discount_approval_level",
    "payment_terms_requested",
    "multi_year_term_requested",
    "competitor_present",
    "competitor_name",
    "competitive_displacement_difficulty",
    "incumbent_vendor_status",
    "renewal_date_proximity_days",
    "product_usage_signal",
    "prior_support_escalations",
    "reference_call_completed",
    "buyer_sentiment_score",
    "sensitive_deal_flag",
]

REQUIRED_OBSERVABLE_FIELDS = {
    "deal_id",
    "run_id",
    "dataset_version",
    "dataset_role",
    "ml_split",
    "opportunity_id",
    "account_name",
    "account_segment",
    "region",
    "deal_amount_arr",
    "crm_stage",
    "created_date",
    "close_date",
    "original_close_date",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic B2B sales deals for Boiler Room.")
    parser.add_argument("--n", type=int, default=10_000, help="Training-pool deal count.")
    parser.add_argument("--live-n", type=int, default=200, help="Held-out live-pool deal count.")
    parser.add_argument("--seed", type=int, default=20260509)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--run-id", default=None)
    args = parser.parse_args()

    rows = generate_dataset(args.n, args.live_n, args.seed, args.run_id)
    args.out.mkdir(parents=True, exist_ok=True)

    for name, records in rows.items():
        if name == "csv_deals":
            continue
        write_jsonl(args.out / f"{name}.jsonl", records)

    write_csv(args.out / "synthetic_deals.csv", rows["synthetic_deals"])
    write_csv(args.out / "synthetic_deal_outcomes.csv", rows["synthetic_deal_outcomes"])

    manifest = {
        "run_id": rows["synthetic_dataset_runs"][0]["run_id"],
        "dataset_version": DATASET_VERSION,
        "training_pool_rows": args.n,
        "live_pool_rows": args.live_n,
        "targets": TARGETS,
        "files": sorted(str(path.name) for path in args.out.glob("*")),
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


def generate_dataset(n: int, live_n: int, seed: int, run_id: str | None = None) -> dict[str, list[dict[str, Any]]]:
    rng = random.Random(seed)
    run_id = run_id or f"run_{DATASET_VERSION}_{seed}"
    created_at = "2026-05-09T12:00:00Z"
    deals: list[dict[str, Any]] = []
    outcomes: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    live_deals: list[dict[str, Any]] = []

    total = n + live_n
    for index in range(total):
        dataset_role = "training_pool" if index < n else "live_pool"
        if dataset_role == "live_pool":
            ml_split = "live"
        elif index < int(n * 0.70):
            ml_split = "train"
        elif index < int(n * 0.85):
            ml_split = "validation"
        else:
            ml_split = "test"

        full_deal = make_full_deal(index, run_id, dataset_role, ml_split, rng)
        outcome = make_outcome(full_deal, rng)
        event_rows = make_events(full_deal, outcome, rng)
        observable = apply_missingness(full_deal, rng)
        deals.append(observable)
        outcomes.append(outcome)
        events.extend(event_rows)
        if dataset_role == "live_pool":
            live_deals.append(make_live_deal(observable))

    run = {
        "run_id": run_id,
        "dataset_version": DATASET_VERSION,
        "seed": seed,
        "row_count": n,
        "live_row_count": live_n,
        "generator_config": {
            "training_rows": n,
            "live_rows": live_n,
            "field_count": len(REQUIRED_OBSERVABLE_FIELDS) + len(SCALAR_FIELDS) + 6,
            "missingness": ["MCAR", "MAR", "MNAR"],
        },
        "research_basis": {
            "crm": ["Salesforce Opportunity fields", "HubSpot default deal properties"],
            "qualification": ["MEDDIC", "MEDDPICC"],
            "buying_process": ["B2B buying committees", "multi-stakeholder buying journey"],
            "forecasting": ["sales opportunity win propensity", "pipeline forecasting"],
        },
        "created_at": created_at,
    }
    return {
        "synthetic_dataset_runs": [run],
        "synthetic_deals": deals,
        "synthetic_deal_outcomes": outcomes,
        "synthetic_deal_events": events,
        "agent_sim_live_deals": live_deals,
    }


def make_full_deal(index: int, run_id: str, dataset_role: str, ml_split: str, rng: random.Random) -> dict[str, Any]:
    deal_id = f"deal_{index + 1:05d}"
    account_name = make_account_name(index, rng)
    segment = weighted_choice(rng, [("Commercial", 0.34), ("Enterprise", 0.34), ("Strategic", 0.22), ("Public Sector", 0.10)])
    industry = rng.choice(INDUSTRIES)
    region = rng.choice(REGIONS)
    deal_type = weighted_choice(rng, [("New Logo", 0.48), ("Expansion", 0.22), ("Renewal", 0.16), ("Pilot", 0.08), ("Upsell", 0.06)])
    existing_customer = deal_type in {"Expansion", "Renewal", "Upsell"} or rng.random() < 0.12
    product_line = rng.choice(PRODUCTS)
    stage = stage_for_role(dataset_role, rng)

    amount = deal_amount(segment, deal_type, rng)
    created_date = date(2025, 1, 1) + timedelta(days=rng.randint(0, 455))
    sales_cycle_age = sales_cycle_age_days(segment, stage, deal_type, rng)
    original_close_date = created_date + timedelta(days=max(20, sales_cycle_age + rng.randint(15, 80)))
    close_date_change_count = close_date_changes(stage, amount, rng)
    close_date = original_close_date + timedelta(days=close_date_change_count * rng.randint(7, 35))
    stage_age = max(2, int(rng.gauss(12 + STAGE_INDEX[stage] * 5 + close_date_change_count * 4, 8)))
    last_activity_lag = max(0, int(rng.expovariate(1 / (5 + close_date_change_count * 2))))
    last_activity_date = min(close_date, date(2026, 5, 9)) - timedelta(days=last_activity_lag)

    committee_contacts = max(1, int(rng.gauss({"Commercial": 3, "Enterprise": 6, "Strategic": 8, "Public Sector": 7}[segment], 2)))
    active_detractors = max(0, int(rng.gauss(0.5 + (amount > 1_000_000) + (segment == "Public Sector"), 0.9)))
    economic_buyer = rng.random() < (0.28 + STAGE_INDEX[stage] * 0.10 + (segment in {"Enterprise", "Strategic"}) * 0.08)
    champion_strength = score_1_5(rng, 2.5 + 0.25 * STAGE_INDEX[stage] + 0.4 * existing_customer)
    champion_responsiveness = score_1_5(rng, 2.7 + 0.25 * champion_strength - 0.35 * active_detractors)
    decision_process = score_1_5(rng, 2.0 + 0.35 * STAGE_INDEX[stage] + 0.25 * economic_buyer)
    business_pain = score_1_5(rng, 2.7 + 0.4 * (deal_type != "Renewal") + rng.random())
    urgency = score_1_5(rng, 2.4 + 0.3 * business_pain + 0.4 * (close_date <= quarter_end(close_date)))
    budget_confirmed = rng.random() < (0.18 + 0.12 * STAGE_INDEX[stage] + 0.14 * economic_buyer)
    procurement_status = process_status(PROCUREMENT_STATUSES, stage, rng)
    legal_status = process_status(LEGAL_STATUSES, stage, rng)
    security_status = process_status(SECURITY_STATUSES, stage, rng)
    competitor_present = rng.random() < (0.45 + 0.10 * (deal_type == "New Logo") + 0.08 * (segment == "Strategic"))
    discount = discount_rate(segment, deal_type, competitor_present, rng)
    historical_win_rate = calc_historical_win_rate(segment, deal_type, product_line, industry)
    account_health = None if not existing_customer else round(clamp(rng.gauss(72, 16), 5, 99), 1)
    product_usage = None if not existing_customer else round(clamp(rng.gauss(68, 20), 0, 100), 1)
    forecast_category = forecast_category_for(stage, rng)
    employee_count = employee_count_for(segment, rng)
    revenue_band = revenue_band_for(segment, rng)
    compliance = compliance_for(industry, segment, product_line, rng)
    integrations = integration_requirements(segment, product_line, rng)
    info_sec_len = infosec_length(segment, security_status, compliance, rng)
    pilot_completed = rng.random() < (0.10 + 0.12 * STAGE_INDEX[stage] + 0.12 * (deal_type == "Pilot"))
    pilot_success = None if not pilot_completed else score_1_5(rng, 3.2 + 0.2 * champion_strength)
    close_days = (close_date - date(2026, 5, 9)).days
    stage_regressions = max(0, int(rng.gauss(0.2 + close_date_change_count * 0.3, 0.55)))
    slipped_quarters = max(0, int(rng.gauss(close_date_change_count * 0.45, 0.75)))
    activity_count = max(0, int(rng.gauss(5 + STAGE_INDEX[stage] * 2 - close_date_change_count, 4)))
    rep_prob = clamp(STAGE_BASE[stage] + rng.gauss(0.08 if forecast_category == "Commit" else 0.02, 0.12), 0.03, 0.96)
    crm_prob = clamp(STAGE_BASE[stage] + rng.gauss(0.0, 0.08), 0.03, 0.94)

    deal = {
        "deal_id": deal_id,
        "run_id": run_id,
        "dataset_version": DATASET_VERSION,
        "dataset_role": dataset_role,
        "ml_split": ml_split,
        "opportunity_id": f"006SYN{index + 1:09d}",
        "account_name": account_name,
        "account_domain": domain_for(account_name),
        "account_segment": segment,
        "region": region,
        "territory": f"{region}-{rng.randint(1, 8)}",
        "industry": industry,
        "employee_count": employee_count,
        "annual_revenue_band": revenue_band,
        "existing_customer_flag": existing_customer,
        "account_health_score": account_health,
        "lead_source": lead_source_for(deal_type, rng),
        "partner_sourced_flag": rng.random() < (0.14 + 0.08 * (segment == "Public Sector")),
        "deal_amount_arr": amount,
        "deal_type": deal_type,
        "product_line": product_line,
        "crm_stage": stage,
        "forecast_category": forecast_category,
        "rep_stated_probability": round(rep_prob, 4),
        "crm_model_probability": round(crm_prob, 4),
        "historical_win_rate_similar_deals": round(historical_win_rate, 4),
        "created_date": created_date.isoformat(),
        "close_date": close_date.isoformat(),
        "original_close_date": original_close_date.isoformat(),
        "days_to_close": close_days,
        "close_date_change_count": close_date_change_count,
        "sales_cycle_age_days": sales_cycle_age,
        "stage_age_days": stage_age,
        "stage_regression_count": stage_regressions,
        "prior_slipped_quarter_count": slipped_quarters,
        "last_activity_date": last_activity_date.isoformat(),
        "activity_count_last_14_days": activity_count,
        "next_step_quality": score_1_5(rng, 2.5 + 0.18 * STAGE_INDEX[stage] - 0.3 * close_date_change_count),
        "mutual_action_plan_status": map_status_for(stage, rng),
        "champion_strength": champion_strength,
        "champion_seniority": champion_seniority_for(champion_strength, rng),
        "champion_responsiveness": champion_responsiveness,
        "economic_buyer_identified": economic_buyer,
        "executive_sponsor_engaged": rng.random() < (0.10 + 0.10 * STAGE_INDEX[stage] + 0.08 * (segment == "Strategic")),
        "executive_meeting_completed": rng.random() < (0.12 + 0.12 * STAGE_INDEX[stage]),
        "buyer_stakeholder_count": committee_contacts,
        "buying_committee_contact_count": committee_contacts,
        "active_detractor_count": active_detractors,
        "decision_process_clarity": decision_process,
        "decision_criteria_known": rng.random() < (0.24 + 0.11 * STAGE_INDEX[stage]),
        "compelling_event_strength": score_1_5(rng, 2.2 + 0.35 * urgency),
        "business_pain_severity": business_pain,
        "quantified_value_roi_present": rng.random() < (0.16 + 0.11 * STAGE_INDEX[stage] + 0.08 * (amount > 800_000)),
        "urgency_score": urgency,
        "budget_confirmed": budget_confirmed,
        "budget_owner_identified": rng.random() < (0.22 + 0.12 * STAGE_INDEX[stage] + 0.15 * budget_confirmed),
        "procurement_status": procurement_status,
        "legal_status": legal_status,
        "security_review_status": security_status,
        "contract_paper_type": weighted_choice(rng, [("Vendor paper", 0.52), ("Customer paper", 0.31), ("Marketplace order", 0.08), ("Reseller paper", 0.09)]),
        "data_residency_requirement": rng.choice(["None", "EU", "US", "Canada", "APAC"]) if ("GDPR" in compliance or segment == "Public Sector") else "None",
        "sso_saml_requirement": rng.random() < (0.35 + 0.2 * (segment in {"Enterprise", "Strategic"})),
        "infosec_questionnaire_length": info_sec_len,
        "implementation_complexity": score_1_5(rng, 2.1 + 0.35 * len(integrations) + 0.25 * (amount > 1_000_000)),
        "pilot_completed_flag": pilot_completed,
        "pilot_success_score": pilot_success,
        "implementation_start_date_dependency": rng.random() < (0.18 + 0.12 * (segment in {"Enterprise", "Strategic"})),
        "discount_requested": discount,
        "required_discount_approval_level": approval_level_for(discount),
        "payment_terms_requested": rng.choice(PAYMENT_TERMS),
        "multi_year_term_requested": rng.random() < (0.20 + 0.14 * (amount > 700_000) + 0.12 * existing_customer),
        "competitor_present": competitor_present,
        "competitor_name": rng.choice(COMPETITORS[:-1]) if competitor_present else None,
        "competitive_displacement_difficulty": score_1_5(rng, 2.2 + 0.45 * competitor_present + 0.45 * (deal_type == "New Logo")),
        "incumbent_vendor_status": rng.choice(INCUMBENTS),
        "renewal_date_proximity_days": rng.randint(0, 240) if deal_type in {"Renewal", "Expansion", "Upsell"} else None,
        "product_usage_signal": product_usage,
        "prior_support_escalations": max(0, int(rng.gauss(0.6 + 1.2 * (existing_customer and account_health and account_health < 45), 1.0))),
        "reference_call_completed": rng.random() < (0.08 + 0.09 * STAGE_INDEX[stage]),
        "buyer_sentiment_score": round(clamp(rng.gauss(0.55 + 0.05 * champion_strength - 0.05 * active_detractors, 0.18), 0, 1), 3),
        "sensitive_deal_flag": rng.random() < (0.03 + 0.04 * (amount > 1_200_000) + 0.02 * (segment == "Public Sector")),
        "compliance_requirements": compliance,
        "integration_requirements": integrations,
        "account_team_members": account_team(segment, rng),
        "stakeholder_map": stakeholder_map(committee_contacts, active_detractors, economic_buyer, rng),
        "missingness_mask": {},
        "source_profile": source_profile(),
        "private_signal_profile": private_signal_profile(rng),
    }
    return deal


def make_outcome(deal: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    stage = deal["crm_stage"]
    amount_m = deal["deal_amount_arr"] / 1_000_000
    legal_penalty = status_penalty(deal["legal_status"])
    security_penalty = status_penalty(deal["security_review_status"])
    procurement_penalty = status_penalty(deal["procurement_status"])
    score = -1.70 + 2.90 * STAGE_BASE[stage]
    score += 0.26 * nz(deal["champion_strength"], 3) + 0.22 * nz(deal["decision_process_clarity"], 3)
    score += 0.35 * bool_int(deal["economic_buyer_identified"]) + 0.28 * bool_int(deal["budget_confirmed"])
    score += 0.20 * bool_int(deal["executive_sponsor_engaged"]) + 0.25 * bool_int(deal["quantified_value_roi_present"])
    score += 0.10 * nz(deal["business_pain_severity"], 3) + 0.11 * nz(deal["urgency_score"], 3)
    score += 0.45 * (deal["historical_win_rate_similar_deals"] - 0.45)
    score -= 0.18 * amount_m + 0.22 * deal["close_date_change_count"] + 0.10 * deal["stage_regression_count"]
    score -= 0.18 * deal["active_detractor_count"] + 0.10 * deal["competitive_displacement_difficulty"]
    score -= legal_penalty + security_penalty + procurement_penalty
    score += 0.16 * bool_int(deal["pilot_completed_flag"]) * (nz(deal["pilot_success_score"], 3) - 2.5)
    score += 0.25 * (deal["buyer_sentiment_score"] - 0.5)
    score += rng.gauss(0, 0.38)
    win_probability = clamp(sigmoid(score), 0.02, 0.98)
    closed_won = rng.random() < win_probability

    slip_score = -0.80 + 0.30 * amount_m + 0.50 * deal["close_date_change_count"] + 0.18 * deal["stage_age_days"] / 30
    slip_score += 0.45 * (procurement_penalty > 0.4) + 0.35 * (legal_penalty > 0.4) + 0.25 * (security_penalty > 0.4)
    slip_score -= 0.25 * bool_int(deal["mutual_action_plan_status"] == "Mutual") + 0.25 * bool_int(deal["budget_confirmed"])
    slip_probability = clamp(sigmoid(slip_score), 0.03, 0.92)
    slipped = rng.random() < slip_probability

    legal_approval_probability = approval_probability(deal["legal_status"], deal, rng)
    security_approval_probability = approval_probability(deal["security_review_status"], deal, rng)
    legal_approved = rng.random() < legal_approval_probability
    security_completed = rng.random() < security_approval_probability
    original_close = date.fromisoformat(deal["original_close_date"])
    actual_close = date.fromisoformat(deal["close_date"])
    if closed_won:
        actual_close = actual_close + timedelta(days=rng.randint(-10, 24 if slipped else 7))
        final_arr_multiplier = 1.03
        final_arr_multiplier -= 0.62 * deal["discount_requested"]
        final_arr_multiplier -= 0.05 * bool_int(deal["competitor_present"])
        final_arr_multiplier += 0.05 * bool_int(deal["multi_year_term_requested"])
        final_arr_multiplier += 0.04 * bool_int(deal["budget_confirmed"])
        final_arr_multiplier += 0.02 * (nz(deal["urgency_score"], 3) - 3)
        final_arr = round(deal["deal_amount_arr"] * clamp(rng.gauss(final_arr_multiplier, 0.08), 0.62, 1.22), 2)
    else:
        actual_close = actual_close + timedelta(days=rng.randint(-8, 35))
        final_arr = 0

    close_above_threshold = bool(closed_won and final_arr >= deal["deal_amount_arr"] * 0.92)
    closed_by_original = bool(closed_won and actual_close <= original_close)
    lost_reason = None if closed_won else rng.choice(LOSS_REASONS)
    drivers = latent_drivers(deal, legal_penalty, security_penalty, procurement_penalty)
    return {
        "deal_id": deal["deal_id"],
        "run_id": deal["run_id"],
        "closed_won": closed_won,
        "closed_won_by_original_date": closed_by_original,
        "slipped_to_next_quarter": bool(slipped or actual_close > quarter_end(original_close)),
        "legal_approved_by_date": legal_approved,
        "security_completed_by_date": security_completed,
        "closed_above_threshold": close_above_threshold,
        "final_arr": final_arr,
        "actual_close_date": actual_close.isoformat(),
        "close_lost_reason": lost_reason,
        "latent_win_probability": round(win_probability, 5),
        "latent_slip_probability": round(slip_probability, 5),
        "latent_approval_probability": round((legal_approval_probability + security_approval_probability) / 2, 5),
        "latent_drivers": drivers,
    }


def make_events(deal: dict[str, Any], outcome: dict[str, Any], rng: random.Random) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    created = date.fromisoformat(deal["created_date"])
    for idx, stage in enumerate(STAGES[: STAGE_INDEX[deal["crm_stage"]] + 1]):
        events.append(event(deal, f"{deal['deal_id']}_stage_{idx}", created + timedelta(days=idx * max(7, deal["sales_cycle_age_days"] // 7)), "stage_change", "crm", {"stage": stage}))
    for idx in range(deal["close_date_change_count"]):
        events.append(event(deal, f"{deal['deal_id']}_close_move_{idx}", created + timedelta(days=20 + idx * 25), "close_date_changed", "crm", {"move_number": idx + 1}))
    activity_events = min(12, max(3, deal["activity_count_last_14_days"] + rng.randint(0, 4)))
    for idx in range(activity_events):
        events.append(event(deal, f"{deal['deal_id']}_activity_{idx}", created + timedelta(days=rng.randint(3, max(8, deal["sales_cycle_age_days"]))), "activity", "engagement", {"kind": rng.choice(["email", "call", "meeting", "demo"])}))
    if deal["legal_status"] != "Not started":
        events.append(event(deal, f"{deal['deal_id']}_legal", date.fromisoformat(deal["close_date"]) - timedelta(days=rng.randint(5, 35)), "legal_status", "legal", {"status": deal["legal_status"]}))
    if deal["security_review_status"] != "Not required":
        events.append(event(deal, f"{deal['deal_id']}_security", date.fromisoformat(deal["close_date"]) - timedelta(days=rng.randint(7, 45)), "security_status", "security", {"status": deal["security_review_status"]}))
    events.append(event(deal, f"{deal['deal_id']}_outcome_marker", date.fromisoformat(outcome["actual_close_date"]), "observed_outcome", "finance", {"closed_won": outcome["closed_won"]}))
    return events


def event(deal: dict[str, Any], event_id: str, event_date: date, event_type: str, source: str, value: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "deal_id": deal["deal_id"],
        "run_id": deal["run_id"],
        "event_date": event_date.isoformat(),
        "event_type": event_type,
        "event_source": source,
        "event_value": value,
    }


def apply_missingness(deal: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    observed = dict(deal)
    mask: dict[str, str] = {}
    stage_index = STAGE_INDEX[deal["crm_stage"]]
    for field in SCALAR_FIELDS:
        if field in REQUIRED_OBSERVABLE_FIELDS:
            continue
        probability = 0.14
        reason = "MCAR"
        if field in {"legal_status", "procurement_status", "security_review_status", "contract_paper_type", "infosec_questionnaire_length"}:
            probability = max(0.10, 0.68 - 0.10 * stage_index)
            reason = "MAR_stage"
        elif field in {"economic_buyer_identified", "budget_confirmed", "decision_process_clarity", "decision_criteria_known"}:
            probability = 0.15 + 0.16 * (not deal.get(field, False))
            reason = "MNAR_qualification_absence"
        elif field in {"next_step_quality", "last_activity_date", "activity_count_last_14_days"}:
            probability = 0.14 + 0.16 * (deal.get("activity_count_last_14_days", 0) <= 1)
            reason = "MNAR_activity_staleness"
        elif field in {"pilot_success_score", "product_usage_signal", "account_health_score", "renewal_date_proximity_days"}:
            probability = 0.70 if deal.get(field) is None else 0.08
            reason = "MAR_deal_type"
        elif field in {"competitor_name"}:
            probability = 0.70 if not deal.get("competitor_present") else 0.10
            reason = "MAR_competition"
        elif field in {"buyer_sentiment_score", "champion_responsiveness", "business_pain_severity"}:
            probability = 0.12 + 0.08 * (stage_index <= 1)
            reason = "MAR_stage"
        if rng.random() < probability:
            observed[field] = None
            mask[field] = reason
    observed["missingness_mask"] = mask
    return observed


def make_live_deal(deal: dict[str, Any]) -> dict[str, Any]:
    baseline = {
        "closed_won": deal.get("crm_model_probability"),
        "closed_won_by_original_date": deal.get("crm_model_probability"),
        "slipped_to_next_quarter": None,
        "legal_approved_by_date": None,
        "security_completed_by_date": None,
        "closed_above_threshold": None,
    }
    return {
        "live_deal_id": f"live_{deal['deal_id']}",
        "deal_id": deal["deal_id"],
        "run_id": deal["run_id"],
        "market_question": f"Will {deal['account_name']} close-won by {deal['close_date']}?",
        "baseline_probabilities": baseline,
        "observable_payload": public_payload(deal),
        "agent_private_signal_seed": deal.get("private_signal_profile", {}),
    }


def public_payload(deal: dict[str, Any]) -> dict[str, Any]:
    hidden_keys = {"private_signal_profile", "missingness_mask", "source_profile"}
    return {key: value for key, value in deal.items() if key not in hidden_keys}


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value) if isinstance(value, (list, dict)) else value for key, value in row.items()})


def weighted_choice(rng: random.Random, choices: list[tuple[Any, float]]) -> Any:
    total = sum(weight for _, weight in choices)
    pick = rng.random() * total
    upto = 0.0
    for value, weight in choices:
        upto += weight
        if upto >= pick:
            return value
    return choices[-1][0]


def make_account_name(index: int, rng: random.Random) -> str:
    return f"{rng.choice(ACCOUNT_PREFIXES)} {rng.choice(ACCOUNT_SUFFIXES)} {index + 1}"


def domain_for(account: str) -> str:
    clean = "".join(ch.lower() for ch in account if ch.isalnum())
    return f"{clean}.example.com"


def stage_for_role(dataset_role: str, rng: random.Random) -> str:
    if dataset_role == "live_pool":
        return weighted_choice(rng, [("Qualified", 0.20), ("Technical Validation", 0.24), ("Business Case", 0.24), ("Negotiation", 0.20), ("Procurement", 0.12)])
    return weighted_choice(rng, [("Discovery", 0.15), ("Qualified", 0.22), ("Technical Validation", 0.22), ("Business Case", 0.18), ("Negotiation", 0.15), ("Procurement", 0.08)])


def deal_amount(segment: str, deal_type: str, rng: random.Random) -> int:
    bases = {"Commercial": 95_000, "Enterprise": 360_000, "Strategic": 1_050_000, "Public Sector": 520_000}
    multiplier = {"New Logo": 1.0, "Expansion": 0.72, "Renewal": 0.90, "Pilot": 0.32, "Upsell": 0.45}[deal_type]
    return int(round(clamp(rng.lognormvariate(0, 0.55) * bases[segment] * multiplier, 20_000, 3_500_000), -3))


def sales_cycle_age_days(segment: str, stage: str, deal_type: str, rng: random.Random) -> int:
    base = {"Commercial": 45, "Enterprise": 90, "Strategic": 135, "Public Sector": 150}[segment]
    base *= {"Pilot": 0.6, "Expansion": 0.72, "Upsell": 0.66, "Renewal": 0.82, "New Logo": 1.0}[deal_type]
    return max(15, int(rng.gauss(base * (0.45 + STAGE_INDEX[stage] * 0.18), 22)))


def close_date_changes(stage: str, amount: int, rng: random.Random) -> int:
    lam = 0.25 + 0.18 * STAGE_INDEX[stage] + 0.35 * (amount > 1_000_000)
    count = 0
    while rng.random() < min(0.72, lam / (count + 1.5)):
        count += 1
    return min(count, 5)


def score_1_5(rng: random.Random, mean: float) -> int:
    return int(round(clamp(rng.gauss(mean, 0.95), 1, 5)))


def employee_count_for(segment: str, rng: random.Random) -> int:
    ranges = {"Commercial": (80, 900), "Enterprise": (900, 7000), "Strategic": (7000, 85000), "Public Sector": (1200, 120000)}
    low, high = ranges[segment]
    return rng.randint(low, high)


def revenue_band_for(segment: str, rng: random.Random) -> str:
    bands = {
        "Commercial": ["$10M-$50M", "$50M-$100M", "$100M-$250M"],
        "Enterprise": ["$250M-$500M", "$500M-$1B", "$1B-$5B"],
        "Strategic": ["$1B-$5B", "$5B-$10B", "$10B+"],
        "Public Sector": ["Budget <$100M", "Budget $100M-$1B", "Budget $1B+"],
    }
    return rng.choice(bands[segment])


def lead_source_for(deal_type: str, rng: random.Random) -> str:
    if deal_type in {"Expansion", "Renewal", "Upsell"}:
        return weighted_choice(rng, [("Expansion Signal", 0.50), ("Executive Referral", 0.18), ("Inbound", 0.12), ("Partner", 0.10), ("Outbound", 0.10)])
    return rng.choice(LEAD_SOURCES[:-1])


def process_status(statuses: list[str], stage: str, rng: random.Random) -> str:
    idx = STAGE_INDEX[stage]
    if idx <= 1:
        weights = [0.72, 0.14, 0.08, 0.03, 0.03]
    elif idx <= 3:
        weights = [0.20, 0.26, 0.28, 0.18, 0.08]
    else:
        weights = [0.05, 0.16, 0.24, 0.43, 0.12]
    return weighted_choice(rng, list(zip(statuses, weights)))


def discount_rate(segment: str, deal_type: str, competitor_present: bool, rng: random.Random) -> float:
    base = {"Commercial": 0.08, "Enterprise": 0.14, "Strategic": 0.18, "Public Sector": 0.12}[segment]
    base += 0.05 * competitor_present + 0.03 * (deal_type == "New Logo") - 0.02 * (deal_type == "Renewal")
    return round(clamp(rng.gauss(base, 0.07), 0, 0.55), 3)


def calc_historical_win_rate(segment: str, deal_type: str, product_line: str, industry: str) -> float:
    value = 0.37
    value += {"Commercial": 0.02, "Enterprise": 0.00, "Strategic": -0.03, "Public Sector": -0.05}[segment]
    value += {"New Logo": -0.05, "Expansion": 0.14, "Renewal": 0.24, "Pilot": -0.12, "Upsell": 0.11}[deal_type]
    value += {"Security Suite": -0.02, "Workflow Automation": 0.03, "Revenue Intelligence": 0.04, "Data Cloud": -0.01, "Enterprise Platform": 0.0}[product_line]
    value += 0.02 if industry in {"Technology", "Financial Services"} else 0
    return clamp(value, 0.08, 0.82)


def forecast_category_for(stage: str, rng: random.Random) -> str:
    idx = STAGE_INDEX[stage]
    if idx <= 1:
        weights = [0.72, 0.18, 0.02, 0.08]
    elif idx <= 3:
        weights = [0.42, 0.36, 0.14, 0.08]
    else:
        weights = [0.14, 0.32, 0.44, 0.10]
    return weighted_choice(rng, list(zip(FORECAST_CATEGORIES, weights)))


def map_status_for(stage: str, rng: random.Random) -> str:
    idx = STAGE_INDEX[stage]
    if idx <= 1:
        weights = [0.50, 0.32, 0.08, 0.03, 0.07]
    elif idx <= 3:
        weights = [0.10, 0.24, 0.32, 0.24, 0.10]
    else:
        weights = [0.04, 0.12, 0.26, 0.42, 0.16]
    return weighted_choice(rng, list(zip(MAP_STATUSES, weights)))


def champion_seniority_for(strength: int, rng: random.Random) -> str:
    if strength >= 4:
        return weighted_choice(rng, [("Director", 0.35), ("VP", 0.38), ("C-Level", 0.18), ("Manager", 0.09)])
    return weighted_choice(rng, [("Manager", 0.40), ("Director", 0.35), ("VP", 0.18), ("Individual contributor", 0.07)])


def compliance_for(industry: str, segment: str, product_line: str, rng: random.Random) -> list[str]:
    reqs = ["SOC 2"] if rng.random() < 0.74 else []
    if industry == "Healthcare":
        reqs.append("HIPAA")
    if industry == "Financial Services":
        reqs.extend(["PCI", "SOC 2"])
    if region_or_public(segment):
        reqs.append("Data residency")
    if product_line == "Security Suite":
        reqs.append("ISO 27001")
    if segment == "Public Sector" and rng.random() < 0.35:
        reqs.append("FedRAMP")
    return sorted(set(reqs))


def region_or_public(segment: str) -> bool:
    return segment == "Public Sector"


def integration_requirements(segment: str, product_line: str, rng: random.Random) -> list[str]:
    count = {"Commercial": 2, "Enterprise": 4, "Strategic": 5, "Public Sector": 4}[segment] + (product_line == "Data Cloud")
    return sorted(set(rng.sample(INTEGRATIONS, min(len(INTEGRATIONS), max(1, int(rng.gauss(count, 1.2)))))))


def infosec_length(segment: str, status: str, compliance: list[str], rng: random.Random) -> int:
    if status == "Not required":
        return 0
    base = {"Commercial": 70, "Enterprise": 170, "Strategic": 260, "Public Sector": 310}[segment]
    return max(15, int(rng.gauss(base + len(compliance) * 25, 45)))


def approval_level_for(discount: float) -> str:
    if discount < 0.10:
        return "None"
    if discount < 0.20:
        return "Manager"
    if discount < 0.35:
        return "VP"
    return "CRO/CFO"


def account_team(segment: str, rng: random.Random) -> list[dict[str, str]]:
    roles = ["AE", "BDR", "SE"]
    if segment in {"Enterprise", "Strategic", "Public Sector"}:
        roles.extend(["Sales Manager", "Legal", "CSM"])
    if segment in {"Strategic", "Public Sector"}:
        roles.extend(["VP", "Executive Sponsor", "Finance"])
    return [{"role": role, "name": f"{role.replace(' ', '')}_{rng.randint(1, 24)}"} for role in roles]


def stakeholder_map(contacts: int, detractors: int, economic_buyer: bool, rng: random.Random) -> dict[str, Any]:
    return {
        "contacts": contacts,
        "economic_buyer": "identified" if economic_buyer else "unknown",
        "champions": max(1, int(rng.gauss(1.2, 0.6))),
        "detractors": detractors,
        "departments": rng.sample(["Sales", "RevOps", "Finance", "Legal", "Security", "IT", "Procurement"], k=min(contacts, rng.randint(2, 5))),
    }


def source_profile() -> dict[str, str]:
    return {
        "crm_stage": "crm",
        "forecast_category": "crm",
        "rep_stated_probability": "rep_forecast",
        "crm_model_probability": "baseline_model",
        "qualification": "sales_notes",
        "activity": "engagement_system",
        "legal_security_procurement": "internal_workflows",
    }


def private_signal_profile(rng: random.Random) -> dict[str, list[str]]:
    signals = {
        "AE": ["champion tone", "budget reality", "buyer politics", "next-step confidence"],
        "BDR": ["intent spike", "email responsiveness", "new stakeholder activity"],
        "SE": ["technical validation quality", "integration risk", "security blocker"],
        "VP": ["forecast pressure", "executive sponsor read", "portfolio pattern"],
    }
    return {role: rng.sample(values, k=rng.randint(1, len(values))) for role, values in signals.items()}


def status_penalty(status: str) -> float:
    return {
        "Not started": 0.18,
        "Vendor setup": 0.12,
        "PO requested": 0.05,
        "Approved": -0.04,
        "Not required": -0.04,
        "Questionnaire sent": 0.16,
        "Review scheduled": 0.08,
        "Passed": -0.04,
        "Redlines pending": 0.15,
        "In review": 0.08,
        "Blocked": 0.52,
    }.get(status, 0.0)


def approval_probability(status: str, deal: dict[str, Any], rng: random.Random) -> float:
    if status in {"Approved", "Passed", "Not required"}:
        return clamp(rng.gauss(0.86, 0.06), 0.55, 0.98)
    if status == "Blocked":
        return clamp(rng.gauss(0.22, 0.10), 0.03, 0.55)
    base = 0.55 + 0.06 * STAGE_INDEX[deal["crm_stage"]] - 0.05 * (deal["implementation_complexity"] - 3)
    return clamp(rng.gauss(base, 0.14), 0.06, 0.92)


def latent_drivers(deal: dict[str, Any], legal_penalty: float, security_penalty: float, procurement_penalty: float) -> list[dict[str, Any]]:
    drivers = [
        ("stage", STAGE_BASE[deal["crm_stage"]] - 0.35),
        ("champion_strength", (deal["champion_strength"] - 3) * 0.07),
        ("economic_buyer_identified", 0.12 if deal["economic_buyer_identified"] else -0.10),
        ("budget_confirmed", 0.14 if deal["budget_confirmed"] else -0.12),
        ("procurement_risk", -procurement_penalty),
        ("legal_risk", -legal_penalty),
        ("security_risk", -security_penalty),
        ("close_date_changes", -0.07 * deal["close_date_change_count"]),
        ("buyer_sentiment", deal["buyer_sentiment_score"] - 0.5),
    ]
    return [{"driver": name, "impact": round(impact, 4)} for name, impact in sorted(drivers, key=lambda item: abs(item[1]), reverse=True)[:6]]


def bool_int(value: Any) -> int:
    return 1 if value else 0


def nz(value: Any, default: float) -> float:
    return default if value is None else float(value)


if __name__ == "__main__":
    main()
