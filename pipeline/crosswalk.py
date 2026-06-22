"""Phase 1 — crosswalk. Build identifier bridges used by build.py.

Outputs (pipeline/cache/):
  - gene_aliases.json       {ensembl_gene_id: [alias/prev symbols, upper-cased, deduped]}
        Lets the frontend resolve user-typed aliases/prev symbols to OT Ensembl ids.
  - pharmclass_by_unii.json {UNII: [pharm_class strings]}
        openFDA pharm_class_epc/_moa/_pe keyed by openfda.unii (NDC + Drugs@FDA; primary join).
  - pharmclass_by_name.json {NORMALISED_NAME: [pharm_class strings]}
        Same classes keyed by salt-stripped, case-folded drug name (UNII-miss fallback only).
  - unii_to_chembl.json     {UNII: [ChEMBL ids]}
        From the UniChem ChEMBL<->FDA-SRS (UNII) whole-source bulk mapping.
  - approval_by_unii.json   {UNII: {"approved": true, "date": "YYYY-MM-DD"|null}}
        From Drugs@FDA submissions with submission_status == 'AP' (earliest AP date).
  - atc_by_chembl.json      {ChEMBL id: {"codes": [...], "classes": [ATC level-4 labels]}}
        WHO ATC classification from DrugCentral (global; covers drugs openFDA never classifies).
"""
from __future__ import annotations

import csv
import glob
import gzip
import json

from common import (CACHE, die, drugcentral_path, hgnc_path, load_config, log,
                    openfda_dir, unichem_path)

csv.field_size_limit(10_000_000)

# Salt/hydrate suffixes stripped for the name-based fallback (per spec, + common hydrates).
SALT_SUFFIXES = {
    "MESYLATE", "HYDROCHLORIDE", "SODIUM", "SULFATE", "BESYLATE", "DIHYDROCHLORIDE",
    "ACETATE", "CITRATE", "TARTRATE", "MALEATE", "FUMARATE", "PHOSPHATE", "SUCCINATE",
    "MONOHYDRATE", "DIHYDRATE", "HYDRATE", "ANHYDROUS", "POTASSIUM", "CALCIUM",
    "HYDROBROMIDE", "BROMIDE", "CHLORIDE",
}


def normalize_name(name: str) -> str:
    """Upper-case, collapse whitespace, and strip trailing salt/hydrate tokens."""
    toks = (name or "").upper().split()
    while toks and toks[-1] in SALT_SUFFIXES:
        toks.pop()
    return " ".join(toks).strip()


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


def _as_list(v) -> list:
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _single_substance(rec: dict, of: dict) -> bool:
    """True if the record describes ONE active drug (so its pharm_class is unambiguous).

    Combination products carry 2+ active ingredients and attribute every pharm_class to
    each ingredient — wrong to map onto a single drug, so they are excluded. A mono drug
    may legitimately list several UNIIs (salt + parent), so UNII count is NOT used here;
    the active-ingredient count (NDC) / substance count (Drugs@FDA) is the reliable signal.
    """
    ings = rec.get("active_ingredients")
    if ings is not None:
        return len(ings) <= 1
    return len(of.get("substance_name") or []) <= 1


def _record_names(rec: dict, of: dict) -> set[str]:
    """Substance names for a record (generic/substance/active-ingredient — NOT brand)."""
    names: set[str] = set()
    for v in _as_list(rec.get("generic_name")):
        names.add(str(v))
    for ing in rec.get("active_ingredients") or []:
        if ing and ing.get("name"):
            names.add(str(ing["name"]))
    for key in ("generic_name", "substance_name"):
        for nm in of.get(key) or []:
            names.add(str(nm))
    return {normalize_name(n) for n in names if n}


def build_pharmclass() -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """(by_unii, by_normalised_name) pharm_class maps from openFDA NDC + Drugs@FDA (union).

    Only single-substance records contribute, to avoid combination-product leakage.
    """
    files = (sorted(glob.glob(str(openfda_dir("ndc") / "*.json")))
             + sorted(glob.glob(str(openfda_dir("drugsfda") / "*.json"))))
    if not files:
        die(f"openFDA json missing under {openfda_dir()} — run download first")
    by_unii: dict[str, set[str]] = {}
    by_name: dict[str, set[str]] = {}
    n_records = n_combo = 0
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
            if not _single_substance(rec, of):
                n_combo += 1
                continue
            for u in of.get("unii") or []:
                u = u.strip().upper()
                if u:
                    by_unii.setdefault(u, set()).update(classes)
            for nn in _record_names(rec, of):
                if nn:
                    by_name.setdefault(nn, set()).update(classes)
    log(f"openFDA NDC+Drugs@FDA: scanned {n_records} records ({n_combo} multi-substance "
        f"skipped); {len(by_unii)} UNIIs, {len(by_name)} normalised names with pharm_class")
    return ({k: sorted(v) for k, v in by_unii.items()},
            {k: sorted(v) for k, v in by_name.items()})


