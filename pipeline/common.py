"""Shared config loading and path helpers for the drugtargets pipeline."""
from __future__ import annotations

import sys
from pathlib import Path

try:  # Python 3.11+
    import tomllib
except ModuleNotFoundError:  # 3.9 / 3.10
    import tomli as tomllib  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.toml"
RAW = ROOT / "pipeline" / "raw"
CACHE = ROOT / "pipeline" / "cache"


def load_config() -> dict:
    with open(CONFIG_PATH, "rb") as fh:
        return tomllib.load(fh)


def out_dir(cfg: dict) -> Path:
    return ROOT / "web" / "public" / "data" / cfg["release"]["data_dir"]


def ot_dir(dataset: str) -> Path:
    return RAW / "opentargets" / dataset


def hgnc_path() -> Path:
    return RAW / "hgnc" / "hgnc_complete_set.txt"


def openfda_dir(sub: str = "") -> Path:
    return RAW / "openfda" / sub if sub else RAW / "openfda"


def unichem_path() -> Path:
    return RAW / "unichem" / "src1src14.txt"


def drugcentral_path() -> Path:
    return RAW / "drugcentral" / "drugcentral.sql.gz"


def iuphar_dir() -> Path:
    return RAW / "iuphar"


def association_path() -> Path:
    return RAW / "association" / "assoc.parquet"


def log(msg: str) -> None:
    print(f"[drugtargets] {msg}", flush=True)


def die(msg: str, code: int = 2) -> "None":
    print(f"[drugtargets] FATAL: {msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)
