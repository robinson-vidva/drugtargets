# CLAUDE.md — drugtargets build spec

This file is the single source of truth for building **drugtargets**, a static, client-side
drug-target exploration and repurposing-hypothesis web tool. Execute the phases in order.
Confirm scope before large or destructive actions. Do not invent data or fields — verify
dataset/folder names and schemas against the live sources before relying on them.

## Decisions (fixed — do not change without asking)

- Repo: `robinson-vidva/drugtargets`, PUBLIC, monorepo (`pipeline/` + `web/`).
- Hosting: Vercel project, served at subdomain `drugtargets.robinsonvidva.com`
  (served from root — Vite `base` stays `/`, React Router needs NO `basename`).
- Frontend: React + Vite + TypeScript. State = React hooks + Context (no Redux/Zustand).
- Data build: offline Python pipeline (DuckDB + pyarrow + pandas). Pipeline runs locally /
  in GitHub Actions ONLY — never on Vercel. Vercel deploys the prebuilt static output.
- All THREE functions ship in v1.
- License posture: CC0/public-domain-clean backbone. Attribute CC BY sources.

## The three functions

1. Boolean gene query: user enters one or more genes with an AND / OR toggle; return drugs
   targeting those genes. Implement via precomputed inverted index + native Set intersect/union.
2. Drug -> all molecular targets, each with action type and a direction badge
   (activate / inhibit / ambiguous) plus the free-text mechanism and openFDA pharm_class chips.
3. Drug -> similar drugs, ranked by SIGNED IDF-WEIGHTED COSINE (below). Show shared
   concordant (same-sign) and discordant (opposite-sign) targets so the user sees WHY.

## Similarity method (precompute offline)

- N = number of drugs with >=1 mechanism. For each target t with drug-frequency n_t:
  IDF_t = log(N / n_t).
- Per-drug sparse vector: component for target t = sign(action) * IDF_t.
- Sign mapping from ChEMBL action_type (derive from parent_type, with override dict):
  +1 = AGONIST, PARTIAL AGONIST, ACTIVATOR, POSITIVE (ALLOSTERIC) MODULATOR, OPENER, STABILISER
  -1 = INHIBITOR, ANTAGONIST, INVERSE AGONIST, BLOCKER, NEGATIVE (ALLOSTERIC) MODULATOR, DISRUPTING AGENT
   0 = MODULATOR, UNKNOWN/OTHER, BINDING AGENT, anything not clearly positive/negative
- similarity = cosine of signed vectors, rescaled to [0,1] via (cos + 1) / 2.
- Precompute top-30 similar drugs per drug + the shared concordant/discordant gene id lists.
- Put the full sign table on the methods page (auditable).

## Data sources (verify names/paths at run time)

- Open Targets Platform release 26.03 (CC0), Parquet only, under
  https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/26.03/output/
  Datasets: drug_molecule, drug_mechanism_of_action, drug_indication (or clinical_indication
  in 26.03), target, disease, optional association_by_datasource_direct.
  NOTE: 26.03 reworked the clinical layer (added clinical_report/clinical_indication/
  clinical_target, retired known_drug). List /output/ and FAIL LOUDLY if a configured
  dataset folder is missing. Confirm via browser or
  `gsutil ls gs://open-targets-data-releases/26.03/output/` before first build.
- openFDA / Drugs@FDA (US-gov public domain): bulk JSON under https://download.open.fda.gov
  (manifest download.json). Use drug/drugsfda (approvals) and drug/label (SPL) for
  openfda.pharm_class_epc/_moa/_pe and identifiers unii, rxcui, spl_set_id, application_number.
  Reproduce verbatim disclaimer: "openFDA is a beta research project and not for clinical use."
- repoDB (CC BY 4.0): OPTIONAL validation layer. If used, attribution is REQUIRED — cite
  Brown & Patel, Scientific Data 4:170029 (2017), doi:10.1038/sdata.2017.29, plus AACT,
  DrugCentral, UMLS (and DrugBank to be safe).

## Identifier crosswalk

- Canonical drug key = ChEMBL ID. Prefer Open Targets drug_molecule.crossReferences; fall back
  to UniChem (REST POST https://www.ebi.ac.uk/unichem/api/v1/compounds, ChEMBL src_id=1, or bulk
  InChIKey files) to bridge openFDA UNII/RxCUI -> ChEMBL.
- Genes: bundle HGNC hgnc_complete_set.txt for symbol <-> ensembl_gene_id <-> uniprot_ids;
  resolve user-typed symbols (incl. aliases/prev symbols) to the Ensembl ids OT uses.

## JSON artifacts (emit to web/public/data/v2026Q2/) — use integer interning

