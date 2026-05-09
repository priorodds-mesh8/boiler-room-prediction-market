from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import requests

try:
    from .common import DEFAULT_ENV_PATH, DEFAULT_OUTPUT_DIR, TABLE_FILES, UPSERT_KEYS, read_jsonl, supabase_config
except ImportError:  # pragma: no cover
    from common import DEFAULT_ENV_PATH, DEFAULT_OUTPUT_DIR, TABLE_FILES, UPSERT_KEYS, read_jsonl, supabase_config  # type: ignore


LOAD_ORDER = [
    "synthetic_dataset_runs",
    "synthetic_deals",
    "synthetic_deal_outcomes",
    "synthetic_deal_events",
    "model_runs",
    "model_predictions",
    "agent_sim_live_deals",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Load generated synthetic deal files into Supabase via PostgREST.")
    parser.add_argument("--in", dest="input_dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV_PATH)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--tables", nargs="*", default=LOAD_ORDER)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    config = supabase_config(args.env)
    print(f"Supabase URL detected for project: {redacted_project(config['url'])}")
    total = 0
    for table in args.tables:
        if table not in TABLE_FILES:
            raise SystemExit(f"Unknown table {table!r}. Valid tables: {', '.join(LOAD_ORDER)}")
        path = args.input_dir / TABLE_FILES[table]
        rows = read_jsonl(path)
        if not rows:
            print(f"{table}: no rows found at {path}")
            continue
        print(f"{table}: {len(rows)} rows")
        if not args.dry_run:
            load_table(config["url"], config["key"], table, rows, args.batch_size)
        total += len(rows)
    print(json.dumps({"loaded_or_checked_rows": total, "dry_run": args.dry_run}, indent=2))


def load_table(url: str, key: str, table: str, rows: list[dict[str, Any]], batch_size: int) -> None:
    endpoint = f"{url}/rest/v1/{table}"
    conflict_key = UPSERT_KEYS[table]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        response = requests.post(
            endpoint,
            params={"on_conflict": conflict_key},
            headers=headers,
            data=json.dumps(batch),
            timeout=60,
        )
        if response.status_code not in {200, 201, 204}:
            message = response.text[:1000]
            if response.status_code == 404 or "schema cache" in message.lower():
                message += (
                    "\n\nThe table probably does not exist yet. Run schema/supabase_schema.sql "
                    "in the Supabase SQL editor, then rerun this loader."
                )
            raise RuntimeError(f"Failed loading {table} rows {start}-{start + len(batch)}: {response.status_code} {message}")
        print(f"  upserted {min(start + batch_size, len(rows))}/{len(rows)}", flush=True)


def redacted_project(url: str) -> str:
    host = url.replace("https://", "").replace("http://", "").split("/")[0]
    if "." in host:
        ref = host.split(".")[0]
        if len(ref) > 8:
            return f"{ref[:4]}...{ref[-4:]}"
    return "<configured>"


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
