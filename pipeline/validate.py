"""Phase 1 — validate. Assert artifact shape/sanity before publishing."""
from __future__ import annotations

import json

from common import die, load_config, log, out_dir

REQUIRED = ["drugs.json", "genes.json", "drug_targets.json", "gene_drugs.json",
            "idf.json", "similar.json", "mechanisms.json", "meta.json",
            "diseases.json", "drug_indications.json", "disease_drugs.json"]


def main() -> None:
    cfg = load_config()
    out = out_dir(cfg)
    for name in REQUIRED:
        if not (out / name).exists():
            die(f"missing artifact: {name}")
    J = {name: json.loads((out / name).read_text()) for name in REQUIRED}

    drugs, genes = J["drugs.json"], J["genes.json"]
    dt, gd = J["drug_targets.json"], J["gene_drugs.json"]
    idf, sim, mech, meta = (J["idf.json"], J["similar.json"],
                            J["mechanisms.json"], J["meta.json"])

    if not drugs:
        die("drugs.json empty")
    if not genes:
        die("genes.json empty")
    if not idf:
        die("idf.json empty")
    if not dt:
        die("drug_targets.json empty")

    drug_ids = {int(k) for k in drugs}
    gene_ids = {int(k) for k in genes}

    # idf: non-negative, finite
    for g, v in idf.items():
        if v < 0 or v != v:
            die(f"idf[{g}] invalid: {v}")
        if int(g) not in gene_ids:
            die(f"idf references unknown gene {g}")

    # drug_targets shape + referential integrity
    edges = 0
    for d, rows in dt.items():
        if int(d) not in drug_ids:
            die(f"drug_targets references unknown drug {d}")
        for r in rows:
            if len(r) != 4:
                die(f"drug_targets[{d}] row not 4-tuple: {r}")
            gi, ac, sign, mi = r
            if gi not in gene_ids:
                die(f"drug_targets[{d}] references unknown gene {gi}")
            if sign not in (-1, 0, 1):
                die(f"drug_targets[{d}] bad sign {sign}")
            if not (0 <= mi < len(mech)):
                die(f"drug_targets[{d}] bad mech index {mi}")
            edges += 1

    # gene_drugs inverted index integrity
    for g, ds in gd.items():
        if int(g) not in gene_ids:
            die(f"gene_drugs references unknown gene {g}")
        for d in ds:
            if d not in drug_ids:
                die(f"gene_drugs[{g}] references unknown drug {d}")

    # similar: scores in [0,1], targets known
    for d, neigh in sim.items():
        if int(d) not in drug_ids:
            die(f"similar references unknown drug {d}")
        for entry in neigh:
            other, score, conc, disc = entry
            if other not in drug_ids:
                die(f"similar[{d}] unknown neighbour {other}")
            if not (0.0 <= score <= 1.0):
                die(f"similar[{d}] score out of range: {score}")
            for gi in conc + disc:
                if gi not in gene_ids:
                    die(f"similar[{d}] unknown shared gene {gi}")

    # indications referential integrity
    diseases, drug_ind, dis_drugs = (J["diseases.json"], J["drug_indications.json"],
                                     J["disease_drugs.json"])
    disease_ids = {int(k) for k in diseases}
    for d, rows in drug_ind.items():
        if int(d) not in drug_ids:
            die(f"drug_indications references unknown drug {d}")
        for dis, ph in rows:
            if dis not in disease_ids:
                die(f"drug_indications[{d}] references unknown disease {dis}")
    for dis, ds in dis_drugs.items():
        if int(dis) not in disease_ids:
            die(f"disease_drugs references unknown disease {dis}")
        for d in ds:
            if d not in drug_ids:
                die(f"disease_drugs[{dis}] references unknown drug {d}")

    # meta counts cross-check
    c = meta["counts"]
    if c["drugs"] != len(drugs):
        die(f"meta drugs {c['drugs']} != {len(drugs)}")
    if c["genes"] != len(genes):
        die(f"meta genes {c['genes']} != {len(genes)}")
    if c["drugTargetEdges"] != edges:
        die(f"meta edges {c['drugTargetEdges']} != {edges}")
    if not meta.get("signTable"):
        die("meta.signTable empty")

    # coverage stats present + consistent
    cov = meta.get("coverage")
    if not cov:
        die("meta.coverage missing")
    A = cov["approvedDrugs"]
    for key in ("anyClass", "pharmClass", "atc"):
        if cov[key]["count"] > A:
            die(f"coverage.{key} count {cov[key]['count']} exceeds approvedDrugs {A}")
    if cov["anyClass"]["count"] < max(cov["pharmClass"]["count"], cov["atc"]["count"]):
        die("anyClass count below its components (union math wrong)")
    if cov["pharmClass"]["byUnii"] == 0:
        die("no drugs matched by UNII — UNII crosswalk likely broken")
    if cov["atc"]["count"] == 0:
        die("no drugs with ATC — DrugCentral crosswalk likely broken")
    # drugs.json shape: pharmClass + atcClass lists, approvalDate field
    for k, d in list(drugs.items())[:50]:
        for f in ("pharmClass", "atcClass", "atc"):
            if not isinstance(d.get(f), list):
                die(f"drug {k} {f} not a list")
        if "approvalDate" not in d:
            die(f"drug {k} missing approvalDate field")

    log("VALIDATION PASSED")
    log(f"  approved coverage: any-class {cov['anyClass']['count']}/{A} ({cov['anyClass']['pct']}%) "
        f"| openFDA {cov['pharmClass']['count']} ({cov['pharmClass']['pct']}%) "
        f"| ATC {cov['atc']['count']} ({cov['atc']['pct']}%)")
    log(f"  FDA-marketed: {cov['fdaMarketed']['withClass']}/{cov['fdaMarketed']['drugs']} "
        f"({cov['fdaMarketed']['pct']}%)")
    log(f"  drugs={len(drugs)} genes={len(genes)} edges={edges} "
        f"similar={len(sim)} mechanisms={len(mech)}")


if __name__ == "__main__":
    main()