- drugs.json    {id: {chembl, name, drugType, maxPhase, approved, pharmClass[]}}
- genes.json    {id: {symbol, ensembl, uniprot, name}}
- drug_targets.json  {drugId: [[geneId, actionTypeCode, sign], ...]}
- gene_drugs.json    {geneId: [drugId, ...]}            # inverted index for boolean query
- idf.json      {geneId: idf}                            # round ~4 sig figs
- similar.json  {drugId: [[otherId, score, [concordantGeneIds], [discordantGeneIds]], ...]}
- meta.json     {otRelease, openfdaDate, hgncVersion, buildDate, counts, licenses[]}
- Tactics: arrays-of-arrays (no repeated keys), rounded floats, brotli/gzip (Vercel auto).
  If similar.json > ~10MB uncompressed, shard by drug-id bucket and lazy-load per query.

## Repo layout

drugtargets/
  pipeline/      download.py crosswalk.py build.py validate.py  (Typer CLI or make targets)
  web/           Vite React-TS app
  web/public/data/v2026Q2/  generated JSON
  Makefile       targets: download crosswalk build validate all
  config.toml    pinned versions: OT_RELEASE, openfda date, hgnc url, chembl version
  .vercelignore  (exclude node_modules, source maps, raw parquet)
  .gitignore     (ignore raw Parquet, node_modules, .venv, pipeline/cache)
  README.md  CLAUDE.md

## Frontend specifics

- Scaffold: npm create vite@latest web -- --template react-ts.
- Deps: react-router-dom, minisearch (autocomplete over genes + drugs, prefix+fuzzy).
  Optional lazy-loaded viz: react-cytoscapejs (small ego-network) — keep behind its own route.
- DataContext loads small artifacts eagerly (genes, drugs, idf, gene_drugs); lazy-load
  drug_targets + similar (or shard) on first use; cache in memory.
- Boolean gene UX: chip/token input + single AND/OR segmented toggle. Disambiguation dropdown
  for alias symbols. Resolve token -> geneId via MiniSearch, then Set intersect (AND) / union (OR).
- Drug view: targets table with gene, action type, direction badge, mechanism text,
  pharm_class chips, approval status; link each gene into a prefilled gene query.
- Similar view: ranked table, score bar, green (concordant) / red (discordant) shared-target chips.
- Shareable URLs via router: /drug/CHEMBL25, /genes?q=EGFR+AND+ERBB2, /methods.
- Put "Hypothesis, not evidence — not for clinical use" disclaimer on EVERY results view.

## Methods/About page must document

Data sources + versions + licenses (OT 26.03 CC0; openFDA public domain + beta disclaimer;
ChEMBL CC BY-SA attribution; HGNC; UniChem; repoDB CC BY 4.0 if used), the exact similarity
formula with a worked 2-drug example, the FULL action-type->sign table, caveats (incomplete
action-type coverage -> many sign 0; curation bias; annotated-mechanism not structure), and a
prominent hypothesis-not-evidence / not-for-clinical-use disclaimer. Footer "Data & Licenses".

## Reproducibility / cadence

- Pin all versions in config.toml; write them into meta.json and the data dir name (v2026Q2).
- validate step asserts row counts, non-empty IDF, schema shape before publishing.
- Quarterly GitHub Action (cron + workflow_dispatch): run `make all`, commit regenerated JSON,
  let Vercel auto-deploy. Pipeline NEVER runs on Vercel.

## Phased plan (execute in order; commit + push after each phase)

- Phase 0: repo skeleton, Vite TS app, requirements/uv, Makefile, config.toml, ignores, CLAUDE.md;
  connect to Vercel; confirm blank deploy works on the subdomain.
- Phase 1: pipeline download (OT 26.03 + openFDA + HGNC, verify folder names), crosswalk, build
  (sign map, IDF, all artifacts, interning), validate -> JSON in web/public/data/v2026Q2/.
  Unit-test sign map + one hand-checked IDF/cosine example.
- Phase 2: DataContext + hooks + types; MiniSearch autocomplete; function 1 (boolean gene) +
  function 2 (drug targets); routing + shareable URLs.
- Phase 3: function 3 (similar drugs) consuming similar.json with concordant/discordant chips +
  score bars; optional lazy Cytoscape ego-network; client-side cosine util + tests (fallback).
- Phase 4: methods/about page, footer attributions, loading/empty/error states, responsive
  layout, bundle/Lighthouse check; add quarterly GitHub Action; final production deploy + smoke test.

## Vercel settings

- Framework preset: Vite. Root Directory: web. Build: npm run build. Output: dist.
- Domain: add drugtargets.robinsonvidva.com; add the CNAME Vercel provides (cname.vercel-dns.com)
  at the DNS provider for the `drugtargets` host. Apex stays on GitHub Pages, untouched.
- Connect GitHub repo for auto-deploy + PR previews. Keep raw Parquet and node_modules out of deploys.
