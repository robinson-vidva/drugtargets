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
from crosswalk import normalize_name
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

    # ---- drug metadata + parent map (read drug_molecule first, so salts collapse) ----
    log("reading drug_molecule")
    dm_glob = str(ot_dir("drug_molecule") / "*.parquet")
    drows = con.execute(
        f"SELECT id, name, drugType, maximumClinicalStage, synonyms, parentId "
        f"FROM read_parquet('{dm_glob}')"
    ).fetchall()
    parent_of: dict[str, str] = {}       # ChEMBL id -> top parent (salt -> parent)
    drug_meta: dict[str, tuple] = {}     # id -> (name, drugType, stage), over ALL molecules
    drug_syns: dict[str, list] = {}
    for did, name, dtype, stage, syns, parent in drows:
        parent_of[did] = parent or did
        drug_meta[did] = (name or did, dtype or "", (stage or "UNKNOWN"))
        drug_syns[did] = [s for s in (syns or []) if s]

    def canon(c: str) -> str:
        return parent_of.get(c, c)

    moa_glob = str(ot_dir("drug_mechanism_of_action") / "*.parquet")
    log("reading drug_mechanism_of_action")
    edges = load_edges(con, moa_glob)
    if not edges:
        die("no drug-target edges parsed from drug_mechanism_of_action")
    log(f"{len(edges)} raw drug-target-action edges (Open Targets / ChEMBL mechanisms)")

    def _jload(name, default):
        p = CACHE / name
        return json.loads(p.read_text()) if p.exists() else default

    # ---- merge IUPHAR signed edges (additive coverage) ----
    iuphar_edges = _jload("iuphar_edges.json", [])
    iuphar_ligands = _jload("iuphar_ligands.json", {})
    for chembl, m in iuphar_ligands.items():
        cid = canon(chembl)
        if cid not in drug_meta:  # IUPHAR-only drug: take its name/approval
            drug_meta[cid] = (m.get("name") or cid, "",
                              "APPROVAL" if m.get("approved") else "UNKNOWN")
            parent_of.setdefault(cid, cid)
    log(f"{len(iuphar_edges)} IUPHAR signed edges merged")

    ot_drugs = {canon(c) for c, _e, _a, _m in edges}
    ot_genes = {e for _c, e, _a, _m in edges}

    # Aggregate to one primary action per (drug, gene); salt ChEMBL ids collapse to parent.
    by_pair_actions: dict[tuple, Counter] = defaultdict(Counter)
    by_pair_mech: dict[tuple, dict] = defaultdict(dict)
    raw_drugs = set()
    for chembl, ensembl, at, mech in edges:
        raw_drugs.add(chembl)
        key = (canon(chembl), ensembl)
        by_pair_actions[key][at] += 1
        if mech:
            by_pair_mech[key].setdefault(at, mech)
    for chembl, ensembl, action in iuphar_edges:
        by_pair_actions[(canon(chembl), ensembl)][action] += 1

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
    iuphar_drugs_added = len(set(drug_chembls) - ot_drugs)
    iuphar_genes_added = len(set(gene_ensembls) - ot_genes)
    sources_stat = {
        "iupharDrugsAdded": iuphar_drugs_added,
        "iupharGenesAdded": iuphar_genes_added,
        "iupharEdges": len(iuphar_edges),
    }
    log(f"{N} drugs ({len(raw_drugs) - len(ot_drugs)} salts collapsed; "
        f"+{iuphar_drugs_added} from IUPHAR), {len(gene_ensembls)} gene targets "
        f"(+{iuphar_genes_added} from IUPHAR)")

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

    def _load(name):
        p = CACHE / name
        return json.loads(p.read_text()) if p.exists() else {}

    pharm_by_unii = _load("pharmclass_by_unii.json")
    pharm_by_name = _load("pharmclass_by_name.json")      # normalised-name fallback
    unii_to_chembl = _load("unii_to_chembl.json")
    approval_by_unii = _load("approval_by_unii.json")
    atc_raw = _load("atc_by_chembl.json")                 # DrugCentral WHO ATC

    # ATC rolled up to parents (so a salt's ATC also tags its parent ChEMBL id).
    atc_by_chembl: dict[str, dict] = {}
    for c, data in atc_raw.items():
        for t in {c, parent_of.get(c, c)}:
            cur = atc_by_chembl.setdefault(t, {"codes": set(), "classes": set()})
            cur["codes"].update(data.get("codes", []))
            cur["classes"].update(data.get("classes", []))

    # Roll UNII-keyed openFDA data up to ChEMBL (incl. salt -> parent via parentId).
    pharm_by_chembl: dict[str, set] = defaultdict(set)
    approval_by_chembl: dict[str, dict] = {}
    for unii, chembls in unii_to_chembl.items():
        classes = pharm_by_unii.get(unii)
        appr = approval_by_unii.get(unii)
        for c in chembls:
            targets = {c, parent_of.get(c, c)}
            for t in targets:
                if classes:
                    pharm_by_chembl[t].update(classes)
                if appr:
                    cur = approval_by_chembl.get(t)
                    if cur is None:
                        approval_by_chembl[t] = dict(appr)
                    elif appr.get("date") and (not cur.get("date") or appr["date"] < cur["date"]):
                        cur["date"] = appr["date"]

    # provenance tally (overall + approved-only)
    prov = {"unii": 0, "fallback": 0, "unmatched": 0}
    prov_approved = {"unii": 0, "fallback": 0, "unmatched": 0}

    def pharm_for(did: str) -> tuple[list[str], str]:
        hit = pharm_by_chembl.get(did)
        if hit:
            return sorted(hit), "unii"
        # fallback: salt-stripped, case-folded name match (UNII miss only)
        meta = drug_meta.get(did)
        cand = set()
        if meta:
            cand.add(normalize_name(meta[0]))
        for s in drug_syns.get(did, []):
            cand.add(normalize_name(s))
        classes: set[str] = set()
        for nm in cand:
            if nm:
                classes.update(pharm_by_name.get(nm, []))
        if classes:
            return sorted(classes), "fallback"
        return [], "unmatched"

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

    # ---- mechanism-derived class fallback (every drug has >=1 target+action) ----
    # Used only when no curated openFDA/ATC class exists, so biologics/mAbs/novel drugs
    # still get a descriptor. Derived from the drug's own most-specific (highest-IDF) targets.
    WORD = {1: "agonist", -1: "inhibitor", 0: "modulator"}
    gi_symbol = {gi: gene_meta.get(ens, (ens,))[0] for ens, gi in gene_id.items()}

    def derived_class(di: int) -> list[str]:
        rows = drug_targets.get(di, [])
        ranked = sorted(rows, key=lambda r: (-idf.get(r[0], 0.0), gi_symbol.get(r[0], "")))
        out, seen = [], set()
        for gi, _ac, sign, _m in ranked:
            lbl = f"{gi_symbol.get(gi, str(gi))} {WORD[sign]}"
            if lbl not in seen:
                seen.add(lbl)
                out.append(lbl)
            if len(out) >= 3:
                break
        return out

    # ---- emit artifacts ----
    log("writing artifacts")
    cov = {"approved": 0, "pharm": 0, "atc": 0, "any": 0, "anyOrDerived": 0,
           "fdaMkt": 0, "fdaWithClass": 0}
    drugs_json = {}
    for did, di in drug_id.items():
        name, dtype, stage = drug_meta.get(did, (did, "", "UNKNOWN"))
        classes, provenance = pharm_for(did)
        a = atc_by_chembl.get(did)
        atc_classes = sorted(a["classes"]) if a else []
        atc_codes = sorted(a["codes"]) if a else []
        derived = derived_class(di) if not (classes or atc_classes) else []
        ot_approved = stage == "APPROVAL"
        fda = approval_by_chembl.get(did)
        approved = ot_approved or bool(fda)
        prov[provenance] += 1
        has_class = bool(classes) or bool(atc_classes)
        if approved:
            prov_approved[provenance] += 1
            cov["approved"] += 1
            cov["pharm"] += bool(classes)
            cov["atc"] += bool(atc_classes)
            cov["any"] += has_class
            cov["anyOrDerived"] += has_class or bool(derived)
        if fda:
            cov["fdaMkt"] += 1
            cov["fdaWithClass"] += has_class
        drugs_json[di] = {
            "chembl": did,
            "name": name,
            "drugType": dtype,
            "maxPhase": STAGE_TO_PHASE.get(stage, 0),
            "approved": approved,
            "approvalDate": (fda or {}).get("date"),
            "pharmClass": classes,
            "atcClass": atc_classes,
            "atc": atc_codes,
            "derivedClass": derived,
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

    A = cov["approved"]
    def _pct(n):
        return round(100.0 * n / A, 1) if A else 0.0
    fda_pct = round(100.0 * cov["fdaWithClass"] / cov["fdaMkt"], 1) if cov["fdaMkt"] else 0.0
    coverage = {
        "approvedDrugs": A,
        "anyClass": {"count": cov["any"], "pct": _pct(cov["any"])},
        "withDerived": {"count": cov["anyOrDerived"], "pct": _pct(cov["anyOrDerived"])},
        "pharmClass": {
            "count": cov["pharm"], "pct": _pct(cov["pharm"]),
            "byUnii": prov_approved["unii"], "byNameFallback": prov_approved["fallback"],
            "unmatched": prov_approved["unmatched"],
        },
        "atc": {"count": cov["atc"], "pct": _pct(cov["atc"])},
        "fdaMarketed": {"drugs": cov["fdaMkt"], "withClass": cov["fdaWithClass"], "pct": fda_pct},
    }
    log(f"coverage of approved drugs ({A}): curated class {cov['any']} ({_pct(cov['any'])}%) "
        f"| incl. mechanism-derived {cov['anyOrDerived']} ({_pct(cov['anyOrDerived'])}%)")
    log(f"  openFDA pharm {cov['pharm']} ({_pct(cov['pharm'])}%) | ATC {cov['atc']} ({_pct(cov['atc'])}%) "
        f"| provenance(approved) {prov_approved} | FDA-marketed {fda_pct}%")

    meta = {
        "otRelease": cfg["opentargets"]["release"],
        "openfdaDate": cfg["openfda"]["date"],
        "openfdaNdcDate": cfg["openfda"]["ndc_date"],
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
        "coverage": coverage,
        "sources": sources_stat,
        "actionTypes": action_types,
        "signTable": sign_table(),
        "openfdaDisclaimer": cfg["openfda"]["disclaimer"],
        "licenses": [
            {"source": "Open Targets Platform", "version": cfg["opentargets"]["release"],
             "license": cfg["opentargets"]["license"]},
            {"source": "openFDA NDC + Drugs@FDA", "version": cfg["openfda"]["ndc_date"],
             "license": cfg["openfda"]["license"]},
            {"source": "ChEMBL", "version": cfg["chembl"]["version"],
             "license": cfg["chembl"]["license"]},
            {"source": "HGNC", "version": cfg["hgnc"]["version"], "license": cfg["hgnc"]["license"]},
            {"source": "UniChem", "version": "REST", "license": "EMBL-EBI"},
            {"source": "DrugCentral (WHO ATC)", "version": cfg["drugcentral"]["version"],
             "license": cfg["drugcentral"]["license"]},
            {"source": "Guide to Pharmacology (IUPHAR/BPS)", "version": cfg["iuphar"]["version"],
             "license": cfg["iuphar"]["license"]},
        ],
    }
    write("meta.json", meta)

    log(f"build complete -> {out}  (similar.json {sim_size/1e6:.2f} MB uncompressed)")
    if sim_size > 10_000_000:
        log("NOTE: similar.json exceeds 10MB uncompressed — sharding recommended (see Phase 3).")


if __name__ == "__main__":
    main()
