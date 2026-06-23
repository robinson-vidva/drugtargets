# drugtargets

A static, client-side **drug–target exploration and repurposing-hypothesis** web tool over
Open Targets, ChEMBL, IUPHAR, openFDA, DrugCentral (WHO ATC) and HGNC.

> **Hypothesis, not evidence — not for clinical use.**

**Live:** [drugtargets.robinsonvidva.com](https://drugtargets.robinsonvidva.com)

Indexed **7,765 drugs**, **2,373 gene targets**, **20,179 signed drug–target edges**,
**2,695 diseases**, and **5,779 drugs with repurposing hypotheses** (Open Targets 26.03 /
ChEMBL 35 / IUPHAR 2026.2). All computation is precomputed offline and served as static JSON —
no backend, no tracking.

## What it does

1. **Boolean gene query** — enter one or more genes (aliases/previous symbols resolve via
   autocomplete) with an AND / OR toggle; get the drugs that target them. Filter by approval /
   phase / drug type, sort any column, export CSV. Inverted index + native `Set` ops.
2. **Drug → targets** — every molecular target with action type, a direction badge
   (activate / inhibit / ambiguous), the free-text mechanism, openFDA pharm-class and WHO-ATC
   chips, approval date, and external links.
3. **Similar drugs** — ranked by **signed IDF-weighted cosine** of shared targets, with the
   shared concordant (same-direction) and discordant (opposite-direction) targets shown so you
   can see *why*, plus a dependency-free SVG ego-network.
4. **Repurposing hypotheses** — diseases a drug is *not* indicated for but a target-similar
   drug is approved/late-phase for, scored by similarity, annotated with shared targets and
   **Open Targets genetic-association** support.
5. **Structural similarity** — RDKit ECFP4 / Tanimoto, a chemical axis independent of targets.
6. **Indications & disease pages** — drug → indications (with phase) and disease → drugs.

Drug classification reaches **~100% of approved drugs** when including a mechanism-derived
fallback (curated coverage: ATC 77%, openFDA EPC/MoA 33%; FDA-marketed 93%).

## Architecture

- **Frontend** (`web/`) — React 19 + Vite + TypeScript, React Router, MiniSearch. A pure
  static SPA: all queries/similarity/repurposing run client-side over precomputed JSON.
- **Pipeline** (`pipeline/`) — offline Python (DuckDB + pyarrow + pandas + RDKit) that
  downloads the public sources, builds the identifier crosswalks (HGNC genes; UNII→ChEMBL via
  UniChem; salt→parent rollup), computes the sign map / IDF / signed-cosine similarity /
  structural Tanimoto / repurposing hypotheses, and emits compact interned JSON to
  `web/public/data/v2026Q2/`. **It never runs on Vercel** — Vercel only serves the prebuilt
  static output; the pipeline runs locally or in the quarterly GitHub Action.

```
drugtargets/
  pipeline/   download · crosswalk · build · validate · signmap · similarity · structure · graph (+ tests/)
  web/        Vite React-TS app  (web/public/data/v2026Q2/  ← generated JSON artifacts)
  config.toml pinned source versions      Makefile  download/crosswalk/build/validate/all
  .github/workflows/quarterly.yml         ROADMAP.md  open items
```

## Quick start

```bash
# Pipeline (regenerate the data artifacts) — local or CI only
make venv          # create .venv and install requirements (incl. rdkit)
make all           # download -> crosswalk -> build -> validate
make test          # Python unit tests (sign map, IDF/cosine, salt-collapse, crosswalks, Tanimoto)

# Web app
cd web
npm install
npm run dev        # local dev server
npm test           # vitest (client-side signed-cosine)
npm run build      # production build -> web/dist
```

## Data sources

| Source | Version | License |
| --- | --- | --- |
| Open Targets Platform (drug, target, indication, **association**) | 26.03 | CC0 1.0 |
| ChEMBL (action types) | 35 | CC BY-SA 3.0 |
| Guide to Pharmacology (IUPHAR/BPS) | 2026.2 | CC BY-SA 4.0 |
| openFDA NDC + Drugs@FDA (pharm_class, approvals) | 2026-06-19 | U.S. Public Domain |
| DrugCentral (WHO ATC classification) | 2023-11-01 | CC BY-SA 4.0 |
| HGNC complete set | 2026-06 | CC0 1.0 |
| UniChem (UNII↔ChEMBL) | REST | EMBL-EBI |

The in-app **Methods** page has the full similarity formula, a worked example, the complete
action-type → sign table, coverage stats, and all attributions and caveats.

## License

Code: MIT. Data: per-source licenses above (CC0 / public-domain backbone; CC BY-SA sources
attributed in-app and here). openFDA is a beta research project, not for clinical use.
