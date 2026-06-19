"""Phase 1 — build. Emit the interned JSON artifacts to web/public/data/<data_dir>/.

Consumes Open Targets drug_mechanism_of_action + drug_molecule + target, plus the
crosswalk caches. Computes the sign map, IDF, per-drug signed sparse vectors, and the
top-30 signed-IDF-weighted-cosine neighbours with shared concordant/discordant targets.
"""
from __future__ import annotations

import datetime
import json
import math
from collections import Counter, defaultdict

import duckdb

from common import CACHE, die, load_config, log, ot_dir, out_dir
from similarity import top_similar
from signmap import action_sign, sign_table

TOP_N = 30
STAGE_TO_PHASE = {
    "APPROVAL": 4, "PHASE_3": 3, "PHASE_2_3": 3, "PHASE_2": 2, "PHASE_1_2": 2,
    "PHASE_1": 1, "EARLY_PHASE_1": 1, "IND": 0, "PREAPPROVAL": 0,
    "PRECLINICAL": 0, "UNKNOWN": 0,
}


def round_sig(x: float, sig: int = 4) -> float:
    if x == 0:
        return 0.0
    return round(x, -int(math.floor(math.log10(abs(x)))) + (sig - 1))


def load_edges(con: duckdb.DuckDBPyConnection, moa_glob: str):
    """Explode chemblIds x targets into (chembl, ensembl, actionType, mechanism) rows."""
    q = f"""
    WITH e AS (
      SELECT actionType, mechanismOfAction, UNNEST(chemblIds) AS chembl, targets
      FROM read_parquet('{moa_glob}')
      WHERE chemblIds IS NOT NULL AND targets IS NOT NULL
    )
    SELECT chembl, UNNEST(targets) AS ensembl, actionType, mechanismOfAction
    FROM e
    """
    rows = con.execute(q).fetchall()
    edges = []
    for chembl, ensembl, at, mech in rows:
        if not chembl or not ensembl or not str(ensembl).startswith("ENSG"):
            continue
        edges.append((chembl, ensembl, at or "", mech or ""))
    return edges


