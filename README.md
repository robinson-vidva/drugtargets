# drugtargets

A static, client-side **drug-target exploration and repurposing-hypothesis** web tool.

> **Hypothesis, not evidence — not for clinical use.**

Live: [drugtargets.robinsonvidva.com](https://drugtargets.robinsonvidva.com)

## Three functions

1. **Boolean gene query** — enter one or more genes with an AND / OR toggle; get the drugs
   that target them (precomputed inverted index + native `Set` intersect/union).
2. **Drug → targets** — every molecular target of a drug with action type, a direction badge
   (activate / inhibit / ambiguous), the free-text mechanism, and openFDA pharm-class chips.
3. **Drug → similar drugs** — ranked by **signed IDF-weighted cosine**, showing the shared
   concordant (same-sign) and discordant (opposite-sign) targets so you can see *why*.

## Architecture

- **Frontend** (`web/`): React + Vite + TypeScript, React Router, MiniSearch autocomplete.
  Pure static site — all computation runs client-side over precomputed JSON.
- **Pipeline** (`pipeline/`): offline Python (DuckDB + pyarrow + pandas) that downloads the
  public source data, builds the identifier crosswalk, computes IDF + signed-cosine similarity,
  and emits compact interned JSON artifacts to `web/public/data/v2026Q2/`.
  **The pipeline never runs on Vercel** — Vercel only serves the prebuilt static output.

## Quick start

```bash
# Pipeline (regenerate data artifacts)
make venv         # create .venv and install requirements
make all          # download -> crosswalk -> build -> validate
make test         # unit tests (sign map + IDF/cosine)

# Web app
cd web
npm install
npm run dev       # local dev server
npm run build     # production build -> web/dist
```

## Data sources

| Source | Release | License |
| --- | --- | --- |
| Open Targets Platform | 26.03 | CC0 1.0 |
| openFDA / Drugs@FDA | 2026-06 snapshot | U.S. Public Domain (beta research project, not for clinical use) |
| ChEMBL | 35 | CC BY-SA 3.0 |
| HGNC complete set | 2026-06 | CC0 1.0 |
| UniChem | — | crosswalk service (EMBL-EBI) |
| repoDB (optional) | — | CC BY 4.0 |

See the in-app **Methods** page for the full similarity formula, the complete action-type → sign
table, a worked example, and all attributions and caveats.

## Repo layout

```
drugtargets/
  pipeline/      download.py crosswalk.py build.py validate.py + tests/
  web/           Vite React-TS app
  web/public/data/v2026Q2/   generated JSON artifacts
  Makefile       download crosswalk build validate all
  config.toml    pinned versions (OT release, openFDA date, HGNC, ChEMBL)
```

## License

Code: MIT. Data: per-source licenses above (CC0/public-domain backbone; CC BY / CC BY-SA
sources attributed on the Methods page).
