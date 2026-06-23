# drugtargets — roadmap & open items

Status of the project and what's outstanding. The app is complete and live at
[drugtargets.robinsonvidva.com](https://drugtargets.robinsonvidva.com); nothing below is
blocking normal use.

## ⚠️ Open risk (worth doing next)

- [ ] **Validate the quarterly GitHub Action in CI.** `.github/workflows/quarterly.yml` has
  never actually run. It now does heavy work — downloads DrugCentral (~1.4 GB), IUPHAR CSVs,
  the Open Targets association data via DuckDB **httpfs** at build time, and runs **RDKit**
  fingerprints. Any of these could fail on a fresh runner (disk, httpfs reliability, rdkit
  install). Trigger it once via `workflow_dispatch` and confirm it's green before relying on
  the auto-rebuild.

## 🟡 Deliberately deferred (decisions, not bugs)

- [ ] **repoDB validation.** Every public download URL is dead; we substitute Open Targets
  clinical-indication data ("known vs novel") + genetic-association support. Reopen only if a
  repoDB CSV can be supplied.
- [ ] **SPL `drug/label` pharm_class.** Excluded — verified it adds only ~2% of approved-drug
  coverage for a >1 GB download. ATC (DrugCentral) covers the gap instead.
- [ ] **Sticky table headers.** Skipped — `.table-wrap`'s `overflow-x` makes viewport-sticky
  `<th>` unreliable, and 10-row pagination already keeps tables short.
- [ ] **ESLint (6 non-functional items).** Intentional reset-on-input effects + dev-only
  fast-refresh hints; zero production impact. Tidy only if a clean `npm run lint` is desired.

## 🔵 Optional future features

- [ ] **Target / gene page.** Tractability + safety-liability data is downloaded but unused;
  a per-target page (its drugs, associated diseases, tractability) is a natural addition.
- [ ] **Global `/repurposing` browse page** — top hypotheses across all drugs, filterable by
  disease area / genetic support.
- [ ] **Compare two drugs** — shared / unique targets side-by-side (Venn-style).
- [ ] **More drug–target sources** — DGIdb and ChEMBL bioactivity (big breadth, but unsigned;
  would contribute to gene-query / drug-target views, not similarity).
- [ ] **Per-edge provenance in the UI** — show whether each drug–target edge comes from Open
  Targets/ChEMBL mechanisms or IUPHAR.
- [ ] **More frontend tests** — only the client-side similarity util has vitest coverage today.

## ✅ Done

Phases 0–4 build & deploy · openFDA UNII join + salt→parent rollup · WHO ATC (DrugCentral) →
~100% class coverage incl. biologics · IUPHAR graph growth (+3.6k drugs, +0.8k targets) ·
indications/disease views · repurposing engine + structural (Tanimoto) + genetic association ·
light theme · pagination / sortable columns / page-size / skeletons / back-to-top ·
shareable filter+sort URLs · a11y pass · per-page titles + Open Graph · custom domain.