def main() -> None:
    cfg = load_config()
    out = out_dir(cfg)
    out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()

    moa_glob = str(ot_dir("drug_mechanism_of_action") / "*.parquet")
    log("reading drug_mechanism_of_action")
    edges = load_edges(con, moa_glob)
    if not edges:
        die("no drug-target edges parsed from drug_mechanism_of_action")
    log(f"{len(edges)} raw drug-target-action edges")

    # Aggregate to one primary action per (drug, gene).
    by_pair_actions: dict[tuple, Counter] = defaultdict(Counter)
    by_pair_mech: dict[tuple, dict] = defaultdict(dict)
    for chembl, ensembl, at, mech in edges:
        key = (chembl, ensembl)
        by_pair_actions[key][at] += 1
        if mech:
            by_pair_mech[key].setdefault(at, mech)

    # primary action = most frequent (tie -> alphabetical)
    pair_primary: dict[tuple, tuple] = {}  # (chembl,ensembl) -> (action, sign, mech)
    for key, counter in by_pair_actions.items():
        best = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        mech = by_pair_mech[key].get(best) or next(
            (m for m in by_pair_mech[key].values()), "")
        pair_primary[key] = (best, action_sign(best), mech)

    drug_chembls = sorted({k[0] for k in pair_primary})
    gene_ensembls = sorted({k[1] for k in pair_primary})
    drug_id = {c: i for i, c in enumerate(drug_chembls)}
    gene_id = {e: i for i, e in enumerate(gene_ensembls)}
    N = len(drug_chembls)
    log(f"{N} drugs with >=1 mechanism, {len(gene_ensembls)} distinct gene targets")

    # ---- gene metadata (target) ----
    log("reading target")
    tgt_glob = str(ot_dir("target") / "*.parquet")
    trows = con.execute(
        f"SELECT id, approvedSymbol, approvedName, proteinIds "
        f"FROM read_parquet('{tgt_glob}')"
    ).fetchall()
    gene_meta = {}
    for gid, sym, name, prot in trows:
        if gid not in gene_id:
            continue
        uni = ""
        if prot:
            sw = [p["id"] for p in prot if p and p.get("source") == "uniprot_swissprot"]
            tr = [p["id"] for p in prot if p and p.get("source") == "uniprot_trembl"]
            uni = (sw or tr or [""])[0] or ""
        gene_meta[gid] = (sym or gid, name or "", uni)

    aliases = json.loads((CACHE / "gene_aliases.json").read_text()) if (
        CACHE / "gene_aliases.json").exists() else {}

    # ---- drug metadata (drug_molecule) ----
    log("reading drug_molecule")
    dm_glob = str(ot_dir("drug_molecule") / "*.parquet")
    drows = con.execute(
        f"SELECT id, name, drugType, maximumClinicalStage, synonyms "
        f"FROM read_parquet('{dm_glob}')"
    ).fetchall()
    drug_meta = {}
    drug_syns = {}
    for did, name, dtype, stage, syns in drows:
        if did not in drug_id:
            continue
        drug_meta[did] = (name or did, dtype or "", (stage or "UNKNOWN"))
        drug_syns[did] = [s for s in (syns or []) if s]

    pharm_by_name = json.loads((CACHE / "pharmclass_by_name.json").read_text()) if (
        CACHE / "pharmclass_by_name.json").exists() else {}

    def pharm_for(did: str) -> list[str]:
        meta = drug_meta.get(did)
        cand = set()
        if meta:
            cand.add(meta[0].strip().upper())
        for s in drug_syns.get(did, []):
            cand.add(s.strip().upper())
        classes: set[str] = set()
        for nm in cand:
            for c in pharm_by_name.get(nm, []):
                classes.add(c)
        return sorted(classes)

    # ---- action-type + mechanism interning ----
    action_types = sorted({p[0] for p in pair_primary.values()})
    action_code = {a: i for i, a in enumerate(action_types)}
    mech_list: list[str] = []
    mech_idx: dict[str, int] = {}

    def intern_mech(m: str) -> int:
        if m not in mech_idx:
            mech_idx[m] = len(mech_list)
            mech_list.append(m)
        return mech_idx[m]

    # ---- drug_targets + signed vectors + inverted index ----
    drug_targets: dict[int, list] = defaultdict(list)
    gene_drugs: dict[int, set] = defaultdict(set)
    gene_drug_count: dict[int, set] = defaultdict(set)
    for (chembl, ensembl), (action, sign, mech) in pair_primary.items():
        di, gi = drug_id[chembl], gene_id[ensembl]
        drug_targets[di].append([gi, action_code[action], sign, intern_mech(mech)])
        gene_drugs[gi].add(di)
        gene_drug_count[gi].add(di)
    for di in drug_targets:
        drug_targets[di].sort(key=lambda r: r[0])

    # ---- IDF ----
    idf = {}
    for gi, drugs in gene_drug_count.items():
        n_t = len(drugs)
        idf[gi] = round_sig(math.log(N / n_t), 4) if n_t else 0.0

    # ---- signed sparse vectors (sign != 0 only) ----
    vectors: dict[int, dict[int, float]] = {}
    for di, rows in drug_targets.items():
        v = {}
        for gi, _ac, sign, _m in rows:
            if sign != 0 and idf.get(gi, 0.0) != 0.0:
                v[gi] = sign * idf[gi]
        vectors[di] = v

    # ---- similarity (top-30 signed cosine) ----
    log("computing signed-cosine similarity")
    similar = top_similar(vectors, drug_targets, top_n=TOP_N, log=log)

    # ---- emit artifacts ----
    log("writing artifacts")
    drugs_json = {}
    for did, di in drug_id.items():
        name, dtype, stage = drug_meta.get(did, (did, "", "UNKNOWN"))
        drugs_json[di] = {
            "chembl": did,
            "name": name,
            "drugType": dtype,
            "maxPhase": STAGE_TO_PHASE.get(stage, 0),
            "approved": stage == "APPROVAL",
            "pharmClass": pharm_for(did),
        }

    genes_json = {}
    for ens, gi in gene_id.items():
        sym, name, uni = gene_meta.get(ens, (ens, "", ""))
        genes_json[gi] = {
            "symbol": sym,
            "ensembl": ens,
            "uniprot": uni,
            "name": name,
            "aliases": [a for a in aliases.get(ens, []) if a != sym.upper()],
        }

    def write(name: str, obj) -> int:
        path = out / name
        path.write_text(json.dumps(obj, separators=(",", ":")))
        size = path.stat().st_size
        log(f"  {name}: {size/1e6:.2f} MB")
        return size

    write("drugs.json", drugs_json)
    write("genes.json", genes_json)
    write("drug_targets.json", {di: rows for di, rows in sorted(drug_targets.items())})
    write("gene_drugs.json", {gi: sorted(ds) for gi, ds in sorted(gene_drugs.items())})
    write("idf.json", {gi: idf[gi] for gi in sorted(idf)})
    write("mechanisms.json", mech_list)
    sim_size = write("similar.json", similar)

    meta = {
        "otRelease": cfg["opentargets"]["release"],
        "openfdaDate": cfg["openfda"]["date"],
        "hgncVersion": cfg["hgnc"]["version"],
        "chemblVersion": cfg["chembl"]["version"],
        "buildDate": datetime.date.today().isoformat(),
        "dataDir": cfg["release"]["data_dir"],
        "counts": {
            "drugs": N,
            "genes": len(gene_ensembls),
            "drugTargetEdges": sum(len(v) for v in drug_targets.values()),
            "mechanisms": len(mech_list),
            "drugsWithSimilar": len(similar),
        },
        "actionTypes": action_types,
        "signTable": sign_table(),
        "openfdaDisclaimer": cfg["openfda"]["disclaimer"],
        "licenses": [
            {"source": "Open Targets Platform", "version": cfg["opentargets"]["release"],
             "license": cfg["opentargets"]["license"]},
            {"source": "openFDA / Drugs@FDA", "version": cfg["openfda"]["date"],
             "license": cfg["openfda"]["license"]},
            {"source": "ChEMBL", "version": cfg["chembl"]["version"],
             "license": cfg["chembl"]["license"]},
            {"source": "HGNC", "version": cfg["hgnc"]["version"], "license": cfg["hgnc"]["license"]},
            {"source": "UniChem", "version": "REST", "license": "EMBL-EBI"},
        ],
    }
    write("meta.json", meta)

    log(f"build complete -> {out}  (similar.json {sim_size/1e6:.2f} MB uncompressed)")
    if sim_size > 10_000_000:
        log("NOTE: similar.json exceeds 10MB uncompressed — sharding recommended (see Phase 3).")


if __name__ == "__main__":
    main()
