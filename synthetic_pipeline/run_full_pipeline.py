from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

try:
    from .common import DEFAULT_OUTPUT_DIR
except ImportError:  # pragma: no cover
    from common import DEFAULT_OUTPUT_DIR  # type: ignore


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local generation, model training, live export, and validation.")
    parser.add_argument("--n", type=int, default=10_000)
    parser.add_argument("--live-n", type=int, default=200)
    parser.add_argument("--seed", type=int, default=20260509)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    commands = [
        [sys.executable, "-m", "synthetic_pipeline.generate_synthetic_deals", "--n", str(args.n), "--live-n", str(args.live_n), "--seed", str(args.seed), "--out", str(args.out)],
        [sys.executable, "-m", "synthetic_pipeline.train_baseline_models", "--in", str(args.out), "--seed", str(args.seed)],
        [sys.executable, "-m", "synthetic_pipeline.export_agent_sim_live_deals", "--in", str(args.out)],
        [sys.executable, "-m", "synthetic_pipeline.validate_dataset", "--in", str(args.out), "--expected-training", str(args.n)],
    ]
    for command in commands:
        print("+ " + " ".join(command), flush=True)
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