def build_unii_to_chembl() -> dict[str, list[str]]:
    """Parse the UniChem src1src14 mapping (ChEMBL<TAB>UNII) into {UNII: [ChEMBL ids]}."""
    path = unichem_path()
    if not path.exists():
        die(f"UniChem mapping missing: {path} — run download first")
    out: dict[str, set[str]] = {}
    with open(path, encoding="utf-8") as fh:
        first = fh.readline()  # header: "From src:'1'\tTo src:'14'"
        if "src" not in first.lower():
            fh.seek(0)  # no header — rewind
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 2:
                continue
            chembl, unii = parts[0].strip(), parts[1].strip().upper()
            if chembl and unii:
                out.setdefault(unii, set()).add(chembl)
    log(f"UniChem: {len(out)} UNIIs mapped to ChEMBL ids")
    return {k: sorted(v) for k, v in out.items()}


def _iso(d: str) -> str | None:
    d = (d or "").strip()
    return f"{d[0:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 and d.isdigit() else None


def build_approval_from_drugsfda() -> dict[str, dict]:
    """{UNII: {'approved': True, 'date': earliest AP submission date}} from Drugs@FDA."""
    files = sorted(glob.glob(str(openfda_dir("drugsfda") / "*.json")))
    if not files:
        die(f"openFDA drugsfda json missing in {openfda_dir('drugsfda')} — run download first")
    out: dict[str, dict] = {}
    for f in files:
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for rec in data.get("results", []):
            ap_dates = [s.get("submission_status_date") for s in (rec.get("submissions") or [])
                        if s.get("submission_status") == "AP"]
            if not ap_dates:
                continue
            isos = sorted([d for d in (_iso(x) for x in ap_dates) if d])
            earliest = isos[0] if isos else None
            for u in (rec.get("openfda") or {}).get("unii") or []:
                u = u.strip().upper()
                if not u:
                    continue
                cur = out.get(u)
                if cur is None:
                    out[u] = {"approved": True, "date": earliest}
                elif earliest and (cur["date"] is None or earliest < cur["date"]):
                    cur["date"] = earliest
    log(f"Drugs@FDA: {len(out)} UNIIs with an approved (AP) submission")
    return out


def _copy_rows(path, table: str):
    """Yield tab-split rows of a Postgres-dump `COPY public.<table> (...) FROM stdin;` block."""
    marker = f"COPY public.{table} "
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        in_block = False
        for line in fh:
            if not in_block:
                if line.startswith(marker):
                    in_block = True
                continue
            if line.startswith("\\."):
                return
            yield line.rstrip("\n").split("\t")


def build_atc_from_drugcentral() -> dict[str, dict]:
    """{ChEMBL id: {'codes': [ATC7...], 'classes': [ATC level-4 labels...]}} from DrugCentral.

    Single streaming pass over the Postgres dump (struct2atc + atc + identifier tables).
    DrugCentral's `identifier` table carries the ChEMBL crosswalk, so this yields
    ChEMBL-id-keyed ATC directly (covering drugs openFDA EPC/MoA never classifies).
    """
    path = drugcentral_path()
    if not path.exists():
        die(f"DrugCentral dump missing: {path} — run download first")

    # atc7 code -> level-4 class label (fallback up the hierarchy)
    code_label: dict[str, str] = {}
    for r in _copy_rows(path, "atc"):
        if len(r) < 11:
            continue
        code = r[1].strip()
        label = next((x for x in (r[10], r[8], r[6], r[4]) if x and x != "\\N"), "")
        if code:
            code_label[code] = label
    log(f"DrugCentral: {len(code_label)} ATC codes")

    # struct_id -> set(atc7 codes)
    struct_codes: dict[str, set] = {}
    for r in _copy_rows(path, "struct2atc"):
        if len(r) < 2:
            continue
        struct_codes.setdefault(r[0], set()).add(r[1].strip())

    # struct_id -> ChEMBL id (from identifier table)
    out: dict[str, dict] = {}
    n_struct_chembl = 0
    for r in _copy_rows(path, "identifier"):
        if len(r) < 4 or r[2] != "ChEMBL_ID":
            continue
        chembl, struct_id = r[1].strip(), r[3]
        codes = struct_codes.get(struct_id)
        if not chembl or not codes:
            continue
        n_struct_chembl += 1
        labels = set()
        for c in codes:
            lbl = code_label.get(c, "")
            if lbl and "combination" not in lbl.lower():
                labels.add(lbl)
        out[chembl] = {"codes": sorted(codes), "classes": sorted(labels)}
    log(f"DrugCentral: {n_struct_chembl} ChEMBL ids with ATC classification")
    return out


def main() -> None:
    load_config()
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "gene_aliases.json").write_text(json.dumps(build_gene_aliases()))
    by_unii, by_name = build_pharmclass()
    (CACHE / "pharmclass_by_unii.json").write_text(json.dumps(by_unii))
    (CACHE / "pharmclass_by_name.json").write_text(json.dumps(by_name))
    (CACHE / "unii_to_chembl.json").write_text(json.dumps(build_unii_to_chembl()))
    (CACHE / "approval_by_unii.json").write_text(json.dumps(build_approval_from_drugsfda()))
    (CACHE / "atc_by_chembl.json").write_text(json.dumps(build_atc_from_drugcentral()))
    log("crosswalk complete")


if __name__ == "__main__":
    main()
