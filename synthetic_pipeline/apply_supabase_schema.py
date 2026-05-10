from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from .common import DEFAULT_ENV_PATH, ROOT, supabase_db_config
except ImportError:  # pragma: no cover
    from common import DEFAULT_ENV_PATH, ROOT, supabase_db_config  # type: ignore


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply schema/supabase_schema.sql to Supabase Postgres.")
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV_PATH)
    parser.add_argument("--schema", type=Path, default=ROOT / "schema" / "supabase_schema.sql")
    parser.add_argument("--deps", type=Path, default=Path("/private/tmp/boiler_room_pydeps"))
    args = parser.parse_args()

    if args.deps.exists():
        sys.path.insert(0, str(args.deps))
    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit(
            "psycopg is required to apply the schema. Install it with: "
            "python3 -m pip install --target /private/tmp/boiler_room_pydeps 'psycopg[binary]'"
        ) from exc

    config = supabase_db_config(args.env)
    sql = args.schema.read_text(encoding="utf-8")
    if "dsn" in config:
        connection = psycopg.connect(str(config["dsn"]), sslmode="require")
    else:
        connection = psycopg.connect(
            host=str(config["host"]),
            port=int(config["port"]),
            dbname=str(config["dbname"]),
            user=str(config["user"]),
            password=str(config["password"]),
            sslmode="require",
            connect_timeout=20,
        )
    with connection:
        with connection.cursor() as cursor:
            cursor.execute(sql)
    print("Supabase schema applied successfully.")


if __name__ == "__main__":
    main()
