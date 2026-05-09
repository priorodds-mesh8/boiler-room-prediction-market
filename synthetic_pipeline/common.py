from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_PATH = Path("/Users/joellang/.env")
DEFAULT_OUTPUT_DIR = ROOT / "data" / "generated"
DEFAULT_MODEL_DIR = ROOT / "models"
DATASET_VERSION = "synthetic-b2b-sales-v1"

TARGETS = [
    "closed_won",
    "closed_won_by_original_date",
    "slipped_to_next_quarter",
    "legal_approved_by_date",
    "security_completed_by_date",
    "closed_above_threshold",
]

TABLE_FILES = {
    "synthetic_dataset_runs": "synthetic_dataset_runs.jsonl",
    "synthetic_deals": "synthetic_deals.jsonl",
    "synthetic_deal_outcomes": "synthetic_deal_outcomes.jsonl",
    "synthetic_deal_events": "synthetic_deal_events.jsonl",
    "model_runs": "model_runs.jsonl",
    "model_predictions": "model_predictions.jsonl",
    "agent_sim_live_deals": "agent_sim_live_deals.jsonl",
}

UPSERT_KEYS = {
    "synthetic_dataset_runs": "run_id",
    "synthetic_deals": "deal_id",
    "synthetic_deal_outcomes": "deal_id",
    "synthetic_deal_events": "event_id",
    "model_runs": "model_run_id",
    "model_predictions": "prediction_id",
    "agent_sim_live_deals": "live_deal_id",
}


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def quarter_end(day: date) -> date:
    month = ((day.month - 1) // 3 + 1) * 3
    if month == 12:
        return date(day.year, 12, 31)
    return date(day.year, month + 1, 1) - timedelta(days=1)


def fiscal_quarter(day: date) -> str:
    return f"Q{((day.month - 1) // 3) + 1} {day.year}"


def json_default(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, default=json_default, sort_keys=True) + "\n")
            count += 1
    return count


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def load_env(path: Path = DEFAULT_ENV_PATH) -> dict[str, str]:
    """Parse both KEY=value .env files and the user's labeled note format.

    Values are intentionally not printed by any caller. This supports labels such
    as "proj url:" and "api secret key:" as well as standard SUPABASE_* names.
    """

    values: dict[str, str] = {}
    if path.exists():
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
            elif ":" in line:
                key, value = line.split(":", 1)
            else:
                continue
            normalized = key.strip().lower().replace("export ", "").replace(" ", "_")
            values[normalized] = value.strip().strip('"').strip("'")

    for key, value in os.environ.items():
      values[key.lower()] = value

    return values


def supabase_config(path: Path = DEFAULT_ENV_PATH) -> dict[str, str]:
    values = load_env(path)
    url = (
        values.get("supabase_url")
        or values.get("next_public_supabase_url")
        or values.get("vite_supabase_url")
        or values.get("project_url")
        or values.get("proj_url")
    )
    key = (
        values.get("supabase_service_role_key")
        or values.get("service_role_key")
        or values.get("api_secret_key")
        or values.get("supabase_secret_key")
        or values.get("supabase_anon_key")
        or values.get("api_key")
    )
    if not url or not key:
        available = ", ".join(sorted(values.keys()))
        raise RuntimeError(
            "Missing Supabase config. Expected SUPABASE_URL plus "
            "SUPABASE_SERVICE_ROLE_KEY, or labeled proj url/api secret key. "
            f"Available keys: {available}"
        )
    return {"url": url.rstrip("/"), "key": key}


def supabase_db_config(path: Path = DEFAULT_ENV_PATH) -> dict[str, str | int]:
    values = load_env(path)
    explicit_url = values.get("supabase_db_url") or values.get("database_url") or values.get("postgres_url")
    if explicit_url:
        return {"dsn": explicit_url}

    web_config = supabase_config(path)
    host = values.get("supabase_db_host") or values.get("db_host")
    if not host:
        project_ref = web_config["url"].replace("https://", "").replace("http://", "").split(".")[0]
        host = f"db.{project_ref}.supabase.co"
    password = values.get("supabase_db_password") or values.get("db_pw") or values.get("db_password") or values.get("database_password")
    if not password:
        raise RuntimeError("Missing Supabase database password. Expected SUPABASE_DB_PASSWORD or labeled db pw.")
    return {
        "host": host,
        "port": int(values.get("supabase_db_port") or values.get("db_port") or 5432),
        "dbname": values.get("supabase_db_name") or values.get("db_name") or "postgres",
        "user": values.get("supabase_db_user") or values.get("db_user") or "postgres",
        "password": password,
    }


def require_output_dir(path: str | Path | None = None) -> Path:
    output_dir = Path(path) if path else DEFAULT_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir
