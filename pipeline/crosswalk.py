"""Phase 1 — crosswalk. Build identifier bridges used by build.py.

Outputs (pipeline/cache/):
  - gene_aliases.json   {ensembl_gene_id: [alias/prev symbols, upper-cased, deduped]}
        Lets the frontend resolve user-typed aliases/prev symbols to the Ensembl ids
        Open Targets uses.
  - pharmclass_by_name.json  {UPPER_DRUG_NAME: [pharm_class strings]}
        openFDA openfda.pharm_class_epc/_moa/_pe keyed by generic/substance name.
        build.py matches ChEMBL drug name + synonyms against this (name-based crosswalk,
        documented on the Methods page).
"""
from __future__ import annotations

import csv
import glob
import json

from common import CACHE, die, hgnc_path, load_config, log, openfda_dir

csv.field_size_limit(10_000_000)


def build_gene_aliases() -> dict[str, list[str]]:
    path = hgnc_path()
    if not path.exists():
        die(f"HGNC file missing: {path} — run download first")
    out: dict[str, set[str]] = {}
    with open(path, encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        cols = reader.fieldnames or []
        for needed in ("symbol", "ensembl_gene_id"):
            if needed not in cols:
                die(f"HGNC missing expected column '{needed}'. Got: {cols[:8]}...")
        for row in reader:
            ens = (row.get("ensembl_gene_id") or "").strip()
            if not ens:
                continue
            names: set[str] = set()
            for col in ("symbol", "alias_symbol", "prev_symbol"):
                raw = (row.get(col) or "").strip().strip('"')
                if not raw:
                    continue
                for piece in raw.split("|"):
                    piece = piece.strip().upper()
                    if piece:
                        names.add(piece)
            if names:
                out.setdefault(ens, set()).update(names)
    log(f"gene aliases: {len(out)} Ensembl genes with HGNC symbols")
    return {k: sorted(v) for k, v in out.items()}


def build_pharmclass_by_name() -> dict[str, list[str]]:
    files = sorted(glob.glob(str(openfda_dir() / "*.json")))
    if not files:
        die(f"openFDA json missing in {openfda_dir()} — run download first")
    by_name: dict[str, set[str]] = {}
    n_records = 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for rec in data.get("results", []):
            n_records += 1
            of = rec.get("openfda") or {}
            classes: set[str] = set()
            for key in ("pharm_class_epc", "pharm_class_moa", "pharm_class_pe"):
                for c in of.get(key) or []:
                    c = c.strip()
                    if c:
                        classes.add(c)
            if not classes:
                continue
            names: set[str] = set()
            for key in ("generic_name", "substance_name", "brand_name"):
                for nm in of.get(key) or []:
                    nm = nm.strip().upper()
                    if nm:
                        names.add(nm)
            for nm in names:
                by_name.setdefault(nm, set()).update(classes)
    log(f"openFDA: scanned {n_records} records; {len(by_name)} names with pharm_class")
    return {k: sorted(v) for k, v in by_name.items()}


def main() -> None:
    load_config()
    CACHE.mkdir(parents=True, exist_ok=True)
    aliases = build_gene_aliases()
    (CACHE / "gene_aliases.json").write_text(json.dumps(aliases))
    pharm = build_pharmclass_by_name()
    (CACHE / "pharmclass_by_name.json").write_text(json.dumps(pharm))
    log("crosswalk complete")


if __name__ == "__main__":
    main()
