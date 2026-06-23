import { Link } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { SearchBox } from '../components/SearchBox';
import { Disclaimer } from '../components/common';
import { usePageTitle } from '../lib/usePageTitle';

export default function HomePage() {
  const { meta } = useData();
  const c = meta?.counts;
  usePageTitle('Drug-target & repurposing explorer');
  return (
    <div>
      <h1>Explore drug targets &amp; repurposing hypotheses</h1>
      <p className="lede">
        A client-side tool over Open Targets, openFDA and ChEMBL. Find drugs by gene,
        inspect a drug's molecular targets and directions, and discover similar drugs by
        signed IDF-weighted target overlap.
      </p>

      <div style={{ margin: '22px 0 12px' }}>
        <SearchBox autoFocus placeholder="Search a drug (e.g. imatinib) or gene (e.g. EGFR)…" />
      </div>

      <div className="quickstart">
        <span className="muted">Try:</span>
        <Link className="tag" to="/drug/CHEMBL941">imatinib</Link>
        <Link className="tag" to="/genes?q=EGFR">EGFR</Link>
        <Link className="tag" to="/genes?q=EGFR%20AND%20ERBB2">EGFR AND ERBB2</Link>
        <Link className="tag" to="/disease/EFO_0000339">chronic myeloid leukemia</Link>
        <Link className="tag" to="/drug/CHEMBL25">aspirin</Link>
      </div>

      <Disclaimer />

      <div className="grid-cards" style={{ marginTop: 18 }}>
        <Link className="card" to="/genes">
          <h3>1 · Boolean gene query</h3>
          <p className="muted">Enter one or more genes with an AND / OR toggle to find the
            drugs that target them.</p>
        </Link>
        <Link className="card" to="/genes?q=EGFR">
          <h3>2 · Drug → targets</h3>
          <p className="muted">Open any drug to see every molecular target, its action type,
            a direction badge and the mechanism.</p>
        </Link>
        <Link className="card" to="/methods">
          <h3>3 · Similar drugs</h3>
          <p className="muted">Rank drugs by signed IDF-weighted cosine, with shared
            concordant / discordant targets explaining why.</p>
        </Link>
      </div>

      {c && (
        <p className="meta-line" style={{ marginTop: 22 }}>
          Indexed <strong>{c.drugs.toLocaleString()}</strong> drugs ·{' '}
          <strong>{c.genes.toLocaleString()}</strong> gene targets ·{' '}
          <strong>{c.drugTargetEdges.toLocaleString()}</strong> drug–target links ·{' '}
          <strong>{c.diseases.toLocaleString()}</strong> diseases ·{' '}
          <strong>{c.drugsWithRepurposing.toLocaleString()}</strong> drugs with repurposing
          hypotheses · built {meta?.buildDate}.
        </p>
      )}
    </div>
  );
}
