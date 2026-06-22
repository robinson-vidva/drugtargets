import { Link } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { Disclaimer } from '../components/common';

export default function MethodsPage() {
  const { meta } = useData();
  const cov = meta?.coverage;
  const pos = meta?.signTable.filter((r) => r.sign === 1) ?? [];
  const neg = meta?.signTable.filter((r) => r.sign === -1) ?? [];
  const amb = meta?.signTable.filter((r) => r.sign === 0) ?? [];

  return (
    <div>
      <h1>Methods &amp; data</h1>
      <Disclaimer />
      <p className="lede">
        drugtargets is a static, client-side tool. All data is precomputed by an offline
        Python pipeline and served as JSON — no server-side computation, no tracking.
      </p>

      {/* ---- Data sources ---- */}
      <h2 id="sources">Data sources &amp; licenses</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Source</th><th>Version</th><th>License</th></tr></thead>
          <tbody>
            {meta?.licenses.map((l) => (
              <tr key={l.source}><td>{l.source}</td><td>{l.version}</td><td className="muted">{l.license}</td></tr>
            ))}
            <tr><td>repoDB (optional validation)</td><td>—</td><td className="muted">CC BY 4.0</td></tr>
          </tbody>
        </table>
      </div>
      <ul className="muted" style={{ fontSize: '0.9rem' }}>
        <li><strong>Open Targets Platform {meta?.otRelease}</strong> — drug_molecule,
          drug_mechanism_of_action, clinical_indication, target, disease (CC0 1.0).</li>
        <li><strong>openFDA / Drugs@FDA</strong> — openfda.pharm_class_epc/_moa/_pe and
          identifiers (UNII, RxCUI, SPL). U.S. public domain.</li>
        <li><strong>ChEMBL {meta?.chemblVersion}</strong> — action types underlying the
          mechanism annotations (CC BY-SA 3.0).</li>
        <li><strong>HGNC complete set {meta?.hgncVersion}</strong> — symbol ↔ Ensembl ↔
          UniProt, incl. alias/previous symbols (CC0 1.0).</li>
        <li><strong>UniChem</strong> (EMBL-EBI) — identifier bridging.</li>
        <li>repoDB, if used as a validation layer, requires citing Brown &amp; Patel,{' '}
          <em>Scientific Data</em> 4:170029 (2017), doi:10.1038/sdata.2017.29 (CC BY 4.0).</li>
      </ul>
      <div className="panel" style={{ marginTop: 10 }}>
        <strong>openFDA disclaimer (verbatim):</strong>{' '}
        <em>{meta?.openfdaDisclaimer ?? 'openFDA is a beta research project and not for clinical use.'}</em>
      </div>

      {/* ---- Similarity ---- */}
      <h2 id="similarity">Similarity method</h2>
      <p>
        Let <code>N</code> be the number of drugs with ≥1 annotated mechanism. For each target{' '}
        <code>t</code> with drug-frequency <code>n<sub>t</sub></code>:
      </p>
      <div className="panel mono">IDF<sub>t</sub> = log( N / n<sub>t</sub> )</div>
      <p>Each drug becomes a sparse vector; the component for target <code>t</code> is:</p>
      <div className="panel mono">v<sub>t</sub> = sign(action) × IDF<sub>t</sub></div>
      <p>
        Similarity is the cosine of two signed vectors, rescaled to [0,1]:
      </p>
      <div className="panel mono">similarity(a, b) = ( cos(a, b) + 1 ) / 2</div>
      <p className="muted">
        We precompute the top-30 neighbours per drug plus the shared <span style={{ color: 'var(--green)' }}>
        concordant</span> (same-sign) and <span style={{ color: 'var(--red)' }}>discordant</span>{' '}
        (opposite-sign) target lists. Targets with sign 0 do not contribute to the cosine.
      </p>

      <h3>Worked example (two drugs)</h3>
      <p className="muted">
        Suppose <code>N = 4</code>. Gene T1 is targeted by 2 drugs → IDF = ln(4/2) = 0.6931;
        gene T2 by 1 drug → IDF = ln(4/1) = 1.3863.
      </p>
      <ul>
        <li>Drug A <em>inhibits</em> T1 and T2 → vector A = (−0.6931, −1.3863).</li>
        <li>Drug B <em>inhibits</em> T1 → vector B = (−0.6931, 0).</li>
        <li>cos(A, B) = 0.6931² / (√(0.6931² + 1.3863²) · 0.6931) = <strong>0.4472</strong>.</li>
        <li>similarity = (0.4472 + 1) / 2 = <strong>0.7236</strong>; shared target T1 is concordant.</li>
        <li>If instead Drug C <em>activates</em> T1, cos(B, C) = −1 → similarity 0; T1 is discordant.</li>
      </ul>

      {/* ---- Sign table ---- */}
      <h2 id="sign-table">Action-type → sign table</h2>
      <p className="muted">Derived from ChEMBL action types. The full mapping is auditable below.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Direction</th><th>Action types</th></tr></thead>
          <tbody>
            <tr>
              <td><span className="badge activate">▲ Activate (+1)</span></td>
              <td>{pos.map((r) => r.actionType).join(', ')}</td>
            </tr>
            <tr>
              <td><span className="badge inhibit">▼ Inhibit (−1)</span></td>
              <td>{neg.map((r) => r.actionType).join(', ')}</td>
            </tr>
            <tr>
              <td><span className="badge ambiguous">◆ Ambiguous (0)</span></td>
              <td>{amb.map((r) => r.actionType).join(', ')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---- Caveats ---- */}
      <h2 id="caveats">Caveats</h2>
      <ul>
        <li><strong>Incomplete action-type coverage.</strong> Many mechanisms have an
          ambiguous or unmapped action type and contribute sign 0 — they appear as targets
          but not in the similarity vectors.</li>
        <li><strong>Curation bias.</strong> Well-studied drugs and targets have richer
          mechanism annotations; absence of a target is not evidence of no interaction.</li>
        <li><strong>Annotated mechanism, not structure.</strong> Similarity reflects shared
          annotated targets and directions — not chemical-structure similarity or assay data.</li>
        <li><strong>Drug classification — two sources.</strong> <em>openFDA pharm_class</em>
          (EPC/MoA/PE) from the <strong>NDC directory + Drugs@FDA</strong>, joined to ChEMBL by{' '}
          <strong>UNII</strong> (via UniChem) and rolled salt→parent, with a salt-stripped name
          fallback. <em>WHO ATC</em> classification from <strong>DrugCentral</strong> (joined by
          ChEMBL id), which covers drugs openFDA never classifies — e.g.{' '}
          <Link to="/drug/CHEMBL941">imatinib</Link> → <code>L01EA01</code> "BCR-ABL tyrosine
          kinase inhibitors". The large SPL <code>drug/label</code> set is intentionally excluded
          (verified to add ~2% openFDA coverage for &gt;1 GB).
          {cov && <> A class is present for <strong>{cov.anyClass.count.toLocaleString()} of{' '}
            {cov.approvedDrugs.toLocaleString()} approved drugs ({cov.anyClass.pct}%)</strong>{' '}
            — ATC {cov.atc.pct}%, openFDA {cov.pharmClass.pct}% (of which{' '}
            {cov.pharmClass.byUnii.toLocaleString()} by UNII,{' '}
            {cov.pharmClass.byNameFallback.toLocaleString()} by name). Among FDA-marketed drugs:{' '}
            <strong>{cov.fdaMarketed.pct}%</strong>.</>}</li>
        <li><strong>Combination products excluded.</strong> Multi-ingredient records are skipped
          when attributing pharm_class, so a drug is not tagged with classes that belong to its
          combination partners.</li>
      </ul>

      <div className="disclaimer" style={{ marginTop: 16 }}>
        <strong>Hypothesis, not evidence — not for clinical use.</strong> Nothing here is a
        treatment recommendation. Consult primary sources and qualified professionals.
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        Built {meta?.buildDate} · Open Targets {meta?.otRelease} · openFDA {meta?.openfdaDate} ·
        ChEMBL {meta?.chemblVersion} · data dir <code>{meta?.dataDir}</code>.{' '}
        <a href="https://github.com/robinson-vidva/drugtargets" target="_blank" rel="noreferrer">Source on GitHub</a>.
      </p>
    </div>
  );
}
