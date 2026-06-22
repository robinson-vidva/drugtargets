"""Phase 1 — download. Fetch all source data into pipeline/raw/.

Sources (verified at run time):
  - Open Targets 26.03 Parquet datasets (lists /output/ and FAILS LOUDLY if a
    configured dataset folder is missing).
  - HGNC complete set (symbol/alias/prev <-> ensembl <-> uniprot).
  - openFDA NDC directory (pharm_class by UNII) + Drugs@FDA (approvals).
  - UniChem ChEMBL<->UNII whole-source bulk mapping (src1src14).

Idempotent: existing files are skipped unless --force.
"""
from __future__ import annotations

import gzip
import io
import re
import sys
import zipfile

import requests

from common import (CACHE, RAW, die, drugcentral_path, hgnc_path, iuphar_dir,
                    load_config, log, openfda_dir, ot_dir, unichem_path)

TIMEOUT = 300
PARQUET_RE = re.compile(r'href="([^"]+\.parquet)"')


def http_get(url: str) -> requests.Response:
    r = requests.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r


def list_output_dir(base_url: str) -> set[str]:
    """Return the set of dataset folder names under OT /output/."""
    html = http_get(base_url + "/").text
    return set(re.findall(r'href="([^"/]+)/"', html))


def list_parquet(dataset_url: str) -> list[str]:
    html = http_get(dataset_url + "/").text
    return sorted(set(PARQUET_RE.findall(html)))


def download_file(url: str, dest, force: bool) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0 and not force:
        log(f"  skip (exists): {dest.name}")
        return
    log(f"  GET {url}")
    with requests.get(url, timeout=TIMEOUT, stream=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in r.iter_content(chunk_size=1 << 20):
                fh.write(chunk)


def download_opentargets(cfg: dict, force: bool) -> None:
    base = cfg["opentargets"]["base_url"].rstrip("/")
    configured = cfg["opentargets"]["datasets"]
    log(f"Open Targets {cfg['opentargets']['release']} — listing /output/")
    available = list_output_dir(base)
    missing = [d for d in configured if d not in available]
    if missing:
        die(
            "configured Open Targets dataset folder(s) missing from "
            f"{base}/: {missing}. Available example folders: "
            f"{sorted(available)[:10]}... — STOPPING (do not guess)."
        )
    for ds in configured:
        files = list_parquet(f"{base}/{ds}")
        if not files:
            die(f"dataset {ds} has no .parquet files at {base}/{ds}/")
        log(f"{ds}: {len(files)} parquet file(s)")
        for fn in files:
            download_file(f"{base}/{ds}/{fn}", ot_dir(ds) / fn, force)


def download_hgnc(cfg: dict, force: bool) -> None:
    log("HGNC complete set")
    download_file(cfg["hgnc"]["url"], hgnc_path(), force)


def download_openfda_endpoint(manifest: dict, endpoint: str, subdir: str, force: bool) -> None:
    """Download all partitions of an openFDA endpoint, unzipping JSON into raw/openfda/<subdir>/."""
    dest_dir = openfda_dir(subdir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    marker = dest_dir / ".done"
    if marker.exists() and not force:
        log(f"  skip (exists): openFDA {endpoint}")
        return
    part = endpoint.split("/")  # e.g. ["drug","ndc"]
    node = manifest["results"][part[0]][part[1]]
    log(f"  {endpoint}: export_date={node.get('export_date')} records={node.get('total_records')}")
    for i, p in enumerate(node["partitions"]):
        url = p["file"]
        log(f"  GET {url}")
        data = http_get(url).content
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for name in zf.namelist():
                with zf.open(name) as src:
                    out = dest_dir / f"{subdir}-{i:04d}-{name.split('/')[-1]}"
                    with open(out, "wb") as dst:
                        dst.write(src.read())
    marker.write_text("ok\n")


def download_openfda(cfg: dict, force: bool) -> None:
    log("openFDA (NDC pharm_class + Drugs@FDA approvals)")
    manifest = http_get(cfg["openfda"]["manifest_url"]).json()
    download_openfda_endpoint(manifest, cfg["openfda"]["ndc_endpoint"], "ndc", force)
    download_openfda_endpoint(manifest, cfg["openfda"]["endpoint"], "drugsfda", force)


def download_unichem(cfg: dict, force: bool) -> None:
    log("UniChem ChEMBL<->UNII mapping (src1src14)")
    dest = unichem_path()
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0 and not force:
        log("  skip (exists): src1src14.txt")
        return
    url = cfg["unichem"]["mapping_url"]
    log(f"  GET {url}")
    data = http_get(url).content
    with open(dest, "wb") as fh:
        fh.write(gzip.decompress(data))


def download_drugcentral(cfg: dict, force: bool) -> None:
    log("DrugCentral dump (WHO ATC classification)")
    dest = drugcentral_path()
    dest.parent.mkdir(parents=True, exist_ok=True)
    download_file(cfg["drugcentral"]["dump_url"], dest, force)


def download_iuphar(cfg: dict, force: bool) -> None:
    log("Guide to Pharmacology (IUPHAR) interactions + ligands")
    download_file(cfg["iuphar"]["interactions_url"], iuphar_dir() / "interactions.csv", force)
    download_file(cfg["iuphar"]["ligands_url"], iuphar_dir() / "ligands.csv", force)


def main() -> None:
    force = "--force" in sys.argv
    cfg = load_config()
    RAW.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    download_opentargets(cfg, force)
    download_hgnc(cfg, force)
    download_openfda(cfg, force)
    download_unichem(cfg, force)
    download_drugcentral(cfg, force)
    download_iuphar(cfg, force)
    log("download complete")


if __name__ == "__main__":
    main()
